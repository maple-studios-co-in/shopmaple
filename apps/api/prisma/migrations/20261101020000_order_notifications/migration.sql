-- One email per checkout attempt and purpose (customer confirmation, staff alert, ...),
-- delivered by the order worker under a lease with a stable provider idempotency key.
CREATE TABLE "OrderNotification" (
    "id" TEXT NOT NULL,
    "merchantScope" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, now()),
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "providerId" TEXT,
    "failureCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderNotification_kind_check" CHECK ("kind" IN ('customer_confirmed', 'customer_received', 'staff_order', 'staff_attention')),
    CONSTRAINT "OrderNotification_state_check" CHECK ("state" IN ('pending', 'processing', 'sent', 'failed'))
);
CREATE UNIQUE INDEX "OrderNotification_merchantScope_subjectId_kind_key" ON "OrderNotification"("merchantScope", "subjectId", "kind");
CREATE INDEX "OrderNotification_state_nextAttemptAt_idx" ON "OrderNotification"("state", "nextAttemptAt");
