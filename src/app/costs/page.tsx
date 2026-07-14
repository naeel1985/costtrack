export const dynamic = "force-dynamic";

import { LedgerPage } from "@/components/transactions/ledger-page";

export default function CostsPage() {
  return <LedgerPage kind="expense" />;
}