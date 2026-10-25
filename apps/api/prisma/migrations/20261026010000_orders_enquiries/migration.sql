CREATE TABLE "Enquiry" (
 "id" TEXT NOT NULL PRIMARY KEY, "idempotencyHash" TEXT NOT NULL, "payloadHash" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT NOT NULL,
 "message" TEXT NOT NULL, "context" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'new',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Enquiry_idempotencyHash_key" ON "Enquiry"("idempotencyHash");
CREATE INDEX "Enquiry_status_createdAt_idx" ON "Enquiry"("status", "createdAt");
CREATE TABLE "CheckoutAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY, "cartId" TEXT NOT NULL, "merchantScope" TEXT NOT NULL,
 "idempotencyKey" TEXT NOT NULL, "receipt" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "amountPaise" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'INR', "state" TEXT NOT NULL DEFAULT 'reservation_required',
 "reservationId" TEXT, "reservationExpiresAt" TIMESTAMP(3), "providerOrderId" TEXT, "paymentId" TEXT,
 "capturedAt" TIMESTAMP(3), "failureCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CheckoutAttempt_cartId_idempotencyKey_key" ON "CheckoutAttempt"("cartId", "idempotencyKey");
CREATE UNIQUE INDEX "CheckoutAttempt_receipt_key" ON "CheckoutAttempt"("receipt");
CREATE UNIQUE INDEX "CheckoutAttempt_reservationId_key" ON "CheckoutAttempt"("reservationId");
CREATE UNIQUE INDEX "CheckoutAttempt_providerOrderId_key" ON "CheckoutAttempt"("providerOrderId");
CREATE UNIQUE INDEX "CheckoutAttempt_paymentId_key" ON "CheckoutAttempt"("paymentId");
CREATE TABLE "PaymentWebhookInbox" (
 "id" TEXT NOT NULL PRIMARY KEY, "merchantScope" TEXT NOT NULL, "eventId" TEXT NOT NULL,
 "bodySha256" TEXT NOT NULL, "eventType" TEXT NOT NULL, "providerOrderId" TEXT, "paymentId" TEXT,
 "state" TEXT NOT NULL DEFAULT 'pending', "failureCode" TEXT,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PaymentWebhookInbox_merchantScope_eventId_key" ON "PaymentWebhookInbox"("merchantScope", "eventId");
CREATE UNIQUE INDEX "PaymentWebhookInbox_merchantScope_bodySha256_key" ON "PaymentWebhookInbox"("merchantScope", "bodySha256");
CREATE INDEX "PaymentWebhookInbox_state_receivedAt_idx" ON "PaymentWebhookInbox"("state", "receivedAt");
CREATE TABLE "OrderOutbox" (
 "id" TEXT NOT NULL PRIMARY KEY, "attemptId" TEXT NOT NULL, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OrderOutbox_attemptId_kind_key" ON "OrderOutbox"("attemptId", "kind");
CREATE INDEX "OrderOutbox_state_createdAt_idx" ON "OrderOutbox"("state", "createdAt");
