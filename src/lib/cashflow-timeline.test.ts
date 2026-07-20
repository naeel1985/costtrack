import { describe, expect, it } from "vitest";
import { buildCashflowTimeline, freeSavingsAt } from "./cashflow-timeline";

// Local dates so month bucketing matches the engine's local day boundaries.
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const aed = (major: number) => major * 100;

const base = {
  today: d("2026-07-16"),
  savingsMinor: aed(10_000),
  incomeEvents: [],
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

  it("buckets income and costs into their calendar month", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      incomeEvents: [
        { date: d("2026-07-25"), amountMinor: aed(20_000) },
        { date: d("2026-08-25"), amountMinor: aed(20_000) },
      ],
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
    expect(aug.incomeMinor).toBe(aed(20_000));
    expect(aug.costsMinor).toBe(0);
    expect(sep.costsMinor).toBe(aed(3_000));
  });

  it("ignores events before today or past the horizon", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      incomeEvents: [{ date: d("2026-07-01"), amountMinor: aed(99_000) }], // past
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

describe("buildCashflowTimeline — daily free savings", () => {
  it("starts at current savings and runs to the end of the horizon", () => {
    const t = buildCashflowTimeline({ ...base, months: 12 });
    expect(t.daily[0].freeSavingsMinor).toBe(aed(10_000));
    expect(t.daily[0].t).toBe(d("2026-07-16").getTime());
    // 2026-07-16 .. 2027-07-15 inclusive = 365 days.
    expect(t.daily).toHaveLength(365);
    expect(t.daily.at(-1)!.t).toBe(d("2027-07-15").getTime());
  });

  it("applies income and costs on their dates, cumulatively", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      incomeEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-07-20"), amountMinor: aed(6_000) }],
    });
    const at = (iso: string) => t.daily.find((p) => p.t === d(iso).getTime())!.freeSavingsMinor;
    expect(at("2026-07-19")).toBe(aed(10_000)); // nothing yet
    expect(at("2026-07-20")).toBe(aed(4_000)); // −6,000 cost
    expect(at("2026-07-24")).toBe(aed(4_000)); // holds
    expect(at("2026-07-25")).toBe(aed(24_000)); // +20,000 salary
    expect(t.daily.at(-1)!.freeSavingsMinor).toBe(aed(24_000)); // carries to the end
  });

  it("tracks cumulative income and known costs alongside free savings", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      incomeEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [
        { date: d("2026-07-20"), amountMinor: aed(6_000) },
        { date: d("2026-08-05"), amountMinor: aed(1_000) },
      ],
    });
    const at = (iso: string) => t.daily.find((p) => p.t === d(iso).getTime())!;
    expect(at("2026-07-19")).toMatchObject({ cumIncomeMinor: 0, cumCostsMinor: 0 });
    expect(at("2026-07-20")).toMatchObject({ cumIncomeMinor: 0, cumCostsMinor: aed(6_000) });
    expect(at("2026-07-25")).toMatchObject({
      cumIncomeMinor: aed(20_000),
      cumCostsMinor: aed(6_000),
    });
    expect(at("2026-08-05")).toMatchObject({
      cumIncomeMinor: aed(20_000),
      cumCostsMinor: aed(7_000),
    });
    // free savings stays the identity: savings + income − costs
    const p = at("2026-08-05");
    expect(p.freeSavingsMinor).toBe(aed(10_000) + p.cumIncomeMinor - p.cumCostsMinor);
  });

  it("exposes per-day income and costs for the daily distribution chart", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      incomeEvents: [{ date: d("2026-07-25"), amountMinor: aed(20_000) }],
      costEvents: [{ date: d("2026-07-20"), amountMinor: aed(6_000) }],
    });
    const at = (iso: string) => t.daily.find((p) => p.t === d(iso).getTime())!;
    expect(at("2026-07-20")).toMatchObject({ dayCostsMinor: aed(6_000), dayIncomeMinor: 0 });
    expect(at("2026-07-25")).toMatchObject({ dayIncomeMinor: aed(20_000), dayCostsMinor: 0 });
    expect(at("2026-07-21")).toMatchObject({ dayCostsMinor: 0, dayIncomeMinor: 0 });
  });

  it("labels the credit-card portion of costs without double-counting it", () => {
    const t = buildCashflowTimeline({
      ...base,
      months: 3,
      // A card bill and an ordinary cost both fall in July; the bill is a subset
      // of costEvents and is only labelled, never re-added.
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

  it("can go negative when costs outrun savings and income", () => {
    const t = buildCashflowTimeline({
      ...base,
      savingsMinor: aed(1_000),
      months: 3,
      costEvents: [{ date: d("2026-08-01"), amountMinor: aed(5_000) }],
    });
    const at = t.daily.find((p) => p.t === d("2026-08-01").getTime())!;
    expect(at.freeSavingsMinor).toBe(aed(-4_000));
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
    expect(freeSavingsAt(t.daily, 4)!.freeSavingsMinor).toBe(aed(8_000)); // 20 Jul
  });

  it("clamps out-of-range offsets instead of returning undefined", () => {
    expect(freeSavingsAt(t.daily, -50)!.t).toBe(t.daily[0].t);
    expect(freeSavingsAt(t.daily, 9_999)!.t).toBe(t.daily.at(-1)!.t);
  });

  it("returns null for an empty series", () => {
    expect(freeSavingsAt([], 3)).toBeNull();
  });
});
