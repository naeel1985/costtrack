import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// AI assistant tools — read the user's own data, return it with every real name
// replaced by an opaque token. Shared by the in-app chat loop and the MCP server
// so both expose exactly the same tokenising surface.
//
// Amounts are returned in major units (e.g. AED), dates as yyyy-MM-dd.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, endOfDay, format, startOfDay, subMonths } from "date-fns";
import { prisma } from "@/lib/db";
import {
  decryptAccount,
  decryptCategory,
  decryptPdc,
  decryptProvision,
  decryptRecurring,
  decryptTransaction,
} from "@/server/crypto-map";
import { computeBalances } from "@/server/balances";
import { expandRecurrence } from "@/lib/projection";
import { nextStatement } from "@/lib/card-cycle";
import { buildTokenizer, type Tokenizer } from "./tokenizer";

export interface ToolContext {
  userId: string;
  dek: Buffer;
  tok: Tokenizer;
}

export async function createToolContext(userId: string, dek: Buffer): Promise<ToolContext> {
  const tok = await buildTokenizer(userId, dek);
  return { userId, dek, tok };
}

const money = (minor: number) => Math.round(minor) / 100;
const iso = (d: Date) => format(d, "yyyy-MM-dd");

const ACCOUNT_TYPE = { cash: "cash", bank: "bank", credit_card: "credit card", wallet: "wallet" } as const;

/** JSON-schema function definitions advertised to the model (and to MCP). */
export const TOOL_SCHEMAS = [
  {
    name: "list_accounts",
    description:
      "List the user's accounts and cards with their current balances. Names are opaque tokens (ACCT_/CARD_).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_credit_cards",
    description:
      "Credit-card status: amount owed, limit, available credit, and the next payment due date with its Total Amount Due.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_due_payments",
    description:
      "Upcoming dated obligations within a horizon: credit-card statement payments, issued cheques, provisions due and recurring costs. Use this to answer when a payment is due. Returns both the raw `payments` list and a `byMonth` breakdown (month, total, currency) — when the horizon spans more than one month, report totals per month from `byMonth` rather than a single lump sum.",
    parameters: {
      type: "object",
      properties: {
        daysAhead: { type: "integer", description: "Horizon in days (default and max 30 — committed costs are capped at the coming 30 days)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "spending_summary",
    description: "Totals of income and expense, and expense grouped by category, over the last N months.",
    parameters: {
      type: "object",
      properties: { months: { type: "integer", description: "How many months back (default 1, max 12)." } },
      additionalProperties: false,
    },
  },
  {
    name: "search_transactions",
    description:
      "Search posted transactions by date range, type and/or account token. Returns date, amount, category and account token.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date yyyy-MM-dd (inclusive)." },
        to: { type: "string", description: "End date yyyy-MM-dd (inclusive)." },
        type: { type: "string", enum: ["income", "expense", "transfer"] },
        accountRef: { type: "string", description: "An account/card token from list_accounts." },
        limit: { type: "integer", description: "Max rows (default 20, max 100)." },
      },
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOL_SCHEMAS)[number]["name"];

// ── Shared loaders ──────────────────────────────────────────────────────────

async function loadAccountsWithBalances(ctx: ToolContext) {
  const [rawAccounts, rawTx] = await Promise.all([
    prisma.account.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { userId: ctx.userId, status: "posted" } }),
  ]);
  const accounts = rawAccounts.map((a) => decryptAccount(a, ctx.dek));
  const txs = rawTx.map((t) => decryptTransaction(t, ctx.dek));
  const balances = computeBalances(accounts, txs);
  return accounts.map((a) => ({ ...a, balanceMinor: balances[a.id] ?? a.openingBalanceMinor }));
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function listAccounts(ctx: ToolContext) {
  const accounts = (await loadAccountsWithBalances(ctx)).filter((a) => !a.isSystem);
  return {
    accounts: accounts.map((a) => {
      const ref = ctx.tok.tokenForAccount(a.id);
      if (a.type === "credit_card") {
        const owed = Math.max(0, -a.balanceMinor);
        return {
          ref,
          type: "credit card",
          currency: a.currency,
          owed: money(owed),
          creditLimit: a.creditLimitMinor != null ? money(a.creditLimitMinor) : null,
        };
      }
      return {
        ref,
        type: ACCOUNT_TYPE[a.type as keyof typeof ACCOUNT_TYPE] ?? a.type,
        currency: a.currency,
        balance: money(a.balanceMinor),
      };
    }),
  };
}

async function getCreditCards(ctx: ToolContext) {
  const accounts = await loadAccountsWithBalances(ctx);
  const cards = accounts.filter((a) => a.type === "credit_card");
  const today = new Date();

  const rawTx = await prisma.transaction.findMany({
    where: { userId: ctx.userId, status: "posted", type: "expense", accountId: { in: cards.map((c) => c.id) } },
  });
  const chargesByCard = new Map<string, { date: Date; amountMinor: number }[]>();
  for (const raw of rawTx) {
    const t = decryptTransaction(raw, ctx.dek);
    const list = chargesByCard.get(t.accountId) ?? [];
    list.push({ date: t.date, amountMinor: t.amountMinor });
    chargesByCard.set(t.accountId, list);
  }

  return {
    cards: cards.map((c) => {
      const owed = Math.max(0, -c.balanceMinor);
      const limit = c.creditLimitMinor ?? null;
      const stmt =
        c.dueDay != null ? nextStatement(c.dueDay, owed, chargesByCard.get(c.id) ?? [], today) : null;
      return {
        ref: ctx.tok.tokenForAccount(c.id),
        currency: c.currency,
        owed: money(owed),
        creditLimit: limit != null ? money(limit) : null,
        available: limit != null ? money(Math.max(0, limit - owed)) : null,
        dueDay: c.dueDay ?? null,
        nextPaymentDue: stmt
          ? {
              statementDate: iso(stmt.statementDate),
              paymentDueDate: iso(stmt.paymentDueDate),
              totalAmountDue: money(stmt.totalAmountDueMinor),
            }
          : null,
      };
    }),
  };
}

async function listDuePayments(ctx: ToolContext, args: { daysAhead?: number }) {
  // Hard-capped at 30 — the model cannot widen this by passing a larger
  // daysAhead itself; committed costs are never reported past 30 days out.
  const daysAhead = Math.min(30, Math.max(1, Math.trunc(args.daysAhead ?? 30)));
  const today = startOfDay(new Date());
  const end = endOfDay(addDays(today, daysAhead));

  const accounts = await loadAccountsWithBalances(ctx);
  const payments: { date: string; amount: number; currency: string; kind: string; ref: string; description: string }[] =
    [];

  // Credit-card statement payments.
  const cards = accounts.filter((a) => a.type === "credit_card" && a.dueDay != null);
  if (cards.length) {
    const rawTx = await prisma.transaction.findMany({
      where: { userId: ctx.userId, status: "posted", type: "expense", accountId: { in: cards.map((c) => c.id) } },
    });
    const chargesByCard = new Map<string, { date: Date; amountMinor: number }[]>();
    for (const raw of rawTx) {
      const t = decryptTransaction(raw, ctx.dek);
      const list = chargesByCard.get(t.accountId) ?? [];
      list.push({ date: t.date, amountMinor: t.amountMinor });
      chargesByCard.set(t.accountId, list);
    }
    for (const c of cards) {
      const owed = Math.max(0, -c.balanceMinor);
      const stmt = nextStatement(c.dueDay!, owed, chargesByCard.get(c.id) ?? [], today);
      if (stmt && stmt.paymentDueDate <= end && stmt.totalAmountDueMinor > 0) {
        payments.push({
          date: iso(stmt.paymentDueDate),
          amount: money(stmt.totalAmountDueMinor),
          currency: c.currency,
          kind: "credit_card_payment",
          ref: ctx.tok.tokenForAccount(c.id),
          description: "Credit-card statement payment",
        });
      }
    }
  }

  // Issued cheques (money going out) due in the window.
  const rawPdcs = await prisma.pDC.findMany({
    where: { userId: ctx.userId, status: "pending", direction: "issued", dueDate: { gte: today, lte: end } },
  });
  for (const raw of rawPdcs) {
    const p = decryptPdc(raw, ctx.dek);
    payments.push({
      date: iso(p.dueDate),
      amount: money(p.amountMinor),
      currency: p.currency,
      kind: "cheque",
      ref: ctx.tok.tokenForPayee(p.counterparty),
      description: "Cheque payable",
    });
  }

  // Provisions with a due date and an unfunded remainder.
  const rawProvisions = await prisma.provision.findMany({
    where: { userId: ctx.userId, status: "active", dueDate: { gte: today, lte: end } },
    include: { allocations: true },
  });
  for (const raw of rawProvisions) {
    const pr = decryptProvision(raw, ctx.dek);
    const funded = pr.allocations.reduce((s, a) => s + a.amountMinor, 0);
    const remaining = Math.max(0, pr.targetMinor - funded);
    if (remaining > 0 && pr.dueDate) {
      payments.push({
        date: iso(pr.dueDate),
        amount: money(remaining),
        currency: pr.currency,
        kind: "provision",
        ref: ctx.tok.tokenize(pr.name) || "provision",
        description: "Provision due",
      });
    }
  }

  // Recurring costs' next occurrences.
  const rawRules = await prisma.recurringRule.findMany({ where: { userId: ctx.userId, isActive: true } });
  for (const raw of rawRules) {
    const r = decryptRecurring(raw, ctx.dek);
    if (r.type !== "expense") continue;
    const dates = expandRecurrence(
      { frequency: r.frequency as never, interval: r.interval, startDate: r.startDate, endDate: r.endDate, occurrenceCount: r.occurrenceCount },
      today,
      end,
    );
    for (const date of dates) {
      payments.push({
        date: iso(date),
        amount: money(r.amountMinor),
        currency: r.currency,
        kind: "recurring_cost",
        ref: ctx.tok.tokenForAccount(r.accountId),
        description: ctx.tok.tokenize(r.name) || "Recurring cost",
      });
    }
  }

  payments.sort((a, b) => a.date.localeCompare(b.date));

  const byMonthMap = new Map<string, { month: string; total: number; currency: string }>();
  for (const p of payments) {
    const month = p.date.slice(0, 7); // yyyy-MM
    const existing = byMonthMap.get(month);
    if (existing) existing.total += p.amount;
    else byMonthMap.set(month, { month, total: p.amount, currency: p.currency });
  }
  const byMonth = [...byMonthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  return { horizonDays: daysAhead, payments, byMonth };
}

async function spendingSummary(ctx: ToolContext, args: { months?: number }) {
  const months = Math.min(12, Math.max(1, Math.trunc(args.months ?? 1)));
  const to = endOfDay(new Date());
  const from = startOfDay(subMonths(to, months));

  const [rawTx, rawCats] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: ctx.userId, status: "posted", type: { in: ["income", "expense"] }, date: { gte: from, lte: to } },
    }),
    prisma.category.findMany({ where: { userId: ctx.userId } }),
  ]);
  const catName = new Map(rawCats.map((c) => [c.id, decryptCategory(c, ctx.dek).name]));

  let income = 0;
  let expense = 0;
  const byCat = new Map<string, number>();
  let currency = "AED";
  for (const raw of rawTx) {
    const t = decryptTransaction(raw, ctx.dek);
    currency = t.currency;
    if (t.type === "income") income += t.amountMinor;
    else {
      expense += t.amountMinor;
      const name = t.categoryId ? catName.get(t.categoryId) ?? "Uncategorised" : "Uncategorised";
      byCat.set(name, (byCat.get(name) ?? 0) + t.amountMinor);
    }
  }

  return {
    from: iso(from),
    to: iso(to),
    currency,
    income: money(income),
    expense: money(expense),
    net: money(income - expense),
    byCategory: [...byCat.entries()]
      .map(([category, minor]) => ({ category, amount: money(minor) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

async function searchTransactions(
  ctx: ToolContext,
  args: { from?: string; to?: string; type?: string; accountRef?: string; limit?: number },
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(args.limit ?? 20)));
  const where: Record<string, unknown> = { userId: ctx.userId, status: "posted" };
  if (args.type) where.type = args.type;
  if (args.from || args.to) {
    where.date = {
      ...(args.from ? { gte: startOfDay(new Date(args.from)) } : {}),
      ...(args.to ? { lte: endOfDay(new Date(args.to)) } : {}),
    };
  }

  // Resolve an account token back to its id (never expose the mapping).
  let accountId: string | null = null;
  if (args.accountRef) {
    const rawAccounts = await prisma.account.findMany({ where: { userId: ctx.userId } });
    for (const a of rawAccounts) {
      if (ctx.tok.tokenForAccount(a.id) === args.accountRef) {
        accountId = a.id;
        break;
      }
    }
    if (accountId) where.accountId = accountId;
  }

  const [rawTx, rawCats] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.category.findMany({ where: { userId: ctx.userId } }),
  ]);
  const catName = new Map(rawCats.map((c) => [c.id, decryptCategory(c, ctx.dek).name]));

  return {
    transactions: rawTx.map((raw) => {
      const t = decryptTransaction(raw, ctx.dek);
      return {
        date: iso(t.date),
        amount: money(t.amountMinor),
        type: t.type,
        category: t.categoryId ? catName.get(t.categoryId) ?? null : null,
        accountRef: ctx.tok.tokenForAccount(t.accountId),
        note: ctx.tok.tokenize(t.note) || null,
      };
    }),
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  switch (name as ToolName) {
    case "list_accounts":
      return listAccounts(ctx);
    case "get_credit_cards":
      return getCreditCards(ctx);
    case "list_due_payments":
      return listDuePayments(ctx, args as { daysAhead?: number });
    case "spending_summary":
      return spendingSummary(ctx, args as { months?: number });
    case "search_transactions":
      return searchTransactions(ctx, args as never);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
