# Admin CRM

The shop admin's **Enquiries** tab is a small CRM for the people who write in through the storefront. Everything lives in the shop database and the shop admin; nothing calls or depends on Keeri.

## Security review (authorisation and persistence changes)

- Access: every CRM route runs `requireEnquiryAccess` inside the transaction (current session, active staff, `canManageEnquiries`), with Origin and CSRF on every POST including the search endpoints. Covered by `admin-crm.test.ts` ("every CRM endpoint keeps the session, capability, Origin and CSRF rules").
- Customer data: list rows never carry email, phone or message; search text travels in POST bodies, never URLs; page URLs carry no query state.
- Contact identity: linking by verified-enough email only; the unverified phone is never a key (adversarial test: a stranger's enquiry carrying a victim's phone gets its own contact; placeholder phones are never keyed).
- Input: staff-entered single-line fields reject all C0/C1 controls and bidi overrides; multi-line fields allow only `\n` and `\t`; calendar dates must exist.
- Concurrency: CAS versions on enquiries, contacts and tasks; row locks `FOR UPDATE`; CRM advisory locks in a dedicated class and fixed order before row locks; one email send per enquiry version with a derived idempotency key.
- Migration: additive, idempotent, no deletes; rollback documented below.

## Who can use it

Both staff roles (`editor` and `publisher`) can use every CRM screen. Access is still gated by the existing `ShopAdmin.canManageEnquiries` capability, which defaults to false and is granted by an operator, exactly as for the original inbox. Every write keeps the admin API's session, Origin and CSRF rules, and every response is `private, no-store`.

## Data model

| Table | Purpose |
| --- | --- |
| `Contact` | One record per customer, keyed by `emailKey` (lower-cased, trimmed email; unique). `phoneKey` is the normalised phone for search and display only: it is customer-typed and unverified, so it is **never a key** and two contacts may carry the same value. Holds name, email, phone, city, `tags` (text array), internal `notes` and a CAS `version`. |
| `Enquiry` | Existing table. Gains `contactId` (restrict FK to `Contact`), `lostReason` and a `status` check constraint limited to the five stages. |
| `EnquiryActivity` | Existing append-only log. Gains `stage`, `taskId` and `subject`, and the action check constraint now accepts `status_changed`, `task_created`, `task_completed`, `task_reopened`, `email_sent` and `email_failed` beside `assigned`, `unassigned` and `note`. Each row shares the enquiry's version counter, so every change is attributed to the acting staff member and ordered. |
| `ContactActivity` | Contact-level events (`updated`, and the task actions for tasks attached to a contact), with a per-contact version. |
| `FollowUpTask` | A task on exactly one enquiry **or** one contact (check constraint): title, `dueOn` (date), optional assignee (staff), note, `done` with `completedAt`, creator and a CAS version. |

Phone normalisation is shared between the API (`apps/api/src/contacts.ts`) and the SQL function `shopmaple_phone_key`: digits only; a 10-digit Indian number gains `91`; a leading trunk `0` on an 11-digit number is replaced by `91`. Anything that is not a plausible mobile number (fewer than 10 significant digits, one repeated digit, or a counting sequence such as 1234567890) is stored as `NULL`, so placeholders never look like identities.

### How contacts are created and linked

Linking is **by normalised email only**. When a public enquiry is saved, the API locks the email key (and the phone key, in that fixed order, before any row lock, using `pg_advisory_xact_lock(7701, hashtext(key))` so CRM locks cannot collide with the catalogue or Keeri sync locks), finds the contact by email key and creates one if none exists, inside the same transaction as the enquiry. An enquiry with a different email never attaches to an existing contact because it shares a phone: the phone is unverified free text and an attacker could otherwise reach a victim's enquiries. The enquiry contract always requires an email, so there is no phone-only path. Staff never create contacts by hand; they can edit name, phone, city, tags and notes (the staff update takes the same locks in the same order before locking the row). Email is the key and is not editable.

### Backfill and rollout

The migration backfills contacts once (see below). `apps/api/src/contacts-backfill.ts` repeats exactly the migration's two backfill statements and is safe to run any number of times:

```sh
# from apps/api
npx tsx --env-file=../../.env src/contacts-backfill-cli.ts
```

Release the API and web together as an **atomic swap** (stop old instances, migrate, start new instances). The migration adds a check constraint on `Enquiry.status` and extends the activity constraint, so an old instance must never run against the new schema: it could write `reviewed` (rejected by the constraint) or save enquiries without a contact. If a non-atomic rollout does leave enquiries without a contact, run the backfill command above; it links them by email key.

## Pipeline stages

`new` → `contacted` → `quoted` → `won` / `lost`. Any stage can move to any other. Moving to `lost` requires a short reason (1–500 characters); leaving `lost` clears it. Every change writes a `status_changed` activity with the stage and reason. The old two-state `reviewed` value was **migrated to `contacted`**; the `/review` route was removed in favour of `POST /api/admin/enquiries/:id/stage`. Historic `EnquiryReviewAudit` rows remain readable on the enquiry detail.

## Follow-up tasks

`POST /api/admin/crm/tasks` creates a task on an enquiry or a contact; `POST /api/admin/crm/tasks/:id/complete` with `{ expectedVersion, done }` completes or reopens it and appends `task_completed` / `task_reopened` to the parent's activity. `GET /api/admin/crm/tasks?view=overdue|today|open|done&today=YYYY-MM-DD` powers the Overdue and Due today views; the viewer's browser supplies `today` so the server never guesses a timezone.

## Views

- **List**: filters for kind, stage, assignment, assignee and a creation date range (Asia/Kolkata calendar days, like the summary's seven-day window), plus search over name, email, phone, product and SKU (case-insensitive, wildcards are literal). Search text may be an email or phone, so it is sent in the body of `POST /api/admin/enquiries/search` (and `POST /api/admin/crm/contacts/search`), never in a URL; the admin page URL carries no query state. Rows carry name, product, stage and the earliest open follow-up date, never email, phone or the message, and link to the enquiry and to the contact.
- **Board**: one column per stage, up to 50 cards each with a "more" indicator pointing at the list view when a stage is larger. Dragging a card (or using its "Move to" control) posts the stage change; the card moves optimistically and returns to its column if the server rejects the move (for example a version conflict). Cards show the customer, product interest, age of the enquiry, the assignee's initials and the state of the earliest open follow-up (carried on each row, so the board needs no task query).
- **Follow-ups**: Overdue, Due today, Open and Done, optionally only the viewer's.
- **Contacts**: searchable directory; a contact page shows details, every enquiry, follow-ups and a combined timeline of enquiry and contact activity (`GET /api/admin/crm/contacts/:id/timeline`).
- **Overview**: the admin Overview tab shows counts per stage, overdue and due-today follow-ups, and enquiries received in the last seven days (`GET /api/admin/crm/summary?today=…`).

## Reply by email

`POST /api/admin/enquiries/:id/reply` with `{ expectedVersion, subject, body }` sends plain text to the enquiry's email through the existing Resend integration, from `ENQUIRY_MAIL_FROM` with `ENQUIRY_MAIL_TO` as reply-to. Replies are never HTML. The subject is one line with no control characters or Unicode bidi overrides (so no header injection and no disguised text); the body allows ordinary newlines and tabs only. Exactly one send per version: the request locks the enquiry row, compares `expectedVersion`, advances the version and records an `email_sending` activity in one transaction, so two requests with the same version yield one send and one `409`. The provider idempotency key is `reply/<enquiry id>/<version consumed>`. After the transport the same activity row becomes `email_sent` or `email_failed` (`502 EMAIL_SEND_FAILED`). If recording that outcome fails, a last-resort single-row update still flips the row and the request answers `500 REPLY_OUTCOME_UNRECORDED` so staff reload before sending again. The rate-limit slot is reserved before the send and released when the send is refused or fails, so parallel replies across enquiries cannot exceed the limit.

**Stuck intent rows.** A row left at `email_sending` means the process died between the intent and the outcome. Find them with

```sql
SELECT "id", "enquiryId", "version", "subject", "createdAt" FROM "EnquiryActivity"
WHERE "action" = 'email_sending' AND "createdAt" < now() - interval '15 minutes';
```

Resolve each by checking the provider for the idempotency key `reply/<enquiryId>/<version>` (sent → `UPDATE "EnquiryActivity" SET "action" = 'email_sent' WHERE "id" = '<id>'`; not sent → `'email_failed'`). The activity log is append-only through the API; this is the one operator correction it expects. When `ENQUIRY_DELIVERY_ENABLED` is not `true` the UI says so and the server refuses with `503 EMAIL_NOT_CONFIGURED`. Each staff member may complete 20 accepted sends per hour per API process (`429 REPLY_RATE_LIMITED`); refused or failed sends do not count, and the counter is in memory.

## Migration `20261029010000_admin_crm`

Additive and idempotent: every statement uses `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` or `WHERE … IS NULL`, so the file can be re-applied with `psql` without duplicating or deleting enquiry data. In order it:

1. creates `Contact` (email key unique, phone key indexed but not unique), the `shopmaple_phone_key` SQL function, the `Enquiry` columns, `FollowUpTask` and `ContactActivity`;
2. backfills one contact per distinct normalised email among enquiries without a contact (named from that email's earliest enquiry, phone stored only when plausible), then links every unlinked enquiry by email key; phone never links;
3. rewrites `status = 'reviewed'` to `'contacted'` and adds the stage and lost-reason check constraints;
4. extends `EnquiryActivity` with the new columns and action constraint (including `email_sending`).

Versions, timestamps and existing activity rows are untouched. `apps/api/test/admin-crm-migration.test.ts` deploys the previous schema on a disposable database, seeds legacy rows, applies this migration, re-runs its SQL and checks the result.

### Rolling back

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

## Design tokens

The CRM screens use a small token set declared on `.shop-admin` in `apps/web/styles/admin.css` (`--crm-space-*`, `--crm-radius-*`, `--crm-type-*`, `--crm-surface-*`, `--crm-line-*`, `--crm-text-*`, `--crm-shadow-*`, `--crm-ease`, `--crm-stage-*`). The rest of the admin can adopt them incrementally; no new framework or font was added.
