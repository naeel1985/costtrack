import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { encInt, encNull, encStr } from "@/server/crypto-map";
import { accountSchema } from "@/lib/schemas";
import type { AuthContext } from "@/server/auth";
import { zodFail, type MutationResult } from "./types";

/**
 * Create or update an account. Pure DB core (no revalidation), shared by the web
 * action and the mobile API. Encrypts name / balances / issuing-bank / last-4;
 * clears card-only fields when the type isn't a credit card.
 */
export async function saveAccountCore(auth: AuthContext, input: unknown): Promise<MutationResult> {
  let data: z.infer<typeof accountSchema>;
  try {
    data = accountSchema.parse(input);
  } catch (e) {
    return zodFail(e);
  }

  const { user, dek } = auth;
  const payload = {
    nameEnc: encStr(data.name, dek),
    type: data.type,
    currency: data.currency,
    openingBalanceEnc: encInt(toMinor(data.openingBalance, data.currency), dek),
    safetyBufferEnc: encInt(toMinor(data.safetyBuffer, data.currency), dek),
    creditLimitEnc:
      data.type === "credit_card" && data.creditLimit != null
        ? encInt(toMinor(data.creditLimit, data.currency), dek)
        : null,
    bankNameEnc: encNull(data.bankName, dek),
    cardLast4Enc: encNull(data.cardLast4 ?? null, dek),
    color: data.color,
    dueDay: data.type === "credit_card" ? data.dueDay ?? null : null,
  };

  let id: string;
  if (data.id) {
    const owned = await prisma.account.findFirst({ where: { id: data.id, userId: user.id } });
    if (!owned) return { ok: false, error: "Account not found", status: 404 };
    id = (await prisma.account.update({ where: { id: data.id }, data: payload })).id;
  } else {
    id = (await prisma.account.create({ data: { ...payload, userId: user.id } })).id;
  }
  return { ok: true, id };
}
