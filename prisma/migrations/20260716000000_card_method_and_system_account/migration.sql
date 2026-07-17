-- Expense payment method (account | debit_card | credit_card).
ALTER TABLE "Transaction" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'account';

-- Auto-managed accounts (the per-user credit-card liability). Excluded from
-- "free savings"; credit-card costs post here so its negative balance = owed.
ALTER TABLE "Account" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- Filter the Costs sections by method without decrypting.
CREATE INDEX "Transaction_userId_method_idx" ON "Transaction"("userId", "method");
