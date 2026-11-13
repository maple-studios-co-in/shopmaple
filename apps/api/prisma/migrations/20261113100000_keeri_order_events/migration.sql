-- Order progress from Keeri (orders/keeri-events.ts): each signed event Keeri posts about a store order it accepted
-- (status moves, delivery, cancellation, refund), kept as received. The buyer's order pages read it. Additive: a new
-- table only, so it is safe under the running release.
CREATE TABLE "KeeriOrderEvent" (
    "id" TEXT NOT NULL,
    "merchantScope" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeeriOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KeeriOrderEvent_merchantScope_bodySha256_key" ON "KeeriOrderEvent"("merchantScope", "bodySha256");
CREATE INDEX "KeeriOrderEvent_merchantScope_externalOrderId_occurredAt_idx" ON "KeeriOrderEvent"("merchantScope", "externalOrderId", "occurredAt");
