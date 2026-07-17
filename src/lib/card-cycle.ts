// ─────────────────────────────────────────────────────────────────────────────
// Credit-card statement cycles — pure, date-fns only, unit-tested.
//
// A card bill is not owed continuously; it falls due on one day each month.
// Costs charged BETWEEN two consecutive due dates form one statement cycle and
// are payable on the closing due date. That's what makes free savings honest:
// the money leaves on the day you actually pay the card, not when you swipe it.
//
// Anything still owed from cycles that already closed is overdue — it can't be
// attributed to a future cycle, so it's charged at the next due date rather
// than silently dropped.
//
// All amounts are integer minor units, POSITIVE magnitudes.
// ─────────────────────────────────────────────────────────────────────────────

import { addMonths, getDaysInMonth, isAfter, setDate, startOfDay } from "date-fns";
import type { DatedAmount } from "./salary-period";

export interface CardCycleInput {
  /** Day of the month the bill falls due (1–31). */
  dueDay: number;
  /** Everything currently unpaid on the card (its negative balance, magnitude). */
  owedMinor: number;
  /** Card costs, used to attribute spend to the cycle it belongs to. */
  costs: DatedAmount[];
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
 * Turn a card into dated cost events — one per due date in [from, to].
 *
 * Each event carries the costs charged in the cycle closing on that date
 * (previous due date, this due date]. The first event additionally carries any
 * balance left over from cycles that already closed, so the total charged
 * across the window reconciles with what's actually owed.
 */
export function cardCycleCosts(card: CardCycleInput, from: Date, to: Date): DatedAmount[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (!Number.isFinite(card.dueDay) || card.dueDay < 1) return [];

  // Walk the due dates inside the window.
  const dueDates: Date[] = [];
  let cursor = nextDueDate(start, card.dueDay);
  for (let i = 0; i < 400 && !isAfter(cursor, end); i++) {
    dueDates.push(cursor);
    cursor = dueDateIn(addMonths(cursor, 1), card.dueDay);
  }
  if (dueDates.length === 0) return [];

  const events: DatedAmount[] = [];
  let attributed = 0;

  for (const due of dueDates) {
    const cycleStart = dueDateIn(addMonths(due, -1), card.dueDay);
    // (cycleStart, due] — the cycle closing on this due date.
    const cycleCosts = card.costs
      .filter((c) => {
        const d = startOfDay(c.date).getTime();
        return d > cycleStart.getTime() && d <= due.getTime();
      })
      .reduce((s, c) => s + Math.max(0, c.amountMinor), 0);
    attributed += cycleCosts;
    events.push({ date: due, amountMinor: cycleCosts });
  }

  // Whatever is owed but wasn't attributed to a cycle in the window already
  // closed — it's overdue, so it lands on the next due date.
  const overdue = Math.max(0, card.owedMinor - attributed);
  if (overdue > 0) events[0].amountMinor += overdue;

  return events.filter((e) => e.amountMinor > 0);
}
