-- Customer accounts (owner's spec, 10 Nov 2026; security review, 11 Nov): sign-in by emailed code, sessions, saved
-- addresses, and Maple's own order numbers. Additive only, so the previous release keeps working: it never reads the new tables, columns or
-- sequence, and the new CheckoutAttempt columns are nullable with no default.

-- Orders gain the customer's email key (set when the quote freezes the attempt) and Maple's order number (assigned in
-- the transaction that records the captured payment).
ALTER TABLE "CheckoutAttempt" ADD COLUMN "customerEmailKey" TEXT;
ALTER TABLE "CheckoutAttempt" ADD COLUMN "orderNumber" INTEGER;
CREATE UNIQUE INDEX "CheckoutAttempt_orderNumber_key" ON "CheckoutAttempt"("orderNumber");
CREATE INDEX "CheckoutAttempt_customerEmailKey_idx" ON "CheckoutAttempt"("customerEmailKey");

-- "MF-10001" onwards. An integer sequence that never cycles: a number is never reused, and a rolled-back capture only
-- leaves a gap.
CREATE SEQUENCE "maple_order_number_seq" AS INTEGER START WITH 10001 NO CYCLE;

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_emailKey_key" ON "Customer"("emailKey");

-- Only an HMAC of each code and of the requesting network (IPv4 address or IPv6 /64) is kept, and the SHA-256 of the
-- sign-in cookie of the browser that asked: only that browser can try the code.
CREATE TABLE "CustomerLoginChallenge" (
    "id" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerLoginChallenge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerLoginChallenge_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE INDEX "CustomerLoginChallenge_emailKey_createdAt_idx" ON "CustomerLoginChallenge"("emailKey", "createdAt");
CREATE INDEX "CustomerLoginChallenge_ipHash_createdAt_idx" ON "CustomerLoginChallenge"("ipHash", "createdAt");
CREATE INDEX "CustomerLoginChallenge_createdAt_idx" ON "CustomerLoginChallenge"("createdAt");

-- Failed sign-in tries for the budgets: 20 an hour per network, 10 a day per email ("wrongCode": wrong digits for a live
-- code of the browser's own). Pruned after two days.
CREATE TABLE "CustomerSignInFailure" (
    "id" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "wrongCode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSignInFailure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerSignInFailure_ipHash_createdAt_idx" ON "CustomerSignInFailure"("ipHash", "createdAt");
CREATE INDEX "CustomerSignInFailure_emailKey_createdAt_idx" ON "CustomerSignInFailure"("emailKey", "createdAt");
CREATE INDEX "CustomerSignInFailure_createdAt_idx" ON "CustomerSignInFailure"("createdAt");

-- The cookie holds 32 random bytes; only their SHA-256 is stored.
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most ten per customer and exactly one default whenever any exist; the account service keeps both under a row lock
-- on the customer.
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerAddress_customerId_updatedAt_idx" ON "CustomerAddress"("customerId", "updatedAt");
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: link existing quoted attempts to their customer's email, normalised as the snapshot and contacts.ts do.
-- Version 1 snapshots have no customer and stay NULL. Leaving "catalogueBindings" out of the SET list keeps its
-- immutability trigger quiet. The API repeats this (idempotently) at start-up for attempts the previous release froze
-- while it was still running.
UPDATE "CheckoutAttempt"
SET "customerEmailKey" = lower(btrim("snapshot" -> 'customer' ->> 'email'))
WHERE "customerEmailKey" IS NULL AND jsonb_typeof("snapshot" -> 'customer' -> 'email') = 'string';

-- Backfill 2: number the attempts already paid, in the order their payments were captured (the API repeats this at
-- start-up too, for payments the previous release captured).
UPDATE "CheckoutAttempt" AS attempt
SET "orderNumber" = numbered."orderNumber"
FROM (
    SELECT ordered."id", nextval('maple_order_number_seq') AS "orderNumber"
    FROM (
        SELECT "id" FROM "CheckoutAttempt"
        WHERE "state" IN ('captured', 'paid_hold_lapsed') AND "orderNumber" IS NULL
        ORDER BY "capturedAt" NULLS LAST, "id"
    ) AS ordered
) AS numbered
WHERE attempt."id" = numbered."id";
