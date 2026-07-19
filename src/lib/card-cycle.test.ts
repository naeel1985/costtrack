import { describe, expect, it } from "vitest";
import { cardCycleBills, dueDateIn, nextDueDate } from "./card-cycle";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const aed = (major: number) => major * 100;

describe("dueDateIn", () => {
  it("returns the due day in that month", () => {
    expect(ymd(dueDateIn(d("2026-07-16"), 15))).toBe("2026-07-15");
  });

  it("clamps to the last day in short months", () => {
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

describe("cardCycleBills", () => {
  const from = d("2026-07-16");
  const to = d("2026-12-16");

  it("bills the current balance on the next upcoming due date", () => {
    // Today 16 Jul, due day 2 -> next due 2 Aug (16 Jul is past 2 Jul).
    const bills = cardCycleBills({ dueDay: 2, owedNowMinor: aed(3_000), charges: [] }, from, to);
    expect(bills).toHaveLength(1);
    expect(ymd(bills[0].date)).toBe("2026-08-02");
    expect(bills[0].amountMinor).toBe(aed(3_000));
  });

  it("matches the user's example: a cost on 20 Jul (due day 2) is paid 2 Aug", () => {
    const bills = cardCycleBills(
      { dueDay: 2, owedNowMinor: 0, charges: [{ date: d("2026-07-20"), amountMinor: aed(500) }] },
      from,
      to,
    );
    expect(bills).toHaveLength(1);
    expect(ymd(bills[0].date)).toBe("2026-08-02");
    expect(bills[0].amountMinor).toBe(aed(500));
  });

  it("separates charges either side of a due date into different statements", () => {
    const bills = cardCycleBills(
      {
        dueDay: 2,
        owedNowMinor: 0,
        charges: [
          { date: d("2026-07-20"), amountMinor: aed(400) }, // (2 Jul, 2 Aug] -> 2 Aug
          { date: d("2026-08-10"), amountMinor: aed(600) }, // (2 Aug, 2 Sep] -> 2 Sep
        ],
      },
      from,
      to,
    );
    expect(bills.map((b) => [ymd(b.date), b.amountMinor])).toEqual([
      ["2026-08-02", aed(400)],
      ["2026-09-02", aed(600)],
    ]);
  });

  it("merges the current balance and same-cycle charges onto one statement", () => {
    const bills = cardCycleBills(
      {
        dueDay: 2,
        owedNowMinor: aed(1_000),
        charges: [{ date: d("2026-07-25"), amountMinor: aed(250) }],
      },
      from,
      to,
    );
    expect(bills).toHaveLength(1);
    expect(ymd(bills[0].date)).toBe("2026-08-02");
    expect(bills[0].amountMinor).toBe(aed(1_250));
  });

  it("bills a recurring charge that repeats for N months as N separate statements", () => {
    // A 300/mo recurring cost on the 10th, four occurrences.
    const charges = [
      { date: d("2026-08-10"), amountMinor: aed(300) },
      { date: d("2026-09-10"), amountMinor: aed(300) },
      { date: d("2026-10-10"), amountMinor: aed(300) },
      { date: d("2026-11-10"), amountMinor: aed(300) },
    ];
    const bills = cardCycleBills({ dueDay: 2, owedNowMinor: 0, charges }, from, to);
    expect(bills.map((b) => ymd(b.date))).toEqual([
      "2026-09-02",
      "2026-10-02",
      "2026-11-02",
      "2026-12-02",
    ]);
    expect(bills.every((b) => b.amountMinor === aed(300))).toBe(true);
  });

  it("ignores charges billed beyond the window", () => {
    const bills = cardCycleBills(
      { dueDay: 2, owedNowMinor: 0, charges: [{ date: d("2027-06-01"), amountMinor: aed(999) }] },
      from,
      to,
    );
    expect(bills).toHaveLength(0);
  });

  it("emits nothing when the card is clear", () => {
    expect(cardCycleBills({ dueDay: 2, owedNowMinor: 0, charges: [] }, from, to)).toHaveLength(0);
  });

  it("emits nothing without a usable due day", () => {
    expect(
      cardCycleBills({ dueDay: 0, owedNowMinor: aed(100), charges: [] }, from, to),
    ).toHaveLength(0);
  });
});
