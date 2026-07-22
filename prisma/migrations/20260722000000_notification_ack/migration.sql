-- Per-user acknowledgement of computed notifications (account going
-- negative/positive, salary ready to debit). Only the acknowledged key is
-- stored; the notifications themselves are derived on the fly. Keys carry
-- ids/dates/type only, so no encryption is needed.
CREATE TABLE "NotificationAck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationAck_userId_key_key" ON "NotificationAck"("userId", "key");

CREATE INDEX "NotificationAck_userId_idx" ON "NotificationAck"("userId");

ALTER TABLE "NotificationAck" ADD CONSTRAINT "NotificationAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
