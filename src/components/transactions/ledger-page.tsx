import {
  getAccountsWithBalances,
  getCategories,
  getDebitCardCycleSummary,
  getRecurringIncomeSchedule,
  getRecurringRules,
  getTransactions,
} from "@/server/queries";
import { PageHeader } from "@/components/shared";
import { AddTransactionButton } from "@/components/add-transaction-button";
import { TransactionsView, type TxRow } from "@/components/transactions/transactions-view";
import { RecurringSection, type RecurringRow } from "@/components/transactions/recurring-section";
import { IncomeScheduleSection } from "@/components/transactions/income-schedule-section";
import { CreditCardSection, DebitCardSection } from "@/components/transactions/card-sections";
import { upcomingStatements, dueDateForCharge } from "@/lib/card-cycle";
import { expandRecurrence } from "@/lib/projection";
import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

export async function LedgerPage({ kind }: { kind: "income" | "expense" }) {
  const [txs, categories, accounts, rules, incomeSchedule, debitCycle] = await Promise.all([
    getTransactions({ type: kind }),
    getCategories(),
    getAccountsWithBalances(),
    getRecurringRules(),
    kind === "income" ? getRecurringIncomeSchedule() : Promise.resolve([]),
    kind === "expense" ? getDebitCardCycleSummary() : Promise.resolve(null),
  ]);

  const accountsLite: AccountLite[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    color: a.color,
    isSystem: a.isSystem,
  }));
  const categoriesLite: CategoryLite[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
  }));

  const rows: TxRow[] = txs.map((t) => ({
    id: t.id,
    type: t.type,
    method: t.method,
    amountMinor: t.amountMinor,
    currency: t.currency,
    date: t.date,
    note: t.note,
    tagList: t.tagList,
    accountId: t.accountId,
    account: { name: t.account?.name ?? "", color: t.account?.color ?? "#64748b" },
    transferAccount: t.transferAccount ? { name: t.transferAccount.name } : null,
    categoryId: t.categoryId,
    category: t.category ? { name: t.category.name, color: t.category.color } : null,
  }));

  const recurringRows: RecurringRow[] = rules
    .filter((r) => r.type === kind)
    .map((r) => ({
      id: r.id,
      name: r.name,
      amountMinor: r.amountMinor,
      currency: r.currency,
      frequency: r.frequency,
      interval: r.interval,
      nextRunDate: r.nextRunDate,
      startDate: r.startDate,
      endDate: r.endDate,
      occurrenceCount: r.occurrenceCount,
      isActive: r.isActive,
      isSalary: r.isSalary,
      accountId: r.accountId,
      accountName: r.account?.name ?? "",
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
    }));

  const isIncome = kind === "income";

  // Cards are liabilities, not spendable accounts — keep the two pools apart.
  const assetAccounts = accountsLite.filter((a) => a.type !== "credit_card" && !a.isSystem);
  const baseCurrency = assetAccounts[0]?.currency ?? "AED";

  // A card's balance is negative; what's owed is its magnitude. Each card gets
  // its upcoming statements: the current issued bill (from posted charges) plus
  // future bills built from recurring costs targeting the card, so a recurring
  // charge shows up in the Total Amount Due of every cycle it lands in.
  const today = new Date();
  const horizon = addMonths(today, 12);
  // Reach back far enough that a recurring occurrence dated before today but
  // still billing on the current (issued, unpaid) statement is generated —
  // cardCycleBills drops anything that would land on an already-past due date.
  const chargeWindowStart = subMonths(today, 2);
  const cards = accounts
    .filter((a) => a.type === "credit_card")
    .map((a) => {
      const owedMinor = Math.max(0, -a.balanceMinor);
      const postedRows = rows.filter((r) => r.accountId === a.id);
      const postedCharges = postedRows.map((r) => ({ date: r.date, amountMinor: r.amountMinor }));
      // Recurring expense rules that draw on this card, expanded to occurrences.
      const cardRules = rules.filter((r) => r.type === "expense" && r.accountId === a.id && r.isActive);
      const futureCharges =
        a.dueDay != null
          ? cardRules.flatMap((r) =>
              expandRecurrence(
                {
                  frequency: r.frequency as never,
                  interval: r.interval,
                  startDate: r.startDate,
                  endDate: r.endDate,
                  occurrenceCount: r.occurrenceCount,
                },
                chargeWindowStart,
                horizon,
              ).map((date) => ({ date, amountMinor: r.amountMinor })),
            )
          : [];
      const statements =
        a.dueDay != null
          ? upcomingStatements(a.dueDay, owedMinor, postedCharges, futureCharges, today, horizon)
          : [];

      // Itemize: every posted charge and projected recurring occurrence, each
      // bucketed onto the statement whose due date it belongs to (same rule
      // upcomingStatements/cardCycleBills use internally), so a click on any
      // statement's total shows exactly the line items that sum to it.
      const itemsByDue = new Map<
        number,
        { date: Date; amountMinor: number; label: string; recurring: boolean }[]
      >();
      const bucket = (item: { date: Date; amountMinor: number; label: string; recurring: boolean }) => {
        if (a.dueDay == null) return;
        const due = dueDateForCharge(item.date, a.dueDay).getTime();
        const list = itemsByDue.get(due);
        if (list) list.push(item);
        else itemsByDue.set(due, [item]);
      };
      for (const r of postedRows) {
        bucket({ date: r.date, amountMinor: r.amountMinor, label: r.note || r.category?.name || "Card charge", recurring: false });
      }
      for (const r of cardRules) {
        for (const date of expandRecurrence(
          {
            frequency: r.frequency as never,
            interval: r.interval,
            startDate: r.startDate,
            endDate: r.endDate,
            occurrenceCount: r.occurrenceCount,
          },
          chargeWindowStart,
          horizon,
        )) {
          bucket({ date, amountMinor: r.amountMinor, label: r.name, recurring: true });
        }
      }

      const statementsWithItems = statements.map((s) => ({
        ...s,
        items: (itemsByDue.get(s.paymentDueDate.getTime()) ?? []).sort((x, y) => x.date.getTime() - y.date.getTime()),
      }));

      return {
        id: a.id,
        name: a.name,
        owedMinor,
        limitMinor: a.creditLimitMinor ?? null,
        dueDay: a.dueDay ?? null,
        statements: statementsWithItems,
      };
    });

  // Card-linked recurring costs surface in the usage lists as this month's
  // projected occurrences — a debit rule on the 5th shows under Debit Card Usage,
  // a credit rule shows under Credit cards — alongside the posted spend.
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const catById = new Map(categoriesLite.map((c) => [c.id, c]));
  const creditCardIds = new Set(accounts.filter((a) => a.type === "credit_card").map((a) => a.id));
  const assetIds = new Set(assetAccounts.map((a) => a.id));
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const recurringUsageRows = (inSection: (accountId: string) => boolean): TxRow[] =>
    rules
      .filter((r) => r.type === "expense" && r.isActive && inSection(r.accountId))
      .flatMap((r) => {
        const acct = acctById.get(r.accountId);
        const cat = r.categoryId ? catById.get(r.categoryId) : null;
        return expandRecurrence(
          {
            frequency: r.frequency as never,
            interval: r.interval,
            startDate: r.startDate,
            endDate: r.endDate,
            occurrenceCount: r.occurrenceCount,
          },
          monthStart,
          monthEnd,
        ).map((date) => ({
          id: `rec:${r.id}:${date.getTime()}`,
          type: "expense",
          method: creditCardIds.has(r.accountId) ? "credit_card" : "debit_card",
          amountMinor: r.amountMinor,
          currency: r.currency,
          date,
          note: r.name,
          tagList: [] as string[],
          accountId: r.accountId,
          account: { name: acct?.name ?? "", color: acct?.color ?? "#64748b" },
          transferAccount: null,
          categoryId: r.categoryId,
          category: cat ? { name: cat.name, color: cat.color } : null,
          isRecurring: true,
        }));
      });

  const byDateDesc = (a: TxRow, b: TxRow) => b.date.getTime() - a.date.getTime();
  const creditRows = [
    ...rows.filter((r) => r.method === "credit_card"),
    ...recurringUsageRows((id) => creditCardIds.has(id)),
  ].sort(byDateDesc);
  const debitRows = [
    ...rows.filter((r) => r.method === "debit_card"),
    ...recurringUsageRows((id) => assetIds.has(id)),
  ].sort(byDateDesc);

  return (
    <div className="space-y-7">
      <PageHeader
        title={isIncome ? "Income" : "Costs"}
        description={
          isIncome
            ? "Salary, freelance, reimbursements and other money coming in."
            : "Everyday spending and recurring costs going out."
        }
        action={<AddTransactionButton txType={kind} label={isIncome ? "Add income" : "Add cost"} size="sm" />}
      />

      {isIncome && <IncomeScheduleSection occurrences={incomeSchedule} />}

      {!isIncome && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CreditCardSection
            rows={creditRows}
            cards={cards}
            currency={baseCurrency}
            assetAccounts={assetAccounts}
            categories={categoriesLite}
          />
          <DebitCardSection
            rows={debitRows}
            currency={baseCurrency}
            accounts={assetAccounts}
            categories={categoriesLite}
            cycle={debitCycle}
          />
        </div>
      )}

      <TransactionsView rows={rows} accounts={accountsLite} categories={categoriesLite} kind={kind} />

      <RecurringSection
        kind={kind}
        rules={recurringRows}
        accounts={accountsLite}
        categories={categoriesLite}
      />
    </div>
  );
}
