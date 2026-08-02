// ─────────────────────────────────────────────────────────────────────────────
// Credit-card statement cycles — pure, date-fns only, unit-tested.
//
// A credit card is a loan repaid on a fixed day each month. Two dates govern a
// statement:
//
//   • Payment due date — the day of the month (`dueDay`) the bill must be paid.
//   • Statement date   — when that bill is ISSUED. It sits 6 days after the
//                        PREVIOUS month's payment due date. So for a due date of
//                        2 Aug, the statement was issued on 8 Jul (2 Jul + 6).
//
// A statement bills every card charge registered between the previous statement
// date and this one — the window (prevStatement, thisStatement] — and that total
// is paid on the payment due date. Example (due day 2, user's real card): the
// statement issued 8 Jul covers charges from 9 Jun to 8 Jul and is paid on 2 Aug.
//
// So a charge waits for the next statement to close, then ~25 more days for the
// payment date — that lag is when the money finally leaves free savings, which
// is what `cardCycleBills` projects.
//
// All amounts are integer minor units, POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, addMonths, getDaysInMonth, isAfter, setDate, startOfDay, subMonths } from "date-fns";
import type { DatedAmount } from "./cashflow-timeline";

/** A statement is issued this many days after the previous month's due date. */
export const STATEMENT_LEAD_DAYS = 6;

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
  /**
   * What the bill says: the charges registered in this statement's window, plus
   * (on the current statement only) anything brought forward. This is
   * payment-BLIND — a settled bill still shows its full total, exactly like a
   * real statement — and always equals the sum of the itemised line items.
   */
  totalAmountDueMinor: number;
  /**
   * Debt billed here that predates this statement's own window: an opening
   * balance, plus charges whose due date has already passed. Only ever non-zero
   * on the current statement. Rendered as a "brought forward" line item so the
   * itemisation still reconciles to the total.
   */
  broughtForwardMinor: number;
  /** Payments settled against this bill (oldest bill first). */
  paidMinor: number;
  /** Still payable: totalAmountDueMinor - paidMinor, floored at 0. */
  remainingMinor: number;
}

/**
 * The due date a charge is billed on, folding anything already overdue onto the
 * current bill. Callers itemising a statement MUST bucket with this so the line
 * items reconcile to `totalAmountDueMinor`.
 */
export function statementBucketDue(chargeDate: Date, dueDay: number, currentDue: Date): Date {
  const due = dueDateForCharge(chargeDate, dueDay);
  return isAfter(currentDue, due) ? currentDue : due;
}

/**
 * Every statement over [today, horizon], each billed like a real statement and
 * then settled against the card's payments.
 *
 * Billing is payment-blind: a statement's total is the sum of the charges whose
 * due date it is, so it always reconciles to its line items. Anything already
 * overdue folds onto the current bill, as does any opening balance not explained
 * by the known charges and payments (`broughtForwardMinor`).
 *
 * Payments are then applied oldest-bill-first, which is how a card actually
 * clears: paying a bill in full settles it and any surplus becomes a credit that
 * eats into the next cycles. So a settled bill still shows its full
 * `totalAmountDueMinor` (matching the paper statement) with `remainingMinor` 0.
 *
 * `postedCharges` and `payments` are real posted rows; `futureCharges` are
 * projections (recurring/scheduled) and so are deliberately excluded from the
 * balance reconciliation.
 *
 * `owedNowMinor` is the card's balance as a positive amount owed — pass it
 * SIGNED (i.e. `-balanceMinor`), so an overpaid card correctly reports a
 * negative figure rather than a floored zero.
 */
export function upcomingStatements(
  dueDay: number,
  owedNowMinor: number,
  postedCharges: DatedAmount[],
  futureCharges: DatedAmount[],
  payments: DatedAmount[],
  today: Date,
  horizon: Date,
): StatementSummary[] {
  if (!Number.isFinite(dueDay) || dueDay < 1) return [];
  const now = startOfDay(today);
  const currentDue = nextDueDate(now, dueDay);
  const end = startOfDay(horizon);

  const sum = (xs: DatedAmount[]) => xs.reduce((s, x) => s + Math.max(0, x.amountMinor), 0);

  // Whatever the balance carries that the known charges and payments don't
  // explain is pre-existing debt (an opening balance): bill it on the current
  // statement. balance = opening + charges - payments. `owedNowMinor` must NOT
  // be floored here — an overpaid card owes a negative amount, and clamping that
  // credit to zero would reappear as phantom brought-forward debt.
  const broughtForwardMinor = Math.max(0, owedNowMinor - sum(postedCharges) + sum(payments));

  const billedByDue = new Map<number, number>();
  // Keep the current statement even when nothing is billed this cycle, so it
  // stays the first entry and callers can read "this cycle" from index 0.
  billedByDue.set(currentDue.getTime(), broughtForwardMinor);

  for (const c of [...postedCharges, ...futureCharges]) {
    const amount = Math.max(0, c.amountMinor);
    if (amount <= 0) continue;
    const due = statementBucketDue(startOfDay(c.date), dueDay, currentDue);
    if (isAfter(due, end)) continue;
    billedByDue.set(due.getTime(), (billedByDue.get(due.getTime()) ?? 0) + amount);
  }

  const statements: StatementSummary[] = [...billedByDue.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dueMs, billed]) => {
      const paymentDueDate = new Date(dueMs);
      return {
        statementDate: statementDateForDue(paymentDueDate, dueDay),
        paymentDueDate,
        totalAmountDueMinor: billed,
        broughtForwardMinor: dueMs === currentDue.getTime() ? broughtForwardMinor : 0,
        paidMinor: 0,
        remainingMinor: billed,
      };
    });

  // Settle oldest bill first; a surplus rolls on as credit against later cycles.
  let unapplied = sum(payments);
  for (const s of statements) {
    if (unapplied <= 0) break;
    const applied = Math.min(unapplied, s.totalAmountDueMinor);
    s.paidMinor = applied;
    s.remainingMinor = s.totalAmountDueMinor - applied;
    unapplied -= applied;
  }

  return statements;
}

/**
 * The next statement with something left to pay — skipping bills already
 * settled. A card paid off on its due date points at the NEXT bill, not at
 * today's cleared one.
 */
export function nextDueStatement(
  dueDay: number,
  owedNowMinor: number,
  postedCharges: DatedAmount[],
  futureCharges: DatedAmount[],
  payments: DatedAmount[],
  today: Date,
  horizon: Date,
): StatementSummary | null {
  const statements = upcomingStatements(
    dueDay,
    owedNowMinor,
    postedCharges,
    futureCharges,
    payments,
    today,
    horizon,
  );
  return statements.find((s) => s.remainingMinor > 0) ?? null;
}
