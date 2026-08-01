// ─────────────────────────────────────────────────────────────────────────────
// Cash-flow timeline — pure, date-fns only, unit-tested.
//
// Answers two dashboard questions over a configurable horizon (up to a year):
//   1. "Income vs costs, month by month" — the monthly buckets.
//   2. "What are my free savings on any given day this year?" — the daily
//      running series, so the UI can scrub to any date and read a number.
//
// Free savings track the running position over the horizon: today's savings,
// plus income as it lands (salary and non-salary alike), minus every known
// committed cost as it falls due — credit-card bills on their due day, recurring
// costs, scheduled spend, cheques and provisions due. So the projected free
// savings at any chosen day is today's free savings + income received by then −
// costs known by then. Salary is tracked separately from other income only to
// draw the salary-cycle buckets (one salary date to the next). Everything is
// integer minor units; incoming amounts are POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, addMonths, differenceInCalendarDays, format, startOfDay, startOfMonth } from "date-fns";

export interface DatedAmount {
  date: Date;
  amountMinor: number; // positive magnitude
}

export interface CashflowTimelineInput {
  today: Date;
  /** Current liquid savings across asset accounts (excludes card liabilities). */
  savingsMinor: number;
  /** Monthly salary occurrences — these define the salary-cycle boundaries. */
  salaryEvents: DatedAmount[];
  /** All non-salary income (freelance, transfers, received cheques). */
  otherIncomeEvents: DatedAmount[];
  /**
   * Every committed cost — this MUST already include the credit-card statement
   * bills so the free-savings maths is complete.
   */
  costEvents: DatedAmount[];
  /**
   * The subset of `costEvents` that are credit-card statement repayments (the
   * "Total Amount Due" landing on each card's payment due date). Used only to
   * break the cost total into "card bills" vs the rest — never added again, so
   * the caller must also have them in `costEvents`.
   */
  cardBillEvents?: DatedAmount[];
  /** Horizon in months (the UI offers 3 / 6 / 9 / 12). */
  months: number;
}

export interface MonthBucket {
  /** "YYYY-MM" — stable identity for the bar, independent of label text. */
  key: string;
  label: string;
  incomeMinor: number;
  costsMinor: number;
  /** The portion of `costsMinor` that is credit-card statement bills. */
  cardBillsMinor: number;
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
  /** Income landing on THIS day alone (for the daily distribution chart). */
  dayIncomeMinor: number;
  /** Committed costs landing on THIS day alone. */
  dayCostsMinor: number;
  /** The portion of `dayCostsMinor` that is a credit-card bill (e.g. a due-date spike). */
  dayCardBillsMinor: number;
}

/** A salary cycle (one salary date to the next) of income vs costs. */
export interface CycleBucket {
  /** Stable identity for the bar (the cycle's start date, yyyy-MM-dd). */
  key: string;
  /** Short axis label — the cycle's start ("25 Jul"), or "Now" for the current tail. */
  label: string;
  /** Full span for the tooltip, e.g. "25 Jul – 24 Aug". */
  rangeLabel: string;
  startT: number; // epoch ms, inclusive
  endT: number; // epoch ms, exclusive
  incomeMinor: number;
  costsMinor: number;
  cardBillsMinor: number;
  netMinor: number;
}

export interface CashflowTimeline {
  months: MonthBucket[];
  /** Buckets by salary cycle; falls back to calendar months without a salary. */
  cycles: CycleBucket[];
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
      cardBillsMinor: 0,
      netMinor: 0,
    });
  }

  const addToBucket = (e: DatedAmount, field: "incomeMinor" | "costsMinor" | "cardBillsMinor") => {
    const d = startOfDay(e.date);
    if (d < today || d > end) return;
    const bucket = buckets.get(format(startOfMonth(d), "yyyy-MM"));
    if (!bucket) return;
    bucket[field] += Math.max(0, e.amountMinor);
  };
  for (const e of input.salaryEvents) addToBucket(e, "incomeMinor");
  for (const e of input.otherIncomeEvents) addToBucket(e, "incomeMinor");
  for (const e of input.costEvents) addToBucket(e, "costsMinor");
  // Card bills are a labelled subset already inside costEvents — track their
  // share separately without adding to the cost total again.
  for (const e of input.cardBillEvents ?? []) addToBucket(e, "cardBillsMinor");

  const monthList = [...buckets.values()];
  for (const b of monthList) b.netMinor = b.incomeMinor - b.costsMinor;

  // ── Daily free savings, salary cycle by salary cycle ──────────────────────
  // Bucket by day-offset once, so this stays O(events + days).
  const salaryByOffset = new Map<number, number>();
  const otherIncomeByOffset = new Map<number, number>();
  const costsByOffset = new Map<number, number>();
  const cardBillsByOffset = new Map<number, number>();
  const addDelta = (e: DatedAmount, into: Map<number, number>) => {
    const offset = differenceInCalendarDays(startOfDay(e.date), today);
    if (offset < 0 || offset > totalDays) return;
    into.set(offset, (into.get(offset) ?? 0) + Math.max(0, e.amountMinor));
  };
  for (const e of input.salaryEvents) addDelta(e, salaryByOffset);
  for (const e of input.otherIncomeEvents) addDelta(e, otherIncomeByOffset);
  for (const e of input.costEvents) addDelta(e, costsByOffset);
  for (const e of input.cardBillEvents ?? []) addDelta(e, cardBillsByOffset);

  // Salary dates open cycles — used for the salary-cycle buckets below.
  const salaryOffsets = new Set(salaryByOffset.keys());

  // Free savings = today's savings + income received so far − costs known so far.
  const daily: FreeSavingsPoint[] = [];
  let cumIncome = 0;
  let cumCosts = 0;
  for (let offset = 0; offset <= totalDays; offset++) {
    const dayIncome = (salaryByOffset.get(offset) ?? 0) + (otherIncomeByOffset.get(offset) ?? 0);
    const dayCosts = costsByOffset.get(offset) ?? 0;
    cumIncome += dayIncome;
    cumCosts += dayCosts;
    daily.push({
      t: addDays(today, offset).getTime(),
      freeSavingsMinor: input.savingsMinor + cumIncome - cumCosts,
      cumIncomeMinor: cumIncome,
      cumCostsMinor: cumCosts,
      dayIncomeMinor: dayIncome,
      dayCostsMinor: dayCosts,
      dayCardBillsMinor: cardBillsByOffset.get(offset) ?? 0,
    });
  }

  // ── Salary-cycle buckets ──────────────────────────────────────────────────
  // Boundaries are the salary dates. Each bucket is one cycle's income vs costs;
  // the leading segment (today → first salary) is the current cycle's tail. With
  // no salary the cycle idea doesn't apply, so we fall back to calendar months.
  const cycles: CycleBucket[] = [];
  if (salaryOffsets.size === 0) {
    for (let i = 0; i < monthList.length; i++) {
      const m = monthList[i];
      const startDate = startOfMonth(addMonths(today, i));
      cycles.push({
        key: m.key,
        label: m.label,
        rangeLabel: m.label,
        startT: startDate.getTime(),
        endT: startOfMonth(addMonths(today, i + 1)).getTime(),
        incomeMinor: m.incomeMinor,
        costsMinor: m.costsMinor,
        cardBillsMinor: m.cardBillsMinor,
        netMinor: m.netMinor,
      });
    }
  } else {
    const boundaries = [
      ...new Set([0, ...[...salaryOffsets].filter((o) => o > 0), totalDays + 1]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startOff = boundaries[i];
      const endOff = boundaries[i + 1]; // exclusive
      let income = 0;
      let costs = 0;
      let cardBills = 0;
      for (let o = startOff; o < endOff && o <= totalDays; o++) {
        income += (salaryByOffset.get(o) ?? 0) + (otherIncomeByOffset.get(o) ?? 0);
        costs += costsByOffset.get(o) ?? 0;
        cardBills += cardBillsByOffset.get(o) ?? 0;
      }
      if (income === 0 && costs === 0) continue; // drop empty stretches
      const startDate = addDays(today, startOff);
      const endDate = addDays(today, Math.min(endOff, totalDays + 1));
      const leading = startOff === 0 && !salaryOffsets.has(0);
      cycles.push({
        key: format(startDate, "yyyy-MM-dd"),
        label: leading ? "Now" : format(startDate, "d MMM"),
        rangeLabel: `${format(startDate, "d MMM")} – ${format(addDays(endDate, -1), "d MMM")}`,
        startT: startDate.getTime(),
        endT: endDate.getTime(),
        incomeMinor: income,
        costsMinor: costs,
        cardBillsMinor: cardBills,
        netMinor: income - costs,
      });
    }
  }

  return { months: monthList, cycles, daily };
}

/** Free savings on a given day-offset from today; clamps to the series ends. */
export function freeSavingsAt(daily: FreeSavingsPoint[], dayOffset: number): FreeSavingsPoint | null {
  if (daily.length === 0) return null;
  const i = Math.min(daily.length - 1, Math.max(0, Math.round(dayOffset)));
  return daily[i];
}
