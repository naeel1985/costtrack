import { getAccountsWithBalances, getCategories, getRecurringRules, getTransactions } from "@/server/queries";
import { PageHeader } from "@/components/shared";
import { AddTransactionButton } from "@/components/add-transaction-button";
import { TransactionsView, type TxRow } from "@/components/transactions/transactions-view";
import { RecurringSection, type RecurringRow } from "@/components/transactions/recurring-section";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

export async function LedgerPage({ kind }: { kind: "income" | "expense" }) {
  const [txs, categories, accounts, rules] = await Promise.all([
    getTransactions({ type: kind }),
    getCategories(),
    getAccountsWithBalances(),
    getRecurringRules(),
  ]);

  const accountsLite: AccountLite[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    color: a.color,
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
      accountId: r.accountId,
      accountName: r.account?.name ?? "",
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
    }));

  const isIncome = kind === "income";

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
