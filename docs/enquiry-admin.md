# Restricted customer enquiry inbox

The shop stores contact, project and bulk enquiries. The inbox lets explicitly authorised staff read submissions and mark new enquiries reviewed. Reviewing is an internal acknowledgement, not a reply or a delivery confirmation. There is no email/SMS transport, assignment, note editing, export, customer account management, order editing, or payment action in this increment. Keeri remains authoritative for products, orders and delivery.

## Access

`ShopAdmin.canManageEnquiries` defaults to false. Content editors and publishers do not inherit access. The existing staff session and login are reused; every request checks current active staff and capability. Capability grants remain an operator decision; this increment grants no live account access. UI navigation is convenience, not the security boundary. All admin responses, including denials and validation errors, have private/no-store caching.

## API contract

- `GET /api/admin/enquiries?kind=contact&status=new&limit=20&cursor=…`: optional kind (contact/project/bulk), status (new/reviewed), limit 1–50, stable descending createdAt/id pagination. List entries contain only reference, kind, status, version and creation time. Cursor contains only creation time and reference. Filters cannot contain customer contact data.
- `GET /api/admin/enquiries/:id`: authorised full detail, bounded by the existing submission contract, including review attribution. Idempotency and payload hashes are never returned.
- `POST /api/admin/enquiries/:id/review` with `{expectedVersion: 0}`: exact website Origin, session-bound CSRF and current capability required. A transaction locks the current staff/session authority and atomically compares the version and new status. One successful transition produces one immutable review audit with actor, action, version and timestamp. Concurrent or repeated reviews return 409. There is no audit update/delete endpoint.

The client renders customer values as React text, does not persist data in localStorage, clears private content on access denial, expiry, conflict or request failure, and bounds requests with the existing admin request deadline. A conflict requires an explicit reload.

## TDD evidence

Node 22.21.1. API commands run from `apps/api`; UI commands from `apps/web`. The only database used is dedicated `shopmaple_test`; fixtures are synthetic and scoped cleanup removes their audits before staff.

- API RED: `npx tsx --env-file=../../.env --test --test-concurrency=1 --test-name-pattern='customer inbox denies' test/admin-enquiries.test.ts` failed with expected403/actual404 for content-only access before route implementation.
- UI RED: `npx tsx --tsconfig test/tsconfig.json --test test/admin-enquiry-inbox.test.tsx` failed three observable assertions against an empty component scaffold: missing inbox, missing access-denial alert and missing open control.

Additional focused GREEN and integration evidence is recorded with the delivery report. Local tests do not establish a production deployment, operational customer access policy, or working outbound notifications.
- API feature RED after access guard wiring: `npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-enquiries.test.ts` passed access denial and failed two intended assertions: authorised list expected200/actual404, review validation expected400/actual404.
- API GREEN: the same full focused command passed3/3; `npx tsx --env-file=../../.env --test --test-concurrency=1 test/enquiries.test.ts test/admin-enquiries.test.ts` passed9/9, including existing public deduplication, rate limits and no outbound delivery claims.
- UI GREEN: the focused UI command passed4/4, including metadata/detail separation, escaped strings, CSRF/version submission, access denial/session expiry, conflicts, filters/pagination and malformed response handling.
- API TypeScript check passed. At the first web TypeScript check, only concurrently edited content panel integration errors remained (unrelated `session` props); the integrating agent must rerun after all changes land.
