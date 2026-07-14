import { getProvisions, getAccountsWithBalances } from "@/server/queries";
import { ProvisionsView, type ProvisionCard } from "@/components/provisions/provisions-view";
import type { AccountLite } from "@/lib/view-types";

export default async function ProvisionsPage() {
  const [provisions, accounts] = await Promise.all([
    getProvisions(),
    getAccountsWithBalances(),
  ]);

  const cards: ProvisionCard[] = provisions.map((p) => ({
    id: p.id,
    name: p.name,
    targetMinor: p.targetMinor,
    currency: p.currency,
    dueDate: p.dueDate,
    priority: p.priority,
    status: p.status,
    accountId: p.accountId,
    accountName: p.account?.name ?? null,
    fundedMinor: p.fundedMinor,
    remainingMinor: p.remainingMinor,
    progress: p.progress,
    monthsLeft: p.monthsLeft,
    suggestedMonthlyMinor: p.suggestedMonthlyMinor,
    onTrack: p.onTrack,
    allocations: p.allocations.map((a) => ({
      id: a.id,
      amountMinor: a.amountMinor,
      date: a.date,
      note: a.note,
    })),
  }));

  const accountsLite: AccountLite[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    color: a.color,
  }));

  return <ProvisionsView provisions={cards} accounts={accountsLite} />;
}
