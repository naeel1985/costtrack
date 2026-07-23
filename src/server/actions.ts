"use server";

import { revalidatePath } from "next/cache";
import { startOfDay } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { expandRecurrence } from "@/lib/projection";
import { requireUser } from "@/server/auth";
import {
  assertOwnsAccounts,
  assertOwnsCategory,
  resolveCreditCardAccount,
} from "@/server/mutations/shared";
import { decryptPdc, decryptProvision, decryptRecurring, encInt, encNull, encStr } from "@/server/crypto-map";
import {
  allocationSchema,
  budgetSchema,
  categorySchema,
  pdcBatchSchema,
  pdcSchema,
  pdcStatusSchema,
  provisionSchema,
  rateSchema,
  recurringSchema,
  settingsSchema,
} from "@/lib/schemas";
import {
  debitRecurringOccurrenceCore,
  undoRecurringOccurrenceCore,
} from "@/server/mutations/income";
import { acknowledgeNotificationsCore } from "@/server/mutations/notifications";
import { deleteTransactionCore, saveTransactionCore } from "@/server/mutations/transactions";
import { saveAccountCore } from "@/server/mutations/accounts";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues.map((i) => i.message).join(", ") };
  }
  const message = error instanceof Error ? error.message : "Something went wrong";
  return { ok: false, error: message };
}

function revalidateAll() {
  for (const p of ["/dashboard", "/income", "/costs", "/cheques", "/provisions", "/reports", "/accounts", "/settings"]) {
    revalidatePath(p);
  }
}

// assertOwnsAccounts / assertOwnsCategory / resolveCreditCardAccount live in
// @/server/mutations/shared (imported above) so the mobile API cores reuse them.

function computeNextRunDate(rule: {
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

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function saveAccount(input: unknown): Promise<ActionResult> {
  try {
    const auth = await requireUser();
    const res = await saveAccountCore(auth, input);
    if (res.ok) revalidateAll();
    return res.ok ? { ok: true, id: res.id } : { ok: false, error: res.error };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveAccount(id: string, archived: boolean): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.account.updateMany({ where: { id, userId: user.id }, data: { isArchived: archived } });
    if (res.count === 0) return { ok: false, error: "Account not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.account.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return { ok: false, error: "Account not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function saveCategory(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = categorySchema.parse(input);
    const payload = {
      nameEnc: encStr(data.name, dek),
      kind: data.kind,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId || null,
    };
    let id: string;
    if (data.id) {
      const owned = await prisma.category.findFirst({ where: { id: data.id, userId: user.id } });
      if (!owned) return { ok: false, error: "Category not found" };
      id = (await prisma.category.update({ where: { id: data.id }, data: payload })).id;
    } else {
      id = (await prisma.category.create({ data: { ...payload, userId: user.id } })).id;
    }
    revalidateAll();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.category.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return { ok: false, error: "Category not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function saveTransaction(input: unknown): Promise<ActionResult> {
  try {
    const auth = await requireUser();
    const res = await saveTransactionCore(auth, input);
    if (res.ok) revalidateAll();
    return res.ok ? { ok: true, id: res.id } : { ok: false, error: res.error };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    const auth = await requireUser();
    const res = await deleteTransactionCore(auth, { id });
    if (res.ok) revalidateAll();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return fail(e);
  }
}

const creditCardPaymentSchema = z.object({
  fromAccountId: z.string().min(1, "Choose a funding account"),
  /** Which card to pay down; defaults to the user's first/only card. */
  cardId: z.string().optional().nullable(),
  amount: z.coerce.number().finite().positive("Enter an amount"),
  currency: z.string().min(1).max(8).default("AED"),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().max(280).optional().nullable(),
});

/**
 * Pay down a credit card: a transfer from a funding (asset) account into the
 * card's account, which raises its balance back toward zero.
 */
export async function recordCreditCardPayment(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = creditCardPaymentSchema.parse(input);
    const ccId = await resolveCreditCardAccount(user.id, dek, data.cardId);
    if (data.fromAccountId === ccId) return { ok: false, error: "Choose a funding account" };
    await assertOwnsAccounts(user.id, [data.fromAccountId]);
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "transfer",
        method: "account",
        amountEnc: encInt(toMinor(data.amount, data.currency), dek),
        currency: data.currency,
        date: data.date,
        accountId: data.fromAccountId,
        transferAccountId: ccId,
        noteEnc: encNull(data.note ?? "Credit card payment", dek),
        tagsEnc: encStr("[]", dek),
        status: "posted",
      },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Recurring rules ─────────────────────────────────────────────────────────

export async function saveRecurring(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = recurringSchema.parse(input);
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
      if (!owned) return { ok: false, error: "Rule not found" };
      id = (await prisma.recurringRule.update({ where: { id: data.id }, data: { ...base, nextRunDate } })).id;
    } else {
      id = (await prisma.recurringRule.create({ data: { ...base, nextRunDate, userId: user.id } })).id;
    }
    revalidateAll();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRecurring(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.recurringRule.updateMany({ where: { id, userId: user.id }, data: { isActive: active } });
    if (res.count === 0) return { ok: false, error: "Rule not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.recurringRule.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return { ok: false, error: "Rule not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Materialise a recurring rule's next occurrence as a posted transaction. */
export async function postRecurringOccurrence(id: string): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const raw = await prisma.recurringRule.findFirst({ where: { id, userId: user.id } });
    if (!raw) return { ok: false, error: "Rule not found" };
    const rule = decryptRecurring(raw, dek);
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: rule.type,
        amountEnc: encInt(rule.amountMinor, dek),
        currency: rule.currency,
        date: rule.nextRunDate,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        noteEnc: encStr(rule.note ?? rule.name, dek),
        tagsEnc: encStr("[]", dek),
        recurringRuleId: rule.id,
        status: "posted",
      },
    });
    const next = computeNextRunDate({
      frequency: rule.frequency,
      interval: rule.interval,
      startDate: new Date(rule.nextRunDate.getTime() + 86_400_000),
      endDate: rule.endDate,
      occurrenceCount: rule.occurrenceCount,
    });
    await prisma.recurringRule.update({ where: { id: rule.id }, data: { nextRunDate: next } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * "Debit" one occurrence of a recurring INCOME rule. The DB core is shared with
 * the mobile API (see mutations/income); the action adds auth + revalidation.
 */
export async function debitRecurringOccurrence(input: unknown): Promise<ActionResult> {
  try {
    const auth = await requireUser();
    const res = await debitRecurringOccurrenceCore(auth, input);
    if (res.ok) revalidateAll();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return fail(e);
  }
}

/** Reverse a debit: remove the posted transaction for that occurrence. */
export async function undoRecurringOccurrence(input: unknown): Promise<ActionResult> {
  try {
    const auth = await requireUser();
    const res = await undoRecurringOccurrenceCore(auth, input);
    if (res.ok) revalidateAll();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return fail(e);
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

/**
 * Acknowledge (dismiss) one or more notifications. Only the opaque key is
 * stored, scoped to the user, so the dismissal survives across sessions and
 * devices. Idempotent — re-acknowledging is a no-op.
 */
export async function acknowledgeNotifications(keys: string[]): Promise<ActionResult> {
  try {
    const auth = await requireUser();
    const res = await acknowledgeNotificationsCore(auth, keys);
    if (res.ok) revalidateAll();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return fail(e);
  }
}

// ── PDCs ────────────────────────────────────────────────────────────────────

export async function savePdc(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = pdcSchema.parse(input);
    await assertOwnsAccounts(user.id, [data.accountId]);
    const payload = {
      direction: data.direction,
      counterpartyEnc: encStr(data.counterparty, dek),
      amountEnc: encInt(toMinor(data.amount, data.currency), dek),
      currency: data.currency,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      bankNameEnc: encNull(data.bankName, dek),
      chequeNumberEnc: encNull(data.chequeNumber, dek),
      accountId: data.accountId,
      notesEnc: encNull(data.notes, dek),
    };
    let id: string;
    if (data.id) {
      const owned = await prisma.pDC.findFirst({ where: { id: data.id, userId: user.id } });
      if (!owned) return { ok: false, error: "Cheque not found" };
      id = (await prisma.pDC.update({ where: { id: data.id }, data: payload })).id;
    } else {
      id = (await prisma.pDC.create({ data: { ...payload, userId: user.id } })).id;
    }
    revalidateAll();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function createPdcBatch(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = pdcBatchSchema.parse(input);
    await assertOwnsAccounts(user.id, [data.accountId]);
    await assertOwnsCategory(user.id, data.categoryId);
    const amountMinor = toMinor(data.amount, data.currency);

    let recurringRuleId: string | undefined;
    if (data.createRecurringRule) {
      const nextRunDate = computeNextRunDate({
        frequency: "monthly",
        interval: 1,
        startDate: data.firstDueDate,
        occurrenceCount: data.count,
      });
      const rule = await prisma.recurringRule.create({
        data: {
          userId: user.id,
          nameEnc: encStr(`${data.counterparty} (${data.count} cheques)`, dek),
          type: data.direction === "issued" ? "expense" : "income",
          frequency: "monthly",
          interval: 1,
          startDate: data.firstDueDate,
          occurrenceCount: data.count,
          amountEnc: encInt(amountMinor, dek),
          currency: data.currency,
          accountId: data.accountId,
          categoryId: data.categoryId || null,
          noteEnc: encNull(data.notes, dek),
          nextRunDate,
        },
      });
      recurringRuleId = rule.id;
    }

    const rows = Array.from({ length: data.count }, (_, i) => {
      const due = new Date(data.firstDueDate);
      due.setMonth(due.getMonth() + i);
      return {
        userId: user.id,
        direction: data.direction,
        counterpartyEnc: encStr(data.counterparty, dek),
        amountEnc: encInt(amountMinor, dek),
        currency: data.currency,
        issueDate: data.firstDueDate,
        dueDate: due,
        bankNameEnc: encNull(data.bankName, dek),
        chequeNumberEnc: data.startChequeNumber != null ? encStr(String(data.startChequeNumber + i), dek) : null,
        accountId: data.accountId,
        recurringRuleId,
        notesEnc: encStr(data.notes ? `${data.notes} (${i + 1}/${data.count})` : `Cheque ${i + 1}/${data.count}`, dek),
      };
    });
    await prisma.pDC.createMany({ data: rows });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setPdcStatus(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = pdcStatusSchema.parse(input);
    const raw = await prisma.pDC.findFirst({ where: { id: data.id, userId: user.id } });
    if (!raw) return { ok: false, error: "Cheque not found" };
    const pdc = decryptPdc(raw, dek);

    await prisma.$transaction(async (tx) => {
      if (raw.clearedTransactionId && data.status !== "cleared") {
        await tx.pDC.update({ where: { id: raw.id }, data: { clearedTransactionId: null } });
        await tx.transaction.deleteMany({ where: { id: raw.clearedTransactionId, userId: user.id } });
      }

      if (data.status === "cleared" && !raw.clearedTransactionId) {
        const created = await tx.transaction.create({
          data: {
            userId: user.id,
            type: pdc.direction === "received" ? "income" : "expense",
            amountEnc: encInt(pdc.amountMinor, dek),
            currency: pdc.currency,
            date: data.clearDate ?? pdc.dueDate,
            accountId: pdc.accountId,
            noteEnc: encStr(
              `Cheque ${pdc.chequeNumber ? `#${pdc.chequeNumber} ` : ""}${pdc.direction === "received" ? "from" : "to"} ${pdc.counterparty}`,
              dek,
            ),
            tagsEnc: encStr('["cheque"]', dek),
            status: "posted",
          },
        });
        await tx.pDC.update({ where: { id: raw.id }, data: { status: "cleared", clearedTransactionId: created.id } });
      } else {
        await tx.pDC.update({ where: { id: raw.id }, data: { status: data.status } });
      }
    });

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePdc(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const pdc = await prisma.pDC.findFirst({ where: { id, userId: user.id } });
    if (!pdc) return { ok: false, error: "Cheque not found" };
    if (pdc.clearedTransactionId) {
      await prisma.pDC.update({ where: { id }, data: { clearedTransactionId: null } });
      await prisma.transaction.deleteMany({ where: { id: pdc.clearedTransactionId, userId: user.id } });
    }
    await prisma.pDC.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Provisions ────────────────────────────────────────────────────────────────

export async function saveProvision(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = provisionSchema.parse(input);
    await assertOwnsAccounts(user.id, [data.accountId]);
    const payload = {
      nameEnc: encStr(data.name, dek),
      targetEnc: encInt(toMinor(data.target, data.currency), dek),
      currency: data.currency,
      dueDate: data.dueDate || null,
      priority: data.priority,
      accountId: data.accountId || null,
    };
    let id: string;
    if (data.id) {
      const owned = await prisma.provision.findFirst({ where: { id: data.id, userId: user.id } });
      if (!owned) return { ok: false, error: "Provision not found" };
      id = (await prisma.provision.update({ where: { id: data.id }, data: payload })).id;
    } else {
      id = (await prisma.provision.create({ data: { ...payload, userId: user.id } })).id;
    }
    revalidateAll();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function addAllocation(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = allocationSchema.parse(input);
    const raw = await prisma.provision.findFirst({
      where: { id: data.provisionId, userId: user.id },
      include: { allocations: true },
    });
    if (!raw) return { ok: false, error: "Provision not found" };
    const provision = decryptProvision(raw, dek);
    const addMinor = toMinor(data.amount, provision.currency);
    await prisma.provisionAllocation.create({
      data: {
        userId: user.id,
        provisionId: data.provisionId,
        amountEnc: encInt(addMinor, dek),
        date: data.date,
        accountId: data.accountId || provision.accountId,
        noteEnc: encNull(data.note, dek),
      },
    });
    const funded = provision.allocations.reduce((s, a) => s + a.amountMinor, 0) + addMinor;
    if (funded >= provision.targetMinor && provision.status === "active") {
      await prisma.provision.update({ where: { id: provision.id }, data: { status: "funded" } });
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAllocation(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.provisionAllocation.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return { ok: false, error: "Allocation not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProvision(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const res = await prisma.provision.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return { ok: false, error: "Provision not found" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export async function upsertBudget(input: unknown): Promise<ActionResult> {
  try {
    const { user, dek } = await requireUser();
    const data = budgetSchema.parse(input);
    await assertOwnsCategory(user.id, data.categoryId);
    const plannedEnc = encInt(toMinor(data.planned, "AED"), dek);
    const existing = await prisma.budget.findUnique({
      where: { categoryId_month: { categoryId: data.categoryId, month: data.month } },
    });
    if (existing) {
      await prisma.budget.update({ where: { id: existing.id }, data: { plannedEnc } });
    } else {
      await prisma.budget.create({ data: { userId: user.id, categoryId: data.categoryId, month: data.month, plannedEnc } });
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBudget(categoryId: string, month: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    await prisma.budget.deleteMany({ where: { userId: user.id, categoryId, month } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Exchange rates ──────────────────────────────────────────────────────────

export async function saveRate(input: unknown): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const data = rateSchema.parse(input);
    const base = data.base.toUpperCase();
    const quote = data.quote.toUpperCase();
    await prisma.exchangeRate.upsert({
      where: { userId_base_quote: { userId: user.id, base, quote } },
      create: { userId: user.id, base, quote, rate: data.rate },
      update: { rate: data.rate, asOf: new Date() },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRate(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    await prisma.exchangeRate.deleteMany({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function updateSettings(input: unknown): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const data = settingsSchema.parse(input);
    await prisma.appSetting.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        baseCurrency: data.baseCurrency,
        defaultBufferMinor: toMinor(data.defaultBuffer, data.baseCurrency),
        theme: data.theme,
      },
      update: {
        baseCurrency: data.baseCurrency,
        defaultBufferMinor: toMinor(data.defaultBuffer, data.baseCurrency),
        theme: data.theme,
      },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
