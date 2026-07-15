// Import / export — the user is never locked in. JSON round-trips the signed-in
// user's own data (decrypted for portability); CSV covers the ledger. Everything
// is scoped to the authenticated user and re-encrypted on the way back in.

import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import {
  decryptAccount,
  decryptBudget,
  decryptCategory,
  decryptPdc,
  decryptProvision,
  decryptRecurring,
  decryptTransaction,
  encInt,
  encNull,
  encStr,
} from "@/server/crypto-map";

const EXPORT_VERSION = 2;

export async function exportUserJson(userId: string, dek: Buffer) {
  const [accounts, categories, transactions, recurringRules, pdcs, provisions, allocations, budgets, rates, settings] =
    await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.transaction.findMany({ where: { userId } }),
      prisma.recurringRule.findMany({ where: { userId } }),
      prisma.pDC.findMany({ where: { userId } }),
      prisma.provision.findMany({ where: { userId } }),
      prisma.provisionAllocation.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.exchangeRate.findMany({ where: { userId } }),
      prisma.appSetting.findUnique({ where: { userId } }),
    ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => decryptAccount(a, dek)),
    categories: categories.map((c) => decryptCategory(c, dek)),
    transactions: transactions.map((t) => {
      const d = decryptTransaction(t, dek);
      return {
        id: d.id, type: d.type, amountMinor: d.amountMinor, currency: d.currency, date: d.date,
        note: d.note, tags: d.tagList, status: d.status, accountId: d.accountId,
        transferAccountId: d.transferAccountId, categoryId: d.categoryId, recurringRuleId: d.recurringRuleId,
      };
    }),
    recurringRules: recurringRules.map((r) => {
      const d = decryptRecurring(r, dek);
      return {
        id: d.id, name: d.name, type: d.type, frequency: d.frequency, interval: d.interval,
        startDate: d.startDate, endDate: d.endDate, occurrenceCount: d.occurrenceCount,
        nextRunDate: d.nextRunDate, isActive: d.isActive, amountMinor: d.amountMinor, currency: d.currency,
        accountId: d.accountId, categoryId: d.categoryId, note: d.note,
      };
    }),
    pdcs: pdcs.map((p) => {
      const d = decryptPdc(p, dek);
      return {
        id: d.id, direction: d.direction, counterparty: d.counterparty, amountMinor: d.amountMinor,
        currency: d.currency, issueDate: d.issueDate, dueDate: d.dueDate, bankName: d.bankName,
        chequeNumber: d.chequeNumber, status: d.status, notes: d.notes, accountId: d.accountId,
        recurringRuleId: d.recurringRuleId, clearedTransactionId: d.clearedTransactionId,
      };
    }),
    provisions: provisions.map((p) => {
      const d = decryptProvision(p, dek);
      return {
        id: d.id, name: d.name, targetMinor: d.targetMinor, currency: d.currency, dueDate: d.dueDate,
        priority: d.priority, status: d.status, accountId: d.accountId,
      };
    }),
    provisionAllocations: allocations.map((a) => {
      // decrypt via provision helper shape
      return {
        id: a.id, provisionId: a.provisionId, amountMinor: Number(decInt(a.amountEnc, dek)),
        date: a.date, note: a.noteEnc ? decStr(a.noteEnc, dek) : null, accountId: a.accountId,
      };
    }),
    budgets: budgets.map((b) => {
      const d = decryptBudget(b, dek);
      return { id: d.id, categoryId: d.categoryId, month: d.month, plannedMinor: d.plannedMinor };
    }),
    exchangeRates: rates.map((r) => ({ id: r.id, base: r.base, quote: r.quote, rate: r.rate, asOf: r.asOf })),
    settings: settings
      ? { baseCurrency: settings.baseCurrency, defaultBufferMinor: settings.defaultBufferMinor, theme: settings.theme }
      : null,
  };
}

// local re-imports to keep the file self-contained
import { decrypt as _dec } from "@/lib/crypto";
const decInt = (v: string, dek: Buffer) => Number(_dec(v, dek));
const decStr = (v: string, dek: Buffer) => _dec(v, dek);

type ExportShape = Awaited<ReturnType<typeof exportUserJson>>;

/** Replace ALL of this user's domain data from a JSON export. */
export async function importUserJson(userId: string, dek: Buffer, data: ExportShape) {
  if (!data || typeof data !== "object" || !Array.isArray(data.accounts)) {
    throw new Error("Not a valid Cashflow export file");
  }
  const D = (v: unknown) => (v ? new Date(v as string) : null);

  await prisma.$transaction(async (tx) => {
    // Clear existing (FK-safe order), scoped to this user only.
    await tx.provisionAllocation.deleteMany({ where: { userId } });
    await tx.provision.deleteMany({ where: { userId } });
    await tx.pDC.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.recurringRule.deleteMany({ where: { userId } });
    await tx.budget.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.exchangeRate.deleteMany({ where: { userId } });

    for (const a of data.accounts ?? []) {
      await tx.account.create({
        data: {
          id: a.id, userId, nameEnc: encStr(a.name, dek), type: a.type, currency: a.currency,
          openingBalanceEnc: encInt(a.openingBalanceMinor, dek), safetyBufferEnc: encInt(a.safetyBufferMinor, dek),
          color: a.color, isArchived: a.isArchived, sortOrder: a.sortOrder,
        },
      });
    }
    for (const c of data.categories ?? []) {
      await tx.category.create({
        data: { id: c.id, userId, nameEnc: encStr(c.name, dek), kind: c.kind, icon: c.icon, color: c.color, parentId: c.parentId, sortOrder: c.sortOrder },
      });
    }
    for (const r of data.recurringRules ?? []) {
      await tx.recurringRule.create({
        data: {
          id: r.id, userId, nameEnc: encStr(r.name, dek), type: r.type, frequency: r.frequency, interval: r.interval,
          startDate: D(r.startDate)!, endDate: D(r.endDate), occurrenceCount: r.occurrenceCount, nextRunDate: D(r.nextRunDate)!,
          isActive: r.isActive, amountEnc: encInt(r.amountMinor, dek), currency: r.currency, accountId: r.accountId, categoryId: r.categoryId, noteEnc: encNull(r.note, dek),
        },
      });
    }
    for (const t of data.transactions ?? []) {
      await tx.transaction.create({
        data: {
          id: t.id, userId, type: t.type, amountEnc: encInt(t.amountMinor, dek), currency: t.currency, date: D(t.date)!,
          noteEnc: encNull(t.note, dek), tagsEnc: encStr(JSON.stringify(t.tags ?? []), dek), status: t.status,
          accountId: t.accountId, transferAccountId: t.transferAccountId, categoryId: t.categoryId, recurringRuleId: t.recurringRuleId,
        },
      });
    }
    for (const p of data.pdcs ?? []) {
      await tx.pDC.create({
        data: {
          id: p.id, userId, direction: p.direction, counterpartyEnc: encStr(p.counterparty, dek), amountEnc: encInt(p.amountMinor, dek),
          currency: p.currency, issueDate: D(p.issueDate)!, dueDate: D(p.dueDate)!, bankNameEnc: encNull(p.bankName, dek),
          chequeNumberEnc: encNull(p.chequeNumber, dek), status: p.status, notesEnc: encNull(p.notes, dek), accountId: p.accountId,
          recurringRuleId: p.recurringRuleId, clearedTransactionId: p.clearedTransactionId,
        },
      });
    }
    for (const p of data.provisions ?? []) {
      await tx.provision.create({
        data: {
          id: p.id, userId, nameEnc: encStr(p.name, dek), targetEnc: encInt(p.targetMinor, dek), currency: p.currency,
          dueDate: D(p.dueDate), priority: p.priority, status: p.status, accountId: p.accountId,
        },
      });
    }
    for (const a of data.provisionAllocations ?? []) {
      await tx.provisionAllocation.create({
        data: { id: a.id, userId, provisionId: a.provisionId, amountEnc: encInt(a.amountMinor, dek), date: D(a.date)!, noteEnc: encNull(a.note, dek), accountId: a.accountId },
      });
    }
    for (const b of data.budgets ?? []) {
      await tx.budget.create({ data: { id: b.id, userId, categoryId: b.categoryId, month: b.month, plannedEnc: encInt(b.plannedMinor, dek) } });
    }
    for (const r of data.exchangeRates ?? []) {
      await tx.exchangeRate.create({ data: { id: r.id, userId, base: r.base, quote: r.quote, rate: r.rate, asOf: D(r.asOf) ?? new Date() } });
    }
    if (data.settings) {
      await tx.appSetting.upsert({
        where: { userId },
        create: { userId, baseCurrency: data.settings.baseCurrency, defaultBufferMinor: data.settings.defaultBufferMinor, theme: data.settings.theme },
        update: { baseCurrency: data.settings.baseCurrency, defaultBufferMinor: data.settings.defaultBufferMinor, theme: data.settings.theme },
      });
    }
  });
}

// ── CSV (transactions) ────────────────────────────────────────────────────────

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function transactionsToCsv(userId: string, dek: Buffer): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    include: { account: true, transferAccount: true, category: true },
    orderBy: { date: "desc" },
  });
  const header = ["date", "type", "amount", "currency", "account", "toAccount", "category", "note", "tags"];
  const lines = [header.join(",")];
  for (const raw of rows) {
    const t = decryptTransaction(raw, dek);
    lines.push(
      [
        format(t.date, "yyyy-MM-dd"),
        t.type,
        (t.amountMinor / 100).toFixed(2),
        t.currency,
        t.account?.name ?? "",
        t.transferAccount?.name ?? "",
        t.category?.name ?? "",
        t.note ?? "",
        t.tagList.join("|"),
      ]
        .map((c) => csvEscape(String(c)))
        .join(","),
    );
  }
  return lines.join("\n");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

export async function importTransactionsCsv(userId: string, dek: Buffer, text: string): Promise<{ imported: number }> {
  const rows = parseCsv(text);
  if (rows.length < 2) return { imported: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const accounts = await prisma.account.findMany({ where: { userId } });
  const categories = await prisma.category.findMany({ where: { userId } });
  const accByName = new Map(accounts.map((a) => [decStr(a.nameEnc, dek).toLowerCase(), a]));
  const catByName = new Map(categories.map((c) => [decStr(c.nameEnc, dek).toLowerCase(), c]));

  async function ensureAccount(name: string) {
    const key = name.toLowerCase();
    const found = accByName.get(key);
    if (found) return found;
    const created = await prisma.account.create({
      data: { userId, nameEnc: encStr(name, dek), type: "bank", currency: "AED", openingBalanceEnc: encInt(0, dek), safetyBufferEnc: encInt(0, dek) },
    });
    accByName.set(key, created);
    return created;
  }
  async function ensureCategory(name: string, kind: "income" | "expense") {
    if (!name) return null;
    const key = name.toLowerCase();
    const found = catByName.get(key);
    if (found) return found;
    const created = await prisma.category.create({ data: { userId, nameEnc: encStr(name, dek), kind } });
    catByName.set(key, created);
    return created;
  }

  let imported = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const dateStr = r[idx("date")]?.trim();
    if (!dateStr) continue;
    const type = (r[idx("type")]?.trim() || "expense") as "income" | "expense" | "transfer";
    const currency = r[idx("currency")]?.trim() || "AED";
    const amountMinor = toMinor(r[idx("amount")]?.trim() || "0", currency);
    const account = await ensureAccount(r[idx("account")]?.trim() || "Imported");
    const toAccName = idx("toaccount") >= 0 ? r[idx("toaccount")]?.trim() : "";
    const toAccount = type === "transfer" && toAccName ? await ensureAccount(toAccName) : null;
    const catName = idx("category") >= 0 ? r[idx("category")]?.trim() : "";
    const category = type !== "transfer" ? await ensureCategory(catName, type === "income" ? "income" : "expense") : null;
    const note = idx("note") >= 0 ? r[idx("note")]?.trim() : "";
    const tags = idx("tags") >= 0 && r[idx("tags")] ? r[idx("tags")].split("|").filter(Boolean) : [];

    await prisma.transaction.create({
      data: {
        userId,
        type,
        amountEnc: encInt(amountMinor, dek),
        currency,
        date: new Date(dateStr),
        accountId: account.id,
        transferAccountId: toAccount?.id ?? null,
        categoryId: category?.id ?? null,
        noteEnc: encNull(note, dek),
        tagsEnc: encStr(JSON.stringify(tags), dek),
      },
    });
    imported++;
  }
  return { imported };
}
