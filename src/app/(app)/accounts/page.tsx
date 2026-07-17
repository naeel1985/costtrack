export const dynamic = "force-dynamic";

import { getAccountsWithBalances, getSettings } from "@/server/queries";
import { AccountsView, type AccountRow } from "@/components/accounts/accounts-view";

export default async function AccountsPage() {
  const [accounts, settings] = await Promise.all([
    getAccountsWithBalances(true),
    getSettings(),
  ]);

  const rows: AccountRow[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    balanceMinor: a.balanceMinor,
    openingBalanceMinor: a.openingBalanceMinor,
    safetyBufferMinor: a.safetyBufferMinor,
    color: a.color,
    isArchived: a.isArchived,
    dueDay: a.dueDay,
  }));

  return <AccountsView accounts={rows} baseCurrency={settings.baseCurrency} />;
}