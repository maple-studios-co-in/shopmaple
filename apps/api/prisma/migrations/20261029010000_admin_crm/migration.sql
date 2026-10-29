-- Admin CRM: contacts, pipeline stages, follow-up tasks and extended activity.
-- Every statement is idempotent so the file can be re-applied safely; it never deletes enquiry data.

-- 1. Contacts keyed by normalised email only. The phone is stored normalised for search and display;
--    it is customer-typed and unverified, so it is never a key and never links enquiries.
CREATE TABLE IF NOT EXISTS "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "emailKey" TEXT NOT NULL,
  "phoneKey" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_emailKey_key" ON "Contact"("emailKey");
DROP INDEX IF EXISTS "Contact_phoneKey_key";
CREATE INDEX IF NOT EXISTS "Contact_phoneKey_idx" ON "Contact"("phoneKey");
CREATE INDEX IF NOT EXISTS "Contact_createdAt_id_idx" ON "Contact"("createdAt", "id");

-- Phone normalisation shared with the API (apps/api/src/contacts.ts): digits only; a 10-digit Indian
-- number gains the 91 prefix and a leading trunk 0 on an 11-digit number is replaced by 91. Anything
-- that is not a plausible mobile number (fewer than 10 significant digits, one repeated digit, or a
-- counting sequence) becomes NULL so placeholders never look like identities.
CREATE OR REPLACE FUNCTION shopmaple_phone_key(raw TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN length(n) < 10 THEN NULL
    WHEN n ~ '^(.)\1*$' THEN NULL
    WHEN n IN ('1234567890', '0123456789') THEN NULL
    ELSE k END
  FROM (
    SELECT k, CASE WHEN k LIKE '91%' AND length(k) = 12 THEN substr(k, 3) ELSE k END AS n
    FROM (
      SELECT CASE
        WHEN length(d) = 10 THEN '91' || d
        WHEN length(d) = 11 AND left(d, 1) = '0' THEN '91' || substr(d, 2)
        ELSE d END AS k
      FROM (SELECT regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') AS d) AS digits
    ) AS keyed
  ) AS national
$$;

-- 2. Enquiry columns and follow-up tasks (created before the backfill so merges can check both).
ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "lostReason" TEXT;
ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enquiry_contactId_fkey') THEN
    ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Enquiry_contactId_createdAt_idx" ON "Enquiry"("contactId", "createdAt");

CREATE TABLE IF NOT EXISTS "FollowUpTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "enquiryId" TEXT REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "contactId" TEXT REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 200),
  "dueOn" DATE NOT NULL,
  "assigneeId" TEXT REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "note" TEXT NOT NULL DEFAULT '' CHECK (length("note") <= 2000),
  "done" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowUpTask_parent_check" CHECK (("enquiryId" IS NULL) <> ("contactId" IS NULL)),
  CONSTRAINT "FollowUpTask_done_check" CHECK ("done" = ("completedAt" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "FollowUpTask_done_dueOn_id_idx" ON "FollowUpTask"("done", "dueOn", "id");
CREATE INDEX IF NOT EXISTS "FollowUpTask_assigneeId_done_dueOn_idx" ON "FollowUpTask"("assigneeId", "done", "dueOn");
CREATE INDEX IF NOT EXISTS "FollowUpTask_enquiryId_done_dueOn_idx" ON "FollowUpTask"("enquiryId", "done", "dueOn");
CREATE INDEX IF NOT EXISTS "FollowUpTask_contactId_done_dueOn_idx" ON "FollowUpTask"("contactId", "done", "dueOn");

CREATE TABLE IF NOT EXISTS "ContactActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "action" TEXT NOT NULL,
  "taskId" TEXT,
  "body" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactActivity_action_check" CHECK (
    ("action" = 'updated' AND "taskId" IS NULL AND "body" IS NULL) OR
    ("action" IN ('task_created', 'task_completed', 'task_reopened') AND "taskId" IS NOT NULL AND "body" IS NOT NULL AND length("body") BETWEEN 1 AND 200)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContactActivity_contactId_version_key" ON "ContactActivity"("contactId", "version");

-- 3. Backfill contacts from existing enquiries. Re-running converges on the same result, and
--    apps/api/src/contacts-backfill.ts repeats exactly these two statements for enquiries written by an
--    old instance after the migration ran. Linking is by email key only.
-- 3a. One contact per distinct normalised email, named from that email's earliest enquiry.
INSERT INTO "Contact" ("id", "emailKey", "phoneKey", "name", "email", "phone", "createdAt", "updatedAt")
SELECT 'ct_' || gen_random_uuid(), e."emailKey", shopmaple_phone_key(e."phone"), e."name", e."emailKey", e."phone", e."createdAt", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (lower(trim("email"))) lower(trim("email")) AS "emailKey", "name", "phone", "createdAt"
  FROM "Enquiry" WHERE "contactId" IS NULL AND trim("email") <> '' ORDER BY lower(trim("email")), "createdAt", "id"
) AS e
ON CONFLICT ("emailKey") DO NOTHING;
-- 3b. Link every enquiry that has no contact yet by email key.
UPDATE "Enquiry" e SET "contactId" = c."id" FROM "Contact" c
  WHERE e."contactId" IS NULL AND c."emailKey" = lower(trim(e."email"));

-- 4. Pipeline stages: legacy "reviewed" becomes "contacted"; the check constraint names the five stages.
UPDATE "Enquiry" SET "status" = 'contacted' WHERE "status" = 'reviewed';
ALTER TABLE "Enquiry" DROP CONSTRAINT IF EXISTS "Enquiry_status_check";
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_status_check" CHECK ("status" IN ('new', 'contacted', 'quoted', 'won', 'lost'));
ALTER TABLE "Enquiry" DROP CONSTRAINT IF EXISTS "Enquiry_lostReason_check";
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_lostReason_check" CHECK ("lostReason" IS NULL OR ("status" = 'lost' AND length("lostReason") BETWEEN 1 AND 500));

-- 5. Enquiry activity gains stage, task and email actions. Existing rows are untouched.
ALTER TABLE "EnquiryActivity" ADD COLUMN IF NOT EXISTS "stage" TEXT;
ALTER TABLE "EnquiryActivity" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
ALTER TABLE "EnquiryActivity" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "EnquiryActivity" DROP CONSTRAINT IF EXISTS "EnquiryActivity_action_check";
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_action_check" CHECK (
  ("action" = 'assigned' AND "assigneeId" IS NOT NULL AND "body" IS NULL AND "stage" IS NULL AND "taskId" IS NULL AND "subject" IS NULL) OR
  ("action" = 'unassigned' AND "assigneeId" IS NULL AND "body" IS NULL AND "stage" IS NULL AND "taskId" IS NULL AND "subject" IS NULL) OR
  ("action" = 'note' AND "assigneeId" IS NULL AND "body" IS NOT NULL AND length("body") BETWEEN 1 AND 2000 AND "stage" IS NULL AND "taskId" IS NULL AND "subject" IS NULL) OR
  ("action" = 'status_changed' AND "assigneeId" IS NULL AND "stage" IN ('new', 'contacted', 'quoted', 'won', 'lost') AND ("body" IS NULL OR length("body") BETWEEN 1 AND 500) AND "taskId" IS NULL AND "subject" IS NULL) OR
  ("action" IN ('task_created', 'task_completed', 'task_reopened') AND "assigneeId" IS NULL AND "taskId" IS NOT NULL AND "body" IS NOT NULL AND length("body") BETWEEN 1 AND 200 AND "stage" IS NULL AND "subject" IS NULL) OR
  ("action" IN ('email_sending', 'email_sent', 'email_failed') AND "assigneeId" IS NULL AND "subject" IS NOT NULL AND length("subject") BETWEEN 1 AND 150 AND "body" IS NOT NULL AND length("body") BETWEEN 1 AND 5000 AND "stage" IS NULL AND "taskId" IS NULL)
);
