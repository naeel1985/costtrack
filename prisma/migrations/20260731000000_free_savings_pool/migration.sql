-- Free-savings pool: a cumulative ledger updated only when a salary occurrence
-- is confirmed (debited), distinct from any live projection.

-- Income rules only: marks the ONE recurring income rule that is the user's
-- salary. At most one true per user, enforced in the mutation layer.
ALTER TABLE "RecurringRule" ADD COLUMN "isSalary" BOOLEAN NOT NULL DEFAULT false;

-- Current realized pool value + where the next cycle starts counting from.
CREATE TABLE "FreeSavingsState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolEnc" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeSavingsState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FreeSavingsState_userId_key" ON "FreeSavingsState"("userId");

ALTER TABLE "FreeSavingsState" ADD CONSTRAINT "FreeSavingsState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only history of realized cycles, one row per confirmed salary debit.
CREATE TABLE "FreeSavingsCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "incomeEnc" TEXT NOT NULL,
    "costsEnc" TEXT NOT NULL,
    "savingsEnc" TEXT NOT NULL,
    "poolAfterEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeSavingsCycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FreeSavingsCycle_userId_idx" ON "FreeSavingsCycle"("userId");

CREATE INDEX "FreeSavingsCycle_userId_cycleEnd_idx" ON "FreeSavingsCycle"("userId", "cycleEnd");

ALTER TABLE "FreeSavingsCycle" ADD CONSTRAINT "FreeSavingsCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
