// Pure balance folding — shared by queries and the projection assembler.
// Operates on already-decrypted transaction shapes (plain numbers), so it never
// touches Prisma or ciphertext.

export interface BalanceAccount {
  id: string;
  openingBalanceMinor: number;
}

export interface BalanceTx {
  type: string;
  amountMinor: number;
  accountId: string;
  transferAccountId: string | null;
  date: Date;
  status: string;
}

/**
 * Fold posted transactions into per-account balances. Transfers move money from
 * `accountId` to `transferAccountId`. Optionally only count transactions on or
 * before `asOf` (used to get the "current" balance for a forward projection).
 */
export function computeBalances(
  accounts: BalanceAccount[],
  transactions: BalanceTx[],
  asOf?: Date,
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of accounts) balances[acc.id] = acc.openingBalanceMinor;

  for (const tx of transactions) {
    if (tx.status !== "posted") continue;
    if (asOf && tx.date > asOf) continue;

    if (tx.type === "income") {
      if (tx.accountId in balances) balances[tx.accountId] += tx.amountMinor;
    } else if (tx.type === "expense") {
      if (tx.accountId in balances) balances[tx.accountId] -= tx.amountMinor;
    } else if (tx.type === "transfer") {
      if (tx.accountId in balances) balances[tx.accountId] -= tx.amountMinor;
      if (tx.transferAccountId && tx.transferAccountId in balances) {
        balances[tx.transferAccountId] += tx.amountMinor;
      }
    }
  }
  return balances;
}
