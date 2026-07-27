import "server-only";
import { startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { CREDIT_CARD_ACCOUNT_NAME } from "@/lib/domain";
import { expandRecurrence } from "@/lib/projection";
import { encInt, encStr } from "@/server/crypto-map";

// Ownership/resolution helpers shared by the web server actions and the mobile
// API mutation cores. Moved here (out of actions.ts) so both can reuse them
// without importing a "use server" module.

/** Throw unless every provided account id belongs to the user. */
export async function assertOwnsAccounts(userId: string, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (wanted.length === 0) return;
  const count = await prisma.account.count({ where: { userId, id: { in: wanted } } });
  if (count !== wanted.length) throw new Error("Account not found");
}

export async function assertOwnsCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const found = await prisma.category.count({ where: { userId, id: categoryId } });
  if (!found) throw new Error("Category not found");
}

/**
 * Resolve which credit card a cost/payment belongs to. Users can keep several
 * cards (each an Account of type `credit_card`, whose negative balance is the
 * amount owed). If they haven't set one up yet we create a default on first
 * use, so the zero-config path still works.
 */
export async function resolveCreditCardAccount(
  userId: string,
  dek: Buffer,
  cardId?: string | null,
): Promise<string> {
  if (cardId) {
    const chosen = await prisma.account.findFirst({
      where: { id: cardId, userId, type: "credit_card" },
    });
    if (!chosen) throw new Error("Credit card not found");
    return chosen.id;
  }
  const existing = await prisma.account.findFirst({
    where: { userId, type: "credit_card", isArchived: false },
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (existing) return existing.id;
  const created = await prisma.account.create({
    data: {
      userId,
      nameEnc: encStr(CREDIT_CARD_ACCOUNT_NAME, dek),
      type: "credit_card",
      currency: "AED",
      openingBalanceEnc: encInt(0, dek),
      safetyBufferEnc: encInt(0, dek),
      color: "#7c3aed",
      isSystem: true,
    },
  });
  return created.id;
}

/**
 * The next date a recurring rule should fire on or after today, given its
 * schedule. Falls back to the start date if the series has no future
 * occurrence. Shared by the web actions and the mobile API core.
 */
export function computeNextRunDate(rule: {
  frequency: string;
  interval: number;
  startDate: Date;
  endDate?: Date | null;
  occurrenceCount?: number | null;
}): Date {
  const today = startOfDay(new Date());
  const horizon = new Date(today.getFullYear() + 5, today.getMonth(), today.getDate());
  const occurrences = expandRecurrence(
    {
      frequency: rule.frequency as never,
      interval: rule.interval,
      startDate: rule.startDate,
      endDate: rule.endDate ?? null,
      occurrenceCount: rule.occurrenceCount ?? null,
    },
    today,
    horizon,
  );
  return occurrences[0] ?? rule.startDate;
}
