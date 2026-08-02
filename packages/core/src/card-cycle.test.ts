import { describe, expect, it } from "vitest";
import {
  cardCycleBills,
  dueDateForCharge,
  dueDateForStatement,
  dueDateIn,
  nextDueDate,
  nextDueStatement,
  statementDateForDue,
  upcomingStatements,
} from "./card-cycle";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
// Minor units are integers — 4754.06 * 100 is 475406.00000000006 in floating
// point, so round rather than letting fixtures carry fractional fils.
const aed = (major: number) => Math.round(major * 100);

describe("dueDateIn", () => {
  it("returns the due day, clamped to short months", () => {
    expect(ymd(dueDateIn(d("2026-07-16"), 3))).toBe("2026-07-03");
    expect(ymd(dueDateIn(d("2027-02-10"), 31))).toBe("2027-02-28");
    expect(ymd(dueDateIn(d("2028-02-10"), 30))).toBe("2028-02-29");
  });
});

describe("nextDueDate", () => {
  it("returns today when today IS the due day, else the next one", () => {
    // The boundary that decides which cycle is 'current'.
    expect(ymd(nextDueDate(d("2026-08-02"), 2))).toBe("2026-08-02");
    expect(ymd(nextDueDate(d("2026-08-03"), 2))).toBe("2026-09-02");
    expect(ymd(nextDueDate(d("2026-08-01"), 2))).toBe("2026-08-02");
  });
});

describe("statementDateForDue", () => {
  it("is 6 days after the previous month's due date (due 3 Jul -> stmt 9 Jun)", () => {
    expect(ymd(statementDateForDue(d("2026-07-03"), 3))).toBe("2026-06-09");
  });

  it("issues the 9 Jul statement for the 3 Aug payment (matches the user's real due-day-2 card: due 2 Aug -> stmt 8 Jul)", () => {
    expect(ymd(statementDateForDue(d("2026-08-03"), 3))).toBe("2026-07-09");
  });

  it("round-trips with dueDateForStatement", () => {
    const due = d("2026-08-03");
    expect(ymd(dueDateForStatement(statementDateForDue(due, 3), 3))).toBe("2026-08-03");
  });
});

describe("dueDateForCharge", () => {
  it("bills a charge on the payment date of the statement that closes after it", () => {
    // Statement 9 Jul covers 10 Jun..9 Jul and is paid 3 Aug.
    expect(ymd(dueDateForCharge(d("2026-06-20"), 3))).toBe("2026-08-03");
    expect(ymd(dueDateForCharge(d("2026-07-09"), 3))).toBe("2026-08-03"); // boundary: on the statement date
    expect(ymd(dueDateForCharge(d("2026-07-10"), 3))).toBe("2026-09-03"); // just after -> next statement
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

  it("bills a mid-window charge on the matching payment date (10 Jun–9 Jul -> 3 Aug)", () => {
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
          { date: d("2026-07-09"), amountMinor: aed(400) }, // statement 9 Jul -> 3 Aug
          { date: d("2026-07-10"), amountMinor: aed(600) }, // statement 9 Aug -> 3 Sep
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

  it("bills a back-dated charge on its statement's due date, even before `from`", () => {
    // User example: due day 2, a charge dated 27 Jun bills on 2 Aug. Adding it
    // "today" (20 Jul) must not drop it just because 27 Jun precedes `from`.
    const bills = cardCycleBills(
      { dueDay: 2, owedNowMinor: 0, charges: [{ date: d("2026-06-27"), amountMinor: aed(500) }] },
      d("2026-07-20"),
      d("2027-07-20"),
    );
    expect(bills.map((b) => [ymd(b.date), b.amountMinor])).toEqual([["2026-08-02", aed(500)]]);
  });

  it("drops a charge whose statement was already issued (bills before the current due date)", () => {
    // Due day 2, charge dated 1 Jun bills on 2 Jul — already past on 20 Jul.
    const bills = cardCycleBills(
      { dueDay: 2, owedNowMinor: 0, charges: [{ date: d("2026-06-01"), amountMinor: aed(500) }] },
      d("2026-07-20"),
      d("2027-07-20"),
    );
    expect(bills).toHaveLength(0);
  });
});

describe("upcomingStatements", () => {
  const today = d("2026-07-20");
  const horizon = d("2027-07-20");
  const noPay: { date: Date; amountMinor: number }[] = [];

  it("keeps the current statement, then bills recurring charges into later cycles", () => {
    const posted = [{ date: d("2026-06-20"), amountMinor: aed(700) }];
    const recurring = [
      { date: d("2026-08-20"), amountMinor: aed(300) },
      { date: d("2026-09-20"), amountMinor: aed(300) },
    ];
    const statements = upcomingStatements(3, aed(700), posted, recurring, noPay, today, horizon);
    expect(statements.map((s) => [ymd(s.paymentDueDate), s.totalAmountDueMinor])).toEqual([
      ["2026-08-03", aed(700)], // current issued statement (posted charge)
      ["2026-10-03", aed(300)], // 20 Aug charge -> 9 Sep statement -> 3 Oct
      ["2026-11-03", aed(300)], // 20 Sep charge -> 9 Oct statement -> 3 Nov
    ]);
  });

  it("keeps a future-dated posted charge out of the current bill", () => {
    const statements = upcomingStatements(
      3,
      aed(1_500),
      [{ date: d("2026-08-15"), amountMinor: aed(1_500) }],
      [],
      noPay,
      today,
      horizon,
    );
    expect(statements[0]).toMatchObject({ totalAmountDueMinor: 0 });
    expect(ymd(statements[0].paymentDueDate)).toBe("2026-08-03");
    const later = statements.find((s) => s.totalAmountDueMinor === aed(1_500))!;
    expect(ymd(later.paymentDueDate)).toBe("2026-10-03");
  });

  it("puts a later recurring charge on its own future cycle, not the current one", () => {
    const statements = upcomingStatements(
      3,
      aed(1_000),
      [],
      [{ date: d("2026-07-25"), amountMinor: aed(250) }],
      noPay,
      today,
      horizon,
    );
    // Nothing posted explains the 1,000 balance, so it is brought forward.
    expect(statements[0]).toMatchObject({
      totalAmountDueMinor: aed(1_000),
      broughtForwardMinor: aed(1_000),
    });
    expect(ymd(statements[0].paymentDueDate)).toBe("2026-08-03");
    expect(statements[1]).toMatchObject({ totalAmountDueMinor: aed(250) });
    expect(ymd(statements[1].paymentDueDate)).toBe("2026-09-03");
  });

  it("folds a back-dated recurring charge into the current Total Amount Due", () => {
    const statements = upcomingStatements(
      2,
      0,
      [],
      [
        { date: d("2026-06-27"), amountMinor: aed(500) }, // -> 2 Aug (current)
        { date: d("2026-07-27"), amountMinor: aed(500) }, // -> 2 Sep (next)
      ],
      noPay,
      d("2026-07-20"),
      d("2027-07-20"),
    );
    expect(statements.map((s) => [ymd(s.paymentDueDate), s.totalAmountDueMinor])).toEqual([
      ["2026-08-02", aed(500)],
      ["2026-09-02", aed(500)],
    ]);
  });

  it("returns nothing without a usable due day", () => {
    expect(upcomingStatements(0, aed(100), [], [], noPay, today, horizon)).toEqual([]);
  });

  it("bills an opening balance no charge explains as brought forward", () => {
    const statements = upcomingStatements(3, aed(1_200), [], [], noPay, today, horizon);
    expect(statements[0]).toMatchObject({
      totalAmountDueMinor: aed(1_200),
      broughtForwardMinor: aed(1_200),
      remainingMinor: aed(1_200),
    });
  });

  it("folds an overdue charge onto the current bill rather than dropping it", () => {
    // Due day 2; a charge dated 1 Jun billed on 2 Jul, already past on 20 Jul.
    const statements = upcomingStatements(
      2,
      aed(500),
      [{ date: d("2026-06-01"), amountMinor: aed(500) }],
      [],
      noPay,
      today,
      horizon,
    );
    expect(ymd(statements[0].paymentDueDate)).toBe("2026-08-02");
    expect(statements[0].totalAmountDueMinor).toBe(aed(500));
  });

  // The reported case. Due day 2: window 9 Jun-8 Jul billed 4,754.06 on 2 Aug,
  // paid with 4,800; window 9 Jul-8 Aug has accrued 2,647.56 for 2 Sep.
  it("shows a settled bill at its full billed total, with the surplus crediting the next cycle", () => {
    const posted = [
      { date: d("2026-06-20"), amountMinor: aed(4_754.06) },
      { date: d("2026-07-20"), amountMinor: aed(2_647.56) },
    ];
    const payments = [{ date: d("2026-08-01"), amountMinor: aed(4_800) }];
    const owedNow = aed(4_754.06) + aed(2_647.56) - aed(4_800);
    const statements = upcomingStatements(2, owedNow, posted, [], payments, d("2026-08-02"), d("2027-08-02"));

    expect(
      statements.map((s) => [
        ymd(s.paymentDueDate),
        s.totalAmountDueMinor,
        s.paidMinor,
        s.remainingMinor,
      ]),
    ).toEqual([
      // The bill still reads 4,754.06 — what the statement says — and is settled.
      ["2026-08-02", aed(4_754.06), aed(4_754.06), 0],
      // 45.94 of surplus credits the next cycle: 2,647.56 - 45.94.
      ["2026-09-02", aed(2_647.56), aed(45.94), aed(2_601.62)],
    ]);
  });

  it("bills a total that always equals the sum of its own charges", () => {
    const posted = [
      { date: d("2026-06-20"), amountMinor: aed(120.5) },
      { date: d("2026-06-25"), amountMinor: aed(33) },
      { date: d("2026-07-20"), amountMinor: aed(89.25) },
    ];
    const owedNow = posted.reduce((s, c) => s + c.amountMinor, 0);
    const statements = upcomingStatements(2, owedNow, posted, [], noPay, d("2026-08-02"), d("2027-08-02"));
    // First bill = the two June charges; second = the July one. No balance magic.
    expect(statements[0].totalAmountDueMinor).toBe(aed(153.5));
    expect(statements[1].totalAmountDueMinor).toBe(aed(89.25));
  });

  it("spends a large credit across several following cycles", () => {
    const posted = [
      { date: d("2026-06-20"), amountMinor: aed(100) },
      { date: d("2026-07-20"), amountMinor: aed(400) },
      { date: d("2026-08-20"), amountMinor: aed(400) },
    ];
    const payments = [{ date: d("2026-08-01"), amountMinor: aed(1_000) }];
    const owedNow = aed(100) + aed(400) + aed(400) - aed(1_000);
    const statements = upcomingStatements(2, owedNow, posted, [], payments, d("2026-08-02"), d("2027-08-02"));
    expect(statements.every((s) => s.remainingMinor === 0)).toBe(true);
    // Bills themselves are unchanged — only what is left to pay went to zero.
    expect(statements.map((s) => s.totalAmountDueMinor)).toEqual([aed(100), aed(400), aed(400)]);
  });
});

describe("nextDueStatement", () => {
  it("skips a settled cycle and points at the next bill actually owing", () => {
    const posted = [
      { date: d("2026-06-20"), amountMinor: aed(4_754.06) },
      { date: d("2026-07-20"), amountMinor: aed(2_647.56) },
    ];
    const payments = [{ date: d("2026-08-01"), amountMinor: aed(4_800) }];
    const owedNow = aed(4_754.06) + aed(2_647.56) - aed(4_800);
    const s = nextDueStatement(2, owedNow, posted, [], payments, d("2026-08-02"), d("2027-08-02"));
    expect(ymd(s!.paymentDueDate)).toBe("2026-09-02");
    expect(s!.remainingMinor).toBe(aed(2_601.62));
  });

  it("is null when nothing is owed anywhere in the horizon", () => {
    expect(nextDueStatement(2, 0, [], [], [], d("2026-08-02"), d("2027-08-02"))).toBeNull();
  });
});
