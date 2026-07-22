import "server-only";
import { startOfDay } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { decryptRecurring, encInt, encStr } from "@/server/crypto-map";
import type { AuthContext } from "@/server/auth";
import { zodFail, type MutationResult } from "./types";

const debitOccurrenceSchema = z.object({
  ruleId: z.string().min(1),
  /** The occurrence's own date (an expected pay date of the rule). */
  date: z.coerce.date(),
  /** Optional override — the salary that actually landed may differ. */
  amount: z.coerce.number().finite().positive("Enter an amount").optional(),
});

/** The day-window [startOfDay, endOfDay] an occurrence date falls in. */
function dayWindow(date: Date): { gte: Date; lte: Date } {
  const gte = startOfDay(date);
  return { gte, lte: new Date(gte.getTime() + 86_400_000 - 1) };
}

/**
 * "Debit" one occurrence of a recurring INCOME rule: materialise it as a posted
 * income transaction on its own account, so the money finally shows up in that
 * account's balance. Idempotent — an occurrence can be debited only once — and
 * the amount can be adjusted to whatever actually landed.
 *
 * Pure DB core, no revalidation: shared by the web action and the mobile API.
 */
export async function debitRecurringOccurrenceCore(
  auth: AuthContext,
  input: unknown,
): Promise<MutationResult> {
  let data: z.infer<typeof debitOccurrenceSchema>;
  try {
    data = debitOccurrenceSchema.parse(input);
  } catch (e) {
    return zodFail(e);
  }

  const { user, dek } = auth;
  const raw = await prisma.recurringRule.findFirst({
    where: { id: data.ruleId, userId: user.id, type: "income" },
  });
  if (!raw) return { ok: false, error: "Income rule not found", status: 404 };
  const rule = decryptRecurring(raw, dek);
  const day = startOfDay(data.date);

  // One debit per occurrence.
  const existing = await prisma.transaction.findFirst({
    where: {
      userId: user.id,
      recurringRuleId: rule.id,
      type: "income",
      status: "posted",
      date: dayWindow(day),
    },
  });
  if (existing) return { ok: false, error: "This income is already debited", status: 409 };

  const amountMinor = data.amount != null ? toMinor(data.amount, rule.currency) : rule.amountMinor;
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "income",
      method: "account",
      amountEnc: encInt(amountMinor, dek),
      currency: rule.currency,
      date: day,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      noteEnc: encStr(rule.note ?? rule.name, dek),
      tagsEnc: encStr("[]", dek),
      recurringRuleId: rule.id,
      status: "posted",
    },
  });
  return { ok: true };
}

/** Reverse a debit: remove the posted transaction for that occurrence. */
export async function undoRecurringOccurrenceCore(
  auth: AuthContext,
  input: unknown,
): Promise<MutationResult> {
  let data: { ruleId: string; date: Date };
  try {
    data = z.object({ ruleId: z.string().min(1), date: z.coerce.date() }).parse(input);
  } catch (e) {
    return zodFail(e);
  }

  const res = await prisma.transaction.deleteMany({
    where: {
      userId: auth.user.id,
      recurringRuleId: data.ruleId,
      type: "income",
      status: "posted",
      date: dayWindow(startOfDay(data.date)),
    },
  });
  if (res.count === 0) return { ok: false, error: "Nothing to undo", status: 404 };
  return { ok: true };
}
