// ─────────────────────────────────────────────────────────────────────────────
// Salary-period engine — pure, dependency-light (date-fns only), unit-tested.
//
// The question this answers, in the user's words: over the next 30 days, how
// much of my savings is genuinely *free* — and will upcoming income cover
// what's committed in that window, or will it eat into savings?
//
// Definitions (kept deliberately explicit so the dashboard can explain itself):
//  • period       = a fixed rolling window: today up to (today + 30 days).
//  • salaryMinor  = monthly-salary income landing inside that window.
//  • costsMinor   = committed costs dated inside that window (recurring costs,
//                   scheduled spend, issued cheques due, provisions due, card).
//  • shortfall    = costs the salary can't cover (max(0, costs − salary)).
//  • otherIncome  = non-salary income (other recurring income, scheduled
//                   income, received cheques) dated inside the window — not
//                   yet posted, so not already reflected in `savingsMinor`.
//                   Added to free savings unconditionally the moment its date
//                   arrives — it isn't netted against costs the way salary is.
//  • freeSavings  = current savings, reduced by the shortfall (if any) and
//                   increased by anticipated other income in the window.
//
// Everything is integer minor units; incoming amounts are POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, startOfDay } from "date-fns";

/** The free-savings window always looks exactly this many days ahead. */
export const SALARY_PERIOD_WINDOW_DAYS = 30;

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
  /** Upcoming non-salary income — other recurring income, scheduled income,
   *  received cheques (positive amounts). Optional for callers that don't
   *  track it; treated as empty. */
  otherIncomeEvents?: DatedAmount[];
}

export interface SalaryPeriodResult {
  hasSalary: boolean;
  periodStart: Date;
  periodEnd: Date;
  salaryMinor: number;
  costsMinor: number;
  /** Non-salary income landing in the window (added to free savings as-is). */
  otherIncomeMinor: number;
  /** salary − costs (positive = surplus flowing into savings). */
  netMinor: number;
  coversCosts: boolean;
  /** Costs the salary can't cover — drawn from savings. */
  shortfallMinor: number;
  /** Surplus this period that grows savings. */
  surplusMinor: number;
  /** Savings that remain unspoken-for after covering any shortfall, plus any
   *  anticipated other income landing in the window. */
  freeSavingsMinor: number;
}

export function computeSalaryPeriod(input: SalaryPeriodInput): SalaryPeriodResult {
  const today = startOfDay(input.today);
  const periodStart = today;
  const periodEnd = addDays(today, SALARY_PERIOD_WINDOW_DAYS);

  const inPeriod = (d: Date) => {
    const t = startOfDay(d).getTime();
    return t >= periodStart.getTime() && t < periodEnd.getTime();
  };

  // Other income counts toward free savings whether or not a salary is
  // configured, so it's computed before branching on hasSalary.
  const otherIncomeMinor = (input.otherIncomeEvents ?? [])
    .filter((e) => inPeriod(e.date))
    .reduce((s, e) => s + Math.max(0, e.amountMinor), 0);

  // "hasSalary" means a monthly salary is configured at all (an upcoming
  // occurrence exists somewhere in the caller's lookahead) — independent of
  // whether that occurrence happens to fall inside this 30-day window.
  const hasSalary = input.salaryEvents.length > 0;

  if (!hasSalary) {
    // Without a monthly salary there's nothing to net costs against, so we
    // can't judge coverage — leave savings whole (plus anticipated other
    // income) rather than treating every cost as an uncovered shortfall.
    return {
      hasSalary: false,
      periodStart,
      periodEnd,
      salaryMinor: 0,
      costsMinor: 0,
      otherIncomeMinor,
      netMinor: 0,
      coversCosts: true,
      shortfallMinor: 0,
      surplusMinor: 0,
      freeSavingsMinor: input.savingsMinor + otherIncomeMinor,
    };
  }

  const salaryMinor = input.salaryEvents
    .filter((e) => inPeriod(e.date))
    .reduce((s, e) => s + Math.max(0, e.amountMinor), 0);

  const costsMinor = input.costEvents
    .filter((e) => inPeriod(e.date))
    .reduce((s, e) => s + Math.max(0, e.amountMinor), 0);

  const netMinor = salaryMinor - costsMinor;
  const shortfallMinor = Math.max(0, -netMinor);
  const surplusMinor = Math.max(0, netMinor);
  const freeSavingsMinor = Math.max(0, input.savingsMinor - shortfallMinor) + otherIncomeMinor;

  return {
    hasSalary,
    periodStart,
    periodEnd,
    salaryMinor,
    costsMinor,
    otherIncomeMinor,
    netMinor,
    coversCosts: netMinor >= 0,
    shortfallMinor,
    surplusMinor,
    freeSavingsMinor,
  };
}
