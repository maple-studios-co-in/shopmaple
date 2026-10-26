# Enquiry delivery implementation plan

Spec: [delivery behavior and contracts](../specs/2026-10-26-enquiry-delivery.md). Continue the full ShopMaple goal; this increment does not activate email or complete production readiness.

- [x] Inspect existing enquiry workflow and Keeri/Revamp transports; select a strict disabled-by-default Resend adapter.
- [x] Separate confirmed publisher identity from pending notification recipient choice.
- [x] Define schema/API/transport contracts and exclusive parallel ownership.
- [x] Backend RED/GREEN: atomic enquiry/outbox persistence, duplicate/concurrent requests, leases, retry bounds, ambiguous recovery, status and audited staff retry.
- [x] Adapter RED/GREEN: strict config, deterministic minimal payload, timeout/body cap, provider acceptance/error classification and safe idempotency.
- [x] UI RED/GREEN: protected status, retries/conflicts, identity/unmount guards, denial cleanup and independent pending state.
- [x] Runner RED/GREEN: no overlapping cycle, drain before shutdown, failure recovery without forwarding private exception details.
- [x] Wire real app/server paths and prove enabled/disabled behavior through HTTP.
- [x] Freeze edits; run complete suite, recovery tests, types/build/bundle guard and security scans.
- [x] Independent immutable-diff review; reproduce and fix findings test-first.
- [ ] Final commit scans and exact-head CI, merge if green; keep production activation separate.

Environments: dedicated loopback test databases only for destructive tests. Preserve development data. No real email, customer reply, credential creation, production migration, checkout activation or server cleanup. Production disk/backup capacity and publisher private password remain separate gates.
