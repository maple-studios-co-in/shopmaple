-- A buyer's cancellation requests, sent to Keeri from the order page. Additive.
CREATE TABLE "OrderCancellationRequest" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderCancellationRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderCancellationRequest_state_check" CHECK ("state" IN ('pending', 'requested', 'refused')),
    CONSTRAINT "OrderCancellationRequest_reason_check" CHECK (char_length("reason") BETWEEN 3 AND 500)
);
CREATE INDEX "OrderCancellationRequest_attemptId_createdAt_idx" ON "OrderCancellationRequest"("attemptId", "createdAt");
