-- Credit cards: the borrowing limit (encrypted minor units, base64 AES-256-GCM,
-- like every other money field). Available credit = limit − amount owed.
ALTER TABLE "Account" ADD COLUMN "creditLimitEnc" TEXT;
