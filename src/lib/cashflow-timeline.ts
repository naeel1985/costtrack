// ─────────────────────────────────────────────────────────────────────────────
// Cash-flow timeline — pure, date-fns only, unit-tested.
//
// Answers two dashboard questions over a configurable horizon (up to a year):
//   1. "Income vs costs, month by month" — the monthly buckets.
//   2. "What are my free savings on any given day this year?" — the daily
//      running series, so the UI can scrub to any date and read a number.
//
// Free savings at day D = current savings + all income up to D − all committed
// costs up to D. "Committed" means already known: recurring rules, scheduled
// spend, issued cheques, and provisions that carry a due date. Everything is
// integer minor units; incoming amounts are POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, addMonths, differenceInCalendarDays, format, startOfDay, startOfMonth } from "date-fns";
import type { DatedAmount } from "./salary-period";

export interface CashflowTimelineInput {
  today: Date;
  /** Current liquid savings across asset accounts (excludes card liabilities). */
  savingsMinor: number;
  incomeEvents: DatedAmount[];
  costEvents: DatedAmount[];
  /** Horizon in months (the UI offers 3 / 6 / 9 / 12). */
  months: number;
}

export interface MonthBucket {
  /** "YYYY-MM" — stable identity for the bar, independent of label text. */
  key: string;
  label: string;
  incomeMinor: number;
  costsMinor: number;
  /** income − costs for the month (negative = the month eats savings). */
  netMinor: number;
}

export interface FreeSavingsPoint {
  t: number; // epoch ms
  freeSavingsMinor: number;
  /** Income received from today up to and including this day. */
  cumIncomeMinor: number;
  /** Known committed costs from today up to and including this day. */
  cumCostsMinor: number;
}

export interface CashflowTimeline {
  months: MonthBucket[];
  /** One point per day from today through the end of the horizon, inclusive. */
  daily: FreeSavingsPoint[];
}

export function buildCashflowTimeline(input: CashflowTimelineInput): CashflowTimeline {
  const today = startOfDay(input.today);
  const months = Math.max(1, Math.round(input.months));
  // Horizon ends the day before the same day-of-month `months` later.
  const end = addDays(addMonths(today, months), -1);
  const totalDays = Math.max(0, differenceInCalendarDays(end, today));

  // ── Monthly buckets ───────────────────────────────────────────────────────
  const buckets = new Map<string, MonthBucket>();
  for (let i = 0; i < months; i++) {
    const monthStart = startOfMonth(addMonths(today, i));
    const key = format(monthStart, "yyyy-MM");
    buckets.set(key, {
      key,
      // Include the year on January so a 12-month span reads unambiguously.
      label: format(monthStart, monthStart.getMonth() === 0 ? "MMM ''yy" : "MMM"),
      incomeMinor: 0,
      costsMinor: 0,
      netMinor: 0,
    });
  }

  const addToBucket = (e: DatedAmount, field: "incomeMinor" | "costsMinor") => {
    const d = startOfDay(e.date);
    if (d < today || d > end) return;
    const bucket = buckets.get(format(startOfMonth(d), "yyyy-MM"));
    if (!bucket) return;
    bucket[field] += Math.max(0, e.amountMinor);
  };
  for (const e of input.incomeEvents) addToBucket(e, "incomeMinor");
  for (const e of input.costEvents) addToBucket(e, "costsMinor");

  const monthList = [...buckets.values()];
  for (const b of monthList) b.netMinor = b.incomeMinor - b.costsMinor;

  // ── Daily running free savings ────────────────────────────────────────────
  // Bucket by day-offset once, so this stays O(events + days).
  const incomeByOffset = new Map<number, number>();
  const costsByOffset = new Map<number, number>();
  const addDelta = (e: DatedAmount, into: Map<number, number>) => {
    const offset = differenceInCalendarDays(startOfDay(e.date), today);
    if (offset < 0 || offset > totalDays) return;
    into.set(offset, (into.get(offset) ?? 0) + Math.max(0, e.amountMinor));
  };
  for (const e of input.incomeEvents) addDelta(e, incomeByOffset);
  for (const e of input.costEvents) addDelta(e, costsByOffset);

  const daily: FreeSavingsPoint[] = [];
  let cumIncome = 0;
  let cumCosts = 0;
  for (let offset = 0; offset <= totalDays; offset++) {
    cumIncome += incomeByOffset.get(offset) ?? 0;
    cumCosts += costsByOffset.get(offset) ?? 0;
    daily.push({
      t: addDays(today, offset).getTime(),
      freeSavingsMinor: input.savingsMinor + cumIncome - cumCosts,
      cumIncomeMinor: cumIncome,
      cumCostsMinor: cumCosts,
    });
  }

  return { months: monthList, daily };
}

/** Free savings on a given day-offset from today; clamps to the series ends. */
export function freeSavingsAt(daily: FreeSavingsPoint[], dayOffset: number): FreeSavingsPoint | null {
  if (daily.length === 0) return null;
  const i = Math.min(daily.length - 1, Math.max(0, Math.round(dayOffset)));
  return daily[i];
}
