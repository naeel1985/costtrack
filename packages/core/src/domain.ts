// Domain vocabulary. These string unions mirror the "enum" columns in the
// Prisma schema (SQLite has no enums). Keeping them here means the UI, server
// actions and validation all agree on the same set of allowed values.

export const ACCOUNT_TYPES = ["cash", "bank", "credit_card", "wallet"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  credit_card: "Credit card",
  wallet: "Wallet",
};

export const CATEGORY_KINDS = ["income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// How an expense was paid. `account` = plain cash/bank spend (the default, also
// used by income/transfers). `debit_card` = drawn from a linked asset account.
// `credit_card` = added as a cost against the user's credit-card liability (it
// accumulates as "owed" and never touches a cash account until a payment).
export const EXPENSE_METHODS = ["account", "debit_card", "credit_card"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  account: "Cash / bank",
  debit_card: "Debit card",
  credit_card: "Credit card",
};

// The single auto-managed credit-card liability account per user. Credit-card
// costs post here; its (negative) balance is the amount owed.
export const CREDIT_CARD_ACCOUNT_NAME = "Credit Card";

export const TRANSACTION_STATUSES = ["posted", "scheduled"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const RECURRENCE_FREQUENCIES = [
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const PDC_DIRECTIONS = ["issued", "received"] as const;
export type PdcDirection = (typeof PDC_DIRECTIONS)[number];

export const PDC_DIRECTION_LABELS: Record<PdcDirection, string> = {
  issued: "Issued (paying out)",
  received: "Received (coming in)",
};

export const PDC_STATUSES = [
  "pending",
  "cleared",
  "bounced",
  "cancelled",
  "replaced",
] as const;
export type PdcStatus = (typeof PDC_STATUSES)[number];

export const PROVISION_STATUSES = [
  "active",
  "funded",
  "released",
  "cancelled",
] as const;
export type ProvisionStatus = (typeof PROVISION_STATUSES)[number];

export const PRIORITIES = [
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Low" },
] as const;

// Semantic colours used consistently across the app. Money direction is the
// only thing that gets green/red; nothing is coloured decoratively.
export const STATUS_TONE: Record<string, "positive" | "negative" | "warning" | "neutral" | "info"> = {
  pending: "warning",
  cleared: "positive",
  bounced: "negative",
  cancelled: "neutral",
  replaced: "info",
  active: "info",
  funded: "positive",
  released: "neutral",
};
