// Import / export — the user is never locked in. JSON does a full round-trip of
// every table; CSV covers the transaction ledger (the thing people most want in
// a spreadsheet).

import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { parseTags } from "@/lib/utils";
import { format } from "date-fns";

const EXPORT_VERSION = 1;

export async function exportAllJson() {
  const [
    settings,
    accounts,
    categories,
    transactions,
    recurringRules,
    pdcs,
    provisions,
    provisionAllocations,
    budgets,
    exchangeRates,
  ] = await Promise.all([
    prisma.appSetting.findMany(),
    prisma.account.findMany(),
    prisma.category.findMany(),
    prisma.transaction.findMany(),
    prisma.recurringRule.findMany(),
    prisma.pDC.findMany(),
    prisma.provision.findMany(),
    prisma.provisionAllocation.findMany(),
    prisma.budget.findMany(),
    prisma.exchangeRate.findMany(),
  ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    accounts,
    categories,
    transactions,
    recurringRules,
    pdcs,
    provisions,
    provisionAllocations,
    budgets,
    exchangeRates,
  };
}

type ExportShape = Awaited<ReturnType<typeof exportAllJson>>;

/** Full restore from a JSON export. Replaces all existing data. */
export async function importAllJson(data: ExportShape) {
  if (!data || typeof data !== "object" || !Array.isArray(data.accounts)) {
    throw new Error("Not a valid Cashflow export file");
  }

  await prisma.$transaction(async (tx) => {
    // Clear in FK-safe order.
    await tx.provisionAllocation.deleteMany();
    await tx.provision.deleteMany();
    await tx.pDC.deleteMany();
    await tx.transaction.deleteMany();
    await tx.recurringRule.deleteMany();
    await tx.budget.deleteMany();
    await tx.category.deleteMany();
    await tx.account.deleteMany();
    await tx.exchangeRate.deleteMany();
    await tx.appSetting.deleteMany();

    const dates = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
      rows.map((r) => {
        const copy: Record<string, unknown> = { ...r };
        for (const k of keys) if (copy[k]) copy[k] = new Date(copy[k] as string);
        return copy;
      });

    if (data.settings?.length)
      await tx.appSetting.createMany({ data: dates(data.settings, ["createdAt", "updatedAt"]) as never });
    if (data.accounts?.length)
      await tx.account.createMany({ data: dates(data.accounts, ["createdAt", "updatedAt"]) as never });
    if (data.categories?.length)
      await tx.category.createMany({ data: dates(data.categories, ["createdAt", "updatedAt"]) as never });
    if (data.recurringRules?.length)
      await tx.recurringRule.createMany({
        data: dates(data.recurringRules, ["startDate", "endDate", "nextRunDate", "createdAt", "updatedAt"]) as never,
      });
    if (data.transactions?.length)
      await tx.transaction.createMany({ data: dates(data.transactions, ["date", "createdAt", "updatedAt"]) as never });
    if (data.pdcs?.length)
      await tx.pDC.createMany({ data: dates(data.pdcs, ["issueDate", "dueDate", "createdAt", "updatedAt"]) as never });
    if (data.provisions?.length)
      await tx.provision.createMany({ data: dates(data.provisions, ["dueDate", "createdAt", "updatedAt"]) as never });
    if (data.provisionAllocations?.length)
      await tx.provisionAllocation.createMany({ data: dates(data.provisionAllocations, ["date", "createdAt"]) as never });
    if (data.budgets?.length)
      await tx.budget.createMany({ data: dates(data.budgets, ["createdAt", "updatedAt"]) as never });
    if (data.exchangeRates?.length)
      await tx.exchangeRate.createMany({ data: dates(data.exchangeRates, ["asOf", "createdAt", "updatedAt"]) as never });
  });
}

// ── CSV (transactions) ────────────────────────────────────────────────────────

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function transactionsToCsv(): Promise<string> {
  const rows = await prisma.transaction.findMany({
    include: { account: true, transferAccount: true, category: true },
    orderBy: { date: "desc" },
  });
  const header = ["date", "type", "amount", "currency", "account", "toAccount", "category", "note", "tags"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        format(r.date, "yyyy-MM-dd"),
        r.type,
        (r.amountMinor / 100).toFixed(2),
        r.currency,
        r.account.name,
        r.transferAccount?.name ?? "",
        r.category?.name ?? "",
        r.note ?? "",
        parseTags(r.tags).join("|"),
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

/**
 * Import transactions from CSV. Accounts and categories are matched by name and
 * created on the fly if missing (income/expense inferred from the row type).
 */
export async function importTransactionsCsv(text: string): Promise<{ imported: number }> {
  const rows = parseCsv(text);
  if (rows.length < 2) return { imported: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const accounts = await prisma.account.findMany();
  const categories = await prisma.category.findMany();
  const accByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  async function ensureAccount(name: string) {
    const key = name.toLowerCase();
    const found = accByName.get(key);
    if (found) return found;
    const created = await prisma.account.create({
      data: { name, type: "bank", currency: "AED" },
    });
    accByName.set(key, created);
    return created;
  }
  async function ensureCategory(name: string, kind: "income" | "expense") {
    if (!name) return null;
    const key = name.toLowerCase();
    const found = catByName.get(key);
    if (found) return found;
    const created = await prisma.category.create({ data: { name, kind } });
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
    const accName = r[idx("account")]?.trim() || "Imported";
    const account = await ensureAccount(accName);
    const toAccName = idx("toaccount") >= 0 ? r[idx("toaccount")]?.trim() : "";
    const toAccount = type === "transfer" && toAccName ? await ensureAccount(toAccName) : null;
    const catName = idx("category") >= 0 ? r[idx("category")]?.trim() : "";
    const category = type !== "transfer" ? await ensureCategory(catName, type === "income" ? "income" : "expense") : null;
    const note = idx("note") >= 0 ? r[idx("note")]?.trim() : "";
    const tags = idx("tags") >= 0 && r[idx("tags")] ? r[idx("tags")].split("|").filter(Boolean) : [];

    await prisma.transaction.create({
      data: {
        type,
        amountMinor,
        currency,
        date: new Date(dateStr),
        accountId: account.id,
        transferAccountId: toAccount?.id ?? null,
        categoryId: category?.id ?? null,
        note: note || null,
        tags: JSON.stringify(tags),
      },
    });
    imported++;
  }
  return { imported };
}
