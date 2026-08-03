// Server-side read layer (used by React Server Components). Every function
// resolves the authenticated user (+ their DEK) via requireUser(), scopes all
// DB access to that user's id, and decrypts rows through the crypto map before
// returning. Pages therefore keep working with plain numbers/strings and can
// never see another user's data.

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import {
  decInt,
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
  eventsFromProvisions,
  eventsFromRecurring,
  expandRecurrence,
  occurrenceKey,
  projectBalances,
  type ProjectionAccount,
  type ProjectionEvent,
  type ProjectionResult,
  type RunwayResult,
} from "@/lib/projection";
import { computeBalances } from "./balances";
import {
  buildCashflowTimeline,
  freeSavingsAt,
  type CashflowTimeline,
  type DatedAmount,
} from "@/lib/cashflow-timeline";
import { nextDueDate, statementBucketDue, upcomingStatements } from "@/lib/card-cycle";
import {
  buildNotifications,
  type NotificationItem,
  type RecoveringAccount,
  type SalaryReadySignal,
} from "@/lib/notifications";

/** The free-savings pool projection looks 2 years ahead, daily granularity. */
export const POOL_TIMELINE_MONTHS = 24;

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

/**
 * The set of recurring occurrences already materialised as posted income
 * transactions ("debited"). Keyed by rule + day so a projected occurrence can be
 * reconciled against its real posting and never double-counted. Operates on
 * already-decrypted transactions (recurringRuleId/date/type are plaintext, but
 * we take decrypted rows since callers already have them).
 */
function debitedOccurrenceKeys(
  transactions: { type: string; status: string; recurringRuleId: string | null; date: Date }[],
): Set<string> {
  const keys = new Set<string>();
  for (const t of transactions) {
    if (t.status === "posted" && t.type === "income" && t.recurringRuleId) {
      keys.add(occurrenceKey(t.recurringRuleId, t.date));
    }
  }
  return keys;
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

  const [rawAccounts, rawPosted, rawScheduled, rawRules, rawPdcs, rawProvisions] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, isArchived: false }, orderBy: { sortOrder: "asc" } }),
    prisma.transaction.findMany({ where: { userId: user.id, status: "posted" } }),
    prisma.transaction.findMany({ where: { userId: user.id, status: "scheduled", date: { gte: start, lte: end } } }),
    prisma.recurringRule.findMany({ where: { userId: user.id, isActive: true } }),
    prisma.pDC.findMany({ where: { userId: user.id, status: "pending" } }),
    prisma.provision.findMany({
      where: { userId: user.id, status: "active", dueDate: { not: null } },
      include: { allocations: true },
    }),
  ]);

  const accounts = rawAccounts.map((a) => decryptAccount(a, dek));
  const posted = rawPosted.map((t) => decryptTransaction(t, dek));
  const scheduled = rawScheduled.map((t) => decryptTransaction(t, dek));
  const rules = rawRules.map((r) => decryptRecurring(r, dek));
  const pdcs = rawPdcs.map((p) => decryptPdc(p, dek));
  const provisions = rawProvisions.map((p) => decryptProvision(p, dek));

  const currentBalances = computeBalances(accounts, posted, start);

  // A recurring income occurrence that's already been "debited" (materialised as
  // a posted income transaction) is in the balance above — don't also project it.
  const debited = debitedOccurrenceKeys(posted);

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
      debited,
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
    // Provisions with a due date are dated obligations, so they count as costs.
    // They settle against their own account, else the first asset account.
    ...eventsFromProvisions(
      provisions.map((p) => ({
        id: p.id,
        name: p.name,
        remainingMinor: Math.max(
          0,
          p.targetMinor - p.allocations.reduce((s, a) => s + a.amountMinor, 0),
        ),
        dueDate: p.dueDate,
        accountId: p.accountId,
        status: p.status,
      })),
      start,
      end,
      accounts.find((a) => a.type !== "credit_card")?.id,
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

  const [rawPdcs, rawRules, rawProvisions, rawDebited] = await Promise.all([
    prisma.pDC.findMany({
      where: { userId: user.id, status: "pending", dueDate: { gte: start, lte: end } },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({ where: { userId: user.id, isActive: true }, include: { account: true, category: true } }),
    prisma.provision.findMany({
      where: { userId: user.id, status: "active", dueDate: { gte: start, lte: end } },
      include: { allocations: true },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, status: "posted", type: "income", recurringRuleId: { not: null } },
      select: { recurringRuleId: true, date: true },
    }),
  ]);

  const debited = new Set<string>();
  for (const t of rawDebited) if (t.recurringRuleId) debited.add(occurrenceKey(t.recurringRuleId, t.date));

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
      if (r.type === "income" && debited.has(occurrenceKey(r.id, date))) continue;
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

export interface NextSalary {
  date: Date;
  amountMinor: number;
  name: string;
}
export interface NextCardDue {
  date: Date;
  amountMinor: number;
  cardName: string;
}
export interface NextCheque {
  date: Date;
  amountMinor: number;
  direction: string;
  counterparty: string;
}
export interface NextProvision {
  date: Date;
  amountMinor: number;
  name: string;
}

/**
 * Assemble the forward-looking dashboard view: the free-savings pool (the
 * realized ledger, or today's live balance if no cycle has been confirmed
 * yet), what's next (salary, card due, cheque, provision), a provisional pool
 * value at the next salary date, and the 2-year daily/cycle timeline. See
 * `lib/free-savings-pool.ts` for the pool's definitions. `accounts` is passed
 * in so we reuse the already-computed balances instead of re-folding the
 * ledger.
 */
export async function loadForwardView(
  userId: string,
  dek: Buffer,
  accounts: AccountWithBalance[],
): Promise<{
  poolMinor: number;
  nextSalary: NextSalary | null;
  nextCardDue: NextCardDue | null;
  nextCheque: NextCheque | null;
  nextProvision: NextProvision | null;
  provisionalPoolAtNextSalaryMinor: number | null;
  poolDryDate: Date | null;
  poolDryAmountMinor: number | null;
  timeline: CashflowTimeline;
  creditCardOwedMinor: number;
  savingsMinor: number;
}> {
  const today = startOfDay(new Date());
  // Two years: the pool graph projects that far ahead, so every other lookup
  // in this function (next cheque, next provision, ...) shares the same window.
  const windowEnd = addMonths(today, POOL_TIMELINE_MONTHS);

  // Card accounts with a due day — their posted spend is fetched so future-dated
  // charges can be billed on their own cycle instead of the current one.
  const cardAccountIds = accounts
    .filter((a) => a.type === "credit_card" && a.dueDay != null)
    .map((a) => a.id);

  const [rawRules, rawPdcs, rawProvisions, rawScheduled, rawPostedCardTx, rawDebited, rawPoolState] = await Promise.all([
    prisma.recurringRule.findMany({ where: { userId, isActive: true } }),
    prisma.pDC.findMany({ where: { userId, status: "pending", dueDate: { gte: today, lte: windowEnd } } }),
    prisma.provision.findMany({
      // Only provisions with a due date are dated obligations; open-ended
      // savings goals have no point on the timeline.
      where: { userId, status: "active", dueDate: { gte: today, lte: windowEnd } },
      include: { allocations: true },
    }),
    prisma.transaction.findMany({
      where: { userId, status: "scheduled", date: { gte: today, lte: windowEnd } },
    }),
    cardAccountIds.length
      ? prisma.transaction.findMany({
          where: {
            userId,
            status: "posted",
            OR: [
              // Charges to the card.
              { type: "expense", accountId: { in: cardAccountIds } },
              // Payments: a transfer whose destination is the card.
              { type: "transfer", transferAccountId: { in: cardAccountIds } },
            ],
          },
        })
      : Promise.resolve([]),
    // Income occurrences already debited into an account (recurringRuleId/date are
    // plaintext, so no decryption needed) — excluded from the projected income so
    // a landed salary isn't counted both in savings and as a future event.
    prisma.transaction.findMany({
      where: { userId, status: "posted", type: "income", recurringRuleId: { not: null } },
      select: { recurringRuleId: true, date: true },
    }),
    // The realized pool ledger — read-only here. Bootstrapping (a write) only
    // happens inside the salary-debit mutation, never from a query.
    prisma.freeSavingsState.findUnique({ where: { userId } }),
  ]);

  const rules = rawRules.map((r) => decryptRecurring(r, dek));
  const debited = new Set<string>();
  for (const t of rawDebited) if (t.recurringRuleId) debited.add(occurrenceKey(t.recurringRuleId, t.date));
  const notDebited = (ruleId: string) => (date: Date) => !debited.has(occurrenceKey(ruleId, date));

  // Posted card spend and card payments, grouped by card. Payments are transfers
  // INTO the card, so they key off transferAccountId, not accountId.
  const postedByCard = new Map<string, DatedAmount[]>();
  const paymentsByCard = new Map<string, DatedAmount[]>();
  for (const raw of rawPostedCardTx) {
    const t = decryptTransaction(raw, dek);
    const isPayment = t.type === "transfer";
    const cardId = isPayment ? t.transferAccountId : t.accountId;
    if (!cardId) continue;
    const target = isPayment ? paymentsByCard : postedByCard;
    const list = target.get(cardId);
    if (list) list.push({ date: t.date, amountMinor: t.amountMinor });
    else target.set(cardId, [{ date: t.date, amountMinor: t.amountMinor }]);
  }

  // ── Credit cards are loans repaid on a due date ─────────────────────────────
  // A charge to a card doesn't leave cash when it's swiped; the statement is
  // repaid on the card's due date. So we collect each card's FUTURE charges
  // (recurring occurrences + scheduled spend) and, together with what's already
  // owed, turn them into repayment events on the due dates below. Those charges
  // are therefore kept OUT of the direct cost list to avoid double-counting.
  const cards = accounts.filter((a) => a.type === "credit_card" && a.dueDay != null);
  const cardIds = new Set(cards.map((c) => c.id));
  const cardCharges = new Map<string, DatedAmount[]>();
  const pushCharge = (accountId: string, e: DatedAmount) => {
    const list = cardCharges.get(accountId);
    if (list) list.push(e);
    else cardCharges.set(accountId, [e]);
  };

  // Free savings base = liquid asset accounts (never a credit-card liability).
  const savingsMinor = accounts
    .filter((a) => !a.isSystem && a.type !== "credit_card")
    .reduce((s, a) => s + a.balanceMinor, 0);

  const expandFrom = (r: (typeof rules)[number], from: Date) =>
    expandRecurrence(
      { frequency: r.frequency as never, interval: r.interval, startDate: r.startDate, endDate: r.endDate, occurrenceCount: r.occurrenceCount },
      from,
      windowEnd,
    );
  const expand = (r: (typeof rules)[number]) => expandFrom(r, today);
  // Card charges reach back two months so a recurring occurrence dated before
  // today but still billing on the current statement is picked up; the statement
  // builder drops any that would land on an already-past due date.
  const cardChargeWindowStart = subMonths(today, 2);

  // Salary is the ONE explicitly-flagged income rule (see RecurringRule.isSalary).
  // Confirming its occurrence closes a free-savings cycle (see mutations/free-savings.ts).
  const salaryRule = rules.find((r) => r.type === "income" && r.isSalary);
  const salaryEvents: DatedAmount[] = salaryRule
    ? expand(salaryRule)
        .filter(notDebited(salaryRule.id))
        .map((date) => ({ date, amountMinor: salaryRule.amountMinor }))
    : [];

  // Every other income stream (business/freelance income, scheduled income and
  // received cheques) is pure free savings the moment it lands.
  const otherIncomeEvents: DatedAmount[] = rules
    .filter((r) => r.type === "income" && r.id !== salaryRule?.id)
    .flatMap((r) => expand(r).filter(notDebited(r.id)).map((date) => ({ date, amountMinor: r.amountMinor })));

  // Committed costs: recurring costs, scheduled spend, issued cheques due and
  // the unfunded remainder of provisions that carry a due date. Charges aimed at
  // a credit card are diverted to that card and billed on its due date instead.
  const costEvents: DatedAmount[] = [];
  for (const r of rules.filter((r) => r.type === "expense")) {
    const isCard = cardIds.has(r.accountId);
    const dates = isCard ? expandFrom(r, cardChargeWindowStart) : expand(r);
    for (const date of dates) {
      const e = { date, amountMinor: r.amountMinor };
      if (isCard) pushCharge(r.accountId, e);
      else costEvents.push(e);
    }
  }
  for (const raw of rawScheduled) {
    const t = decryptTransaction(raw, dek);
    const e = { date: t.date, amountMinor: t.amountMinor };
    if (t.type === "income") otherIncomeEvents.push(e);
    else if (t.type === "expense") {
      if (cardIds.has(t.accountId)) pushCharge(t.accountId, e);
      else costEvents.push(e);
    }
  }
  // Next cheque (either direction) and next provision due — tracked alongside
  // the cost/income folding above so we don't re-decrypt these rows below.
  let nextCheque: NextCheque | null = null;
  let nextProvision: NextProvision | null = null;
  for (const raw of rawPdcs) {
    const p = decryptPdc(raw, dek);
    if (p.direction === "issued") costEvents.push({ date: p.dueDate, amountMinor: p.amountMinor });
    else otherIncomeEvents.push({ date: p.dueDate, amountMinor: p.amountMinor });
    if (!nextCheque || p.dueDate < nextCheque.date) {
      nextCheque = { date: p.dueDate, amountMinor: p.amountMinor, direction: p.direction, counterparty: p.counterparty };
    }
  }
  for (const raw of rawProvisions) {
    const pr = decryptProvision(raw, dek);
    const funded = pr.allocations.reduce((s, a) => s + a.amountMinor, 0);
    const remaining = Math.max(0, pr.targetMinor - funded);
    if (remaining > 0 && pr.dueDate) {
      costEvents.push({ date: pr.dueDate, amountMinor: remaining });
      if (!nextProvision || pr.dueDate < nextProvision.date) {
        nextProvision = { date: pr.dueDate, amountMinor: remaining, name: pr.name };
      }
    }
  }

  // Each card's current balance + future charges become repayment events on the
  // due dates — this is where credit-card spending finally hits free savings.
  // They go into costEvents (for the maths) and into cardBillEvents (so the
  // dashboard can show the "Total Amount Due" spike landing on each due date).
  const cardBillEvents: DatedAmount[] = [];
  let nextCardDue: NextCardDue | null = null;
  for (const card of cards) {
    const dueDay = card.dueDay!;
    // Signed: negative when the card is in credit (overpaid).
    const owedNow = -card.balanceMinor;
    // One statement series drives all three readings — the pool projection, the
    // dashboard's "next due", and the Costs page — so they can never disagree.
    // It is payment-aware: a settled cycle bills 0 and any overpayment credits
    // the next one.
    const statements = upcomingStatements(
      dueDay,
      owedNow,
      postedByCard.get(card.id) ?? [],
      cardCharges.get(card.id) ?? [],
      paymentsByCard.get(card.id) ?? [],
      today,
      windowEnd,
    );
    // Only what is still unpaid leaves the pool — a settled bill costs nothing.
    const bills = statements
      .filter((s) => s.remainingMinor > 0)
      .map((s) => ({ date: s.paymentDueDate, amountMinor: s.remainingMinor }));
    costEvents.push(...bills);
    cardBillEvents.push(...bills);

    // Skip cycles already paid off — the next bill is the next one owing.
    const stmt = statements.find((s) => s.remainingMinor > 0);
    if (stmt && (!nextCardDue || stmt.paymentDueDate < nextCardDue.date)) {
      nextCardDue = { date: stmt.paymentDueDate, amountMinor: stmt.remainingMinor, cardName: card.name };
    }
  }

  // The pool: the realized ledger if a cycle has ever closed, else today's live
  // balance for display (bootstrapping/persisting only ever happens inside the
  // salary-debit mutation — see mutations/free-savings.ts).
  const poolMinor = rawPoolState ? decInt(rawPoolState.poolEnc, dek) : savingsMinor;

  const timeline = buildCashflowTimeline({
    today,
    savingsMinor: poolMinor,
    salaryEvents,
    otherIncomeEvents,
    costEvents,
    cardBillEvents,
    months: POOL_TIMELINE_MONTHS,
  });

  const creditCardOwedMinor = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((s, a) => s + Math.max(0, -a.balanceMinor), 0);

  const nextSalary: NextSalary | null = salaryEvents.length
    ? { date: salaryEvents[0].date, amountMinor: salaryEvents[0].amountMinor, name: salaryRule!.name }
    : null;

  const provisionalPoolAtNextSalaryMinor = nextSalary
    ? (freeSavingsAt(timeline.daily, differenceInCalendarDays(startOfDay(nextSalary.date), today))?.freeSavingsMinor ?? null)
    : null;

  // The "smart" bit: the first day in the 2-year projection the pool would go
  // negative if every known salary/income/cost lands as expected. Null means
  // it stays non-negative across the whole horizon.
  const dryPoint = timeline.daily.find((p) => p.freeSavingsMinor < 0) ?? null;
  const poolDryDate = dryPoint ? new Date(dryPoint.t) : null;
  const poolDryAmountMinor = dryPoint ? dryPoint.freeSavingsMinor : null;

  return {
    poolMinor,
    nextSalary,
    nextCardDue,
    nextCheque,
    nextProvision,
    provisionalPoolAtNextSalaryMinor,
    poolDryDate,
    poolDryAmountMinor,
    timeline,
    creditCardOwedMinor,
    savingsMinor,
  };
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
  poolMinor: number;
  nextSalary: NextSalary | null;
  nextCardDue: NextCardDue | null;
  nextCheque: NextCheque | null;
  nextProvision: NextProvision | null;
  provisionalPoolAtNextSalaryMinor: number | null;
  poolDryDate: Date | null;
  poolDryAmountMinor: number | null;
  timeline: CashflowTimeline;
  creditCardOwedMinor: number;
  savingsMinor: number;
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

  const {
    poolMinor,
    nextSalary,
    nextCardDue,
    nextCheque,
    nextProvision,
    provisionalPoolAtNextSalaryMinor,
    poolDryDate,
    poolDryAmountMinor,
    timeline,
    creditCardOwedMinor,
    savingsMinor,
  } = await loadForwardView(user.id, dek, accounts);

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
    poolMinor,
    nextSalary,
    nextCardDue,
    nextCheque,
    nextProvision,
    provisionalPoolAtNextSalaryMinor,
    poolDryDate,
    poolDryAmountMinor,
    timeline,
    creditCardOwedMinor,
    savingsMinor,
  };
}

export interface DebitCycleSummary {
  /** Start of the current free-savings cycle (the pool's anchor date). */
  cycleStart: Date;
  /** Posted debit/cash spend since cycleStart. */
  spentSinceCycleMinor: number;
  /** The salary rule's next occurrence, if one is configured. */
  nextSalaryDate: Date | null;
  /** Recurring + scheduled debit/cash costs due between today and nextSalaryDate
   *  (or, with no salary configured, the next 30 days). */
  provisionedUntilNextSalaryMinor: number;
}

/**
 * The debit-card usage summary for the Costs page: how much has actually left
 * debit/cash accounts since the free-savings pool's current cycle started, and
 * how much more is already provisioned (recurring + scheduled) before the next
 * salary is expected — cheques, provisions and credit-card bills are tracked
 * elsewhere, so this is scoped to debit/cash spend specifically.
 */
export async function getDebitCardCycleSummary(): Promise<DebitCycleSummary> {
  const { user, dek } = await requireUser();
  const today = startOfDay(new Date());

  const [poolState, rawSalaryRule, accounts] = await Promise.all([
    prisma.freeSavingsState.findUnique({ where: { userId: user.id } }),
    prisma.recurringRule.findFirst({ where: { userId: user.id, type: "income", isSalary: true, isActive: true } }),
    getAccountsWithBalances(),
  ]);

  const cycleStart = poolState ? poolState.anchorDate : today;
  const assetAccountIds = accounts.filter((a) => a.type !== "credit_card" && !a.isSystem).map((a) => a.id);

  let nextSalaryDate: Date | null = null;
  if (rawSalaryRule) {
    const rule = decryptRecurring(rawSalaryRule, dek);
    const occurrences = expandRecurrence(
      {
        frequency: rule.frequency as never,
        interval: rule.interval,
        startDate: rule.startDate,
        endDate: rule.endDate,
        occurrenceCount: rule.occurrenceCount,
      },
      today,
      addMonths(today, 3),
    );
    nextSalaryDate = occurrences[0] ?? null;
  }
  const horizonEnd = nextSalaryDate ?? addDays(today, 30);

  const [rawSpent, rawRules, rawScheduled] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId: user.id,
        status: "posted",
        type: "expense",
        accountId: { in: assetAccountIds },
        date: { gt: cycleStart },
      },
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id, isActive: true, type: "expense", accountId: { in: assetAccountIds } },
    }),
    prisma.transaction.findMany({
      where: {
        userId: user.id,
        status: "scheduled",
        type: "expense",
        accountId: { in: assetAccountIds },
        date: { gte: today, lte: horizonEnd },
      },
    }),
  ]);

  const spentSinceCycleMinor = rawSpent.reduce((s, t) => s + decInt(t.amountEnc, dek), 0);

  let provisionedUntilNextSalaryMinor = rawScheduled.reduce((s, t) => s + decInt(t.amountEnc, dek), 0);
  for (const raw of rawRules) {
    const r = decryptRecurring(raw, dek);
    const dates = expandRecurrence(
      {
        frequency: r.frequency as never,
        interval: r.interval,
        startDate: r.startDate,
        endDate: r.endDate,
        occurrenceCount: r.occurrenceCount,
      },
      today,
      horizonEnd,
    );
    provisionedUntilNextSalaryMinor += dates.length * r.amountMinor;
  }

  return { cycleStart, spentSinceCycleMinor, nextSalaryDate, provisionedUntilNextSalaryMinor };
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

export interface CardStatementItem {
  date: Date;
  amountMinor: number;
  label: string;
  /** A projected occurrence of a recurring rule, not a posted charge. */
  recurring: boolean;
}

export interface CardStatementView {
  statementDate: Date;
  paymentDueDate: Date;
  totalAmountDueMinor: number;
  broughtForwardMinor: number;
  paidMinor: number;
  remainingMinor: number;
  /** Always sums to totalAmountDueMinor. */
  items: CardStatementItem[];
}

export interface CreditCardView {
  id: string;
  name: string;
  currency: string;
  owedMinor: number;
  limitMinor: number | null;
  dueDay: number | null;
  /** Current cycle first, then future ones. */
  statements: CardStatementView[];
}

/** How far ahead card statements are projected. */
const CARD_STATEMENT_MONTHS = 12;

/**
 * Every credit card with its statements, each billed from its own charges and
 * settled against real payments, plus the line items that sum to each bill.
 *
 * This is the single source for both the web Costs page and `/api/v1/cards`, so
 * the two surfaces cannot drift — the itemisation is bucketed with the very same
 * `statementBucketDue` the engine bills with.
 */
export async function getCreditCardStatements(): Promise<CreditCardView[]> {
  const { user, dek } = await requireUser();
  const accounts = await getAccountsWithBalances();
  const cards = accounts.filter((a) => a.type === "credit_card");
  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id);
  const [rawCharges, rules, paymentsByCard] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id, status: "posted", type: "expense", accountId: { in: cardIds } },
      include: { category: true },
    }),
    getRecurringRules(),
    getCardPayments(cardIds),
  ]);
  const charges = rawCharges.map((t) => decryptTransaction(t, dek));

  const today = startOfDay(new Date());
  const horizon = addMonths(today, CARD_STATEMENT_MONTHS);
  // Reach back far enough that a recurring occurrence dated before today but
  // still billing on the current statement is generated.
  const chargeWindowStart = subMonths(today, 2);

  return cards.map((card) => {
    const posted = charges.filter((t) => t.accountId === card.id);
    const cardRules = rules.filter((r) => r.type === "expense" && r.accountId === card.id && r.isActive);
    const occurrencesOf = (r: (typeof cardRules)[number]) =>
      expandRecurrence(
        {
          frequency: r.frequency as never,
          interval: r.interval,
          startDate: r.startDate,
          endDate: r.endDate,
          occurrenceCount: r.occurrenceCount,
        },
        chargeWindowStart,
        horizon,
      );

    const postedCharges = posted.map((t) => ({ date: t.date, amountMinor: t.amountMinor }));
    const futureCharges =
      card.dueDay != null
        ? cardRules.flatMap((r) => occurrencesOf(r).map((date) => ({ date, amountMinor: r.amountMinor })))
        : [];
    const payments = paymentsByCard[card.id] ?? [];

    const statements =
      card.dueDay != null
        ? upcomingStatements(
            card.dueDay,
            -card.balanceMinor, // signed: negative when the card is in credit
            postedCharges,
            futureCharges,
            payments,
            today,
            horizon,
          )
        : [];

    // Bucket line items exactly as the engine bills them.
    const currentDue = card.dueDay != null ? nextDueDate(today, card.dueDay) : null;
    const itemsByDue = new Map<number, CardStatementItem[]>();
    const bucket = (item: CardStatementItem) => {
      if (card.dueDay == null || currentDue == null) return;
      const due = statementBucketDue(item.date, card.dueDay, currentDue).getTime();
      const list = itemsByDue.get(due);
      if (list) list.push(item);
      else itemsByDue.set(due, [item]);
    };
    for (const t of posted) {
      bucket({
        date: t.date,
        amountMinor: t.amountMinor,
        label: t.note || t.category?.name || "Card charge",
        recurring: false,
      });
    }
    for (const r of cardRules) {
      for (const date of occurrencesOf(r)) {
        bucket({ date, amountMinor: r.amountMinor, label: r.name, recurring: true });
      }
    }

    return {
      id: card.id,
      name: card.name,
      currency: card.currency,
      owedMinor: Math.max(0, -card.balanceMinor),
      limitMinor: card.creditLimitMinor ?? null,
      dueDay: card.dueDay ?? null,
      statements: statements.map((s) => {
        const items = [...(itemsByDue.get(s.paymentDueDate.getTime()) ?? [])].sort(
          (a, b) => a.date.getTime() - b.date.getTime(),
        );
        // Opening/overdue debt has no charge of its own — surface it so the
        // itemisation still adds up to the billed total.
        if (s.broughtForwardMinor > 0) {
          items.unshift({
            date: s.statementDate,
            amountMinor: s.broughtForwardMinor,
            label: "Balance brought forward",
            recurring: false,
          });
        }
        return { ...s, items };
      }),
    };
  });
}

/**
 * Posted payments against each credit card, keyed by card id. A payment is a
 * transfer INTO the card account, so it never appears in an expense query —
 * statement settlement has to load it separately.
 */
export async function getCardPayments(cardIds: string[]): Promise<Record<string, DatedAmount[]>> {
  const { user, dek } = await requireUser();
  if (cardIds.length === 0) return {};
  const rows = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      status: "posted",
      type: "transfer",
      transferAccountId: { in: cardIds },
    },
  });
  const byCard: Record<string, DatedAmount[]> = {};
  for (const raw of rows) {
    const t = decryptTransaction(raw, dek);
    if (!t.transferAccountId) continue;
    (byCard[t.transferAccountId] ??= []).push({ date: t.date, amountMinor: t.amountMinor });
  }
  return byCard;
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

// ── Recurring income schedule ──────────────────────────────────────────────────

export interface IncomeOccurrence {
  key: string;
  ruleId: string;
  ruleName: string;
  accountId: string;
  accountName: string;
  color: string;
  currency: string;
  date: Date;
  /** The rule's configured amount — the default when debiting. */
  defaultAmountMinor: number;
  /** True once this occurrence has been debited into its account. */
  debited: boolean;
  /** The amount actually debited (may differ from the default). */
  postedAmountMinor: number | null;
  /** Debitable = the occurrence date has arrived and it isn't debited yet. */
  debitable: boolean;
}

/**
 * The per-occurrence schedule for active recurring INCOME rules: each expected
 * pay date, whether it has been "debited" (materialised into its account), and
 * whether it's ready to debit now. Powers the Debit table on the Income page.
 * Occurrences run from a year back to a quarter ahead so history and what's
 * coming are both visible.
 */
export async function getRecurringIncomeSchedule(): Promise<IncomeOccurrence[]> {
  const { user, dek } = await requireUser();
  const today = startOfDay(new Date());
  const from = subMonths(today, 12);
  const to = addMonths(today, 3);

  const [rawRules, rawPosted] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { userId: user.id, type: "income", isActive: true },
      include: { account: true },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, status: "posted", type: "income", recurringRuleId: { not: null } },
    }),
  ]);

  const rules = rawRules.map((r) => decryptRecurring(r, dek));
  const postedByKey = new Map<string, number>();
  for (const raw of rawPosted) {
    const t = decryptTransaction(raw, dek);
    if (t.recurringRuleId) postedByKey.set(occurrenceKey(t.recurringRuleId, t.date), t.amountMinor);
  }

  const rows: IncomeOccurrence[] = [];
  for (const r of rules) {
    for (const date of expandRecurrence(
      { frequency: r.frequency as never, interval: r.interval, startDate: r.startDate, endDate: r.endDate, occurrenceCount: r.occurrenceCount },
      from,
      to,
    )) {
      const key = occurrenceKey(r.id, date);
      const postedAmountMinor = postedByKey.get(key);
      const debited = postedAmountMinor != null;
      rows.push({
        key,
        ruleId: r.id,
        ruleName: r.name,
        accountId: r.accountId,
        accountName: r.account?.name ?? "",
        color: r.account?.color ?? "#64748b",
        currency: r.currency,
        date,
        defaultAmountMinor: r.amountMinor,
        debited,
        postedAmountMinor: postedAmountMinor ?? null,
        debitable: !debited && date.getTime() <= today.getTime(),
      });
    }
  }

  // Newest first: upcoming pay dates, then the one ready to debit, then history.
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return rows;
}

// ── Notifications ───────────────────────────────────────────────────────────────

/**
 * The user's live notifications, minus the ones they've already acknowledged.
 * Derived from current balances, the 90-day projection and the recurring-income
 * schedule; acknowledgement is persisted per-user (NotificationAck) so a
 * dismissed alert stays dismissed across sessions and devices.
 */
export async function getNotifications(): Promise<NotificationItem[]> {
  const { user } = await requireUser();
  const [accounts, { result }, schedule, acks] = await Promise.all([
    getAccountsWithBalances(),
    getProjection({ horizonDays: 90 }),
    getRecurringIncomeSchedule(),
    prisma.notificationAck.findMany({ where: { userId: user.id }, select: { key: true } }),
  ]);
  const ackKeys = new Set(acks.map((a) => a.key));
  const systemIds = new Set(accounts.filter((a) => a.isSystem).map((a) => a.id));

  // The projection's own warnings are the authoritative negative/buffer/bounce
  // set; drop any raised against the auto-managed (system) card liability.
  const warnings = result.warnings.filter((w) => !systemIds.has(w.accountId));

  // Asset accounts underwater today but projected to climb back to ≥ 0.
  const recovering: RecoveringAccount[] = accounts
    .filter((a) => !a.isSystem && a.type !== "credit_card" && a.balanceMinor < 0)
    .map((a) => {
      const day = result.days.find((d) => (d.balances[a.id] ?? 0) >= 0);
      return day
        ? { id: a.id, name: a.name, currency: a.currency, balanceMinor: a.balanceMinor, firstPositiveDate: day.date }
        : null;
    })
    .filter((x): x is RecoveringAccount => x != null);

  const salaryReady: SalaryReadySignal[] = schedule
    .filter((o) => o.debitable)
    .map((o) => ({
      ruleId: o.ruleId,
      ruleName: o.ruleName,
      accountName: o.accountName,
      amountMinor: o.defaultAmountMinor,
      currency: o.currency,
      date: o.date,
    }));

  return buildNotifications({ warnings, recovering, salaryReady }).filter((n) => !ackKeys.has(n.key));
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
