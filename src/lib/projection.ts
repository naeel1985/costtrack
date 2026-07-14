// ─────────────────────────────────────────────────────────────────────────────
// Projection engine — the core of the app.
//
// This module is deliberately PURE: it imports nothing from Prisma or Next and
// operates only on plain data structures. That makes it trivial to unit-test and
// keeps all cash-flow logic in one auditable place. The database layer is
// responsible for loading rows and mapping them into the input shapes below.
//
// Everything is in integer minor units. `amountMinor` on an event is SIGNED:
// positive = money in, negative = money out.
// ─────────────────────────────────────────────────────────────────────────────

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns";
import type { RecurrenceFrequency } from "./domain";

export type EventKind = "recurring" | "pdc" | "scheduled" | "provision" | "whatif";

export interface ProjectionAccount {
  id: string;
  name: string;
  currency: string;
  /** Balance as of the projection start date (opening + posted movements). */
  currentBalanceMinor: number;
  safetyBufferMinor: number;
}

export interface ProjectionEvent {
  date: Date;
  accountId: string;
  amountMinor: number; // signed
  kind: EventKind;
  label: string;
  refId?: string;
  /** For PDCs, the cheque number, used to build human warnings. */
  chequeNumber?: string | null;
}

export interface RecurringInput {
  id: string;
  name: string;
  type: "income" | "expense";
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: Date;
  endDate?: Date | null;
  occurrenceCount?: number | null;
  amountMinor: number;
  accountId: string;
}

export interface PdcInput {
  id: string;
  direction: "issued" | "received";
  counterparty: string;
  amountMinor: number;
  dueDate: Date;
  accountId: string;
  chequeNumber?: string | null;
  status: string;
}

export interface DayPoint {
  date: Date;
  /** Balance per account id at end of this day. */
  balances: Record<string, number>;
  /** Sum across all accounts (naive — assumes single currency for the total). */
  totalMinor: number;
}

export type WarningType = "negative" | "buffer" | "pdc_bounce";

export interface ProjectionWarning {
  type: WarningType;
  severity: "critical" | "warning";
  accountId: string;
  accountName: string;
  date: Date;
  message: string;
  projectedBalanceMinor: number;
  amountMinor?: number;
  refId?: string;
}

export interface ProjectionResult {
  start: Date;
  days: DayPoint[];
  warnings: ProjectionWarning[];
  perAccount: Record<
    string,
    {
      minBalanceMinor: number;
      minBalanceDate: Date;
      endBalanceMinor: number;
      firstNegativeDate: Date | null;
      firstBufferBreachDate: Date | null;
    }
  >;
}

// ── Recurrence expansion ────────────────────────────────────────────────────

function step(date: Date, frequency: RecurrenceFrequency, interval: number): Date {
  switch (frequency) {
    case "weekly":
      return addWeeks(date, interval);
    case "monthly":
      return addMonths(date, interval);
    case "yearly":
      return addYears(date, interval);
    case "custom":
      // Custom = every `interval` days.
      return addDays(date, interval);
    default:
      return addMonths(date, interval);
  }
}

/**
 * Expand a recurring rule into the occurrence dates that fall within
 * [from, to]. Respects endDate and occurrenceCount, both counted from the
 * rule's true startDate (not the window start).
 */
export function expandRecurrence(
  rule: Pick<
    RecurringInput,
    "frequency" | "interval" | "startDate" | "endDate" | "occurrenceCount"
  >,
  from: Date,
  to: Date,
): Date[] {
  const dates: Date[] = [];
  const interval = Math.max(1, rule.interval || 1);
  let cursor = startOfDay(rule.startDate);
  let count = 0;
  const windowStart = startOfDay(from);
  const windowEnd = startOfDay(to);
  const maxIterations = 10_000; // hard stop against pathological input

  for (let i = 0; i < maxIterations; i++) {
    if (rule.occurrenceCount != null && count >= rule.occurrenceCount) break;
    if (rule.endDate && isAfter(cursor, startOfDay(rule.endDate))) break;
    if (isAfter(cursor, windowEnd)) break;

    if (!isBefore(cursor, windowStart)) {
      dates.push(cursor);
    }
    count++;
    cursor = step(cursor, rule.frequency, interval);
  }
  return dates;
}

export function eventsFromRecurring(
  rules: RecurringInput[],
  from: Date,
  to: Date,
): ProjectionEvent[] {
  const events: ProjectionEvent[] = [];
  for (const rule of rules) {
    const sign = rule.type === "income" ? 1 : -1;
    for (const date of expandRecurrence(rule, from, to)) {
      events.push({
        date,
        accountId: rule.accountId,
        amountMinor: sign * rule.amountMinor,
        kind: "recurring",
        label: rule.name,
        refId: rule.id,
      });
    }
  }
  return events;
}

export function eventsFromPdcs(
  pdcs: PdcInput[],
  from: Date,
  to: Date,
): ProjectionEvent[] {
  const windowStart = startOfDay(from);
  const windowEnd = startOfDay(to);
  const events: ProjectionEvent[] = [];
  for (const pdc of pdcs) {
    if (pdc.status !== "pending") continue;
    const due = startOfDay(pdc.dueDate);
    if (isBefore(due, windowStart) || isAfter(due, windowEnd)) continue;
    const sign = pdc.direction === "received" ? 1 : -1;
    events.push({
      date: due,
      accountId: pdc.accountId,
      amountMinor: sign * pdc.amountMinor,
      kind: "pdc",
      label:
        pdc.direction === "issued"
          ? `Cheque to ${pdc.counterparty}`
          : `Cheque from ${pdc.counterparty}`,
      refId: pdc.id,
      chequeNumber: pdc.chequeNumber,
    });
  }
  return events;
}

// ── Core projection ─────────────────────────────────────────────────────────

export interface ProjectOptions {
  accounts: ProjectionAccount[];
  events: ProjectionEvent[];
  start: Date;
  horizonDays: number;
}

export function projectBalances({
  accounts,
  events,
  start,
  horizonDays,
}: ProjectOptions): ProjectionResult {
  const startDay = startOfDay(start);
  const days: DayPoint[] = [];

  // Bucket signed event amounts by day-offset and account.
  const byOffset = new Map<number, ProjectionEvent[]>();
  for (const ev of events) {
    const offset = differenceInCalendarDays(startOfDay(ev.date), startDay);
    if (offset < 0 || offset > horizonDays) continue;
    const bucket = byOffset.get(offset);
    if (bucket) bucket.push(ev);
    else byOffset.set(offset, [ev]);
  }

  const balances: Record<string, number> = {};
  const accountById = new Map<string, ProjectionAccount>();
  for (const acc of accounts) {
    balances[acc.id] = acc.currentBalanceMinor;
    accountById.set(acc.id, acc);
  }

  const perAccount: ProjectionResult["perAccount"] = {};
  for (const acc of accounts) {
    perAccount[acc.id] = {
      minBalanceMinor: acc.currentBalanceMinor,
      minBalanceDate: startDay,
      endBalanceMinor: acc.currentBalanceMinor,
      firstNegativeDate: null,
      firstBufferBreachDate: null,
    };
  }

  const warnings: ProjectionWarning[] = [];

  for (let offset = 0; offset <= horizonDays; offset++) {
    const date = addDays(startDay, offset);
    const todaysEvents = byOffset.get(offset) ?? [];

    for (const ev of todaysEvents) {
      if (!(ev.accountId in balances)) continue;
      balances[ev.accountId] += ev.amountMinor;
    }

    // Snapshot end-of-day balances.
    const snapshot: Record<string, number> = {};
    let total = 0;
    for (const acc of accounts) {
      const bal = balances[acc.id];
      snapshot[acc.id] = bal;
      total += bal;

      const stat = perAccount[acc.id];
      if (bal < stat.minBalanceMinor) {
        stat.minBalanceMinor = bal;
        stat.minBalanceDate = date;
      }
      stat.endBalanceMinor = bal;
      if (bal < 0 && stat.firstNegativeDate == null) stat.firstNegativeDate = date;
      if (
        bal < acc.safetyBufferMinor &&
        stat.firstBufferBreachDate == null
      ) {
        stat.firstBufferBreachDate = date;
      }
    }

    // PDC-specific bounce warnings: if an issued cheque falls today and the
    // account ends the day negative, flag the cheque by name.
    for (const ev of todaysEvents) {
      if (ev.kind !== "pdc") continue;
      const acc = accountById.get(ev.accountId);
      if (!acc) continue;
      const endBal = snapshot[ev.accountId];
      if (ev.amountMinor < 0 && endBal < 0) {
        warnings.push({
          type: "pdc_bounce",
          severity: "critical",
          accountId: acc.id,
          accountName: acc.name,
          date,
          message: buildBounceMessage(ev, endBal, acc.currency),
          projectedBalanceMinor: endBal,
          amountMinor: ev.amountMinor,
          refId: ev.refId,
        });
      }
    }

    days.push({ date, balances: snapshot, totalMinor: total });
  }

  // Per-account first-breach warnings (deduped: one negative + one buffer each).
  for (const acc of accounts) {
    const stat = perAccount[acc.id];
    if (stat.firstNegativeDate) {
      warnings.push({
        type: "negative",
        severity: "critical",
        accountId: acc.id,
        accountName: acc.name,
        date: stat.firstNegativeDate,
        message: `${acc.name} is projected to go negative`,
        projectedBalanceMinor: balanceOn(days, acc.id, stat.firstNegativeDate),
      });
    } else if (
      acc.safetyBufferMinor > 0 &&
      stat.firstBufferBreachDate
    ) {
      warnings.push({
        type: "buffer",
        severity: "warning",
        accountId: acc.id,
        accountName: acc.name,
        date: stat.firstBufferBreachDate,
        message: `${acc.name} drops below its safety buffer`,
        projectedBalanceMinor: balanceOn(
          days,
          acc.id,
          stat.firstBufferBreachDate,
        ),
      });
    }
  }

  warnings.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { start: startDay, days, warnings, perAccount };
}

function balanceOn(days: DayPoint[], accountId: string, date: Date): number {
  const target = startOfDay(date).getTime();
  const day = days.find((d) => startOfDay(d.date).getTime() === target);
  return day?.balances[accountId] ?? 0;
}

function buildBounceMessage(
  ev: ProjectionEvent,
  projected: number,
  currency: string,
): string {
  const chequeRef = ev.chequeNumber ? `Cheque #${ev.chequeNumber}` : "A cheque";
  const amount = formatForMessage(Math.abs(ev.amountMinor), currency);
  const dateStr = ev.date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const bal = formatForMessage(projected, currency);
  return `${chequeRef} for ${amount} may bounce on ${dateStr} — projected balance ${bal}`;
}

// Lightweight formatter for warning strings (kept local so projection.ts stays
// self-contained and dependency-free beyond date-fns).
function formatForMessage(minor: number, currency: string): string {
  const value = minor / 100;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} ${currency}`;
}

// ── Runway ──────────────────────────────────────────────────────────────────

export interface RunwayResult {
  /** Months of runway at the given monthly net burn. Infinity if not burning. */
  months: number;
  monthlyNetMinor: number; // negative = burning cash
  depletionDate: Date | null;
}

/**
 * Estimate cash runway: how long the current total balance lasts at the current
 * average monthly net cash flow. `monthlyNetMinor` should be negative when the
 * user is spending more than they earn.
 */
export function computeRunway(
  totalBalanceMinor: number,
  monthlyNetMinor: number,
  from: Date = new Date(),
): RunwayResult {
  if (monthlyNetMinor >= 0) {
    return { months: Infinity, monthlyNetMinor, depletionDate: null };
  }
  const burn = Math.abs(monthlyNetMinor);
  const months = totalBalanceMinor / burn;
  const depletionDate = addDays(startOfDay(from), Math.round(months * 30.44));
  return { months, monthlyNetMinor, depletionDate };
}
