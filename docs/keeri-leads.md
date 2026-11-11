# Enquiries as Keeri leads

Contact, project and bulk enquiries from the website can also be sent to Keeri as leads, so staff work them in the Keeri CRM. Newsletter signups and reviews never go to Keeri. The enquiry is always saved in the store first and stays in Admin → Enquiries as the fallback, whatever Keeri answers.

## How it works

- `POST /api/enquiries` saves the enquiry and, in the same transaction, queues one outbox row per target in `EnquiryDelivery`: `target = 'email'` for the staff alert (as before) and `target = 'keeri'` for the lead. Both rows share the outbox's 60-second lease, backoff (30 s doubling to 1 h), five-attempt limit, 23-hour window and the audited staff retry.
- Every 30 seconds the API sends due leads to `POST {KEERI_ORIGIN}/api/storefront/leads` with `Authorization: Bearer <KEERI_COMMERCE_TOKEN>` and `Idempotency-Key: <enquiry id>`. The body is `{ version: 1, enquiryId, kind, name, email, phone, message, context, submittedAt }`; empty context fields are left out. A retry sends the same body with the same key, so Keeri returns the same lead.
- Keeri's 200 reply is kept on the row: `keeriLeadId`, `keeriOutcome` (`created` or `matched`), `keeriLeadPath` and `acceptedAt`. A 5xx, 429, timeout or dropped connection is retried. A 400 (`INVALID_LEAD`), 409 (`IDEMPOTENCY_CONFLICT`), 401 or 403 is final and recorded as `provider_rejected`, `idempotency_conflict` or `configuration_error`.
- Requests have a 10-second deadline and read at most 16 KiB of reply. Error bodies are never read, and nothing about the customer is logged.

## The staff email

The email alert keeps going. Each cycle runs Keeri first, and an alert waits until its lead's first Keeri attempt has finished (or at most two minutes, for example if Keeri's worker is not running). If Keeri took the lead by then, the alert links `{KEERI_ADMIN_ORIGIN}{leadPath}`; otherwise it links the store admin as before. An alert keeps the link it was first built with on retries, because the email provider's idempotency key is per alert. The alert still carries only the reference, kind and date.

## Store admin

The enquiry's delivery panel shows the Keeri lead as pending, created, matched or failed, the attempts and last status code, and an "Open in Keeri" link once there is a lead. "Retry Keeri lead" brings forward a waiting retry, as "Retry notification" does for the email; both are audited.

## Configuration

| Key | Meaning |
| --- | --- |
| `KEERI_LEADS_ENABLED` | `true` to send leads; `false` or unset leaves the store exactly as before (no Keeri rows). Any other value stops startup. |
| `KEERI_ORIGIN` | Keeri's HTTPS origin, already shared with checkout and the catalogue. |
| `KEERI_COMMERCE_TOKEN` | The same Keeri service credential as checkout, which must also carry the `leads:write` scope. |
| `KEERI_ADMIN_ORIGIN` | Optional. The Keeri admin base URL for links; defaults to `KEERI_ORIGIN`. In production, `https://maplefurnishers.keeri.in`. |

With `KEERI_LEADS_ENABLED=true` and `KEERI_ORIGIN` or `KEERI_COMMERCE_TOKEN` missing or invalid, the API refuses to start and names the key (never its value). Queued leads are bound to `KEERI_ORIGIN`: pointing the store at a different Keeri stops old rows with `configuration_changed` instead of sending them elsewhere. Rotating the token does not.

## Rollout

1. Keeri: deploy `POST /api/storefront/leads` and give the store's commerce credential the `leads:write` scope.
2. Store: deploy this release (the migration only adds columns and changes the unique key to enquiry + target), then set `KEERI_LEADS_ENABLED=true` (and `KEERI_ADMIN_ORIGIN` if Keeri's admin is on another host) and restart `shopmaple-api`.
3. Send one test enquiry and check the lead in Keeri, the "Open in Keeri" link in the admin and the link in the staff email.

Rollback is `KEERI_LEADS_ENABLED=false` and a restart: new enquiries stop queuing leads, staff emails stop waiting for Keeri, and any queued lead rows stay put for later. Enquiries saved before activation are not backfilled.
