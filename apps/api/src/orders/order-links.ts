import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * What ties a paid checkout attempt to a customer account (owner's spec, 10 Nov 2026):
 * - `customerEmailKey`, the snapshot's customer email trimmed and lowercased (`emailKey` below), set when the quote freezes it;
 * - `orderNumber`, Maple's "MF-" number from maple_order_number_seq, assigned once inside the capture transaction.
 */

/** An email as accounts key it: trimmed and lowercased, the same as `accountEmailSchema` in @shopmaple/contracts/account. */
export const emailKey = (raw: string) => raw.trim().toLowerCase();

const snapshotEmail = z.object({ customer: z.object({ email: z.string().min(1) }) });
/** The customer's email key from a frozen snapshot; null for legacy (version 1) snapshots, which carry no customer. */
export function snapshotEmailKey(snapshot: unknown) {
  const parsed = snapshotEmail.safeParse(snapshot);
  return parsed.success ? emailKey(parsed.data.customer.email) : null;
}

/** The next Maple order number. The sequence never cycles, so a number is never reused; a rolled-back or retried
 * capture transaction only leaves a gap. */
export async function nextOrderNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`SELECT nextval('maple_order_number_seq')::integer AS "value"`;
  return row!.value;
}

/**
 * The migration's two backfills, repeated idempotently at API start-up: attempts the previous release froze or captured
 * between the migration and this release starting get their email key and order number here. Paid attempts are
 * numbered in the order their payments were captured. Neither statement touches "catalogueBindings", whose trigger
 * forbids rewrites.
 */
export async function backfillOrderLinks(db: PrismaClient) {
  const linked = await db.$executeRaw`
    UPDATE "CheckoutAttempt"
    SET "customerEmailKey" = lower(btrim("snapshot" -> 'customer' ->> 'email'))
    WHERE "customerEmailKey" IS NULL AND jsonb_typeof("snapshot" -> 'customer' -> 'email') = 'string'`;
  const numbered = await db.$executeRaw`
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
    WHERE attempt."id" = numbered."id" AND attempt."orderNumber" IS NULL`;
  return { linked, numbered };
}
