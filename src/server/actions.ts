"use server";

import { revalidatePath } from "next/cache";
import { startOfDay } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { expandRecurrence } from "@/lib/projection";
import {
  accountSchema,
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
  transactionSchema,
} from "@/lib/schemas";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues.map((i) => i.message).join(", ") };
  }
  const message = error instanceof Error ? error.message : "Something went wrong";
  return { ok: false, error: message };
}

function revalidateAll() {
  for (const p of ["/", "/income", "/costs", "/cheques", "/provisions", "/reports", "/accounts", "/settings"]) {
    revalidatePath(p);
  }
}

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
    const data = accountSchema.parse(input);
    const payload = {
      name: data.name,
      type: data.type,
      currency: data.currency,
      openingBalanceMinor: toMinor(data.openingBalance, data.currency),
      safetyBufferMinor: toMinor(data.safetyBuffer, data.currency),
      color: data.color,
    };
    const row = data.id
      ? await prisma.account.update({ where: { id: data.id }, data: payload })
      : await prisma.account.create({ data: payload });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveAccount(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await prisma.account.update({ where: { id }, data: { isArchived: archived } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  try {
    await prisma.account.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function saveCategory(input: unknown): Promise<ActionResult> {
  try {
    const data = categorySchema.parse(input);
    const payload = {
      name: data.name,
      kind: data.kind,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId || null,
    };
    const row = data.id
      ? await prisma.category.update({ where: { id: data.id }, data: payload })
      : await prisma.category.create({ data: payload });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    await prisma.category.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function saveTransaction(input: unknown): Promise<ActionResult> {
  try {
    const data = transactionSchema.parse(input);
    const payload = {
      type: data.type,
      amountMinor: toMinor(data.amount, data.currency),
      currency: data.currency,
      date: data.date,
      accountId: data.accountId,
      transferAccountId: data.type === "transfer" ? data.transferAccountId || null : null,
      categoryId: data.type === "transfer" ? null : data.categoryId || null,
      note: data.note || null,
      tags: JSON.stringify(data.tags ?? []),
    };
    const row = data.id
      ? await prisma.transaction.update({ where: { id: data.id }, data: payload })
      : await prisma.transaction.create({ data: payload });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    await prisma.transaction.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Recurring rules ─────────────────────────────────────────────────────────

export async function saveRecurring(input: unknown): Promise<ActionResult> {
  try {
    const data = recurringSchema.parse(input);
    const base = {
      name: data.name,
      type: data.type,
      frequency: data.frequency,
      interval: data.interval,
      startDate: data.startDate,
      endDate: data.endDate || null,
      occurrenceCount: data.occurrenceCount || null,
      amountMinor: toMinor(data.amount, data.currency),
      currency: data.currency,
      accountId: data.accountId,
      categoryId: data.categoryId || null,
      note: data.note || null,
    };
    const nextRunDate = computeNextRunDate(base);
    const row = data.id
      ? await prisma.recurringRule.update({ where: { id: data.id }, data: { ...base, nextRunDate } })
      : await prisma.recurringRule.create({ data: { ...base, nextRunDate } });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRecurring(id: string, active: boolean): Promise<ActionResult> {
  try {
    await prisma.recurringRule.update({ where: { id }, data: { isActive: active } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  try {
    await prisma.recurringRule.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Materialise a recurring rule's next occurrence as a posted transaction. */
export async function postRecurringOccurrence(id: string): Promise<ActionResult> {
  try {
    const rule = await prisma.recurringRule.findUnique({ where: { id } });
    if (!rule) return { ok: false, error: "Rule not found" };
    await prisma.transaction.create({
      data: {
        type: rule.type,
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        date: rule.nextRunDate,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        note: rule.note ?? rule.name,
        tags: "[]",
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
    await prisma.recurringRule.update({ where: { id }, data: { nextRunDate: next } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── PDCs ────────────────────────────────────────────────────────────────────

export async function savePdc(input: unknown): Promise<ActionResult> {
  try {
    const data = pdcSchema.parse(input);
    const payload = {
      direction: data.direction,
      counterparty: data.counterparty,
      amountMinor: toMinor(data.amount, data.currency),
      currency: data.currency,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      bankName: data.bankName || null,
      chequeNumber: data.chequeNumber || null,
      accountId: data.accountId,
      notes: data.notes || null,
    };
    const row = data.id
      ? await prisma.pDC.update({ where: { id: data.id }, data: payload })
      : await prisma.pDC.create({ data: payload });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function createPdcBatch(input: unknown): Promise<ActionResult> {
  try {
    const data = pdcBatchSchema.parse(input);
    const amountMinor = toMinor(data.amount, data.currency);

    let recurringRuleId: string | undefined;
    if (data.createRecurringRule) {
      const base = {
        name: `${data.counterparty} (${data.count} cheques)`,
        type: (data.direction === "issued" ? "expense" : "income") as "income" | "expense",
        frequency: "monthly" as const,
        interval: 1,
        startDate: data.firstDueDate,
        endDate: null,
        occurrenceCount: data.count,
        amountMinor,
        currency: data.currency,
        accountId: data.accountId,
        categoryId: data.categoryId || null,
        note: data.notes || null,
      };
      const rule = await prisma.recurringRule.create({
        data: { ...base, nextRunDate: computeNextRunDate(base) },
      });
      recurringRuleId = rule.id;
    }

    const rows = Array.from({ length: data.count }, (_, i) => {
      const due = new Date(data.firstDueDate);
      due.setMonth(due.getMonth() + i);
      return {
        direction: data.direction,
        counterparty: data.counterparty,
        amountMinor,
        currency: data.currency,
        issueDate: data.firstDueDate,
        dueDate: due,
        bankName: data.bankName || null,
        chequeNumber:
          data.startChequeNumber != null ? String(data.startChequeNumber + i) : null,
        accountId: data.accountId,
        recurringRuleId,
        notes: data.notes ? `${data.notes} (${i + 1}/${data.count})` : `Cheque ${i + 1}/${data.count}`,
      };
    });
    await prisma.pDC.createMany({ data: rows });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Update a cheque's status. Clearing creates a matching ledger transaction and
 * links it; moving away from "cleared" removes that transaction to keep the
 * ledger reconciled.
 */
export async function setPdcStatus(input: unknown): Promise<ActionResult> {
  try {
    const data = pdcStatusSchema.parse(input);
    const pdc = await prisma.pDC.findUnique({ where: { id: data.id } });
    if (!pdc) return { ok: false, error: "Cheque not found" };

    await prisma.$transaction(async (tx) => {
      // Remove any previously created clearing transaction if we're leaving the
      // cleared state.
      if (pdc.clearedTransactionId && data.status !== "cleared") {
        await tx.pDC.update({ where: { id: pdc.id }, data: { clearedTransactionId: null } });
        await tx.transaction.delete({ where: { id: pdc.clearedTransactionId } }).catch(() => {});
      }

      if (data.status === "cleared" && !pdc.clearedTransactionId) {
        const created = await tx.transaction.create({
          data: {
            type: pdc.direction === "received" ? "income" : "expense",
            amountMinor: pdc.amountMinor,
            currency: pdc.currency,
            date: data.clearDate ?? pdc.dueDate,
            accountId: pdc.accountId,
            note: `Cheque ${pdc.chequeNumber ? `#${pdc.chequeNumber} ` : ""}${
              pdc.direction === "received" ? "from" : "to"
            } ${pdc.counterparty}`,
            tags: '["cheque"]',
            status: "posted",
          },
        });
        await tx.pDC.update({
          where: { id: pdc.id },
          data: { status: "cleared", clearedTransactionId: created.id },
        });
      } else {
        await tx.pDC.update({ where: { id: pdc.id }, data: { status: data.status } });
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
    const pdc = await prisma.pDC.findUnique({ where: { id } });
    if (pdc?.clearedTransactionId) {
      await prisma.pDC.update({ where: { id }, data: { clearedTransactionId: null } });
      await prisma.transaction.delete({ where: { id: pdc.clearedTransactionId } }).catch(() => {});
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
    const data = provisionSchema.parse(input);
    const payload = {
      name: data.name,
      targetMinor: toMinor(data.target, data.currency),
      currency: data.currency,
      dueDate: data.dueDate || null,
      priority: data.priority,
      accountId: data.accountId || null,
    };
    const row = data.id
      ? await prisma.provision.update({ where: { id: data.id }, data: payload })
      : await prisma.provision.create({ data: payload });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addAllocation(input: unknown): Promise<ActionResult> {
  try {
    const data = allocationSchema.parse(input);
    const provision = await prisma.provision.findUnique({
      where: { id: data.provisionId },
      include: { allocations: true },
    });
    if (!provision) return { ok: false, error: "Provision not found" };
    await prisma.provisionAllocation.create({
      data: {
        provisionId: data.provisionId,
        amountMinor: toMinor(data.amount, provision.currency),
        date: data.date,
        accountId: data.accountId || provision.accountId,
        note: data.note || null,
      },
    });
    // Auto-mark as funded when target reached.
    const funded =
      provision.allocations.reduce((s, a) => s + a.amountMinor, 0) +
      toMinor(data.amount, provision.currency);
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
    await prisma.provisionAllocation.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProvision(id: string): Promise<ActionResult> {
  try {
    await prisma.provision.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export async function upsertBudget(input: unknown): Promise<ActionResult> {
  try {
    const data = budgetSchema.parse(input);
    const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
    const plannedMinor = toMinor(data.planned, "AED");
    await prisma.budget.upsert({
      where: { categoryId_month: { categoryId: data.categoryId, month: data.month } },
      create: { categoryId: data.categoryId, month: data.month, plannedMinor },
      update: { plannedMinor },
    });
    void cat;
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBudget(categoryId: string, month: string): Promise<ActionResult> {
  try {
    await prisma.budget.delete({ where: { categoryId_month: { categoryId, month } } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Exchange rates ──────────────────────────────────────────────────────────

export async function saveRate(input: unknown): Promise<ActionResult> {
  try {
    const data = rateSchema.parse(input);
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: data.base.toUpperCase(), quote: data.quote.toUpperCase() } },
      create: { base: data.base.toUpperCase(), quote: data.quote.toUpperCase(), rate: data.rate },
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
    await prisma.exchangeRate.delete({ where: { id } });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function updateSettings(input: unknown): Promise<ActionResult> {
  try {
    const data = settingsSchema.parse(input);
    await prisma.appSetting.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
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
