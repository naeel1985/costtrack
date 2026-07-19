// ─────────────────────────────────────────────────────────────────────────────
// Credit-card statement cycles — pure, date-fns only, unit-tested.
//
// A credit card is a loan: you spend on it now and repay the bank on a fixed day
// each month. Costs charged BETWEEN two consecutive due dates form one statement
// cycle, payable on the closing due date — e.g. with a due day of the 2nd, every
// cost from 2 Jul to 2 Aug is paid on 2 Aug. That repayment is when cash actually
// leaves your accounts, so it's what the free-savings projection should feel.
//
// `cardCycleBills` turns a card into dated repayment events:
//   • each FUTURE charge is billed on the due date closing its cycle, so a
//     recurring cost that repeats for N months produces N charges, each landing
//     on its own statement;
//   • whatever is ALREADY owed today is due on the next upcoming due date.
//
// All amounts are integer minor units, POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addMonths, getDaysInMonth, isAfter, setDate, startOfDay } from "date-fns";
import type { DatedAmount } from "./salary-period";

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

/** The first due date on or after `from`. */
export function nextDueDate(from: Date, dueDay: number): Date {
  const start = startOfDay(from);
  const thisMonth = dueDateIn(start, dueDay);
  return isAfter(start, thisMonth) ? dueDateIn(addMonths(start, 1), dueDay) : thisMonth;
}

/**
 * Repayment events for a card across [from, to].
 *
 * Each future charge is billed on the due date that closes its cycle (the first
 * due date on or after the charge). The amount owed today is billed on the first
 * upcoming due date. Bills with no money on them are dropped.
 */
export function cardCycleBills(card: CardBillInput, from: Date, to: Date): DatedAmount[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (!Number.isFinite(card.dueDay) || card.dueDay < 1) return [];

  const firstDue = nextDueDate(start, card.dueDay);
  if (isAfter(firstDue, end)) return [];

  // Accumulate by due-date epoch, so charges sharing a statement merge.
  const byDue = new Map<number, number>();
  const add = (dueMs: number, amount: number) => {
    if (amount <= 0) return;
    byDue.set(dueMs, (byDue.get(dueMs) ?? 0) + amount);
  };

  // Current balance is due at the first upcoming statement.
  add(firstDue.getTime(), Math.max(0, card.owedNowMinor));

  // Each future charge lands on the due date closing its cycle.
  for (const c of card.charges) {
    const amount = Math.max(0, c.amountMinor);
    if (amount <= 0) continue;
    const chargeDate = startOfDay(c.date);
    if (isAfter(start, chargeDate)) continue; // already reflected in owedNow
    const due = nextDueDate(chargeDate, card.dueDay);
    if (isAfter(due, end)) continue; // billed beyond the window
    add(due.getTime(), amount);
  }

  return [...byDue.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([dueMs, amountMinor]) => ({ date: new Date(dueMs), amountMinor }));
}
