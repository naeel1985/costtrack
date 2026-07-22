// ─────────────────────────────────────────────────────────────────────────────
// Notifications engine — pure and unit-tested.
//
// Notifications are DERIVED, never stored. They are the single home for the
// forward-looking alerts the app raises: the projection's warnings (an account
// going negative, dropping below its safety buffer, a cheque that may bounce),
// an overdrawn account projected to recover, and income ready to debit. Each
// carries a deterministic `key` so a user's acknowledgement (stored as just that
// key) hides it and stays dismissed across sessions and devices.
//
// A key stays stable while the underlying situation is unchanged (same account,
// same projected date, same pay occurrence) and changes — resurfacing the
// alert — when the situation genuinely changes.
// ─────────────────────────────────────────────────────────────────────────────

import { format, startOfDay } from "date-fns";
import { formatMoney } from "./money";
import type { ProjectionWarning } from "./projection";

export type NotificationType =
  | "salary_ready"
  | "account_negative"
  | "account_buffer"
  | "account_positive"
  | "pdc_bounce";

export type NotificationSeverity = "critical" | "warning" | "info" | "positive";

export interface NotificationItem {
  key: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** The date the notification is about (projected/occurrence), for ordering. */
  date: Date | null;
  accountId?: string;
}

/** An asset account that's underwater today but projected to climb back to ≥ 0. */
export interface RecoveringAccount {
  id: string;
  name: string;
  currency: string;
  balanceMinor: number;
  firstPositiveDate: Date;
}

export interface SalaryReadySignal {
  ruleId: string;
  ruleName: string;
  accountName: string;
  amountMinor: number;
  currency: string;
  date: Date;
}

export interface NotificationInput {
  /** The projection's warnings — the authoritative negative/buffer/bounce set. */
  warnings: ProjectionWarning[];
  recovering: RecoveringAccount[];
  salaryReady: SalaryReadySignal[];
}

const dayKey = (d: Date) => String(startOfDay(d).getTime());
const human = (d: Date) => format(d, "d MMM yyyy");

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

export function buildNotifications(input: NotificationInput): NotificationItem[] {
  const items: NotificationItem[] = [];
  const recoveringIds = new Set(input.recovering.map((r) => r.id));

  for (const w of input.warnings) {
    // A recovering account gets the reassuring "back in the black" note below
    // instead of a scary going-negative / buffer warning.
    if ((w.type === "negative" || w.type === "buffer") && recoveringIds.has(w.accountId)) continue;

    if (w.type === "negative") {
      items.push({
        key: `account_negative:${w.accountId}:${dayKey(w.date)}`,
        type: "account_negative",
        severity: "critical",
        title: "Account going negative",
        body: w.message,
        date: w.date,
        accountId: w.accountId,
      });
    } else if (w.type === "buffer") {
      items.push({
        key: `account_buffer:${w.accountId}:${dayKey(w.date)}`,
        type: "account_buffer",
        severity: "warning",
        title: "Below safety buffer",
        body: w.message,
        date: w.date,
        accountId: w.accountId,
      });
    } else if (w.type === "pdc_bounce") {
      items.push({
        key: `pdc_bounce:${w.refId ?? w.accountId}:${dayKey(w.date)}`,
        type: "pdc_bounce",
        severity: "critical",
        title: "Cheque may bounce",
        body: w.message,
        date: w.date,
        accountId: w.accountId,
      });
    }
  }

  for (const r of input.recovering) {
    items.push({
      key: `account_positive:${r.id}:${dayKey(r.firstPositiveDate)}`,
      type: "account_positive",
      severity: "positive",
      title: "Back in the black",
      body: `${r.name} is ${formatMoney(r.balanceMinor, r.currency)} now but is projected to return to positive on ${human(
        r.firstPositiveDate,
      )}.`,
      date: r.firstPositiveDate,
      accountId: r.id,
    });
  }

  for (const s of input.salaryReady) {
    items.push({
      key: `salary_ready:${s.ruleId}:${dayKey(s.date)}`,
      type: "salary_ready",
      severity: "info",
      title: "Income ready to debit",
      body: `${s.ruleName} — ${formatMoney(s.amountMinor, s.currency)} is ready to debit into ${
        s.accountName || "its account"
      }.`,
      date: s.date,
    });
  }

  // Most urgent first; within a severity, soonest dated first (undated last).
  items.sort((x, y) => {
    const bySeverity = SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity];
    if (bySeverity !== 0) return bySeverity;
    const xt = x.date ? x.date.getTime() : Infinity;
    const yt = y.date ? y.date.getTime() : Infinity;
    return xt - yt;
  });

  return items;
}
