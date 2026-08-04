import "server-only";
import { startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { decryptAccount, decryptTransaction, encInt, decInt } from "@/server/crypto-map";
import { computeBalances } from "@/server/balances";
import { nextDueStatement } from "@/lib/card-cycle";
import { realizeCycle } from "@/lib/free-savings-pool";
import type { DatedAmount } from "@/lib/cashflow-timeline";
import type { AuthContext } from "@/server/auth";

/**
 * Where the next cycle starts and what the pool is worth going into it.
 *
 * The append-only `FreeSavingsCycle` ledger is the source of truth: the anchor
 * is simply the latest realized cycle's end, and the pool its closing value.
 * `FreeSavingsState` is a cache of that same row (written alongside it), so it
 * is deliberately not read here — a stale or orphaned state row can never drag
 * the ledger out of line.
 *
 * Before any cycle has closed, the story starts where the account does: the
 * anchor is the user's creation date and the pool is their asset balance *as of
 * that date* (openings plus anything backdated before it). Anchoring on "today"
 * instead — as this used to — silently swallowed everything between account
 * creation and the first confirmation, and made the first confirmation of a
 * back-dated salary realize nothing at all.
 *
 * Read-only: nothing is persisted until a cycle actually realizes.
 */
export async function resolveFreeSavingsAnchor(
  userId: string,
  dek: Buffer,
): Promise<{ poolMinor: number; anchorDate: Date }> {
  const latest = await prisma.freeSavingsCycle.findFirst({
    where: { userId },
    orderBy: { cycleEnd: "desc" },
  });
  if (latest) {
    return { poolMinor: decInt(latest.poolAfterEnc, dek), anchorDate: latest.cycleEnd };
  }

  const [user, rawAccounts, rawTx] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
    prisma.account.findMany({ where: { userId, isArchived: false } }),
    prisma.transaction.findMany({ where: { userId, status: "posted" } }),
  ]);
  const accounts = rawAccounts.map((a) => decryptAccount(a, dek));
  const txs = rawTx.map((t) => decryptTransaction(t, dek));
  // Pool accounts are every asset account (cash/bank) — never credit cards,
  // never archived/system rows.
  const assetAccounts = accounts.filter((a) => a.type !== "credit_card" && !a.isSystem);
  const anchorDate = startOfDay(user.createdAt);
  const balances = computeBalances(assetAccounts, txs, anchorDate);
  const poolMinor = assetAccounts.reduce((s, a) => s + (balances[a.id] ?? a.openingBalanceMinor), 0);

  return { poolMinor, anchorDate };
}

/**
 * Realize a free-savings cycle when a SALARY occurrence is confirmed: sum
 * actual posted income and actual posted/closed costs between the pool's
 * current anchor and this confirmed date, fold the result into the pool, and
 * record the cycle. No-ops if `cycleEnd` doesn't fall after the anchor (e.g. a
 * backdated confirmation) — nothing to realize yet.
 */
export async function realizeSalaryCycle(auth: AuthContext, ruleId: string, cycleEndRaw: Date): Promise<void> {
  const { user, dek } = auth;
  const cycleEnd = startOfDay(cycleEndRaw);
  const state = await resolveFreeSavingsAnchor(user.id, dek);
  const cycleStart = state.anchorDate;
  if (cycleEnd <= cycleStart) return;

  const [rawAccounts, rawWindowTx] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, isArchived: false } }),
    prisma.transaction.findMany({
      where: { userId: user.id, status: "posted", date: { gt: cycleStart, lte: cycleEnd } },
    }),
  ]);
  const accounts = rawAccounts.map((a) => decryptAccount(a, dek));
  const assetAccountIds = new Set(accounts.filter((a) => a.type !== "credit_card" && !a.isSystem).map((a) => a.id));
  const cards = accounts.filter((a) => a.type === "credit_card" && a.dueDay != null);

  const windowTx = rawWindowTx.map((t) => decryptTransaction(t, dek));
  const incomeEvents: DatedAmount[] = windowTx
    .filter((t) => t.type === "income")
    .map((t) => ({ date: t.date, amountMinor: t.amountMinor }));
  const debitCostEvents: DatedAmount[] = windowTx
    .filter((t) => t.type === "expense" && assetAccountIds.has(t.accountId))
    .map((t) => ({ date: t.date, amountMinor: t.amountMinor }));

  // Credit-card fees: the statement due in this window, sourced the same way
  // the dashboard/AI tool report "next payment due" — not re-derived per charge.
  const cardCostEvents: DatedAmount[] = [];
  if (cards.length) {
    const rawAllTx = await prisma.transaction.findMany({ where: { userId: user.id, status: "posted" } });
    const allTx = rawAllTx.map((t) => decryptTransaction(t, dek));
    const balances = computeBalances(accounts, allTx);
    for (const card of cards) {
      const rawCardCharges = allTx.filter((t) => t.type === "expense" && t.accountId === card.id);
      // Payments are transfers INTO the card; without them a settled statement
      // would be charged against the pool a second time.
      const rawCardPayments = allTx.filter(
        (t) => t.type === "transfer" && t.transferAccountId === card.id,
      );
      const owedNow = -(balances[card.id] ?? 0); // signed: negative when in credit
      const stmt = nextDueStatement(
        card.dueDay!,
        owedNow,
        rawCardCharges.map((t) => ({ date: t.date, amountMinor: t.amountMinor })),
        [],
        rawCardPayments.map((t) => ({ date: t.date, amountMinor: t.amountMinor })),
        cycleStart,
        cycleEnd,
      );
      if (stmt && stmt.paymentDueDate > cycleStart && stmt.paymentDueDate <= cycleEnd && stmt.remainingMinor > 0) {
        cardCostEvents.push({ date: stmt.paymentDueDate, amountMinor: stmt.remainingMinor });
      }
    }
  }

  const result = realizeCycle({
    poolBeforeMinor: state.poolMinor,
    cycleStart,
    cycleEnd,
    incomeEvents,
    costEvents: [...debitCostEvents, ...cardCostEvents],
  });

  await prisma.$transaction([
    prisma.freeSavingsCycle.create({
      data: {
        userId: user.id,
        ruleId,
        cycleStart: result.cycleStart,
        cycleEnd: result.cycleEnd,
        incomeEnc: encInt(result.incomeMinor, dek),
        costsEnc: encInt(result.costsMinor, dek),
        savingsEnc: encInt(result.savingsMinor, dek),
        poolAfterEnc: encInt(result.poolAfterMinor, dek),
      },
    }),
    // The cache of the row above — created on the first realization, so it can
    // never exist without a cycle behind it.
    prisma.freeSavingsState.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        poolEnc: encInt(result.poolAfterMinor, dek),
        anchorDate: result.cycleEnd,
      },
      update: { poolEnc: encInt(result.poolAfterMinor, dek), anchorDate: result.cycleEnd },
    }),
  ]);
}

/**
 * Reverse the effect of the most recently confirmed salary cycle for this
 * rule/date, if it's genuinely the latest one on record — undoing an older
 * cycle while newer ones exist would corrupt the running pool, so that case is
 * left alone (the income transaction itself still gets removed by the caller;
 * only the pool ledger keeps its prior, slightly stale value).
 */
export async function reverseSalaryCycleIfLatest(auth: AuthContext, ruleId: string, cycleEndRaw: Date): Promise<void> {
  const { user, dek } = auth;
  const cycleEnd = startOfDay(cycleEndRaw);

  const latest = await prisma.freeSavingsCycle.findFirst({
    where: { userId: user.id },
    orderBy: { cycleEnd: "desc" },
  });
  if (!latest || latest.ruleId !== ruleId || startOfDay(latest.cycleEnd).getTime() !== cycleEnd.getTime()) return;

  const savingsMinor = decInt(latest.savingsEnc, dek);
  const poolAfterMinor = decInt(latest.poolAfterEnc, dek);
  const poolBeforeMinor = poolAfterMinor - savingsMinor;
  const cycleCount = await prisma.freeSavingsCycle.count({ where: { userId: user.id } });

  await prisma.$transaction([
    prisma.freeSavingsCycle.delete({ where: { id: latest.id } }),
    // Undoing the only cycle takes the pool back to never-realized, so the
    // cache goes with it — leaving it behind would pin the anchor to a cycle
    // that no longer exists.
    cycleCount > 1
      ? prisma.freeSavingsState.update({
          where: { userId: user.id },
          data: { poolEnc: encInt(poolBeforeMinor, dek), anchorDate: latest.cycleStart },
        })
      : prisma.freeSavingsState.deleteMany({ where: { userId: user.id } }),
  ]);
}
