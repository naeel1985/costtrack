import { getAccountsWithBalances, getCategories, getRecurringRules, getTransactions } from "@/server/queries";
import { PageHeader } from "@/components/shared";
import { AddTransactionButton } from "@/components/add-transaction-button";
import { TransactionsView, type TxRow } from "@/components/transactions/transactions-view";
import { RecurringSection, type RecurringRow } from "@/components/transactions/recurring-section";
import { CreditCardSection, DebitCardSection } from "@/components/transactions/card-sections";
import { nextStatement } from "@/lib/card-cycle";
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
      accountId: r.accountId,
      accountName: r.account?.name ?? "",
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
    }));

  const isIncome = kind === "income";

  // Cards are liabilities, not spendable accounts — keep the two pools apart.
  const assetAccounts = accountsLite.filter((a) => a.type !== "credit_card" && !a.isSystem);
  const baseCurrency = assetAccounts[0]?.currency ?? "AED";

  // A card's balance is negative; what's owed is its magnitude. Each card also
  // gets its next statement (statement date, payment due date, total due).
  const today = new Date();
  const cards = accounts
    .filter((a) => a.type === "credit_card")
    .map((a) => {
      const owedMinor = Math.max(0, -a.balanceMinor);
      const charges = rows
        .filter((r) => r.accountId === a.id)
        .map((r) => ({ date: r.date, amountMinor: r.amountMinor }));
      const stmt = a.dueDay != null ? nextStatement(a.dueDay, owedMinor, charges, today) : null;
      return {
        id: a.id,
        name: a.name,
        owedMinor,
        limitMinor: a.creditLimitMinor ?? null,
        dueDay: a.dueDay ?? null,
        statementDate: stmt?.statementDate ?? null,
        paymentDueDate: stmt?.paymentDueDate ?? null,
        totalAmountDueMinor: stmt?.totalAmountDueMinor ?? null,
      };
    });

  const creditRows = rows.filter((r) => r.method === "credit_card");
  const debitRows = rows.filter((r) => r.method === "debit_card");

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
