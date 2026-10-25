# Current delivery queue — 26 October 2026

The active goal and next work are tracked in [Shop Content and Motion](superpowers/plans/2026-10-26-shop-content-motion.md). This wave adds a protected Shop Admin and restores the original moving Instagram layout. Keeri remains the product/order authority; checkout remains disabled. The older checklist below records previous milestones and must not be read as the current deployment status.

Completed and deployed in PR #17: category copy/order/visibility controls, private media library and transactional publication, and a separately authorized enquiry inbox. The first publisher is `aditya@maplefurnishers.com`; private password setup and enquiry capability approval remain pending. The deployed runtime is `b38d9a0` (same tree as merge `7eda8c6`).

PR #18 is merged and deployed: gallery keyboard/swipe/load transitions, optional section reveals (default off), source-aligned hero destinations, offline uploaded-media recovery tools, and a [bounded page parity audit](audits/2026-10-26-page-parity.md). Runtime 9522ab8 has the identical tree to merge 8a29804; 350 tests, CI, scanners, independent review, restored database backup and public/browser probes passed. Automated security inventory metadata remained unavailable; all 19 changed files received manual review.

PR #19 is merged and deployed: Shopify display fields after exact matches, honest variant photo/default/item-code presentation, original blog index layout/excerpts/order and removal of the obsolete Chairs self-link. Runtime26a7826 matches merge99efc65;369tests, CI, scanners, independent review, restore-tested backup and public/browser checks passed. All539products/1050variants and identity/pricing/stock hashes were preserved.

PR #20 campaign scheduling and PR #21 original Shopify product disclosure copy are merged and deployed together at runtime26bd9aa, identical tree to main8e83717. Application verification:414 tests, types/builds, CI, scanners and independent review. Operational importer7 tests and disk guard9 tests passed. Exactly186 source PDP captures persisted;539 products/1050 variants and identity/price/stock hashes were preserved. Public and mobile browser checks passed. Publisher activation remains pending.

PR #22/#23 operations release: [paired database/media backups](releases/2026-10-26-paired-backups.md) are installed at tool revision3906413, with a verified production restore and one-time off-host copy. The 02:47 UTC daily schedule now invokes the paired job; its next scheduled run and automated off-host retention/alerts remain pending. A fresh [category-route parity audit](audits/2026-10-26-category-routes.md) confirms `/collections/chairs` has its own legacy source template, distinct from `/pages/chairs`; a redirect would not satisfy parity.

PR #24 is merged as39ff224 after464 local tests and all eight exact-head CI checks ataa00108. It is not deployed. It restores the legacy Chairs editorial route, article images/dates, responsive Nimbus artwork, typed Our Story controls and dynamic reduced-motion video pause. Desktop/mobile browser checks passed. See [verification and remaining gaps](releases/2026-10-26-content-parity.md).

PR #25 is merged asb7df7a1 after all eight exact-head CI checks at91bcaf1. Its eight groups of [homepage content controls](releases/2026-10-26-home-content.md) preserve source copy and published-only reads.475 integrated tests, types/build, scanners and independent review pass; it is not deployed. Existing strict-schema rollback compatibility applies to both storyPage and homeDetails. Server capacity and private publisher setup remain unresolved.

PR #26 is merged as7aec707 after all eight exact-head CI checks at26d276a. The [Nimbus increment](releases/2026-10-26-nimbus-content.md) adds nine section order/visibility controls, copy editing and source typography/paragraph fidelity.492 integrated tests, types/build, scanners, independent review and bounded desktop/mobile browser checks pass. Not deployed.

PR #27 is merged as65113a5 after all eight exact-head CI checks atdec9a40. The [Contact, Bulk Enquiry and Returns increment](releases/2026-10-26-service-pages.md) adds typed existing-page content controls while preserving forms, fixed destinations and operational warnings.510 integrated tests, types/build, scanners, independent review and bounded desktop/mobile checks pass. Not deployed.

PR #28 is merged as284be7a after eight exact-head CI checks atf3c85e6. The [policy/blog increment](releases/2026-10-26-editorial-content.md) adds sparse structured copy controls for the existing policies, blog titles and articles. Original text and layouts remain defaults, and imported tables now render valid structure with readable keyboard scrolling.536 integrated tests, types/build, scanners, independent review and bounded browser checks pass. Not deployed.

PR #29 is merged asf1fe854 after eight exact-head CI checks atbf8c76e. The [homepage merchandising increment](releases/2026-10-26-home-merchandising.md) adds two product rails and category/offer tile controls. Staff select and reorder catalogue handles, edit tile artwork and canonical collection destinations, and save drafts through the existing publishing workflow. Original source defaults remain; Keeri prices and stock are not editable in this CMS.557 tests, types/build, scanners, independent review and bounded browser checks pass. Not deployed.

The [template artwork increment](releases/2026-10-26-template-artwork.md) implements grouped controls for 21 existing Homepage, Nimbus and Our Story placements, including six responsive desktop/mobile pairs. 577 tests, types/build and bounded browser checks pass; final security, CI and merge are pending. Sparse overrides preserve original source imagery and allow restoring a placement's original. Uploaded media uses the existing private library and transactional publisher boundary. Decorative icons, city artwork, video files, article creation and broader service/commerce work remain separate.

Priority order remaining:

1. Private publisher activation and production staff workflow verification; decide enquiry access.
2. Deliberately reconcile remaining duplicate variant identities without guessing prices or stock. Source PDP rich-text import is deployed.
3. Verify remaining route/mobile/state parity, including the source Chairs collection landing route. Blog and obsolete self-link fixes are deployed.
4. Observe the installed paired-backup schedule and arrange automated off-host retention/alerts. Resolve server capacity before another full application release.
5. Enquiry assignment/notes and notification delivery with retries. Campaign scheduling is deployed.
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
