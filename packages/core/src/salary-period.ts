// ─────────────────────────────────────────────────────────────────────────────
// Salary-period engine — pure, dependency-light (date-fns only), unit-tested.
//
// The question this answers, in the user's words: during a monthly salary
// period, how much of my savings is genuinely *free* — and will the next
// salary cover that period's committed costs, or will it eat into savings?
//
// Definitions (kept deliberately explicit so the dashboard can explain itself):
//  • period      = from the next salary date up to the following salary date.
//  • salaryMinor = income landing inside that period.
//  • costsMinor  = committed costs dated inside that period (recurring costs,
//                  scheduled spend, issued cheques due, provisions due, card).
//  • shortfall   = costs the salary can't cover (max(0, costs − salary)).
//  • freeSavings = current savings, reduced ONLY by that shortfall. If the
//                  salary covers the period, savings are left whole.
//
// Everything is integer minor units; incoming amounts are POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addMonths, isBefore, startOfDay } from "date-fns";

export interface DatedAmount {
  date: Date;
  amountMinor: number; // positive magnitude
}

export interface SalaryPeriodInput {
  today: Date;
  /** Current liquid savings across asset accounts (excludes card liability). */
  savingsMinor: number;
  /** Upcoming monthly-salary occurrences (positive amounts). */
  salaryEvents: DatedAmount[];
  /** Committed future costs (positive amounts). */
  costEvents: DatedAmount[];
}

export interface SalaryPeriodResult {
  hasSalary: boolean;
  periodStart: Date;
  periodEnd: Date;
  salaryMinor: number;
  costsMinor: number;
  /** salary − costs (positive = surplus flowing into savings). */
  netMinor: number;
  coversCosts: boolean;
  /** Costs the salary can't cover — drawn from savings. */
  shortfallMinor: number;
  /** Surplus this period that grows savings. */
  surplusMinor: number;
  /** Savings that remain unspoken-for after covering any shortfall. */
  freeSavingsMinor: number;
}

export function computeSalaryPeriod(input: SalaryPeriodInput): SalaryPeriodResult {
  const today = startOfDay(input.today);

  const salarySorted = input.salaryEvents
    .map((e) => ({ date: startOfDay(e.date), amountMinor: e.amountMinor }))
    .filter((e) => !isBefore(e.date, today)) // date >= today
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const hasSalary = salarySorted.length > 0;

  // Without a monthly salary the "salary period" concept doesn't apply, so we
  // can't judge coverage — leave savings whole rather than treating every cost
  // as an uncovered shortfall.
  if (!hasSalary) {
    return {
      hasSalary: false,
      periodStart: today,
      periodEnd: addMonths(today, 1),
      salaryMinor: 0,
      costsMinor: 0,
      netMinor: 0,
      coversCosts: true,
      shortfallMinor: 0,
      surplusMinor: 0,
      freeSavingsMinor: input.savingsMinor,
    };
  }

  const periodStart = salarySorted[0].date;

  // Period ends at the next *later* salary date, else a month after it starts.
  const nextAfter = salarySorted.find((e) => e.date.getTime() > periodStart.getTime());
  const periodEnd = nextAfter ? nextAfter.date : addMonths(periodStart, 1);

  const inPeriod = (d: Date) => {
    const t = startOfDay(d).getTime();
    return t >= periodStart.getTime() && t < periodEnd.getTime();
  };

  const salaryMinor = salarySorted
    .filter((e) => inPeriod(e.date))
    .reduce((s, e) => s + Math.max(0, e.amountMinor), 0);

  const costsMinor = input.costEvents
    .filter((e) => inPeriod(e.date))
    .reduce((s, e) => s + Math.max(0, e.amountMinor), 0);

  const netMinor = salaryMinor - costsMinor;
  const shortfallMinor = Math.max(0, -netMinor);
  const surplusMinor = Math.max(0, netMinor);
  const freeSavingsMinor = Math.max(0, input.savingsMinor - shortfallMinor);

  return {
    hasSalary,
    periodStart,
    periodEnd,
    salaryMinor,
    costsMinor,
    netMinor,
    coversCosts: netMinor >= 0,
    shortfallMinor,
    surplusMinor,
    freeSavingsMinor,
  };
}
