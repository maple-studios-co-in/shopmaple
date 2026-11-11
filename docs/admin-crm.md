# Admin CRM (retired)

**Retired on 11 November 2026.** Website enquiries (contact, project and bulk) are sent to Keeri as leads ([Keeri leads](keeri-leads.md)), and staff handle customers, follow-ups and email replies in Keeri. The owner decided that customer and CRM work lives in Keeri and the store admin keeps storefront presentation only. No new-enquiry email alert is wanted: Keeri's follow-up task and nudge on each new lead are enough.

The store database held one test enquiry and no contacts or tasks at retirement, so nothing was migrated.

## What the store admin keeps

Admin → Enquiries is now a read-only **Website enquiries** list for staff with `ShopAdmin.canManageEnquiries` (see [enquiry admin](enquiry-admin.md)):

- A line at the top: "Website enquiries are handled in Keeri. Open a lead there to reply, assign or follow up.", linked to `{KEERI_ADMIN_ORIGIN}/leads` while Keeri leads are enabled.
- One row per saved enquiry: reference, kind, time and the Keeri lead state (pending, created, matched or failed), with "Open in Keeri" once Keeri has the lead. A kind filter keeps newsletter signups and reviews Keeri could not take viewable, as before.
- Opening a row shows the enquiry as submitted (read-only) and its delivery panel, including "Retry Keeri lead" for a lead that is waiting to retry.

## What was removed

- Admin screens: the pipeline board, stage changes, assignment, internal notes and the activity timeline, follow-up tasks, the Contacts directory and contact pages, the Overview pipeline summary, and email replies.
- API routes, which now answer `404`: `POST /api/admin/enquiries/search`, `GET /api/admin/enquiries/assignees`, `GET /api/admin/enquiries/:id/activity`, `POST /api/admin/enquiries/:id/{stage,assignment,notes,reply}`, and everything under `/api/admin/crm/` (contacts, contact search, contact timeline and update, tasks, task completion, summary).
- Contact linking on save: `POST /api/enquiries` no longer creates or links a `Contact`, so the store keeps no second copy of the customer. New enquiries have `contactId = NULL`. The re-runnable contact backfill (`contacts-backfill.ts` and its CLI) went with it.

## Data kept, for safety

No table, column, constraint or row was dropped. `Contact`, `ContactActivity`, `FollowUpTask`, `EnquiryActivity`, `EnquiryReviewAudit` and the `Enquiry` columns `status`, `version`, `assignedToId`, `contactId` and `lostReason` stay as they are, unread and unwritten by the application. Dropping them is a separate, deliberate migration once the owner is sure nothing there is needed.

| Table | Purpose (historical) |
| --- | --- |
| `Contact` | One record per customer, keyed by `emailKey` (lower-cased, trimmed email; unique). `phoneKey` is the normalised phone for search and display only: it is customer-typed and unverified, so it is **never a key** and two contacts may carry the same value. Holds name, email, phone, city, `tags` (text array), internal `notes` and a CAS `version`. |
| `Enquiry` | Existing table. Gains `contactId` (restrict FK to `Contact`), `lostReason` and a `status` check constraint limited to the five stages. |
| `EnquiryActivity` | Existing append-only log. Gains `stage`, `taskId` and `subject`, and the action check constraint now accepts `status_changed`, `task_created`, `task_completed`, `task_reopened`, `email_sent` and `email_failed` beside `assigned`, `unassigned` and `note`. Each row shares the enquiry's version counter, so every change is attributed to the acting staff member and ordered. |
| `ContactActivity` | Contact-level events (`updated`, and the task actions for tasks attached to a contact), with a per-contact version. |
| `FollowUpTask` | A task on exactly one enquiry **or** one contact (check constraint): title, `dueOn` (date), optional assignee (staff), note, `done` with `completedAt`, creator and a CAS version. |

## Rolling back the retirement

Redeploy the previous release. This change has no migration, so the old CRM screens and routes work against the same database. Enquiries saved in between simply have no contact, which the old screens already handle (`contactId` was always nullable).

## Schema history

The CRM tables came from the migration below, which stays in the migration history.

### Migration `20261029010000_admin_crm`

Additive and idempotent: every statement uses `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` or `WHERE … IS NULL`, so the file can be re-applied with `psql` without duplicating or deleting enquiry data. In order it:

1. creates `Contact` (email key unique, phone key indexed but not unique), the `shopmaple_phone_key` SQL function, the `Enquiry` columns, `FollowUpTask` and `ContactActivity`;
2. backfills one contact per distinct normalised email among enquiries without a contact (named from that email's earliest enquiry, phone stored only when plausible), then links every unlinked enquiry by email key; phone never links;
3. rewrites `status = 'reviewed'` to `'contacted'` and adds the stage and lost-reason check constraints;
4. extends `EnquiryActivity` with the new columns and action constraint (including `email_sending`).

Versions, timestamps and existing activity rows are untouched. `apps/api/test/admin-crm-migration.test.ts` still deploys the previous schema on a disposable database, seeds legacy rows, applies this migration, re-runs its SQL and checks the result.

#### Rolling back

Deploy the previous application together with this SQL (no row is deleted by the migration, so the old application's data is intact):

```sql
ALTER TABLE "EnquiryActivity" DROP CONSTRAINT IF EXISTS "EnquiryActivity_action_check";
DELETE FROM "EnquiryActivity" WHERE "action" NOT IN ('assigned', 'unassigned', 'note');  -- loses stage, task and email history
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_action_check" CHECK (
  ("action" = 'assigned' AND "assigneeId" IS NOT NULL AND "body" IS NULL) OR
  ("action" = 'unassigned' AND "assigneeId" IS NULL AND "body" IS NULL) OR
  ("action" = 'note' AND "assigneeId" IS NULL AND "body" IS NOT NULL AND length("body") BETWEEN 1 AND 2000));
ALTER TABLE "EnquiryActivity" DROP COLUMN IF EXISTS "stage", DROP COLUMN IF EXISTS "taskId", DROP COLUMN IF EXISTS "subject";
ALTER TABLE "Enquiry" DROP CONSTRAINT IF EXISTS "Enquiry_status_check", DROP CONSTRAINT IF EXISTS "Enquiry_lostReason_check";
UPDATE "Enquiry" SET "status" = 'reviewed' WHERE "status" <> 'new';
DROP TABLE IF EXISTS "FollowUpTask";
DROP TABLE IF EXISTS "ContactActivity";
ALTER TABLE "Enquiry" DROP COLUMN IF EXISTS "contactId", DROP COLUMN IF EXISTS "lostReason";
DROP TABLE IF EXISTS "Contact";
DROP FUNCTION IF EXISTS shopmaple_phone_key(TEXT);
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261029010000_admin_crm';
```

The rollback loses CRM data (contacts, tasks, stage history, replies) and collapses every non-new stage to `reviewed`. Take the paired backup first, as for any migration.
