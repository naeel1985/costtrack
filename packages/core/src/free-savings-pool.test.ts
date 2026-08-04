import { describe, expect, it } from "vitest";
import { buildPoolTrail, joinPoolSeries, realizeCycle } from "./free-savings-pool";
import { buildCashflowTimeline } from "./cashflow-timeline";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const aed = (major: number): number => major * 100;

describe("realizeCycle", () => {
  it("matches the worked example: pool + salary − credit card fee − debit card cost", () => {
    // 10,000 pool, 30,000 salary, 3,000 credit-card fee, 1,500 debit-card cost.
    const r = realizeCycle({
      poolBeforeMinor: aed(10_000),
      cycleStart: d("2026-06-25"),
      cycleEnd: d("2026-07-25"),
      incomeEvents: [{ date: d("2026-07-25"), amountMinor: aed(30_000) }],
      costEvents: [
        { date: d("2026-07-05"), amountMinor: aed(3_000) }, // credit card due
        { date: d("2026-07-20"), amountMinor: aed(1_500) }, // debit card spend
      ],
    });
    expect(r.incomeMinor).toBe(aed(30_000));
    expect(r.costsMinor).toBe(aed(4_500));
    expect(r.savingsMinor).toBe(aed(25_500));
    expect(r.poolAfterMinor).toBe(aed(35_500));
  });

  it("allows negative savings and a shrinking pool when costs exceed income", () => {
    const r = realizeCycle({
      poolBeforeMinor: aed(5_000),
      cycleStart: d("2026-06-25"),
      cycleEnd: d("2026-07-25"),
      incomeEvents: [{ date: d("2026-07-25"), amountMinor: aed(10_000) }],
      costEvents: [{ date: d("2026-07-10"), amountMinor: aed(18_000) }],
    });
    expect(r.savingsMinor).toBe(aed(-8_000));
    expect(r.poolAfterMinor).toBe(aed(-3_000)); // pool itself can go negative
  });

  it("handles a cycle with no income or costs (pool unchanged)", () => {
    const r = realizeCycle({
      poolBeforeMinor: aed(1_000),
      cycleStart: d("2026-06-25"),
      cycleEnd: d("2026-07-25"),
      incomeEvents: [],
      costEvents: [],
    });
    expect(r.incomeMinor).toBe(0);
    expect(r.costsMinor).toBe(0);
    expect(r.savingsMinor).toBe(0);
    expect(r.poolAfterMinor).toBe(aed(1_000));
  });

  it("ignores non-positive event amounts defensively", () => {
    const r = realizeCycle({
      poolBeforeMinor: 0,
      cycleStart: d("2026-06-25"),
      cycleEnd: d("2026-07-25"),
      incomeEvents: [{ date: d("2026-07-01"), amountMinor: -500 }],
      costEvents: [{ date: d("2026-07-01"), amountMinor: 0 }],
    });
    expect(r.incomeMinor).toBe(0);
    expect(r.costsMinor).toBe(0);
  });
});

describe("buildPoolTrail", () => {
  it("runs the pool day by day from posted movements", () => {
    const trail = buildPoolTrail({
      from: d("2026-07-01"),
      to: d("2026-07-05"),
      openingMinor: aed(1_000),
      movements: [
        { date: d("2026-07-02"), deltaMinor: aed(5_000) }, // salary in
        { date: d("2026-07-04"), deltaMinor: aed(-800) }, // spend out
      ],
    });

    expect(trail).toHaveLength(5);
    expect(trail.map((p) => p.freeSavingsMinor)).toEqual([
      aed(1_000), // 1 Jul — nothing yet
      aed(6_000), // 2 Jul — salary lands
      aed(6_000), // 3 Jul
      aed(5_200), // 4 Jul — spend
      aed(5_200), // 5 Jul
    ]);
    expect(trail[4].cumIncomeMinor).toBe(aed(5_000));
    expect(trail[4].cumCostsMinor).toBe(aed(800));
  });

  it("splits a day's movements into that day's income and costs", () => {
    const [day] = buildPoolTrail({
      from: d("2026-07-01"),
      to: d("2026-07-01"),
      openingMinor: 0,
      movements: [
        { date: d("2026-07-01"), deltaMinor: aed(300) },
        { date: d("2026-07-01"), deltaMinor: aed(-100) },
        { date: d("2026-07-01"), deltaMinor: aed(-250), cardPayment: true },
      ],
    });
    expect(day.dayIncomeMinor).toBe(aed(300));
    expect(day.dayCostsMinor).toBe(aed(350));
    expect(day.dayCardBillsMinor).toBe(aed(250));
    expect(day.freeSavingsMinor).toBe(aed(-50));
  });

  it("ignores movements outside the window and returns nothing for an empty one", () => {
    const trail = buildPoolTrail({
      from: d("2026-07-01"),
      to: d("2026-07-02"),
      openingMinor: aed(100),
      movements: [
        { date: d("2026-06-30"), deltaMinor: aed(999) },
        { date: d("2026-07-03"), deltaMinor: aed(999) },
      ],
    });
    expect(trail.map((p) => p.freeSavingsMinor)).toEqual([aed(100), aed(100)]);

    // Account created today: the trail (which ends yesterday) is empty.
    expect(buildPoolTrail({ from: d("2026-07-02"), to: d("2026-07-01"), openingMinor: 0, movements: [] })).toEqual([]);
  });
});

describe("joinPoolSeries", () => {
  it("meets the forward projection at today's live balance and rebases its totals", () => {
    // Trail ends yesterday at 5,200; 400 more posts today, so today's live
    // balance — what the forward series is seeded with — is 5,600.
    const trail = buildPoolTrail({
      from: d("2026-07-01"),
      to: d("2026-07-04"),
      openingMinor: aed(1_000),
      movements: [
        { date: d("2026-07-02"), deltaMinor: aed(5_000) },
        { date: d("2026-07-04"), deltaMinor: aed(-800) },
      ],
    });
    const forward = buildCashflowTimeline({
      today: d("2026-07-05"),
      savingsMinor: aed(5_600),
      salaryEvents: [{ date: d("2026-07-07"), amountMinor: aed(2_000) }],
      otherIncomeEvents: [],
      costEvents: [{ date: d("2026-07-06"), amountMinor: aed(600) }],
      months: 1,
    }).daily;

    const series = joinPoolSeries(trail, forward);
    expect(series).toHaveLength(trail.length + forward.length);

    // Continuous across the seam: yesterday 5,200 → today 5,600 (the 400 that
    // posted today) → 5,000 after the cost → 7,000 after the salary.
    expect(series.slice(3, 7).map((p) => p.freeSavingsMinor)).toEqual([
      aed(5_200),
      aed(5_600),
      aed(5_000),
      aed(7_000),
    ]);

    // Cumulative totals continue from the trail rather than restarting.
    expect(series[3].cumIncomeMinor).toBe(aed(5_000));
    expect(series[6].cumIncomeMinor).toBe(aed(7_000));
    expect(series[6].cumCostsMinor).toBe(aed(1_400));
  });

  it("falls back to the forward series alone when there is no history", () => {
    const forward = buildCashflowTimeline({
      today: d("2026-07-05"),
      savingsMinor: aed(100),
      salaryEvents: [],
      otherIncomeEvents: [],
      costEvents: [],
      months: 1,
    }).daily;
    expect(joinPoolSeries([], forward)).toBe(forward);
  });
});
