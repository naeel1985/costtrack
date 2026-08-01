import { describe, expect, it } from "vitest";
import { realizeCycle } from "./free-savings-pool";

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
