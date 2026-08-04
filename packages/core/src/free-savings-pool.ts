// ─────────────────────────────────────────────────────────────────────────────
// Free-savings pool — pure, dependency-light (date-fns only), unit-tested.
//
// A cumulative ledger, distinct from any live projection: the pool only
// changes when a salary occurrence is CONFIRMED (debited). At that moment the
// cycle since the last confirmation is realized — actual posted income minus
// actual posted/closed costs in that window — and folded into the running
// pool. The pool then carries forward unchanged until the next confirmation.
//
// Everything is integer minor units; `incomeEvents`/`costEvents` amounts are
// POSITIVE magnitudes. `poolBeforeMinor`/`savingsMinor`/`poolAfterMinor` are
// SIGNED — a cycle can spend more than it earned.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { DatedAmount, FreeSavingsPoint } from "./cashflow-timeline";

export interface CycleRealizationInput {
  /** Pool value going into this cycle (signed). */
  poolBeforeMinor: number;
  /** Start of this cycle's window (the previous cycle's end, or the bootstrap anchor). */
  cycleStart: Date;
  /** The confirmed salary debit date that closes this cycle. */
  cycleEnd: Date;
  /** Actual posted income dated within the cycle window (positive amounts),
   *  including the salary occurrence itself and any other posted income. */
  incomeEvents: DatedAmount[];
  /** Actual posted debit-card costs plus any credit-card statement that
   *  closed within the cycle window (positive amounts). */
  costEvents: DatedAmount[];
}

export interface CycleRealizationResult {
  cycleStart: Date;
  cycleEnd: Date;
  incomeMinor: number;
  costsMinor: number;
  /** income − costs. Can be negative. */
  savingsMinor: number;
  /** poolBeforeMinor + savingsMinor. Can be negative. */
  poolAfterMinor: number;
}

// ── The pool's past ──────────────────────────────────────────────────────────
// The realized cycle above is an audit record of one salary period; it is NOT
// the pool's current value. The pool is what the user can actually spend today,
// so it tracks every posted movement across their asset accounts — the same
// number the forward projection then builds on. `buildPoolTrail` produces that
// value for every day from the account's creation up to (and including) the
// day given, so "what was my pool on <date>?" is answerable for any past date,
// exactly as it already is for any future one.

export interface PostedMovement {
  date: Date;
  /** SIGNED: positive when money enters the asset pool, negative when it leaves. */
  deltaMinor: number;
  /** A repayment into a credit card — the realized form of a future card bill. */
  cardPayment?: boolean;
}

export interface PoolTrailInput {
  /** First day of the trail (normally the account's creation date). */
  from: Date;
  /** Last day of the trail, inclusive (normally yesterday — today belongs to
   *  the forward series, which is seeded with the live balance). */
  to: Date;
  /** Total asset balance at the end of the day BEFORE `from`. */
  openingMinor: number;
  /** Every posted movement that changed an asset balance, in any order. */
  movements: PostedMovement[];
}

/**
 * A daily running pool value across a past window. Shares `FreeSavingsPoint`
 * with the forward projection so one chart can scrub across both; `cumIncome`/
 * `cumCosts` are measured from the start of the trail.
 */
export function buildPoolTrail(input: PoolTrailInput): FreeSavingsPoint[] {
  const from = startOfDay(input.from);
  const to = startOfDay(input.to);
  const days = differenceInCalendarDays(to, from);
  if (days < 0) return [];

  const inByOffset = new Map<number, number>();
  const outByOffset = new Map<number, number>();
  const cardByOffset = new Map<number, number>();
  for (const m of input.movements) {
    const offset = differenceInCalendarDays(startOfDay(m.date), from);
    if (offset < 0 || offset > days) continue;
    const into = m.deltaMinor >= 0 ? inByOffset : outByOffset;
    into.set(offset, (into.get(offset) ?? 0) + Math.abs(m.deltaMinor));
    if (m.cardPayment) cardByOffset.set(offset, (cardByOffset.get(offset) ?? 0) + Math.abs(m.deltaMinor));
  }

  const points: FreeSavingsPoint[] = [];
  let cumIncome = 0;
  let cumCosts = 0;
  for (let offset = 0; offset <= days; offset++) {
    const dayIncome = inByOffset.get(offset) ?? 0;
    const dayCosts = outByOffset.get(offset) ?? 0;
    cumIncome += dayIncome;
    cumCosts += dayCosts;
    points.push({
      t: addDays(from, offset).getTime(),
      freeSavingsMinor: input.openingMinor + cumIncome - cumCosts,
      cumIncomeMinor: cumIncome,
      cumCostsMinor: cumCosts,
      dayIncomeMinor: dayIncome,
      dayCostsMinor: dayCosts,
      dayCardBillsMinor: cardByOffset.get(offset) ?? 0,
    });
  }
  return points;
}

/**
 * Lay the forward projection after the trail as one continuous series, rebasing
 * the projection's cumulative totals onto the trail's so "income/costs by then"
 * counts from the same origin on both sides of today.
 *
 * The two halves are already continuous in value: the forward series is seeded
 * with today's live asset balance, which is the trail's last value plus
 * whatever posted today.
 */
export function joinPoolSeries(
  trail: FreeSavingsPoint[],
  forward: FreeSavingsPoint[],
): FreeSavingsPoint[] {
  const last = trail[trail.length - 1];
  if (!last) return forward;
  return [
    ...trail,
    ...forward.map((p) => ({
      ...p,
      cumIncomeMinor: last.cumIncomeMinor + p.cumIncomeMinor,
      cumCostsMinor: last.cumCostsMinor + p.cumCostsMinor,
    })),
  ];
}

export function realizeCycle(input: CycleRealizationInput): CycleRealizationResult {
  const cycleStart = startOfDay(input.cycleStart);
  const cycleEnd = startOfDay(input.cycleEnd);

  const incomeMinor = input.incomeEvents.reduce((s, e) => s + Math.max(0, e.amountMinor), 0);
  const costsMinor = input.costEvents.reduce((s, e) => s + Math.max(0, e.amountMinor), 0);
  const savingsMinor = incomeMinor - costsMinor;
  const poolAfterMinor = input.poolBeforeMinor + savingsMinor;

  return { cycleStart, cycleEnd, incomeMinor, costsMinor, savingsMinor, poolAfterMinor };
}
