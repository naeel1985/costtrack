// Server-side read layer (used by React Server Components). Every function
// resolves the authenticated user (+ their DEK) via requireUser(), scopes all
// DB access to that user's id, and decrypts rows through the crypto map before
// returning. Pages therefore keep working with plain numbers/strings and can
// never see another user's data.

import {
  addDays,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import {
  decryptAccount,
  decryptBudget,
  decryptCategory,
  decryptPdc,
  decryptProvision,
  decryptRecurring,
  decryptTransaction,
  type DecryptedAccount,
} from "@/server/crypto-map";
import {
  computeRunway,
  eventsFromPdcs,
  eventsFromRecurring,
  expandRecurrence,
  projectBalances,
  type ProjectionAccount,
  type ProjectionEvent,
  type ProjectionResult,
  type RunwayResult,
} from "@/lib/projection";
import { computeBalances } from "./balances";

export async function getSettings() {
  const { user } = await requireUser();
  const existing = await prisma.appSetting.findUnique({ where: { userId: user.id } });
  if (existing) return existing;
  return prisma.appSetting.create({ data: { userId: user.id } });
}

export type AccountWithBalance = DecryptedAccount & { balanceMinor: number };

export async function getAccountsWithBalances(includeArchived = false): Promise<AccountWithBalance[]> {
  const { user, dek } = await requireUser();
  const [rawAccounts, rawTx] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.transaction.findMany({ where: { userId: user.id, status: "posted" } }),
  ]);

  const accounts = rawAccounts.map((a) => decryptAccount(a, dek));
  const transactions = rawTx.map((t) => decryptTransaction(t, dek));
  const balances = computeBalances(accounts, transactions);
  return accounts.map((a) => ({ ...a, balanceMinor: balances[a.id] ?? a.openingBalanceMinor }));
}

export interface WhatIfEvent {
  date: Date;
  accountId: string;
  amountMinor: number;
  label: string;
}

export interface BuildProjectionOptions {
  horizonDays?: number;
  whatIf?: WhatIfEvent[];
}

export async function getProjection({
  horizonDays = 90,
  whatIf = [],
}: BuildProjectionOptions = {}): Promise<{ result: ProjectionResult; accounts: ProjectionAccount[] }> {
  const { user, dek } = await requireUser();
  const start = startOfDay(new Date());
  const end = addDays(start, horizonDays);

  const [rawAccounts, rawPosted, rawScheduled, rawRules, rawPdcs] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, isArchived: false }, orderBy: { sortOrder: "asc" } }),
    prisma.transaction.findMany({ where: { userId: user.id, status: "posted" } }),
    prisma.transaction.findMany({ where: { userId: user.id, status: "scheduled", date: { gte: start, lte: end } } }),
    prisma.recurringRule.findMany({ where: { userId: user.id, isActive: true } }),
    prisma.pDC.findMany({ where: { userId: user.id, status: "pending" } }),
  ]);

  const accounts = rawAccounts.map((a) => decryptAccount(a, dek));
  const posted = rawPosted.map((t) => decryptTransaction(t, dek));
  const scheduled = rawScheduled.map((t) => decryptTransaction(t, dek));
  const rules = rawRules.map((r) => decryptRecurring(r, dek));
  const pdcs = rawPdcs.map((p) => decryptPdc(p, dek));

  const currentBalances = computeBalances(accounts, posted, start);

  const projAccounts: ProjectionAccount[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    currentBalanceMinor: currentBalances[a.id] ?? a.openingBalanceMinor,
    safetyBufferMinor: a.safetyBufferMinor,
  }));

  const events: ProjectionEvent[] = [
    ...eventsFromRecurring(
      rules.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as "income" | "expense",
        frequency: r.frequency as never,
        interval: r.interval,
        startDate: r.startDate,
        endDate: r.endDate,
        occurrenceCount: r.occurrenceCount,
        amountMinor: r.amountMinor,
        accountId: r.accountId,
      })),
      start,
      end,
    ),
    ...eventsFromPdcs(
      pdcs.map((p) => ({
        id: p.id,
        direction: p.direction as "issued" | "received",
        counterparty: p.counterparty,
        amountMinor: p.amountMinor,
        dueDate: p.dueDate,
        accountId: p.accountId,
        chequeNumber: p.chequeNumber,
        status: p.status,
      })),
      start,
      end,
    ),
    ...scheduled.map((t) => ({
      date: t.date,
      accountId: t.accountId,
      amountMinor: t.type === "income" ? t.amountMinor : -t.amountMinor,
      kind: "scheduled" as const,
      label: t.note ?? "Scheduled",
      refId: t.id,
    })),
    ...whatIf.map((w) => ({
      date: w.date,
      accountId: w.accountId,
      amountMinor: w.amountMinor,
      kind: "whatif" as const,
      label: w.label,
    })),
  ];

  const result = projectBalances({ accounts: projAccounts, events, start, horizonDays });
  return { result, accounts: projAccounts };
}

export interface UpcomingObligation {
  id: string;
  kind: "pdc" | "recurring" | "provision";
  date: Date;
  label: string;
  sublabel?: string;
  amountMinor: number;
  currency: string;
  accountId?: string;
  status?: string;
}

export async function getUpcomingObligations(horizonDays = 90): Promise<UpcomingObligation[]> {
  const { user, dek } = await requireUser();
  const start = startOfDay(new Date());
  const end = addDays(start, horizonDays);

  const [rawPdcs, rawRules, rawProvisions] = await Promise.all([
    prisma.pDC.findMany({
      where: { userId: user.id, status: "pending", dueDate: { gte: start, lte: end } },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({ where: { userId: user.id, isActive: true }, include: { account: true, category: true } }),
    prisma.provision.findMany({
      where: { userId: user.id, status: "active", dueDate: { gte: start, lte: end } },
      include: { allocations: true },
    }),
  ]);

  const items: UpcomingObligation[] = [];

  for (const raw of rawPdcs) {
    const p = decryptPdc(raw, dek);
    items.push({
      id: p.id,
      kind: "pdc",
      date: p.dueDate,
      label: p.direction === "issued" ? `Cheque to ${p.counterparty}` : `Cheque from ${p.counterparty}`,
      sublabel: `${p.chequeNumber ? `#${p.chequeNumber} · ` : ""}${p.account?.name ?? ""}`,
      amountMinor: p.direction === "received" ? p.amountMinor : -p.amountMinor,
      currency: p.currency,
      accountId: p.accountId,
      status: p.status,
    });
  }

  for (const raw of rawRules) {
    const r = decryptRecurring(raw, dek);
    for (const date of expandRecurrence(
      { frequency: r.frequency as never, interval: r.interval, startDate: r.startDate, endDate: r.endDate, occurrenceCount: r.occurrenceCount },
      start,
      end,
    )) {
      items.push({
        id: `${r.id}:${date.getTime()}`,
        kind: "recurring",
        date,
        label: r.name,
        sublabel: `${r.category?.name ? `${r.category.name} · ` : ""}${r.account?.name ?? ""}`,
        amountMinor: r.type === "income" ? r.amountMinor : -r.amountMinor,
        currency: r.currency,
        accountId: r.accountId,
      });
    }
  }

  for (const raw of rawProvisions) {
    const pr = decryptProvision(raw, dek);
    const funded = pr.allocations.reduce((s, a) => s + a.amountMinor, 0);
    const shortfall = Math.max(0, pr.targetMinor - funded);
    items.push({
      id: pr.id,
      kind: "provision",
      date: pr.dueDate!,
      label: pr.name,
      sublabel: shortfall > 0 ? "Provision due" : "Provision (fully funded)",
      amountMinor: -shortfall,
      currency: pr.currency,
      accountId: pr.accountId ?? undefined,
    });
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface DashboardData {
  accounts: AccountWithBalance[];
  netWorthMinor: number;
  monthIncomeMinor: number;
  monthExpenseMinor: number;
  savingsRate: number;
  runway: RunwayResult;
  projection: ProjectionResult;
  obligations: UpcomingObligation[];
  baseCurrency: string;
}

export async function getDashboard(horizonDays = 90): Promise<DashboardData> {
  const { user, dek } = await requireUser();
  const settings = await getSettings();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [accounts, { result }, obligations, rawMonthTx, rawLast3] = await Promise.all([
    getAccountsWithBalances(),
    getProjection({ horizonDays }),
    getUpcomingObligations(horizonDays),
    prisma.transaction.findMany({ where: { userId: user.id, status: "posted", date: { gte: monthStart, lte: monthEnd } } }),
    prisma.transaction.findMany({
      where: { userId: user.id, status: "posted", date: { gte: subMonths(now, 3) }, type: { in: ["income", "expense"] } },
    }),
  ]);

  const monthTx = rawMonthTx.map((t) => decryptTransaction(t, dek));
  const last3 = rawLast3.map((t) => decryptTransaction(t, dek));

  const netWorthMinor = accounts.reduce((s, a) => s + a.balanceMinor, 0);
  const monthIncomeMinor = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amountMinor, 0);
  const monthExpenseMinor = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountMinor, 0);
  const savingsRate = monthIncomeMinor > 0 ? (monthIncomeMinor - monthExpenseMinor) / monthIncomeMinor : 0;

  const income3 = last3.filter((t) => t.type === "income").reduce((s, t) => s + t.amountMinor, 0);
  const expense3 = last3.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountMinor, 0);
  const monthlyNetMinor = Math.round((income3 - expense3) / 3);
  const runway = computeRunway(netWorthMinor, monthlyNetMinor, now);

  return {
    accounts,
    netWorthMinor,
    monthIncomeMinor,
    monthExpenseMinor,
    savingsRate,
    runway,
    projection: result,
    obligations,
    baseCurrency: settings.baseCurrency,
  };
}

// ── Transactions ──────────────────────────────────────────────────────────────

export interface TransactionFilters {
  type?: "income" | "expense" | "transfer";
  accountId?: string;
  categoryId?: string;
  tag?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

export async function getTransactions(filters: TransactionFilters = {}) {
  const { user, dek } = await requireUser();
  const where: Record<string, unknown> = { userId: user.id, status: "posted" };
  if (filters.type) where.type = filters.type;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.from || filters.to) {
    where.date = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }

  const rows = await prisma.transaction.findMany({
    where,
    include: { account: true, transferAccount: true, category: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  let mapped = rows.map((t) => decryptTransaction(t, dek));
  // Note/tag search happens post-decryption (fields are encrypted at rest).
  if (filters.search) {
    const q = filters.search.toLowerCase();
    mapped = mapped.filter((t) => (t.note ?? "").toLowerCase().includes(q));
  }
  if (filters.tag) mapped = mapped.filter((t) => t.tagList.includes(filters.tag!));
  return mapped;
}

export async function getCategories() {
  const { user, dek } = await requireUser();
  const rows = await prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });
  return rows.map((c) => decryptCategory(c, dek));
}

export async function getRecurringRules() {
  const { user, dek } = await requireUser();
  const rows = await prisma.recurringRule.findMany({
    where: { userId: user.id },
    include: { account: true, category: true },
    orderBy: { nextRunDate: "asc" },
  });
  return rows.map((r) => decryptRecurring(r, dek));
}

// ── PDCs ──────────────────────────────────────────────────────────────────────

export interface PdcFilters {
  status?: string;
  direction?: string;
}

export async function getPdcs(filters: PdcFilters = {}) {
  const { user, dek } = await requireUser();
  const where: Record<string, unknown> = { userId: user.id };
  if (filters.status) where.status = filters.status;
  if (filters.direction) where.direction = filters.direction;
  const rows = await prisma.pDC.findMany({ where, include: { account: true }, orderBy: { dueDate: "asc" } });
  return rows.map((p) => decryptPdc(p, dek));
}

// ── Provisions ────────────────────────────────────────────────────────────────

export type ProvisionWithFunding = Awaited<ReturnType<typeof getProvisions>>[number];

export async function getProvisions() {
  const { user, dek } = await requireUser();
  const rows = await prisma.provision.findMany({
    where: { userId: user.id },
    include: { allocations: true, account: true },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
  });
  const now = new Date();
  return rows.map((raw) => {
    const p = decryptProvision(raw, dek);
    const fundedMinor = p.allocations.reduce((s, a) => s + a.amountMinor, 0);
    const remainingMinor = Math.max(0, p.targetMinor - fundedMinor);
    const progress = p.targetMinor > 0 ? Math.min(1, fundedMinor / p.targetMinor) : 1;
    const monthsLeft = p.dueDate
      ? Math.max(0, (p.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;
    const suggestedMonthlyMinor = monthsLeft && monthsLeft > 0 ? Math.ceil(remainingMinor / monthsLeft) : remainingMinor;
    const onTrack = remainingMinor === 0 || (monthsLeft != null && monthsLeft >= 1);
    return { ...p, fundedMinor, remainingMinor, progress, monthsLeft, suggestedMonthlyMinor, onTrack };
  });
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export async function getBudgets(month: string) {
  const { user, dek } = await requireUser();
  const [rawBudgets, rawCategories] = await Promise.all([
    prisma.budget.findMany({ where: { userId: user.id, month }, include: { category: true } }),
    prisma.category.findMany({ where: { userId: user.id, kind: "expense" } }),
  ]);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = endOfMonth(from);
  const rawTx = await prisma.transaction.findMany({
    where: { userId: user.id, status: "posted", type: "expense", date: { gte: from, lte: to } },
  });
  const budgets = rawBudgets.map((b) => decryptBudget(b, dek));
  const categories = rawCategories.map((c) => decryptCategory(c, dek));
  const actualByCat = new Map<string, number>();
  for (const raw of rawTx) {
    const t = decryptTransaction(raw, dek);
    if (!t.categoryId) continue;
    actualByCat.set(t.categoryId, (actualByCat.get(t.categoryId) ?? 0) + t.amountMinor);
  }
  return { budgets, categories, actualByCat: Object.fromEntries(actualByCat) };
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportData {
  months: { key: string; label: string; incomeMinor: number; expenseMinor: number; netMinor: number }[];
  byCategory: { name: string; color: string; amountMinor: number }[];
  topPayees: { name: string; amountMinor: number; count: number }[];
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  avgMonthlyExpenseMinor: number;
  baseCurrency: string;
  monthsBack: number;
}

export async function getReportData(monthsBack = 6): Promise<ReportData> {
  const { user, dek } = await requireUser();
  const settings = await getSettings();
  const now = new Date();
  const from = startOfMonth(subMonths(now, monthsBack - 1));

  const [rawTxs, rawCategories] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id, status: "posted", type: { in: ["income", "expense"] }, date: { gte: from } } }),
    prisma.category.findMany({ where: { userId: user.id } }),
  ]);
  const categories = rawCategories.map((c) => decryptCategory(c, dek));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const monthMap = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  for (let i = 0; i < monthsBack; i++) {
    const d = startOfMonth(subMonths(now, monthsBack - 1 - i));
    monthMap.set(format(d, "yyyy-MM"), { incomeMinor: 0, expenseMinor: 0 });
  }

  const catTotals = new Map<string, number>();
  const payeeTotals = new Map<string, { amountMinor: number; count: number }>();
  let totalIncomeMinor = 0;
  let totalExpenseMinor = 0;

  for (const raw of rawTxs) {
    const t = decryptTransaction(raw, dek);
    const key = format(t.date, "yyyy-MM");
    const bucket = monthMap.get(key);
    if (t.type === "income") {
      if (bucket) bucket.incomeMinor += t.amountMinor;
      totalIncomeMinor += t.amountMinor;
    } else {
      if (bucket) bucket.expenseMinor += t.amountMinor;
      totalExpenseMinor += t.amountMinor;
      const catName = t.categoryId ? catById.get(t.categoryId)?.name ?? "Uncategorised" : "Uncategorised";
      catTotals.set(catName, (catTotals.get(catName) ?? 0) + t.amountMinor);
      const payee = (t.note ?? "").trim() || "Other";
      const cur = payeeTotals.get(payee) ?? { amountMinor: 0, count: 0 };
      payeeTotals.set(payee, { amountMinor: cur.amountMinor + t.amountMinor, count: cur.count + 1 });
    }
  }

  const colorByCat = new Map(categories.map((c) => [c.name, c.color]));
  const byCategory = [...catTotals.entries()]
    .map(([name, amountMinor]) => ({ name, color: colorByCat.get(name) ?? "#94a3b8", amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
  const topPayees = [...payeeTotals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, 8);
  const months = [...monthMap.entries()].map(([key, v]) => ({
    key,
    label: format(new Date(`${key}-01`), "MMM"),
    incomeMinor: v.incomeMinor,
    expenseMinor: v.expenseMinor,
    netMinor: v.incomeMinor - v.expenseMinor,
  }));

  return {
    months,
    byCategory,
    topPayees,
    totalIncomeMinor,
    totalExpenseMinor,
    avgMonthlyExpenseMinor: Math.round(totalExpenseMinor / monthsBack),
    baseCurrency: settings.baseCurrency,
    monthsBack,
  };
}

// ── Rates ─────────────────────────────────────────────────────────────────────

export async function getRates() {
  const { user } = await requireUser();
  return prisma.exchangeRate.findMany({ where: { userId: user.id }, orderBy: [{ base: "asc" }, { quote: "asc" }] });
}
