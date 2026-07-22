// ─────────────────────────────────────────────────────────────────────────────
// Credit-card statement cycles — pure, date-fns only, unit-tested.
//
// A credit card is a loan repaid on a fixed day each month. Two dates govern a
// statement:
//
//   • Payment due date — the day of the month (`dueDay`) the bill must be paid.
//   • Statement date   — when that bill is ISSUED. It sits 5 days after the
//                        PREVIOUS month's payment due date. So for a due date of
//                        3 Jul, the statement was issued on 8 Jun (3 Jun + 5).
//
// A statement bills every card charge registered between the previous statement
// date and this one — the window (prevStatement, thisStatement] — and that total
// is paid on the payment due date. Example (due day 3): the statement issued
// 8 Jul covers charges from 9 Jun to 8 Jul and is paid on 3 Aug.
//
// So a charge waits for the next statement to close, then ~25 more days for the
// payment date — that lag is when the money finally leaves free savings, which
// is what `cardCycleBills` projects.
//
// All amounts are integer minor units, POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, addMonths, getDaysInMonth, isAfter, setDate, startOfDay, subMonths } from "date-fns";
import type { DatedAmount } from "./salary-period";

/** A statement is issued this many days after the previous month's due date. */
export const STATEMENT_LEAD_DAYS = 5;

export interface CardBillInput {
  /** Day of the month the bill falls due (1–31). */
  dueDay: number;
  /** Amount already owed today (the card's negative balance, as a magnitude). */
  owedNowMinor: number;
  /** Future charges to the card (recurring occurrences, scheduled spend). */
  charges: DatedAmount[];
}

/**
 * The due date falling in `ref`'s month, clamped to the last day for short
 * months — a card due on the 31st is due 28 Feb, not 3 March.
 */
export function dueDateIn(ref: Date, dueDay: number): Date {
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), getDaysInMonth(ref));
  return startOfDay(setDate(ref, day));
}

/** The first payment due date on or after `from`. */
export function nextDueDate(from: Date, dueDay: number): Date {
  const start = startOfDay(from);
  const thisMonth = dueDateIn(start, dueDay);
  return isAfter(start, thisMonth) ? dueDateIn(addMonths(start, 1), dueDay) : thisMonth;
}

/** The statement date whose bill is paid on `dueDate`: prev month's due + 5 days. */
export function statementDateForDue(dueDate: Date, dueDay: number): Date {
  return addDays(dueDateIn(subMonths(startOfDay(dueDate), 1), dueDay), STATEMENT_LEAD_DAYS);
}

/** The payment due date for a statement issued on `statementDate`. */
export function dueDateForStatement(statementDate: Date, dueDay: number): Date {
  return nextDueDate(addDays(startOfDay(statementDate), 1), dueDay);
}

/** The first statement date on or after `charge` — the statement that bills it. */
function statementOnOrAfter(charge: Date, dueDay: number): Date {
  const c = startOfDay(charge);
  let month = subMonths(c, 1);
  for (let i = 0; i < 4; i++) {
    const s = addDays(dueDateIn(month, dueDay), STATEMENT_LEAD_DAYS);
    if (!isAfter(c, s)) return s; // s >= c
    month = addMonths(month, 1);
  }
  // Unreachable for sane inputs (statements recur monthly).
  return addDays(dueDateIn(c, dueDay), STATEMENT_LEAD_DAYS);
}

/** The payment due date on which a charge dated `charge` is billed. */
export function dueDateForCharge(charge: Date, dueDay: number): Date {
  return dueDateForStatement(statementOnOrAfter(charge, dueDay), dueDay);
}

/**
 * Repayment events for a card across [from, to].
 *
 * Each charge is billed on the payment due date of the statement that closes on
 * or after it (statement date + the ~25-day gap to the due date) — the charge's
 * OWN date decides this, so a back-dated charge can still belong to the current
 * statement. The amount owed today is billed on the first upcoming due date, and
 * anything that would fall on a due date already past (its statement has been
 * issued) is dropped. Empty bills drop.
 */
export function cardCycleBills(card: CardBillInput, from: Date, to: Date): DatedAmount[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (!Number.isFinite(card.dueDay) || card.dueDay < 1) return [];

  const firstDue = nextDueDate(start, card.dueDay);
  if (isAfter(firstDue, end)) return [];

  const byDue = new Map<number, number>();
  const add = (dueMs: number, amount: number) => {
    if (amount <= 0) return;
    byDue.set(dueMs, (byDue.get(dueMs) ?? 0) + amount);
  };

  // Current balance is due at the first upcoming statement.
  add(firstDue.getTime(), Math.max(0, card.owedNowMinor));

  for (const c of card.charges) {
    const amount = Math.max(0, c.amountMinor);
    if (amount <= 0) continue;
    const due = dueDateForCharge(startOfDay(c.date), card.dueDay);
    if (isAfter(firstDue, due)) continue; // its statement is already issued/paid
    if (isAfter(due, end)) continue; // billed beyond the window
    add(due.getTime(), amount);
  }

  return [...byDue.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([dueMs, amountMinor]) => ({ date: new Date(dueMs), amountMinor }));
}

export interface StatementSummary {
  statementDate: Date;
  paymentDueDate: Date;
  /** Charges registered in this statement's window (prevStatement, thisStatement]. */
  totalAmountDueMinor: number;
}

/**
 * The next upcoming statement for display: its statement date, payment due date,
 * and Total Amount Due (the charges registered in its window). `charges` should
 * be the card's registered (posted) charges; `owedNowMinor` is folded onto the
 * first payment so the figure never understates what's payable.
 */
export function nextStatement(
  dueDay: number,
  owedNowMinor: number,
  charges: DatedAmount[],
  today: Date,
): StatementSummary | null {
  if (!Number.isFinite(dueDay) || dueDay < 1) return null;
  const now = startOfDay(today);
  const paymentDueDate = nextDueDate(now, dueDay);
  const thisStatement = statementDateForDue(paymentDueDate, dueDay);
  const prevStatement = statementDateForDue(dueDateIn(subMonths(paymentDueDate, 1), dueDay), dueDay);

  const windowTotal = charges.reduce((sum, c) => {
    const d = startOfDay(c.date).getTime();
    return d > prevStatement.getTime() && d <= thisStatement.getTime()
      ? sum + Math.max(0, c.amountMinor)
      : sum;
  }, 0);

  return {
    statementDate: thisStatement,
    paymentDueDate,
    totalAmountDueMinor: Math.max(windowTotal, Math.max(0, owedNowMinor)),
  };
}

/**
 * Every statement over [today, horizon]: the current statement (what's owed for
 * this cycle and any overdue carry) followed by future statements built from
 * charges that fall AFTER the current statement closes — future-dated posted
 * spend plus projected recurring/scheduled charges. Amounts landing on the same
 * payment due date are merged, so a monthly recurring cost surfaces as one
 * "Total Amount Due" line per cycle.
 *
 * `owedNowMinor` is the card's balance (payment-aware). A charge you dated into a
 * later cycle sits in that balance but does NOT belong to the current bill, so we
 * subtract those future-dated posted charges out of the current statement and
 * bill them on their own due dates instead.
 */
export function upcomingStatements(
  dueDay: number,
  owedNowMinor: number,
  postedCharges: DatedAmount[],
  futureCharges: DatedAmount[],
  today: Date,
  horizon: Date,
): StatementSummary[] {
  if (!Number.isFinite(dueDay) || dueDay < 1) return [];
  const now = startOfDay(today);
  const currentDue = nextDueDate(now, dueDay);
  const thisStatement = statementDateForDue(currentDue, dueDay);

  // Posted charges dated after the current statement's close belong to a later
  // cycle — pull them out of the current bill and bill them by their own date.
  const futurePosted = postedCharges.filter((c) => isAfter(startOfDay(c.date), thisStatement));
  const futurePostedSum = futurePosted.reduce((s, c) => s + Math.max(0, c.amountMinor), 0);

  // The current statement (plus any overdue carry) = the balance minus those
  // not-yet-billed future charges. Balance is payment-aware, so this is too.
  const currentBaseMinor = Math.max(0, Math.max(0, owedNowMinor) - futurePostedSum);

  const byDue = new Map<number, StatementSummary>();
  const put = (s: StatementSummary) => {
    const key = s.paymentDueDate.getTime();
    const existing = byDue.get(key);
    if (existing) existing.totalAmountDueMinor += s.totalAmountDueMinor;
    else byDue.set(key, { ...s });
  };

  // Keep the current statement even if nothing is due this cycle, so it stays
  // the first entry and callers can read "due now" from index 0.
  put({ statementDate: thisStatement, paymentDueDate: currentDue, totalAmountDueMinor: currentBaseMinor });

  // Future-dated posted spend + projected charges, each billed on the due date
  // of the statement that closes after it. owedNow is already accounted for
  // above, so pass 0 here to avoid double counting.
  const bills = cardCycleBills(
    { dueDay, owedNowMinor: 0, charges: [...futurePosted, ...futureCharges] },
    now,
    horizon,
  );
  for (const b of bills) {
    put({
      statementDate: statementDateForDue(b.date, dueDay),
      paymentDueDate: b.date,
      totalAmountDueMinor: b.amountMinor,
    });
  }

  return [...byDue.values()].sort((a, b) => a.paymentDueDate.getTime() - b.paymentDueDate.getTime());
}
