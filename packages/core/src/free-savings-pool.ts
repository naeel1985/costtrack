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

import { startOfDay } from "date-fns";
import type { DatedAmount } from "./cashflow-timeline";

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

export function realizeCycle(input: CycleRealizationInput): CycleRealizationResult {
  const cycleStart = startOfDay(input.cycleStart);
  const cycleEnd = startOfDay(input.cycleEnd);

  const incomeMinor = input.incomeEvents.reduce((s, e) => s + Math.max(0, e.amountMinor), 0);
  const costsMinor = input.costEvents.reduce((s, e) => s + Math.max(0, e.amountMinor), 0);
  const savingsMinor = incomeMinor - costsMinor;
  const poolAfterMinor = input.poolBeforeMinor + savingsMinor;

  return { cycleStart, cycleEnd, incomeMinor, costsMinor, savingsMinor, poolAfterMinor };
}
