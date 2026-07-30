import { describe, expect, it } from "vitest";
import { computeSalaryPeriod, SALARY_PERIOD_WINDOW_DAYS, type DatedAmount } from "./salary-period";

// Local dates (midnight local) so the period math doesn't drift by timezone.
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const aed = (major: number): number => major * 100;

describe("computeSalaryPeriod", () => {
  it("reports no salary when there are no upcoming income events", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(10_000),
      salaryEvents: [],
      costEvents: [{ date: d("2026-07-20"), amountMinor: aed(3_000) }],
    });
    expect(r.hasSalary).toBe(false);
    // With no salary the savings are still shown whole (no shortfall computed
    // against a period we can't define).
    expect(r.freeSavingsMinor).toBe(aed(10_000));
  });

  it("still adds other income landing in the window when there's no salary configured", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(10_000),
      salaryEvents: [],
      costEvents: [{ date: d("2026-07-20"), amountMinor: aed(3_000) }],
      otherIncomeEvents: [{ date: d("2026-07-18"), amountMinor: aed(2_000) }],
    });
    expect(r.hasSalary).toBe(false);
    expect(r.otherIncomeMinor).toBe(aed(2_000));
    expect(r.freeSavingsMinor).toBe(aed(10_000) + aed(2_000));
  });

  it("defines a fixed 30-day window from today, regardless of salary timing", () => {
    const salaryEvents: DatedAmount[] = [
      { date: d("2026-07-25"), amountMinor: aed(20_000) },
      { date: d("2026-08-25"), amountMinor: aed(20_000) },
    ];
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(50_000),
      salaryEvents,
      costEvents: [
        { date: d("2026-07-30"), amountMinor: aed(6_000) }, // in window
        { date: d("2026-08-26"), amountMinor: aed(9_999) }, // beyond 30 days — excluded
      ],
    });
    expect(r.periodStart).toEqual(d("2026-07-16"));
    expect(r.periodEnd).toEqual(d("2026-08-15"));
    expect(SALARY_PERIOD_WINDOW_DAYS).toBe(30);
    // Only the 25 Jul occurrence falls in the 16 Jul – 15 Aug window.
    expect(r.salaryMinor).toBe(aed(20_000));
    expect(r.costsMinor).toBe(aed(6_000));
  });

  it("covers costs and grows savings when salary exceeds window costs", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(30_000),
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-08-01"), amountMinor: aed(12_000) }],
    });
    expect(r.coversCosts).toBe(true);
    expect(r.surplusMinor).toBe(aed(8_000));
    expect(r.shortfallMinor).toBe(0);
    // Savings untouched (salary covered the window).
    expect(r.freeSavingsMinor).toBe(aed(30_000));
  });

  it("draws the shortfall from savings when salary can't cover costs", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(30_000),
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [
        { date: d("2026-07-28"), amountMinor: aed(15_000) },
        { date: d("2026-08-05"), amountMinor: aed(10_000) },
      ],
    });
    expect(r.coversCosts).toBe(false);
    expect(r.costsMinor).toBe(aed(25_000));
    expect(r.shortfallMinor).toBe(aed(5_000)); // 25k costs − 20k salary
    expect(r.surplusMinor).toBe(0);
    expect(r.freeSavingsMinor).toBe(aed(25_000)); // 30k savings − 5k shortfall
  });

  it("never drives free savings below zero from the shortfall alone", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(2_000),
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(5_000) }],
      costEvents: [{ date: d("2026-07-28"), amountMinor: aed(20_000) }],
    });
    expect(r.shortfallMinor).toBe(aed(15_000));
    expect(r.freeSavingsMinor).toBe(0);
  });

  it("adds other (non-salary) income landing in the window on top of savings", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(10_000),
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-07-28"), amountMinor: aed(20_000) }], // net 0
      otherIncomeEvents: [
        { date: d("2026-07-20"), amountMinor: aed(1_500) }, // in window
        { date: d("2026-08-20"), amountMinor: aed(9_999) }, // beyond 30 days — excluded
      ],
    });
    expect(r.otherIncomeMinor).toBe(aed(1_500));
    expect(r.freeSavingsMinor).toBe(aed(10_000) + aed(1_500));
  });

  it("ignores events outside the 30-day window even with a salary configured", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(10_000),
      salaryEvents: [{ date: d("2026-09-01"), amountMinor: aed(20_000) }], // beyond window
      costEvents: [{ date: d("2026-09-05"), amountMinor: aed(5_000) }], // beyond window
    });
    expect(r.hasSalary).toBe(true); // salary is configured, just not landing in this window
    expect(r.salaryMinor).toBe(0);
    expect(r.costsMinor).toBe(0);
    expect(r.freeSavingsMinor).toBe(aed(10_000));
  });
});
