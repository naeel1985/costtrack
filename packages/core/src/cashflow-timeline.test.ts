import { describe, expect, it } from "vitest";
import { buildCashflowTimeline, freeSavingsAt } from "./cashflow-timeline";

// Local dates so month bucketing matches the engine's local day boundaries.
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const aed = (major: number) => major * 100;

const base = {
  today: d("2026-07-16"),
  savingsMinor: aed(10_000),
  salaryEvents: [],
  otherIncomeEvents: [],
  costEvents: [],
  months: 12,
};

describe("buildCashflowTimeline — monthly buckets", () => {
  it("produces one bucket per month of the horizon", () => {
    expect(buildCashflowTimeline({ ...base, months: 3 }).months).toHaveLength(3);
    expect(buildCashflowTimeline({ ...base, months: 6 }).months).toHaveLength(6);
    expect(buildCashflowTimeline({ ...base, months: 9 }).months).toHaveLength(9);
    expect(buildCashflowTimeline({ ...base, months: 12 }).months).toHaveLength(12);
  });

  it("buckets salary, other income and costs into their calendar month", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      otherIncomeEvents: [{ date: d("2026-08-10"), amountMinor: aed(4_000) }],
      costEvents: [
        { date: d("2026-07-20"), amountMinor: aed(6_000) },
        { date: d("2026-07-28"), amountMinor: aed(1_500) },
        { date: d("2026-09-01"), amountMinor: aed(3_000) },
      ],
    });
    const [jul, aug, sep] = t.months;
    expect(jul.key).toBe("2026-07");
    expect(jul.incomeMinor).toBe(aed(20_000));
    expect(jul.costsMinor).toBe(aed(7_500));
    expect(jul.netMinor).toBe(aed(12_500));
    expect(aug.incomeMinor).toBe(aed(4_000)); // other income counts too
    expect(aug.costsMinor).toBe(0);
    expect(sep.costsMinor).toBe(aed(3_000));
  });

  it("ignores events before today or past the horizon", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      otherIncomeEvents: [{ date: d("2026-07-01"), amountMinor: aed(99_000) }], // past
      costEvents: [{ date: d("2027-06-01"), amountMinor: aed(99_000) }], // beyond
    });
    expect(t.months.reduce((s, m) => s + m.incomeMinor + m.costsMinor, 0)).toBe(0);
  });

  it("labels January with the year so a 12-month span is unambiguous", () => {
    const t = buildCashflowTimeline({ ...base, months: 12 });
    const jan = t.months.find((m) => m.key === "2027-01");
    expect(jan?.label).toBe("Jan '27");
    expect(t.months.find((m) => m.key === "2026-08")?.label).toBe("Aug");
  });
});

describe("buildCashflowTimeline — salary-cycle buckets", () => {
  it("buckets income and costs by salary cycle, not calendar month", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 6,
      salaryEvents: [
        { date: d("2026-07-25"), amountMinor: aed(20_000) },
        { date: d("2026-08-25"), amountMinor: aed(20_000) },
      ],
      costEvents: [
        { date: d("2026-07-20"), amountMinor: aed(1_000) }, // before first salary — "Now"
        { date: d("2026-08-02"), amountMinor: aed(6_000) }, // in the 25 Jul cycle
        { date: d("2026-08-26"), amountMinor: aed(3_000) }, // in the 25 Aug cycle
      ],
    });
    const now = t.cycles[0];
    expect(now.label).toBe("Now");
    expect(now.costsMinor).toBe(aed(1_000));
    expect(now.incomeMinor).toBe(0);

    const julCycle = t.cycles.find((c) => c.key === "2026-07-25")!;
    expect(julCycle.incomeMinor).toBe(aed(20_000));
    expect(julCycle.costsMinor).toBe(aed(6_000)); // the 2 Aug cost belongs to the 25 Jul cycle
    expect(julCycle.rangeLabel).toBe("25 Jul – 24 Aug");

    const augCycle = t.cycles.find((c) => c.key === "2026-08-25")!;
    expect(augCycle.costsMinor).toBe(aed(3_000));
  });

  it("falls back to calendar months when there is no salary", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      otherIncomeEvents: [{ date: d("2026-07-20"), amountMinor: aed(4_000) }],
    });
    expect(t.cycles).toHaveLength(3);
    expect(t.cycles[0].key).toBe("2026-07");
    expect(t.cycles[0].incomeMinor).toBe(aed(4_000));
  });
});

describe("buildCashflowTimeline — running free savings", () => {
  const at = (t: ReturnType<typeof buildCashflowTimeline>, iso: string) =>
    t.daily.find((p) => p.t === d(iso).getTime())!;

  it("starts at current savings and runs to the end of the horizon", () => {
    const t = buildCashflowTimeline({ ...base, months: 12 });
    expect(t.daily[0].freeSavingsMinor).toBe(aed(10_000));
    expect(t.daily[0].t).toBe(d("2026-07-16").getTime());
    // 2026-07-16 .. 2027-07-15 inclusive = 365 days.
    expect(t.daily).toHaveLength(365);
    expect(t.daily.at(-1)!.t).toBe(d("2027-07-15").getTime());
  });

  it("rises when salary lands and dips as the cycle's costs fall due", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-08-01"), amountMinor: aed(6_000) }],
    });
    expect(at(t, "2026-07-24").freeSavingsMinor).toBe(aed(10_000)); // before salary
    expect(at(t, "2026-07-25").freeSavingsMinor).toBe(aed(30_000)); // salary in
    expect(at(t, "2026-08-01").freeSavingsMinor).toBe(aed(24_000)); // cost out
  });

  it("counts non-salary income as free savings the moment it lands", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      otherIncomeEvents: [{ date: d("2026-07-20"), amountMinor: aed(3_000) }],
    });
    expect(at(t, "2026-07-20").freeSavingsMinor).toBe(aed(13_000)); // freelance is free at once
    expect(at(t, "2026-07-25").freeSavingsMinor).toBe(aed(33_000)); // + salary
  });

  it("can go negative when costs outrun savings and income to a date", () => {
    const t = buildCashflowTimeline({
      ...base,
      savingsMinor: aed(1_000),
      months: 3,
      costEvents: [{ date: d("2026-08-01"), amountMinor: aed(5_000) }],
    });
    expect(at(t, "2026-08-01").freeSavingsMinor).toBe(aed(-4_000));
  });

  it("projects today's free savings + income by then − costs by then", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-08-01"), amountMinor: aed(6_000) }],
    });
    const p = at(t, "2026-08-05");
    // The identity the explorer's four cards rely on.
    expect(p.freeSavingsMinor).toBe(aed(10_000) + p.cumIncomeMinor - p.cumCostsMinor);
  });

  it("tracks cumulative income and known costs, and per-day amounts", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      salaryEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [
        { date: d("2026-07-20"), amountMinor: aed(6_000) },
        { date: d("2026-08-05"), amountMinor: aed(1_000) },
      ],
    });
    expect(at(t, "2026-07-19")).toMatchObject({ cumIncomeMinor: 0, cumCostsMinor: 0 });
    expect(at(t, "2026-07-20")).toMatchObject({ cumCostsMinor: aed(6_000), dayCostsMinor: aed(6_000) });
    expect(at(t, "2026-07-25")).toMatchObject({ cumIncomeMinor: aed(20_000), dayIncomeMinor: aed(20_000) });
    expect(at(t, "2026-08-05")).toMatchObject({ cumIncomeMinor: aed(20_000), cumCostsMinor: aed(7_000) });
  });

  it("labels the credit-card portion of costs without double-counting it", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      costEvents: [
        { date: d("2026-07-20"), amountMinor: aed(6_000) },
        { date: d("2026-08-03"), amountMinor: aed(1_500) }, // the card bill
      ],
      cardBillEvents: [{ date: d("2026-08-03"), amountMinor: aed(1_500) }],
    });
    const jul = t.months.find((m) => m.key === "2026-07")!;
    const aug = t.months.find((m) => m.key === "2026-08")!;
    expect(jul.costsMinor).toBe(aed(6_000));
    expect(jul.cardBillsMinor).toBe(0);
    expect(aug.costsMinor).toBe(aed(1_500)); // not 3,000 — no double count
    expect(aug.cardBillsMinor).toBe(aed(1_500));
    const dueDay = t.daily.find((p) => p.t === d("2026-08-03").getTime())!;
    expect(dueDay).toMatchObject({ dayCostsMinor: aed(1_500), dayCardBillsMinor: aed(1_500) });
  });
});

describe("freeSavingsAt", () => {
  const t = buildCashflowTimeline({
    ...base,
    months: 12,
    costEvents: [{ date: d("2026-07-20"), amountMinor: aed(2_000) }],
  });

  it("reads the value at a day offset", () => {
    expect(freeSavingsAt(t.daily, 0)!.freeSavingsMinor).toBe(aed(10_000));
    expect(freeSavingsAt(t.daily, 4)!.freeSavingsMinor).toBe(aed(8_000)); // 20 Jul, no salary to cover
  });

  it("clamps out-of-range offsets instead of returning undefined", () => {
    expect(freeSavingsAt(t.daily, -50)!.t).toBe(t.daily[0].t);
    expect(freeSavingsAt(t.daily, 9_999)!.t).toBe(t.daily.at(-1)!.t);
  });

  it("returns null for an empty series", () => {
    expect(freeSavingsAt([], 3)).toBeNull();
  });
});
