# Admin CRM

The shop admin's **Enquiries** tab is a small CRM for the people who write in through the storefront. Everything lives in the shop database and the shop admin; nothing calls or depends on Keeri.

## Who can use it

Both staff roles (`editor` and `publisher`) can use every CRM screen. Access is still gated by the existing `ShopAdmin.canManageEnquiries` capability, which defaults to false and is granted by an operator, exactly as for the original inbox. Every write keeps the admin API's session, Origin and CSRF rules, and every response is `private, no-store`.

## Data model

| Table | Purpose |
| --- | --- |
| `Contact` | One record per customer, keyed by `emailKey` (lower-cased, trimmed email; unique) and `phoneKey` (digits only, unique when present). Holds name, email, phone, city, `tags` (text array), internal `notes` and a CAS `version`. |
| `Enquiry` | Existing table. Gains `contactId` (restrict FK to `Contact`), `lostReason` and a `status` check constraint limited to the five stages. |
| `EnquiryActivity` | Existing append-only log. Gains `stage`, `taskId` and `subject`, and the action check constraint now accepts `status_changed`, `task_created`, `task_completed`, `task_reopened`, `email_sent` and `email_failed` beside `assigned`, `unassigned` and `note`. Each row shares the enquiry's version counter, so every change is attributed to the acting staff member and ordered. |
| `ContactActivity` | Contact-level events (`updated`, and the task actions for tasks attached to a contact), with a per-contact version. |
| `FollowUpTask` | A task on exactly one enquiry **or** one contact (check constraint): title, `dueOn` (date), optional assignee (staff), note, `done` with `completedAt`, creator and a CAS version. |

Phone normalisation is shared between the API (`apps/api/src/contacts.ts`) and the migration's SQL function `shopmaple_phone_key`: digits only; a 10-digit Indian number gains `91`; a leading trunk `0` on an 11-digit number is replaced by `91`.

### How contacts are created

When a public enquiry is saved, the API looks up a contact by email key, then by phone key, and creates one if neither matches, inside the same transaction and under a transaction-scoped advisory lock so concurrent first enquiries from one customer produce a single contact. Staff never create contacts by hand; they can edit name, phone, city, tags and notes. Email is the key and is not editable. Changing a phone to one another contact already holds returns `409 CONTACT_PHONE_IN_USE`.

## Pipeline stages

`new` → `contacted` → `quoted` → `won` / `lost`. Any stage can move to any other. Moving to `lost` requires a short reason (1–500 characters); leaving `lost` clears it. Every change writes a `status_changed` activity with the stage and reason. The old two-state `reviewed` value was **migrated to `contacted`**; the `/review` route was removed in favour of `POST /api/admin/enquiries/:id/stage`. Historic `EnquiryReviewAudit` rows remain readable on the enquiry detail.

## Follow-up tasks

`POST /api/admin/crm/tasks` creates a task on an enquiry or a contact; `POST /api/admin/crm/tasks/:id/complete` with `{ expectedVersion, done }` completes or reopens it and appends `task_completed` / `task_reopened` to the parent's activity. `GET /api/admin/crm/tasks?view=overdue|today|open|done&today=YYYY-MM-DD` powers the Overdue and Due today views; the viewer's browser supplies `today` so the server never guesses a timezone.

## Views

- **List**: filters for kind, stage, assignment, assignee and a creation date range, plus search over name, email, phone, product and SKU (case-insensitive, wildcards are literal). Rows link to the enquiry and to the contact.
- **Board**: one column per stage. Dragging a card (or using its "Move to" control) posts the stage change; the card moves optimistically and returns to its column if the server rejects the move (for example a version conflict). Cards show the customer, product interest, age of the enquiry, the assignee's initials and the state of the earliest open follow-up.
- **Follow-ups**: Overdue, Due today, Open and Done, optionally only the viewer's.
- **Contacts**: searchable directory; a contact page shows details, every enquiry, follow-ups and a combined timeline of enquiry and contact activity (`GET /api/admin/crm/contacts/:id/timeline`).
- **Overview**: the admin Overview tab shows counts per stage, overdue and due-today follow-ups, and enquiries received in the last seven days (`GET /api/admin/crm/summary?today=…`).

## Reply by email

`POST /api/admin/enquiries/:id/reply` with `{ expectedVersion, subject, body }` sends plain text to the enquiry's email through the existing Resend integration, from `ENQUIRY_MAIL_FROM` with `ENQUIRY_MAIL_TO` as reply-to. Replies are never HTML. When `ENQUIRY_DELIVERY_ENABLED` is not `true` the UI says so and the server refuses with `503 EMAIL_NOT_CONFIGURED`. A send that the provider rejects answers `502 EMAIL_SEND_FAILED`. Both outcomes are recorded in activity with the full subject and text (`email_sent` / `email_failed`). Each staff member may send 20 replies per hour per API process (`429 REPLY_RATE_LIMITED`); the counter is in memory and resets on restart.

## Migration `20261029010000_admin_crm`

Additive and idempotent: every statement uses `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` or `WHERE … IS NULL`, so the file can be re-applied with `psql` without duplicating or deleting enquiry data. In order it:

1. creates `Contact`, the `shopmaple_phone_key` SQL function, the `Enquiry` columns, `FollowUpTask` and `ContactActivity`;
2. backfills one contact per distinct normalised email (named from that email's earliest enquiry), assigns each phone key to the earliest contact that supplied it, merges later contacts whose phone belongs to an earlier one, then links every enquiry by email key and finally by phone key;
3. rewrites `status = 'reviewed'` to `'contacted'` and adds the stage and lost-reason check constraints;
4. extends `EnquiryActivity` with the new columns and action constraint.

Versions, timestamps and existing activity rows are untouched. `apps/api/test/admin-crm-migration.test.ts` deploys the previous schema on a disposable database, seeds legacy rows, applies this migration, re-runs its SQL and checks the result.

### Rolling back

Deploy the previous application together with this SQL (no row is deleted by the migration, so the old application's data is intact):

```sql
ALTER TABLE "EnquiryActivity" DROP CONSTRAINT IF EXISTS "EnquiryActivity_action_check";
DELETE FROM "EnquiryActivity" WHERE "action" NOT IN ('assigned', 'unassigned', 'note');
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

## Design tokens

The CRM screens use a small token set declared on `.shop-admin` in `apps/web/styles/admin.css` (`--crm-space-*`, `--crm-radius-*`, `--crm-type-*`, `--crm-surface-*`, `--crm-line-*`, `--crm-text-*`, `--crm-shadow-*`, `--crm-ease`, `--crm-stage-*`). The rest of the admin can adopt them incrementally; no new framework or font was added.
