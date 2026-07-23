-- Optional issuing-bank name and card last-4 digits on accounts (encrypted).
ALTER TABLE "Account" ADD COLUMN "bankNameEnc" TEXT;
ALTER TABLE "Account" ADD COLUMN "cardLast4Enc" TEXT;
