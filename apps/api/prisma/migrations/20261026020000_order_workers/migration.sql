ALTER TABLE "PaymentWebhookInbox"
  ADD COLUMN "workerState" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "workerFailureCode" TEXT;
ALTER TABLE "OrderOutbox"
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "externalOrderId" TEXT;
CREATE INDEX "PaymentWebhookInbox_merchantScope_workerState_nextAttemptAt_idx" ON "PaymentWebhookInbox"("merchantScope", "workerState", "nextAttemptAt");
CREATE INDEX "OrderOutbox_state_nextAttemptAt_idx" ON "OrderOutbox"("state", "nextAttemptAt");
