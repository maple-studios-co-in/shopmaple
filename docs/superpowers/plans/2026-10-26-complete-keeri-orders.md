# Complete Keeri orders implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Preserve file ownership and TDD evidence.

**Goal:** Convert verified website purchases into normal confirmed Keeri orders with captured advances, later invoice allocation, and a working customer checkout integration.

**Architecture:** ShopMaple remains the customer commerce service. Keeri produces authoritative quotes, reserves stock and owns orders/advance accounting. Existing Keeri admin handles commerce operations; no third dashboard.

**Tech Stack:** Existing Node 22/TypeScript, Next.js/React, Express, Prisma/PostgreSQL, existing Razorpay adapter.

**Spec:** ../specs/2026-10-26-complete-keeri-orders-design.md

## Global constraints

- Invoices later; confirmed orders after verified capture. India/INR with explicitly approved delivery policy.
- RED/GREEN behavior tests, isolated synthetic test databases, no live payments or secrets in git.
- Preserve v1 legacy semantics and disabled preview defaults. New v2 consumer/producer fixtures must agree before integration.
- Keeri branch feature/shopmaple-order-fulfilment from deployed eba9249a. Shop branch codex/commerce-integration retains PR2 history.

## Review focus

- Concurrent retries cannot duplicate customer, order, captured advance or invoice allocation.
- A paid reservation cannot be released twice, expire after transfer or be re-reserved by existing order flows.
- Address/tax changes cannot alter already purchased commercial/document facts.
- Timeout and late capture cannot be falsely presented as unpaid or fulfilled.
- New dashboard data/actions cannot bypass tenant, Orders, Payments or Inventory permissions.

## Task 1 — Keeri transaction and quote authority

Owner: Keeri agent. Files: apps/admin/src/storefront/*, service routes/proxy tests, packages/db/prisma schema/additive migration, inventory transfer contract, invoice allocation/party projections and paid-order guards; corresponding domain tests.

- [ ] Freeze exact v2 quote/order contract and send to Shop agent before consumer implementation.
- [ ] Write failing unit/database tests for policy-bound quote, v2 reservation and idempotent confirmed order/advance creation.
- [ ] Implement authoritative quote and transactional stock ownership transfer with legacy v1 preserved.
- [ ] Write failing invoice-later allocation, immutable-party and prepaid edit/cancellation tests; implement through existing domain contracts.
- [ ] Run focused tests, database invariants and lint/types; report commands and results.

## Task 2 — Shop backend composition

Owner: Shop backend agent. Files: packages/contracts/src/*, apps/api/src/orders/*, commerce-http.ts, keeri-commerce.ts, commerce-runtime.ts, server/worker entrypoints, cart/catalogue capability plumbing, migrations and API tests. Does not own apps/web.

- [ ] Agree exact v2 protocol with Keeri owner, including provider capture evidence/acknowledgement.
- [ ] RED/GREEN normalized customer input, async authoritative quote freeze, cart/idempotency binding and strict transport tests.
- [ ] Wire opt-in configured checkout and bounded worker runner; preserve default preview.
- [ ] RED/GREEN safe public statuses, verified capture/retry behavior and actual Keeri acknowledgement.
- [ ] Expose stable shared checkout/public status types to UI owner and run API verification.

## Task 3 — Customer checkout and staff visibility

Owner: UI agent after shared interfaces freeze. Files: Shop apps/web checkout/status components/routes/tests and cart continuation; new Keeri storefront admin read projection/page/tests if explicitly coordinated with Keeri owner.

- [ ] RED/GREEN India address validation/review, pending/accepted/review states and no browser-paid authority.
- [ ] Add hosted Razorpay handoff only from server-configured public key/order; no SDK secrets or invented success.
- [ ] Add permission-checked staff view or integrate existing Keeri order projections with core agent coordination.
- [ ] Check actual browser states and focused component tests.

## Task 4 — Integration, security and handoff

Owner: root.

- [ ] Run cross-repository producer/consumer fixture and isolated purchase->capture->order->invoice-allocation scenario without real gateway calls.
- [ ] Run full combined tests/types/builds, schema invariants, audit/secret/static checks and review final diff.
- [ ] Update architecture/backend gap inventory and PR evidence with implemented/configured/live distinctions.
- [ ] Keep local preview running and report exact remaining activation gates; never label credentials or gateway sandbox checks complete without evidence.
