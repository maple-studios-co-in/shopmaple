# Enquiry alerts

Shop Admin displays an enquiry's notification state separately from its review, assignment and notes. Only active staff with enquiry permission can view or retry notifications. The publisher identity does not automatically receive this permission or select the email recipient.

Alerts are disabled by default. A saved enquiry is available in the private inbox regardless of transport configuration. When explicitly enabled, a new submission and one notification intent commit together. Repeated submissions cannot create extra intents; existing enquiries are not backfilled. Public receipts continue to report notificationSent:false because acceptance into a queue does not mean delivery.

## Configuration and activation

The API reads ENQUIRY_DELIVERY_ENABLED (default false), ENQUIRY_RESEND_API_KEY, ENQUIRY_MAIL_FROM, ENQUIRY_MAIL_TO and WEB_ORIGIN. Sender/recipient must each be a single plain email address. Production requires a public HTTPS origin. Put credentials only in the protected runtime environment; do not paste them into chat or command arguments. Use a verified sender and a deliberately chosen team inbox, then arrange a separately authorized controlled acceptance test before activation. Do not infer recipients from the first publisher's email.

The alert contains only reference, kind, creation date and a link to /admin. Customer names, email addresses, phone numbers, enquiry messages and notes remain in the protected application. No customer reply or marketing message is sent by this workflow.

## Delivery and recovery

An enabled API schedules bounded cycles every 30 seconds with no overlapping cycle in the same process. PostgreSQL leases coordinate multiple processes; a cycle claims at most 10 jobs by default. HTTP runs outside transactions, has a 10 second total deadline and a 16 KiB response limit. Each attempt uses the same deterministic message and provider idempotency key. Jobs are tied to configuration and template version; changing sender, recipient, origin, credential or template cannot silently reroute old work.

Resend retains idempotency keys for 24 hours. Our retry cutoff is 23 hours from the first attempt, with a maximum of 5 attempts and increasing delays. Expired leases can be recovered within this window. Unknown responses do not establish that nothing was sent. Jobs with conflicting configuration, exhausted attempts or expired ambiguity require operator reconciliation. Do not delete/recreate a job or change its key to force a resend. Inspect the provider record privately and follow a separately reviewed recovery procedure. Automatic acceptance tracking is implemented; signed delivery/bounce webhooks are not.

Status meanings:
- queued: waiting for a worker;
- sending: a lease currently owns the attempt;
- retry_wait: another same-key attempt is eligible within the bounded retry policy;
- accepted: the provider accepted the email, not proof of arrival in a mailbox;
- failed: automatic attempts stopped and an operator must review;
- uncertain: the outcome needs reconciliation before any further action.

The Retry notification action only expedites an eligible retry_wait job. It retains the key, attempt count and cutoff, checks a current version, and records staff attribution. It cannot resend accepted or terminal jobs. Reload status after any conflict or uncertain UI response.

Delivery rows reference enquiries and retry audits reference staff with restrictive foreign keys. No automatic deletion or retention worker is included. A future authorized retention process must account for pending work, ambiguous outcomes and audit records before deleting personal data.

## Release requirements

Apply the additive migration with a verified paired backup and adequate capacity. Deploy API/web together; leaving the flag disabled prevents outgoing mail. Verify staff permissions, enqueue/duplicate semantics, provider acceptance and actual team mailbox receipt separately before claiming active delivery. Checkout remains disabled independently. The first publisher still needs private password setup and production staff acceptance.

Provider references: [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [send endpoint](https://resend.com/docs/api-reference/emails/send-email), checked 26 October 2026. Local synthetic transport tests do not prove production provider configuration.
