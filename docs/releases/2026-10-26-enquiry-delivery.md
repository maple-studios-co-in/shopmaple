# Enquiry notification delivery

New enquiries can now enqueue one durable staff alert atomically when email is explicitly configured. Shop Admin shows notification status and offers an audited, version-checked retry where safe. Provider acceptance is distinguished from mailbox arrival. The default remains disabled; no live message or customer reply was sent.

## Verification

- TDD: enabled enqueue failed with0 intents vs1; rollback failed before atomic persistence. Worker tests failed before claims/retries existed. Authenticated delivery endpoints failed404 vs200/403 before routes. UI panel assertions failed before implementation. Adapter config/transport and scheduler assertions failed before behavior. Anonymous route checks characterized existing global401 and are not claimed as RED.
- Final project suite:326 API,572 web and53 deployment tests pass. Separate recovery/bootstrap suite:5 pass. **956 total**, no failures or skips. Node22 typecheck and API/web production build pass.
- Migration tested on a fresh disposable database and an existing populated database, preserving enquiries, creating no backfill, enforcing unique delivery intent and restrictive evidence references. Local development was backed up privately before migration; counts remain85 products,115 variants,1 enquiry,1 cart and1 item. It has0 delivery jobs. The backup archive inventory was checked; this local dump was not separately restore-tested.
- Dependency audit0 vulnerabilities; staged/history Gitleaks no leaks; Semgrep74 rules/178 targets,~100% parsed,0 findings. Default exclusions:146 paths plus1 asset larger than1MiB. Manual review covered excluded new tests as well as production code.
- Independent review examined all27 changed files plus auth, CSRF/Origin middleware and UI request lifecycle against immutable patch SHA25623667d04ed4133743d95990b97f4e19334334f026e98ce1b4a7ac6de0926080c; no actionable findings. A second independent review covers the receipt/form-notice follow-up and its tests/docs against final patch SHA2563cd8598a9f05cca7f2f65cec7e2c5d20ce228b37adc5d0133b2bd0618fad623e; no actionable source findings.
- Isolated native-browser fixture confirms retry pending locks, queued refresh, accepted wording without retry, and permission-denial clearing. At390px the panel has no horizontal overflow. This uses the real component with synthetic in-memory transport, not real staff/provider acceptance. Temporary tabs/fixture server were cleaned up; local built store remains available.
- Homepage bundle guard passes at254065 raw/77104 gzip bytes. Local API is healthy, preview mode, checkout disabled.

A development-backup diagnostic initially used the wrong Prisma model name and exited before backup/migration; correcting Variant allowed the guarded backup and migration to complete. An old local web process emitted an upstream Shopify-image timeout before it was stopped for this build; this change does not claim to resolve upstream image delivery.

## Release boundaries

Source is prepared for final-commit scanning and CI; merge and deployment are recorded separately in the current project report. No production migration, account creation, content publication, mail send, order/payment or cleanup occurred.

At26October02:47UTC the scheduled ShopMaple paired backup reported failure. The server remains100% full with1952KiB available; the generic backup log does not establish a more specific cause. Earlier Keeri media backup also failed with ENOSPC. Production release remains26bd9aa185a4cecdf173bd0e550003e594a7205b. Resolve capacity and successful backups before deploying this additive schema/runtime change.

Publisher aditya@maplefurnishers.com still requires private password setup. Notification sender/recipient/provider credentials, controlled transport activation and actual mailbox arrival remain unverified. Signed delivery webhooks, retention, reviews/newsletter/customer-account integrations and commerce readiness remain outstanding. Keep the full project goal active and checkout disabled.

Integration follow-up: the earlier public preview receipt said the enquiry had definitely not been sent. That becomes inaccurate once an explicitly enabled worker can act asynchronously. A test-first update changes only this system status to say team notification is unconfirmed; original Shopify marketing copy remains unchanged. The refreshed production build and independent delta review pass; final suite results are recorded above before commit.
