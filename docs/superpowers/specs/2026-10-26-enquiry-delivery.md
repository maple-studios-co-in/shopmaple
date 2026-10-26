# Enquiry notification delivery

Implement the remaining enquiry alert workflow, disabled by default. The confirmed publisher is aditya@maplefurnishers.com; this does not select an alert recipient or grant enquiry access. Use existing Shop Admin sessions and separate enquiry permission. Keeri remains commerce authority.

## Behavior and boundaries

A new enquiry and its single delivery intent commit atomically only when notification configuration is enabled and complete. Duplicate submissions reuse the existing receipt; activation never backfills historical enquiries. The public receipt remains notificationSent:false because queuing is not delivery.

Use PostgreSQL, native fetch and Resend, without a new queue service or package. Configuration requires ENQUIRY_DELIVERY_ENABLED=true, ENQUIRY_RESEND_API_KEY, ENQUIRY_MAIL_FROM, ENQUIRY_MAIL_TO and WEB_ORIGIN. Default is disabled. Require one plain sender and recipient email and HTTPS public origin (loopback HTTP only outside production). Bind jobs to a SHA256 fingerprint of these values, including credential and template version, so configuration changes cannot redirect existing work.

Messages contain only enquiry reference, kind, creation date and a protected /admin link. Never copy customer contact details or message text into alerts, jobs or logs. Message rendering is deterministic. Preserve a stable provider idempotency key per job. Resend retains keys for 24 hours; stop automatic/manual retries at 23 hours after first attempt, and require reconciliation rather than risk duplicates. Provider acceptance is reported as accepted, never inbox delivery.

Jobs: queued, sending, retry_wait, accepted, failed, uncertain. Claim with a database lease and compare-and-set ownership; one attempt increments attempts/version. Limit five attempts, bounded batches and delay retries. Expired sending leases may retry only inside the deduplication window. A configuration mismatch, expired uncertain attempt or idempotency payload conflict requires reconciliation. No resend of accepted jobs. Keep a restrictive enquiry foreign key; retention/deletion is explicitly a later operator workflow.

Protected GET /api/admin/enquiries/:id/delivery returns {enquiryId, enabled, delivery:null|{status,version,attempts,nextAttemptAt,acceptedAt,errorCode,canRetry}}. ISO timestamp fields nullable; no provider ID, recipient, credential, configuration hash or lease is exposed. POST same path + /retry accepts strict {expectedVersion}, expedites only retry_wait jobs that retain retry eligibility; it never sends synchronously. Current enquiry permission, Origin/CSRF, optimistic version and append-only retry audit are required. Disable/revocation checks remain immediate.

## Shared implementation contract

Adapter exports EnquiryDeliveryConfig {apiKey,from,to,adminOrigin,fingerprint}, EnquiryAlert {jobId,enquiryId,kind,createdAt:Date}; loadEnquiryDeliveryConfig(env):config|null; sendEnquiryAlert(config,alert,fetchImpl?):Promise<EnquiryDeliveryOutcome>. Outcome: {status:'accepted',providerId:string} or {status:'retryable'|'failed'|'uncertain',code:'rate_limited'|'provider_busy'|'provider_unavailable'|'network_error'|'invalid_response'|'provider_rejected'|'configuration_error'|'idempotency_conflict'}. Adapter has a bounded timeout including response body and response-size cap; no redirects. Internal worker additional error codes: configuration_changed, retry_window_expired, attempts_exhausted.

Backend exports processEnquiryDeliveries(db,config,send?,now?,limit?):Promise<number>. Each process call has a bounded batch; server runs one nonoverlapping cycle every 30 seconds only with explicit configuration. Shutdown waits for active cycle before disconnecting. Tests mock transport only, not transactions.

Shared exports enquiryDeliveryResponseSchema, enquiryDeliveryRetryInputSchema, EnquiryDeliveryResponse from contracts root. Strict response fields above, status union above, attempts integer0..5, version nonnegative, errorCode nullable union above. UI receives session,enquiryId,onDenied,onBusy and shows status without claiming delivery; retry refresh handles conflicts, denies and unmount/identity changes. Parent tracks independent workflow/delivery pending flags.

## Ownership

- Backend agent: Prisma schema/migration; enquiries.ts; admin/enquiries.ts; new delivery-worker.ts and admin/enquiry-delivery.ts; shared delivery contracts/index export; focused API tests. Owns dedicated DB while running tests.
- Adapter agent: new enquiry-delivery-provider.ts and transport/config tests only. No DB use.
- UI agent: new delivery panel and inbox integration/tests; installed Next guide first. No shared/API edits.
- Root: server.ts, app.ts integration, docs, final integration tests/security/review/release. Coordinate shared contracts before edits.

## Acceptance

Genuine RED/GREEN behavior evidence, atomic enqueue/rollback/idempotency, concurrent claims and stale finalization, bounded attempts and unknown responses, no secret/PII leakage, auth/CSRF/revocation/conflict tests, stale UI responses, full suite/types/build/security and independent final diff review. No live mail, account creation, production changes or checkout activation in this increment. Private publisher setup and full-server capacity remain separate deployment gates.

Sources: https://resend.com/docs/dashboard/emails/idempotency-keys and https://resend.com/docs/api-reference/emails/send-email (checked 26 October 2026).
