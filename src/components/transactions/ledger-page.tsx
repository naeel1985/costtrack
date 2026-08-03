import {
  getAccountsWithBalances,
  getCategories,
  getCreditCardStatements,
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
import { expandRecurrence } from "@/lib/projection";
import { endOfMonth, startOfMonth } from "date-fns";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

export async function LedgerPage({ kind }: { kind: "income" | "expense" }) {
  // Statements come from the shared server query — the same one /api/v1/cards
  // serves the mobile app — so the two surfaces bill identically.
  const [txs, categories, accounts, rules, incomeSchedule, debitCycle, cards] = await Promise.all([
    getTransactions({ type: kind }),
    getCategories(),
    getAccountsWithBalances(),
    getRecurringRules(),
    kind === "income" ? getRecurringIncomeSchedule() : Promise.resolve([]),
    kind === "expense" ? getDebitCardCycleSummary() : Promise.resolve(null),
    kind === "expense" ? getCreditCardStatements() : Promise.resolve([]),
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

  const today = new Date();

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
