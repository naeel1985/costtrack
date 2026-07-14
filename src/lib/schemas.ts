import { z } from "zod";
import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  PDC_DIRECTIONS,
  PDC_STATUSES,
  RECURRENCE_FREQUENCIES,
  TRANSACTION_TYPES,
} from "./domain";

// All forms submit major-unit amounts as strings/numbers; we coerce and the
// server action converts to minor units. Amounts are validated as finite &
// non-negative (direction/type carries the sign).

const amount = z.coerce
  .number({ message: "Enter an amount" })
  .finite()
  .min(0, "Amount must be positive");

const currency = z.string().min(1).max(8).default("AED");

export const accountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").max(80),
  type: z.enum(ACCOUNT_TYPES),
  currency,
  openingBalance: z.coerce.number().finite().default(0),
  safetyBuffer: z.coerce.number().finite().min(0).default(0),
  color: z.string().default("#64748b"),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  kind: z.enum(CATEGORY_KINDS),
  icon: z.string().default("Circle"),
  color: z.string().default("#64748b"),
  parentId: z.string().optional().nullable(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const transactionSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(TRANSACTION_TYPES),
    amount,
    currency,
    date: z.coerce.date(),
    accountId: z.string().min(1, "Choose an account"),
    transferAccountId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    note: z.string().max(280).optional().nullable(),
    tags: z.array(z.string()).default([]),
  })
  .refine((d) => d.type !== "transfer" || !!d.transferAccountId, {
    message: "Choose a destination account for the transfer",
    path: ["transferAccountId"],
  })
  .refine((d) => d.type !== "transfer" || d.transferAccountId !== d.accountId, {
    message: "Transfer accounts must differ",
    path: ["transferAccountId"],
  });
export type TransactionInput = z.infer<typeof transactionSchema>;

export const recurringSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  type: z.enum(["income", "expense"]),
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.coerce.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  occurrenceCount: z.coerce.number().int().min(1).optional().nullable(),
  amount,
  currency,
  accountId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  note: z.string().max(280).optional().nullable(),
});
export type RecurringInput = z.infer<typeof recurringSchema>;

export const pdcSchema = z.object({
  id: z.string().optional(),
  direction: z.enum(PDC_DIRECTIONS),
  counterparty: z.string().min(1, "Who is it to/from?").max(120),
  amount,
  currency,
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  bankName: z.string().max(80).optional().nullable(),
  chequeNumber: z.string().max(40).optional().nullable(),
  accountId: z.string().min(1),
  notes: z.string().max(280).optional().nullable(),
});
export type PdcInput = z.infer<typeof pdcSchema>;

export const pdcBatchSchema = z.object({
  direction: z.enum(PDC_DIRECTIONS),
  counterparty: z.string().min(1).max(120),
  amount,
  currency,
  count: z.coerce.number().int().min(1).max(60),
  firstDueDate: z.coerce.date(),
  bankName: z.string().max(80).optional().nullable(),
  startChequeNumber: z.coerce.number().int().optional().nullable(),
  accountId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  createRecurringRule: z.boolean().default(true),
  notes: z.string().max(280).optional().nullable(),
});
export type PdcBatchInput = z.infer<typeof pdcBatchSchema>;

export const pdcStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PDC_STATUSES),
  clearDate: z.coerce.date().optional().nullable(),
});

export const provisionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  target: amount,
  currency,
  dueDate: z.coerce.date().optional().nullable(),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  accountId: z.string().optional().nullable(),
});
export type ProvisionInput = z.infer<typeof provisionSchema>;

export const allocationSchema = z.object({
  provisionId: z.string().min(1),
  amount,
  date: z.coerce.date().default(() => new Date()),
  accountId: z.string().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});
export type AllocationInput = z.infer<typeof allocationSchema>;

export const budgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  planned: amount,
});
export type BudgetInput = z.infer<typeof budgetSchema>;

export const rateSchema = z.object({
  id: z.string().optional(),
  base: z.string().min(1).max(8),
  quote: z.string().min(1).max(8),
  rate: z.coerce.number().positive(),
});
export type RateInput = z.infer<typeof rateSchema>;

export const settingsSchema = z.object({
  baseCurrency: z.string().min(1).max(8),
  defaultBuffer: z.coerce.number().finite().min(0).default(0),
  theme: z.enum(["light", "dark", "system"]).default("system"),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
