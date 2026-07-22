import { describe, expect, it } from "vitest";
import { computeSalaryPeriod, type DatedAmount } from "./salary-period";

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

  it("defines the period from the next salary to the following one", () => {
    const salaryEvents: DatedAmount[] = [
      { date: d("2026-07-25"), amountMinor: aed(20_000) },
      { date: d("2026-08-25"), amountMinor: aed(20_000) },
    ];
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(50_000),
      salaryEvents,
      costEvents: [
        { date: d("2026-07-30"), amountMinor: aed(6_000) }, // in period
        { date: d("2026-08-26"), amountMinor: aed(9_999) }, // next period — excluded
      ],
    });
    expect(r.periodStart).toEqual(d("2026-07-25"));
    expect(r.periodEnd).toEqual(d("2026-08-25"));
    expect(r.salaryMinor).toBe(aed(20_000));
    expect(r.costsMinor).toBe(aed(6_000));
  });

  it("covers costs and grows savings when salary exceeds period costs", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(30_000),
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-08-01"), amountMinor: aed(12_000) }],
    });
    expect(r.coversCosts).toBe(true);
    expect(r.surplusMinor).toBe(aed(8_000));
    expect(r.shortfallMinor).toBe(0);
    // Savings untouched (salary covered the period).
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

  it("never drives free savings below zero", () => {
    const r = computeSalaryPeriod({
      today: d("2026-07-16"),
      savingsMinor: aed(2_000),
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(5_000) }],
      costEvents: [{ date: d("2026-07-28"), amountMinor: aed(20_000) }],
    });
    expect(r.shortfallMinor).toBe(aed(15_000));
    expect(r.freeSavingsMinor).toBe(0);
  });
});
