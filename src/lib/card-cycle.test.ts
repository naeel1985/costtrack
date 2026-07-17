import { describe, expect, it } from "vitest";
import { cardCycleCosts, dueDateIn, nextDueDate } from "./card-cycle";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const aed = (major: number) => major * 100;

describe("dueDateIn", () => {
  it("returns the due day in that month", () => {
    expect(ymd(dueDateIn(d("2026-07-16"), 15))).toBe("2026-07-15");
  });

  it("clamps to the last day in short months", () => {
    // A card due on the 31st is due 28 Feb — never spills into March.
    expect(ymd(dueDateIn(d("2027-02-10"), 31))).toBe("2027-02-28");
    expect(ymd(dueDateIn(d("2026-09-10"), 31))).toBe("2026-09-30");
  });

  it("handles a leap February", () => {
    expect(ymd(dueDateIn(d("2028-02-10"), 30))).toBe("2028-02-29");
  });
});

describe("nextDueDate", () => {
  it("uses this month when the due day is still ahead", () => {
    expect(ymd(nextDueDate(d("2026-07-10"), 15))).toBe("2026-07-15");
  });

  it("rolls to next month once the due day has passed", () => {
    expect(ymd(nextDueDate(d("2026-07-16"), 15))).toBe("2026-08-15");
  });

  it("treats the due day itself as still due today", () => {
    expect(ymd(nextDueDate(d("2026-07-15"), 15))).toBe("2026-07-15");
  });
});

describe("cardCycleCosts", () => {
  it("bills costs on the due date closing their cycle", () => {
    // Today 16 Jul, due day 15. Spend on 20 Jul falls in the cycle
    // (15 Jul, 15 Aug] -> payable 15 Aug, not immediately.
    const events = cardCycleCosts(
      {
        dueDay: 15,
        owedMinor: aed(500),
        costs: [{ date: d("2026-07-20"), amountMinor: aed(500) }],
      },
      d("2026-07-16"),
      d("2026-10-16"),
    );
    expect(events).toHaveLength(1);
    expect(ymd(events[0].date)).toBe("2026-08-15");
    expect(events[0].amountMinor).toBe(aed(500));
  });

  it("separates spend either side of a due date into different bills", () => {
    const events = cardCycleCosts(
      {
        dueDay: 15,
        owedMinor: aed(900),
        costs: [
          { date: d("2026-07-20"), amountMinor: aed(400) }, // cycle -> 15 Aug
          { date: d("2026-08-20"), amountMinor: aed(500) }, // cycle -> 15 Sep
        ],
      },
      d("2026-07-16"),
      d("2026-10-16"),
    );
    expect(events.map((e) => [ymd(e.date), e.amountMinor])).toEqual([
      ["2026-08-15", aed(400)],
      ["2026-09-15", aed(500)],
    ]);
  });

  it("charges already-closed (overdue) balance at the next due date", () => {
    // 3,000 owed from cycles that closed before today, and nothing new charged.
    const events = cardCycleCosts(
      { dueDay: 15, owedMinor: aed(3_000), costs: [] },
      d("2026-07-16"),
      d("2026-10-16"),
    );
    expect(ymd(events[0].date)).toBe("2026-08-15");
    expect(events[0].amountMinor).toBe(aed(3_000));
    expect(events).toHaveLength(1);
  });

  it("reconciles: total billed equals what is owed", () => {
    const owed = aed(4_780.5 / 1); // arbitrary carried balance
    const events = cardCycleCosts(
      {
        dueDay: 15,
        owedMinor: owed + aed(600),
        costs: [{ date: d("2026-07-20"), amountMinor: aed(600) }],
      },
      d("2026-07-16"),
      d("2026-12-16"),
    );
    expect(events.reduce((s, e) => s + e.amountMinor, 0)).toBe(owed + aed(600));
  });

  it("emits nothing when the card is clear", () => {
    expect(cardCycleCosts({ dueDay: 15, owedMinor: 0, costs: [] }, d("2026-07-16"), d("2026-12-16")))
      .toHaveLength(0);
  });

  it("emits nothing without a usable due day", () => {
    expect(
      cardCycleCosts({ dueDay: 0, owedMinor: aed(100), costs: [] }, d("2026-07-16"), d("2026-12-16")),
    ).toHaveLength(0);
  });
});
