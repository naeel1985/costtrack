import { describe, expect, it } from "vitest";
import {
  cardCycleBills,
  dueDateForCharge,
  dueDateForStatement,
  dueDateIn,
  nextDueDate,
  nextStatement,
  statementDateForDue,
} from "./card-cycle";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const aed = (major: number) => major * 100;

describe("dueDateIn", () => {
  it("returns the due day, clamped to short months", () => {
    expect(ymd(dueDateIn(d("2026-07-16"), 3))).toBe("2026-07-03");
    expect(ymd(dueDateIn(d("2027-02-10"), 31))).toBe("2027-02-28");
    expect(ymd(dueDateIn(d("2028-02-10"), 30))).toBe("2028-02-29");
  });
});

describe("statementDateForDue", () => {
  it("is 5 days after the previous month's due date (user example: due 3 Jul -> stmt 8 Jun)", () => {
    expect(ymd(statementDateForDue(d("2026-07-03"), 3))).toBe("2026-06-08");
  });

  it("issues the 8 Jul statement for the 3 Aug payment (user example)", () => {
    expect(ymd(statementDateForDue(d("2026-08-03"), 3))).toBe("2026-07-08");
  });

  it("round-trips with dueDateForStatement", () => {
    const due = d("2026-08-03");
    expect(ymd(dueDateForStatement(statementDateForDue(due, 3), 3))).toBe("2026-08-03");
  });
});

describe("dueDateForCharge", () => {
  it("bills a charge on the payment date of the statement that closes after it", () => {
    // Statement 8 Jul covers 9 Jun..8 Jul and is paid 3 Aug.
    expect(ymd(dueDateForCharge(d("2026-06-20"), 3))).toBe("2026-08-03");
    expect(ymd(dueDateForCharge(d("2026-07-08"), 3))).toBe("2026-08-03"); // boundary: on the statement date
    expect(ymd(dueDateForCharge(d("2026-07-09"), 3))).toBe("2026-09-03"); // just after -> next statement
  });
});

describe("cardCycleBills", () => {
  const from = d("2026-06-01");
  const to = d("2026-12-31");

  it("bills the current balance on the next upcoming due date", () => {
    const bills = cardCycleBills({ dueDay: 3, owedNowMinor: aed(3_000), charges: [] }, from, to);
    expect(bills[0].amountMinor).toBe(aed(3_000));
    expect(ymd(bills[0].date)).toBe("2026-06-03");
  });

  it("bills a mid-window charge on the matching payment date (9 Jun–8 Jul -> 3 Aug)", () => {
    const bills = cardCycleBills(
      { dueDay: 3, owedNowMinor: 0, charges: [{ date: d("2026-06-20"), amountMinor: aed(500) }] },
      from,
      to,
    );
    expect(bills).toHaveLength(1);
    expect(ymd(bills[0].date)).toBe("2026-08-03");
    expect(bills[0].amountMinor).toBe(aed(500));
  });

  it("splits charges either side of a statement date into different bills", () => {
    const bills = cardCycleBills(
      {
        dueDay: 3,
        owedNowMinor: 0,
        charges: [
          { date: d("2026-07-08"), amountMinor: aed(400) }, // statement 8 Jul -> 3 Aug
          { date: d("2026-07-09"), amountMinor: aed(600) }, // statement 8 Aug -> 3 Sep
        ],
      },
      from,
      to,
    );
    expect(bills.map((b) => [ymd(b.date), b.amountMinor])).toEqual([
      ["2026-08-03", aed(400)],
      ["2026-09-03", aed(600)],
    ]);
  });

  it("bills a recurring charge repeating for N months as N separate statements", () => {
    const charges = [
      { date: d("2026-08-10"), amountMinor: aed(300) },
      { date: d("2026-09-10"), amountMinor: aed(300) },
      { date: d("2026-10-10"), amountMinor: aed(300) },
    ];
    const bills = cardCycleBills({ dueDay: 3, owedNowMinor: 0, charges }, from, to);
    // Each 10th falls just after that month's statement, so it's billed two due
    // dates later.
    expect(bills.map((b) => ymd(b.date))).toEqual(["2026-10-03", "2026-11-03", "2026-12-03"]);
    expect(bills.every((b) => b.amountMinor === aed(300))).toBe(true);
  });

  it("reconciles: everything owed and charged is billed exactly once", () => {
    const charges = [
      { date: d("2026-06-20"), amountMinor: aed(500) },
      { date: d("2026-08-10"), amountMinor: aed(300) },
    ];
    const bills = cardCycleBills({ dueDay: 3, owedNowMinor: aed(1_000), charges }, from, to);
    expect(bills.reduce((s, b) => s + b.amountMinor, 0)).toBe(aed(1_800));
  });

  it("emits nothing when clear or without a usable due day", () => {
    expect(cardCycleBills({ dueDay: 3, owedNowMinor: 0, charges: [] }, from, to)).toHaveLength(0);
    expect(cardCycleBills({ dueDay: 0, owedNowMinor: aed(100), charges: [] }, from, to)).toHaveLength(0);
  });
});

describe("nextStatement", () => {
  it("reports the statement date, payment due date and total due for the window", () => {
    // today 20 Jun, due day 3 -> next payment 3 Jul, its statement 8 Jun,
    // window (8 May, 8 Jun]. A charge on 1 Jun is in it; one on 20 Jun is not.
    const s = nextStatement(
      3,
      0,
      [
        { date: d("2026-06-01"), amountMinor: aed(700) },
        { date: d("2026-06-20"), amountMinor: aed(999) },
      ],
      d("2026-06-20"),
    );
    expect(s).not.toBeNull();
    expect(ymd(s!.paymentDueDate)).toBe("2026-07-03");
    expect(ymd(s!.statementDate)).toBe("2026-06-08");
    expect(s!.totalAmountDueMinor).toBe(aed(700));
  });

  it("never understates what's owed", () => {
    const s = nextStatement(3, aed(5_000), [], d("2026-06-20"));
    expect(s!.totalAmountDueMinor).toBe(aed(5_000));
  });

  it("returns null without a due day", () => {
    expect(nextStatement(0, aed(100), [], d("2026-06-20"))).toBeNull();
  });
});
