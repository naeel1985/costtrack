// ─────────────────────────────────────────────────────────────────────────────
// Notifications engine — pure and unit-tested.
//
// Notifications are DERIVED from current balances, the forward projection and
// the recurring-income schedule; they are never stored. Each one carries a
// deterministic `key` so a user's acknowledgement (stored as just that key) can
// hide it and stay dismissed across sessions and devices.
//
// A key stays stable while the underlying situation is unchanged (same account,
// same projected date, same pay occurrence). When the situation genuinely
// changes — a new projected negative date, a new pay date — the key changes and
// the notification resurfaces, which is what we want.
// ─────────────────────────────────────────────────────────────────────────────

import { format, startOfDay } from "date-fns";
import { formatMoney } from "./money";

export type NotificationType =
  | "salary_ready"
  | "account_negative"
  | "account_positive"
  | "card_over_limit";

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

/** Per-account signals distilled from balances + the projection. */
export interface AccountSignal {
  id: string;
  name: string;
  type: string; // credit_card | bank | cash | wallet
  currency: string;
  /** Current (posted) balance. Cards are negative by the amount owed. */
  balanceMinor: number;
  creditLimitMinor: number | null;
  /** First projected day the balance is below zero (null if never). */
  firstNegativeDate: Date | null;
  /** First projected day a currently-negative balance returns to ≥ 0. */
  firstPositiveDate: Date | null;
  /** Deepest projected balance and the day it happens (for card limits). */
  minBalanceMinor: number;
  minBalanceDate: Date;
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
  accounts: AccountSignal[];
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

  for (const a of input.accounts) {
    if (a.type === "credit_card") {
      // A card's "negative" balance is expected (it's a liability). The useful
      // alert is when its projected debt would blow past the credit limit.
      if (a.creditLimitMinor != null && a.creditLimitMinor > 0) {
        const projectedOwed = Math.max(0, -a.minBalanceMinor);
        if (projectedOwed > a.creditLimitMinor) {
          items.push({
            key: `card_over_limit:${a.id}:${dayKey(a.minBalanceDate)}`,
            type: "card_over_limit",
            severity: "warning",
            title: `${a.name} nearing its limit`,
            body: `Projected balance owed of ${formatMoney(projectedOwed, a.currency)} exceeds the ${formatMoney(
              a.creditLimitMinor,
              a.currency,
            )} limit around ${human(a.minBalanceDate)}.`,
            date: a.minBalanceDate,
            accountId: a.id,
          });
        }
      }
      continue;
    }

    // Asset accounts (bank / cash / wallet).
    if (a.balanceMinor < 0) {
      if (a.firstPositiveDate) {
        items.push({
          key: `account_positive:${a.id}:${dayKey(a.firstPositiveDate)}`,
          type: "account_positive",
          severity: "positive",
          title: `${a.name} back in the black`,
          body: `${a.name} is ${formatMoney(a.balanceMinor, a.currency)} now but is projected to return to positive on ${human(
            a.firstPositiveDate,
          )}.`,
          date: a.firstPositiveDate,
          accountId: a.id,
        });
      } else {
        items.push({
          key: `account_negative:${a.id}:now`,
          type: "account_negative",
          severity: "critical",
          title: `${a.name} is overdrawn`,
          body: `${a.name} is currently ${formatMoney(a.balanceMinor, a.currency)} with no recovery projected.`,
          date: null,
          accountId: a.id,
        });
      }
    } else if (a.firstNegativeDate) {
      items.push({
        key: `account_negative:${a.id}:${dayKey(a.firstNegativeDate)}`,
        type: "account_negative",
        severity: "critical",
        title: `${a.name} going negative`,
        body: `${a.name} is projected to drop below zero on ${human(a.firstNegativeDate)}.`,
        date: a.firstNegativeDate,
        accountId: a.id,
      });
    }
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
      accountId: undefined,
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
