import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { encNull, encInt, encStr } from "@/server/crypto-map";
import { transactionSchema } from "@/lib/schemas";
import type { AuthContext } from "@/server/auth";
import {
  INCOME_ON_CARD_ERROR,
  assertOwnsAccounts,
  assertOwnsCategory,
  isCreditCardAccount,
  resolveCreditCardAccount,
} from "./shared";
import { zodFail, type MutationResult } from "./types";

/**
 * Create or update a transaction. Pure DB core (no revalidation), shared by the
 * web action and the mobile API. Mirrors the web logic exactly: credit-card
 * costs resolve their liability account, transfers null out category, amounts
 * convert to minor units, and note/tags are encrypted.
 */
export async function saveTransactionCore(auth: AuthContext, input: unknown): Promise<MutationResult> {
  let data: z.infer<typeof transactionSchema>;
  try {
    data = transactionSchema.parse(input);
  } catch (e) {
    return zodFail(e);
  }

  const { user, dek } = auth;
  const method = data.type === "expense" ? data.method : "account";
  const accountId =
    data.type === "expense" && method === "credit_card"
      ? await resolveCreditCardAccount(user.id, dek, data.accountId)
      : data.accountId ?? null;
  if (!accountId) return { ok: false, error: "Choose an account", status: 400 };

  await assertOwnsAccounts(user.id, [accountId, data.transferAccountId]);
  await assertOwnsCategory(user.id, data.type === "transfer" ? null : data.categoryId);

  // Cards are excluded from the free-savings pool, so income banked into one
  // would simply vanish from it. (Pay a card down with a transfer instead.)
  if (data.type === "income" && (await isCreditCardAccount(user.id, accountId))) {
    return { ok: false, error: INCOME_ON_CARD_ERROR, status: 400 };
  }

  const payload = {
    type: data.type,
    method,
    amountEnc: encInt(toMinor(data.amount, data.currency), dek),
    currency: data.currency,
    date: data.date,
    accountId,
    transferAccountId: data.type === "transfer" ? data.transferAccountId || null : null,
    categoryId: data.type === "transfer" ? null : data.categoryId || null,
    noteEnc: encNull(data.note, dek),
    tagsEnc: encStr(JSON.stringify(data.tags ?? []), dek),
  };

  let id: string;
  if (data.id) {
    const owned = await prisma.transaction.findFirst({ where: { id: data.id, userId: user.id } });
    if (!owned) return { ok: false, error: "Transaction not found", status: 404 };
    id = (await prisma.transaction.update({ where: { id: data.id }, data: payload })).id;
  } else {
    id = (await prisma.transaction.create({ data: { ...payload, userId: user.id } })).id;
  }
  return { ok: true, id };
}

export async function deleteTransactionCore(auth: AuthContext, input: unknown): Promise<MutationResult> {
  let id: string;
  try {
    ({ id } = z.object({ id: z.string().min(1) }).parse(input));
  } catch (e) {
    return zodFail(e);
  }
  const res = await prisma.transaction.deleteMany({ where: { id, userId: auth.user.id } });
  if (res.count === 0) return { ok: false, error: "Transaction not found", status: 404 };
  return { ok: true };
}
