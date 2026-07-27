import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { recurringSchema } from "@/lib/schemas";
import { encInt, encNull, encStr } from "@/server/crypto-map";
import type { AuthContext } from "@/server/auth";
import { assertOwnsAccounts, assertOwnsCategory, computeNextRunDate } from "./shared";
import { zodFail, type MutationResult } from "./types";

/**
 * Create or update a recurring rule. Pure DB core (no revalidation), shared by
 * the web action and the mobile API. Mirrors the web logic: name/amount/note
 * are encrypted, the amount converts to minor units, and `nextRunDate` is
 * recomputed from the schedule on every save.
 */
export async function saveRecurringCore(auth: AuthContext, input: unknown): Promise<MutationResult> {
  let data: z.infer<typeof recurringSchema>;
  try {
    data = recurringSchema.parse(input);
  } catch (e) {
    return zodFail(e);
  }

  const { user, dek } = auth;
  await assertOwnsAccounts(user.id, [data.accountId]);
  await assertOwnsCategory(user.id, data.categoryId);

  const base = {
    nameEnc: encStr(data.name, dek),
    type: data.type,
    frequency: data.frequency,
    interval: data.interval,
    startDate: data.startDate,
    endDate: data.endDate || null,
    occurrenceCount: data.occurrenceCount || null,
    amountEnc: encInt(toMinor(data.amount, data.currency), dek),
    currency: data.currency,
    accountId: data.accountId,
    categoryId: data.categoryId || null,
    noteEnc: encNull(data.note, dek),
  };
  const nextRunDate = computeNextRunDate({
    frequency: data.frequency,
    interval: data.interval,
    startDate: data.startDate,
    endDate: data.endDate,
    occurrenceCount: data.occurrenceCount,
  });

  let id: string;
  if (data.id) {
    const owned = await prisma.recurringRule.findFirst({ where: { id: data.id, userId: user.id } });
    if (!owned) return { ok: false, error: "Rule not found", status: 404 };
    id = (await prisma.recurringRule.update({ where: { id: data.id }, data: { ...base, nextRunDate } })).id;
  } else {
    id = (await prisma.recurringRule.create({ data: { ...base, nextRunDate, userId: user.id } })).id;
  }
  return { ok: true, id };
}
