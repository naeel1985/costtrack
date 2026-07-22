export const dynamic = "force-dynamic";

import { getPdcs, getAccountsWithBalances, getCategories } from "@/server/queries";
import { PdcRegister, type PdcRow } from "@/components/pdc/pdc-register";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

export default async function ChequesPage() {
  const [pdcs, accounts, categories] = await Promise.all([
    getPdcs(),
    getAccountsWithBalances(),
    getCategories(),
  ]);

  const rows: PdcRow[] = pdcs.map((p) => ({
    id: p.id,
    direction: p.direction as "issued" | "received",
    counterparty: p.counterparty,
    amountMinor: p.amountMinor,
    currency: p.currency,
    issueDate: p.issueDate,
    dueDate: p.dueDate,
    bankName: p.bankName,
    chequeNumber: p.chequeNumber,
    status: p.status,
    notes: p.notes,
    accountId: p.accountId,
    accountName: p.account?.name ?? "",
  }));

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

  return <PdcRegister pdcs={rows} accounts={accountsLite} categories={categoriesLite} />;
}