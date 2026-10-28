import type { PrismaClient } from "@prisma/client";

/**
 * Re-runnable contact backfill, API-less. The same two statements as migration
 * 20261029010000_admin_crm step 3: one contact per distinct normalised email among
 * enquiries that have no contact yet (named from that email's earliest enquiry, phone stored
 * only when plausible), then link every unlinked enquiry by email key. Phone is never a key.
 * Each statement is idempotent; running this twice changes nothing the second time.
 */
export async function backfillContacts(db: PrismaClient): Promise<{ contactsCreated: number; enquiriesLinked: number }> {
  return db.$transaction(async (tx) => {
    const contactsCreated = await tx.$executeRaw`
      INSERT INTO "Contact" ("id", "emailKey", "phoneKey", "name", "email", "phone", "createdAt", "updatedAt")
      SELECT 'ct_' || gen_random_uuid(), e."emailKey", shopmaple_phone_key(e."phone"), e."name", e."emailKey", e."phone", e."createdAt", CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT ON (lower(trim("email"))) lower(trim("email")) AS "emailKey", "name", "phone", "createdAt"
        FROM "Enquiry" WHERE "contactId" IS NULL AND trim("email") <> '' ORDER BY lower(trim("email")), "createdAt", "id"
      ) AS e
      ON CONFLICT ("emailKey") DO NOTHING`;
    const enquiriesLinked = await tx.$executeRaw`
      UPDATE "Enquiry" e SET "contactId" = c."id" FROM "Contact" c
      WHERE e."contactId" IS NULL AND c."emailKey" = lower(trim(e."email"))`;
    return { contactsCreated, enquiriesLinked };
  });
}
