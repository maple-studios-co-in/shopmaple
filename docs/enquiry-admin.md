# Website enquiries in the shop admin

Website enquiries are handled in Keeri. Contact, project and bulk enquiries go to Keeri as leads ([Keeri leads](keeri-leads.md)); staff reply, assign and follow up there. The shop admin keeps a **read-only** list of what the store's forms saved and whether each one reached Keeri. The store's own CRM (stages, assignment, notes, follow-ups, contacts and email replies) was retired on 11 November 2026; see [admin CRM (retired)](admin-crm.md).

## Access

`ShopAdmin.canManageEnquiries` defaults to false. Content editors and publishers do not inherit access. The existing staff session and login are reused; every request checks current active staff and capability. Capability grants remain an operator decision. UI navigation is convenience, not the security boundary. All admin responses, including denials and validation errors, have private/no-store caching.

## The screen

Admin → Enquiries shows:

- the line "Website enquiries are handled in Keeri. Open a lead there to reply, assign or follow up.", linked to `{KEERI_ADMIN_ORIGIN}/leads` while Keeri leads are enabled (plain text otherwise);
- a kind filter (contact, project, bulk, newsletter, review), so newsletter signups and reviews Keeri could not take stay viewable;
- one row per enquiry, newest first: reference, kind, time and the Keeri lead state (pending, lead created, matched a lead, failed; "Stays in the store" for signups and reviews, "Not sent" for an enquiry saved while leads were off), with "Open in Keeri" once Keeri has the lead;
- on opening a row, the enquiry as submitted (reference, name, email, phone, product, variant, SKU, pincode, message) and its delivery panel: the email alert's state if alerts are configured, the Keeri lead's state, attempts and last status code, "Open in Keeri", and "Retry Keeri lead" while the lead is waiting to retry.

Nothing on the screen edits the enquiry. The only write is the audited delivery retry.

## API contract

- `GET /api/admin/enquiries?kind=contact&limit=20&cursor=…`: optional kind, limit 1–50, stable descending createdAt/id pagination. The reply is `{ items, nextCursor, keeriLeadsUrl }`; each item is `{ id, kind, createdAt, keeri }` where `keeri` is `{ state, leadUrl }` or `null`. Rows never carry the customer's name, email, phone or message. Any other query parameter is a `400`. The cursor contains only creation time and reference. `keeriLeadsUrl` is `{KEERI_ADMIN_ORIGIN}/leads`, or `null` while Keeri leads are off; `leadUrl` is set only once Keeri has accepted the lead and leads are on.
- `GET /api/admin/enquiries/:id`: the enquiry as submitted: `{ id, kind, name, email, phone, message, context, createdAt }`. Idempotency and payload hashes are never returned. Anything that is not an enquiry reference is a `404`.
- `GET /api/admin/enquiries/:id/delivery` and `POST /api/admin/enquiries/:id/delivery/retry`: unchanged; see [enquiry delivery](enquiry-delivery.md) and [Keeri leads](keeri-leads.md).

The retired CRM routes (search, assignees, activity, stage, assignment, notes, reply, and everything under `/api/admin/crm/`) answer `404`.

The client renders customer values as React text, does not persist data in localStorage, clears private content on access denial, expiry or request failure, and bounds requests with the existing admin request deadline.

## TDD evidence (original inbox increment, October 2026)

Node 22.21.1. API commands run from `apps/api`; UI commands from `apps/web`. The only database used is dedicated `shopmaple_test`; fixtures are synthetic and scoped cleanup removes their audits before staff.

- API RED: `npx tsx --env-file=../../.env --test --test-concurrency=1 --test-name-pattern='customer inbox denies' test/admin-enquiries.test.ts` failed with expected403/actual404 for content-only access before route implementation.
- UI RED: `npx tsx --tsconfig test/tsconfig.json --test test/admin-enquiry-inbox.test.tsx` failed three observable assertions against an empty component scaffold: missing inbox, missing access-denial alert and missing open control.

Additional focused GREEN and integration evidence is recorded with the delivery report. Local tests do not establish a production deployment, operational customer access policy, or working outbound notifications.
- API feature RED after access guard wiring: `npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-enquiries.test.ts` passed access denial and failed two intended assertions: authorised list expected200/actual404, review validation expected400/actual404.
- API GREEN: the same full focused command passed3/3; `npx tsx --env-file=../../.env --test --test-concurrency=1 test/enquiries.test.ts test/admin-enquiries.test.ts` passed9/9, including existing public deduplication, rate limits and no outbound delivery claims.
- UI GREEN: the focused UI command passed4/4, including metadata/detail separation, escaped strings, CSRF/version submission, access denial/session expiry, conflicts, filters/pagination and malformed response handling.
- API TypeScript check passed. At the first web TypeScript check, only concurrently edited content panel integration errors remained (unrelated `session` props); the integrating agent must rerun after all changes land.
