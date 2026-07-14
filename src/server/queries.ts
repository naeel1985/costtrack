// Server-side read layer (used by React Server Components). All DB access for
// reads funnels through here so pages stay declarative and the projection is
// assembled in exactly one place.

import {
  addDays,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { prisma } from "@/lib/db";
import { parseTags } from "@/lib/utils";
import {
  computeRunway,
  eventsFromPdcs,
  eventsFromRecurring,
  projectBalances,
  type ProjectionAccount,
  type ProjectionEvent,
  type ProjectionResult,
  type RunwayResult,
} from "@/lib/projection";
import { computeBalances } from "./balances";

export async function getSettings() {
  const existing = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.appSetting.create({ data: { id: "singleton" } });
}

export type AccountWithBalance = Awaited<
  ReturnType<typeof getAccountsWithBalances>
>[number];

export async function getAccountsWithBalances(includeArchived = false) {
  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({
      where: includeArchived ? {} : { isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.transaction.findMany({
      where: { status: "posted" },
      select: {
        type: true,
        amountMinor: true,
        accountId: true,
        transferAccountId: true,
        date: true,
        status: true,
      },
    }),
  ]);

  const balances = computeBalances(accounts, transactions);
  return accounts.map((a) => ({
    ...a,
    balanceMinor: balances[a.id] ?? a.openingBalanceMinor,
  }));
}

export interface WhatIfEvent {
  date: Date;
  accountId: string;
  amountMinor: number; // signed
  label: string;
}

export interface BuildProjectionOptions {
  horizonDays?: number;
  whatIf?: WhatIfEvent[];
}

/**
 * Assemble the full forward projection from the DB: current balances +
 * recurring rules + pending PDCs + already-scheduled transactions, then run the
 * pure engine. `whatIf` events are hypothetical and layered on top.
 */
export async function getProjection({
  horizonDays = 90,
  whatIf = [],
}: BuildProjectionOptions = {}): Promise<{
  result: ProjectionResult;
  accounts: ProjectionAccount[];
}> {
  const start = startOfDay(new Date());
  const end = addDays(start, horizonDays);

  const [accounts, allPosted, scheduled, rules, pdcs] = await Promise.all([
    prisma.account.findMany({ where: { isArchived: false }, orderBy: { sortOrder: "asc" } }),
    prisma.transaction.findMany({
      where: { status: "posted" },
      select: {
        type: true,
        amountMinor: true,
        accountId: true,
        transferAccountId: true,
        date: true,
        status: true,
      },
    }),
    prisma.transaction.findMany({
      where: { status: "scheduled", date: { gte: start, lte: end } },
    }),
    prisma.recurringRule.findMany({ where: { isActive: true } }),
    prisma.pDC.findMany({ where: { status: "pending" } }),
  ]);

  const currentBalances = computeBalances(accounts, allPosted, start);

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
  amountMinor: number; // signed: negative = outflow
  currency: string;
  accountId?: string;
  status?: string;
}

export async function getUpcomingObligations(horizonDays = 90): Promise<UpcomingObligation[]> {
  const start = startOfDay(new Date());
  const end = addDays(start, horizonDays);

  const [pdcs, rules, provisions] = await Promise.all([
    prisma.pDC.findMany({
      where: { status: "pending", dueDate: { gte: start, lte: end } },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({ where: { isActive: true }, include: { account: true, category: true } }),
    prisma.provision.findMany({
      where: { status: "active", dueDate: { gte: start, lte: end } },
      include: { allocations: true },
    }),
  ]);

  const items: UpcomingObligation[] = [];

  for (const p of pdcs) {
    items.push({
      id: p.id,
      kind: "pdc",
      date: p.dueDate,
      label: p.direction === "issued" ? `Cheque to ${p.counterparty}` : `Cheque from ${p.counterparty}`,
      sublabel: `${p.chequeNumber ? `#${p.chequeNumber} · ` : ""}${p.account.name}`,
      amountMinor: p.direction === "received" ? p.amountMinor : -p.amountMinor,
      currency: p.currency,
      accountId: p.accountId,
      status: p.status,
    });
  }

  for (const r of rules) {
    for (const date of eventDatesForRule(r, start, end)) {
      items.push({
        id: `${r.id}:${date.getTime()}`,
        kind: "recurring",
        date,
        label: r.name,
        sublabel: `${r.category?.name ? `${r.category.name} · ` : ""}${r.account.name}`,
        amountMinor: r.type === "income" ? r.amountMinor : -r.amountMinor,
        currency: r.currency,
        accountId: r.accountId,
      });
    }
  }

  for (const pr of provisions) {
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

// Local helper — expand a rule's next occurrences within a window (mirrors the
// engine's logic but returns Date[] for the obligations feed).
import { expandRecurrence } from "@/lib/projection";
function eventDatesForRule(
  r: { frequency: string; interval: number; startDate: Date; endDate: Date | null; occurrenceCount: number | null },
  from: Date,
  to: Date,
): Date[] {
  return expandRecurrence(
    {
      frequency: r.frequency as never,
      interval: r.interval,
      startDate: r.startDate,
      endDate: r.endDate,
      occurrenceCount: r.occurrenceCount,
    },
    from,
    to,
  );
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
  const settings = await getSettings();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [accounts, { result }, obligations, monthTx, last3] = await Promise.all([
    getAccountsWithBalances(),
    getProjection({ horizonDays }),
    getUpcomingObligations(horizonDays),
    prisma.transaction.findMany({
      where: { status: "posted", date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.transaction.findMany({
      where: { status: "posted", date: { gte: subMonths(now, 3) }, type: { in: ["income", "expense"] } },
    }),
  ]);

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
  const where: Record<string, unknown> = { status: "posted" };
  if (filters.type) where.type = filters.type;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.search) {
    where.note = { contains: filters.search };
  }

  const rows = await prisma.transaction.findMany({
    where,
    include: { account: true, transferAccount: true, category: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const mapped = rows.map((t) => ({ ...t, tagList: parseTags(t.tags) }));
  if (filters.tag) return mapped.filter((t) => t.tagList.includes(filters.tag!));
  return mapped;
}

export async function getCategories() {
  return prisma.category.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });
}

export async function getRecurringRules() {
  return prisma.recurringRule.findMany({
    include: { account: true, category: true },
    orderBy: { nextRunDate: "asc" },
  });
}

// ── PDCs ──────────────────────────────────────────────────────────────────────

export interface PdcFilters {
  status?: string;
  direction?: string;
  bankName?: string;
}

export async function getPdcs(filters: PdcFilters = {}) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.direction) where.direction = filters.direction;
  if (filters.bankName) where.bankName = filters.bankName;
  return prisma.pDC.findMany({
    where,
    include: { account: true },
    orderBy: { dueDate: "asc" },
  });
}

// ── Provisions ────────────────────────────────────────────────────────────────

export type ProvisionWithFunding = Awaited<ReturnType<typeof getProvisions>>[number];

export async function getProvisions() {
  const rows = await prisma.provision.findMany({
    include: { allocations: true, account: true },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
  });
  const now = new Date();
  return rows.map((p) => {
    const fundedMinor = p.allocations.reduce((s, a) => s + a.amountMinor, 0);
    const remainingMinor = Math.max(0, p.targetMinor - fundedMinor);
    const progress = p.targetMinor > 0 ? Math.min(1, fundedMinor / p.targetMinor) : 1;
    const monthsLeft = p.dueDate
      ? Math.max(0, (p.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;
    const suggestedMonthlyMinor =
      monthsLeft && monthsLeft > 0 ? Math.ceil(remainingMinor / monthsLeft) : remainingMinor;
    const onTrack = remainingMinor === 0 || (monthsLeft != null && monthsLeft >= 1);
    return {
      ...p,
      fundedMinor,
      remainingMinor,
      progress,
      monthsLeft,
      suggestedMonthlyMinor,
      onTrack,
    };
  });
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export async function getBudgets(month: string) {
  const [budgets, categories] = await Promise.all([
    prisma.budget.findMany({ where: { month }, include: { category: true } }),
    prisma.category.findMany({ where: { kind: "expense" } }),
  ]);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = endOfMonth(from);
  const tx = await prisma.transaction.findMany({
    where: { status: "posted", type: "expense", date: { gte: from, lte: to } },
  });
  const actualByCat = new Map<string, number>();
  for (const t of tx) {
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
  const settings = await getSettings();
  const now = new Date();
  const from = startOfMonth(subMonths(now, monthsBack - 1));

  const [txs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "posted", type: { in: ["income", "expense"] }, date: { gte: from } },
    }),
    prisma.category.findMany(),
  ]);
  const catById = new Map(categories.map((c) => [c.id, c]));

  // Monthly income vs expense buckets.
  const monthMap = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  for (let i = 0; i < monthsBack; i++) {
    const d = startOfMonth(subMonths(now, monthsBack - 1 - i));
    monthMap.set(format(d, "yyyy-MM"), { incomeMinor: 0, expenseMinor: 0 });
  }

  const catTotals = new Map<string, number>();
  const payeeTotals = new Map<string, { amountMinor: number; count: number }>();
  let totalIncomeMinor = 0;
  let totalExpenseMinor = 0;

  for (const t of txs) {
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

// ── Rates & settings ──────────────────────────────────────────────────────────

export async function getRates() {
  return prisma.exchangeRate.findMany({ orderBy: [{ base: "asc" }, { quote: "asc" }] });
}
