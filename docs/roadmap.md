# Current delivery queue — 26 October 2026

The active goal and next work are tracked in [Shop Content and Motion](superpowers/plans/2026-10-26-shop-content-motion.md). This wave adds a protected Shop Admin and restores the original moving Instagram layout. Keeri remains the product/order authority; checkout remains disabled. The older checklist below records previous milestones and must not be read as the current deployment status.

Completed and deployed in PR #17: category copy/order/visibility controls, private media library and transactional publication, and a separately authorized enquiry inbox. The first publisher is `aditya@maplefurnishers.com`; private password setup and enquiry capability approval remain pending. The deployed runtime is `b38d9a0` (same tree as merge `7eda8c6`).

Current increment: gallery keyboard/swipe/load transitions, optional section reveals, source-aligned hero destinations, offline uploaded-media recovery tools, and a [bounded page parity audit](audits/2026-10-26-page-parity.md). Local implementation does not imply deployment.

Priority order remaining:

1. Private publisher activation and production staff workflow verification; decide enquiry access.
2. Resolve merged variant identity/default image mismatch and preserve Shopify presentation copy, without guessing prices or stock.
3. Fix remaining page parity: chairs self-link/route behavior, blog ordering/excerpts/layout, then mobile and remaining states.
4. Install paired database/media backups, restore/reconcile a pair and arrange off-host retention/alerts.
5. Campaign scheduling; enquiry assignment/notes and notification delivery with retries.
6. Measured performance/accessibility; product hover/menu feedback where useful, preserving reduced-motion and source layout.
7. Reviews, newsletter, account/order history and returns integration.
8. Approved shipping/packing, merchant verification and sandbox payment/Keeri order recovery before checkout activation.

Each increment requires assertion-based RED/GREEN evidence, integrated checks, security review and separate deployment proof.

---

# Shop Maple delivery checklist

Updated 25 October 2026. This is the implementation queue for replacing Shopify with the custom storefront and Keeri as the operational source. A checked box means code and its stated checks exist; it does not mean deployed or approved for live sales. Frontend and API remain in one repository. No Medusa.

## Working rules

- New behavior and fixes follow RED → GREEN → REFACTOR, with the expected failing assertion and final verification recorded in the PR. Existing behavior gets characterization tests before it changes; history is not retroactively called TDD.
- Agents own separate files. Database migrations and tests using `shopmaple_test` take a single shared lease. Integrate only after a full combined suite, typecheck, build and security checks.
- Security checks run locally for each integration and in CI on changes. Periodic dependency/secret/static checks complement, rather than replace, threat-based code review. A passing scanner is not proof of absence of vulnerabilities.
- Keep preview mode, noindex and checkout refusal until the release gates below are proven. Never use live merchant transactions or production Keeri data as test fixtures.

## Existing verified foundation

- [x] Next.js storefront and Express API monorepo, PostgreSQL and shared validated contracts.
- [x] Homepage, product, collection, enquiry and five bespoke landing pages; Shopify-aligned desktop/mobile navigation.
- [x] Dated preview catalogue: 85 products / 115 variants; guest cart and idempotent enquiry persistence.
- [x] Offline tenant-isolated Keeri export transformation/import.
- [x] Frozen pricing/order service, payment signature/capture verification and transactional inbox/outbox foundation.
- [x] Baseline: 74 tests, typechecks and both builds passed before this wave; PR #1 merged. Full UI parity, live integrations and deployment remain incomplete.

## Wave 1 — verified; PR #2 open

| Work item | Owner | Acceptance / dependencies | Status |
| --- | --- | --- | --- |
| Protected checkout/status HTTP boundary and raw-body signed webhook intake | Checkout agent | Guest ownership, strict request bodies, server prices, no leaked private fields, signed webhook replay, default-disabled server; RED/GREEN integration tests | Implemented; focused tests passed |
| Durable payment inbox / Keeri order-outbox processors | Worker agent | Atomic leases, crash recovery, fencing, bounded retries, acknowledgement binding and merchant isolation; PostgreSQL concurrency tests | Implemented; focused tests passed |
| TDD project policy and repeatable security gates | Quality agent | Root guidance, PR evidence template, audit/secret/static checks, least-privilege CI and dependency update checks | Implemented; focused tests passed |
| Safe Keeri export fetch boundary | Integrator | Fixed trusted HTTPS destination, credential isolation, no redirects, timeout/size limits, tenant/schema validation; no unverified endpoint activation | Implemented; focused tests passed |
| Combined verification and security review | Integrator | Full test suite, typechecks, builds, immutable-diff security review, CI on the exact PR head | 106 tests, typechecks, builds, scanners and immutable source-diff review passed; PR #2 CI passed |

## Wave 2 — Keeri and payment integration

- [ ] Add or verify a dedicated Keeri service API contract: authenticated full catalogue export, atomic stock reservations/expiry/consumption and idempotent captured-order intake. **Authorized:** user approved dedicated APIs. Implemented in Keeri PR #778 (`feature/shopmaple-service-api`), with local verification complete (5,992 unit tests, 1,278 database tests, lint/types/build and security review); GitHub CI remains the separate merge gate. Consumption into a complete sales order and live configuration remain pending.
- [x] Implement Keeri producer endpoints with tenant-scoped service authorization, minimum public product projection and consistent full-snapshot semantics. Tests reject other tenants, drafts, private media and partial exports. Reviewed publication/media configuration is still required before use.
- [ ] Connect catalogue pull/import with freshness visibility and publication-triggered cache invalidation. Test stale snapshots, replay, source collisions, interrupted imports and retirement.
- [ ] Implement cross-channel stock reservation adapter. Test two buyers competing for the last item, expiry, made-to-order policy and idempotent reserve/consume/release.
- [ ] Connect authenticated order delivery to Keeri. Test lost responses, duplicate acknowledgements, revoked credentials and repeated delivery without duplicate sales orders.
- [ ] Verify the merchant account/gateway currently used by Shopify; configure sandbox credentials outside git. Historical evidence supports Razorpay but does not prove current merchant configuration.
- [ ] Define shipping, tax, serviceability, cancellation and made-to-order purchase rules. No invented zero shipping/tax or stock guarantees.
- [ ] Add customer/delivery details to immutable order snapshots with validation and a retention policy.
- [ ] Build hosted checkout and order-status UI using tested shared API contracts. Browser success never marks an order paid; server verification owns status.
- [ ] Implement ambiguous payment creation recovery, late captures, refunds, cancellation and disputes with operator-visible resolution and audit trails.

## Wave 3 — storefront completeness and performance

- [ ] Compare all remaining Shopify templates and states, including keyboard/mobile, cart, search, errors and empty states; record route-by-route parity gaps.
- [ ] Migrate the complete approved catalogue and exact collection membership; replace remaining Shopify category/product handoffs only when local destinations are verified.
- [ ] Resolve accounts/order history, reviews, newsletter, Instagram and returns integrations; never display fake success for unavailable services.
- [ ] Connect enquiry notifications and authenticated staff handling, including retry, deduplication, retention/deletion and abuse controls.
- [ ] Move catalogue filtering/sorting/pagination into indexed database queries; test combined filters, pagination boundaries and representative catalogue size.
- [ ] Migrate approved media to durable hosting; preserve alt text, responsive image sizing and image priority. Benchmark actual LCP, CLS and INP on staging.
- [ ] Plan Shopify URL redirects, canonical URLs, structured product data, sitemap and search migration. Remove noindex only at release.

## Wave 4 — staging and release gates

- [ ] Choose staging/production host and configure secrets, TLS, trusted proxy/rate-limit behavior, database isolation and worker process supervision.
- [ ] Implement structured redacted logs, health/readiness, queue age/retry metrics, error reporting and actionable alerts.
- [ ] Add migration rehearsal, automated backups and an independently verified restore/rollback drill.
- [ ] Run end-to-end sandbox purchase → verified capture → Keeri order → reservation consumption, plus decline, timeout, duplicate/out-of-order webhook and failed-delivery recovery.
- [ ] Perform final scoped security review and resolve confirmed blockers; verify dependency/secret/static scans on the exact release revision.
- [ ] Verify ordinary browser flows, accessibility and performance on desktop and mobile; document residual gaps and operational ownership.
- [ ] Prepare a concrete DNS/cutover and rollback plan. Deploy/cut over only with the user's release authorization; merging code alone does not replace Shopify.

## External decisions / configuration

Keep credentials out of chat and git. Required before live activation: Keeri endpoint ownership and service identity, authoritative stock policy, gateway merchant/test mode, shipping/tax/serviceability rules, customer-data/retention requirements, notification channel and deployment destination. Independent code work continues while these are resolved.

Related: [architecture](architecture.md), [UI parity](ui-parity-progress.md), [Keeri contract](keeri-integration.md), [orders](order-flow.md), [payments](payments.md).

## Current review links

- [ShopMaple PR #2](https://github.com/maple-studios-co-in/shopmaple/pull/2): commerce boundaries, TDD policy and security CI; source revision `db81bf58` passed the immutable security review with no reportable findings.
- [Keeri PR #778](https://github.com/maple-studios-co-in/Keeri/pull/778): dedicated service APIs, shared stock guard and dependency security updates. Ready for review after local verification; check the PR for current GitHub CI results. Intake remains `pending_commercial_review`, not a completed sales order.
- No production deployment, live payment or Shopify cutover has occurred.
