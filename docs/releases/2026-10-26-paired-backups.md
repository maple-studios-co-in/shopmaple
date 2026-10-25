# Paired ShopMaple backup release — 26 October 2026

PR #22 and the verification follow-up PR #23 are merged. Immutable backup tooling `39064130264d569bbca34fcc7c74e828e954e52a` is installed. The storefront remains on `26bd9aa185a4cecdf173bd0e550003e594a7205b`; no app restart, database migration or checkout activation was part of this operations release.

## Verified production behavior

- First complete recovery pair: `20261025T223549269Z-9e350d55-d5e0-4545-aac8-a29dcca2f470`, taken at 22:35 UTC on 25 October.
- Database archive: 220,325 bytes, SHA-256 `f25130fea616c2e1f3d762a624c003d0336976e9667bf96d4c6448fa682fb9a6`. Paired media currently contains zero uploaded files; existing source assets remain in the immutable application release.
- Restored into a new disposable PostgreSQL database, then removed only that owned database. Restored/current counts matched: 539 products, 1,050 variants, zero media records, zero checkout attempts, zero enquiries and nine finished migrations.
- A private off-host copy on the owner's Mac passed independent archive/checksum verification. This is a one-time copy, not automated off-host protection.
- Replaced exactly one existing cron entry: ShopMaple's 02:47 UTC daily database-only job now runs the fixed-revision paired backup launcher. The before/after crontab comparison confirms every unrelated entry was preserved. Cron service is active. A manual first run and restore were observed; the next scheduled run has not yet been observed.
- API/web/database PIDs and restart counters remained unchanged. Public health returns `ok`, preview catalogue and `checkoutEnabled: false`.

The initial PR #22 manual backup completed, but its follow-up verifier exposed a Node stdin import bug. PR #23 fixes it with subprocess regressions. CI also exposed a pre-existing bootstrap test stdin race; only test helpers changed, with explicit early-rejection regression assertions. The host crontab command rejected the long snapshot filename; after confirming the existing schedule matched the preserved before-file, installation via stdin succeeded and exact readback passed. No backup/release was deleted.

## Verification

Final backup revision: 438 passing application/deployment tests, typecheck, production build, dependency audit, redacted staged/history secret scans, static analysis and source review. All eight PR #23 CI checks passed. Real recovery tests include published, private and orphan image bytes and actual authorization routes; the production pair itself is currently empty of uploads. Three operational cron-planner tests passed, preserving unrelated entries and rejecting ambiguous targets/revisions.

## Still outstanding

Automated off-host destination, retention, missing-backup/failure alert delivery, observation of a scheduled run and capacity expansion/approved retention work. Server available capacity is about 1.25 GiB; another ordinary full application build cannot safely fit within the existing staging reserve. All old releases/backups remain retained. Private publisher activation and checkout readiness are separate pending gates.

Private evidence: `/Users/adityaagrawal/.codex/verification/shopmaple-paired-backup-20261026`. This directory includes a database backup and must not be committed or shared publicly.
