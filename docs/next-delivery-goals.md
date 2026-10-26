# ShopMaple next delivery goals

Created 26 October 2026. Parent outcome: a discoverable, manageable storefront with a verified purchase flow backed by Keeri. Preserve original Shopify copy and accepted Figma changes. Missing product data must remain explicit, not invented.

## Tracking boundary

The user requested a new goal with smaller goals and parallel execution. The Codex goal tool rejected creation because this chat already has an unfinished, usage-limited goal. That goal has not been marked complete or replaced. This document tracks the next delivery milestones; it does not claim a new unattended goal was registered. Resuming automatic goal execution requires the user to resume the existing goal in Codex.

## Starting point

Release 77d829e is the last verified live storefront release (PR 51, main tree e91c4a7). The preceding deployment verified 539 distinct public products, 1,050 variants and 332 category fills. These are dated deployment facts, not a fresh production audit. Checkout remains disabled. Current work is on codex/store-next-milestones and is not deployed.

## Milestones and smaller goals

| ID | Goal | Acceptance evidence | Owner / state |
| --- | --- | --- | --- |
| G1.1 | Complete Chairs discovery without removing its original editorial layout | Full relevant catalogue, pagination, filter/sort links, honest price placeholders, desktop/mobile review | Implemented and locally verified; not deployed |
| G1.2 | Verify remaining category routes and unmatched products | Route/query audit; all published products remain discoverable through All Furniture/search; avoid guessed category assignments | Reviewed: other collection routes already use dynamic queries; named source collections and /pages routes remain intentionally curated |
| G2.1 | Establish the actual checkout readiness boundary | Source-backed matrix separating implemented services from configured runtime and live provider proof | Checkout agent: matrix completed |
| G2.2 | Bound payment provider response consumption | Oversized/stalled response tests; unknown payment-order outcomes stay uncertain; no automatic POST retry | Implemented, tested and independently reviewed; not deployed |
| G2.3 | Complete Keeri shipping quote authority | Authenticated Shiprocket integration, serviceability, approved packing/courier facts, tested invalid/missing-rate rejection | Existing Keeri adapter verified in source; quote integration and package/rate policy remain pending |
| G2.4 | Implement full-payment made-to-order fulfilment policy | Separate MTO from scarce-stock holds; per-product dispatch policy without fabricated dates; cross-service tests | Pending design against current Keeri implementation |
| G2.5 | Compose gated checkout and supervised recovery workers | Explicit config validation, uncertain payment recovery, captured-order handoff/replay, operator resolution | Pending G2.3–G2.4 and provider sandbox readiness |
| G2.6 | Complete customer checkout/status and sandbox journey | Quote/address review, hosted payment, correct pending/confirmed statuses; duplicate/late/lost-response cases | Pending upstream gates; production checkout stays disabled |
| G3.1 | Reconcile Shop Admin capabilities and readiness | Identify existing publishing/media/page features, activation gaps and enquiry notification state | Source audit completed; private publisher setup and delivery verification remain operational gates |
| G3.2 | Complete bounded admin usability gap with TDD | Protected staff workflow regression tests; no broad access grants or false notification success | Inbox no longer depends on draft availability; implemented/tested/reviewed, not deployed |
| G3.3 | Activate publisher and enquiry delivery | Private publisher setup; explicit capability; sender configuration; authenticated staff/browser and delivery evidence | Pending readiness facts and private setup; no live test messages |
| G4.1 | Close remaining Figma/Shopify UI parity gaps | Route/mobile/state checklist, source copy retained; destination art resolved from authoritative assets | Pending; exact city photography remains open |
| G4.2 | Verify interactive performance/accessibility | Measured page loading, keyboard/touch controls, reduced motion, image/video lifecycle | Pending bounded visual/performance review |
| G5.1 | Run integrated quality/security gates | Full suite, types/build, dependency/secret/static scans, independent review | 1,067 tests, types/build and independent review pass; static/history secret scans pass; dependency audit blocked by certificate trust |
| G5.2 | Resolve deployment capacity and operational evidence | Adequate free space, backup/restore and rollback, worker/alert ownership, off-host backup schedule proof | Pending; last deployment had only ~845 MiB free |
| G5.3 | Release and verify exact revision | Exact-head CI, immutable artifact, staged/live checks, normal public browser and catalogue evidence | Pending all applicable gates; no deployment claimed |

## Execution rules

- Parallel agents own distinct files. Shared contract/schema changes and destructive test-database runs require coordination.
- Every behavior change records a meaningful failing assertion before implementation, then focused GREEN and integrated checks. Prose gets factual review, not artificial tests.
- Keeri remains authoritative for products, stock, orders and delivery. Shop Admin manages presentation/enquiries; do not create a competing inventory dashboard.
- Keep secrets private. No real payments, stock changes, customer test messages or production orders in automated verification.
- Do not weaken TLS or checkout guards to satisfy a check. Record environmental failures separately.
- A completed code task is not a deployed feature. Update each milestone with evidence and remaining inputs.

## Increment evidence

- [Category discovery](releases/2026-10-26-category-discovery.md)
- [Checkout readiness and provider hardening](releases/2026-10-26-checkout-next.md)
- [Admin readiness and inbox resilience](releases/2026-10-26-admin-next.md)

## Integrated verification of this increment

- `npm test`: 366 API, 648 web, 53 deployment/backup tests passed (1,067 total).
- `npm run typecheck` and `npm run build` passed under Node 22.21.1. Local web server restarted on port 3000 after the build.
- Independent reviews of the payment, collection and admin diffs found no remaining concrete regressions. An affected compact catalogue fixture initially failed after the deliberate new page request; it was corrected to assert the new request contract and bounded editorial batches before the full-suite pass.
- Semgrep: 74 rules, 182 targets, zero findings. Gitleaks history: 83 commits, no leaks. Dependency audit failed certificate verification against registry.npmjs.org; no TLS bypass, clean-audit or release claim.
- Local browser verification: desktop 1280 px, single editorial h1 and embedded h2 listing; hero jump targets the complete listing; Next opens page 2; mobile 390 px has no horizontal page overflow and its filter/clear flow returns to page 1. Local fixture currently has 35 chair results; this is not the production category count. Existing local cart/saved state was preserved.
- Credentials, staff capabilities, payment activation, Keeri data and production services were not changed. This increment remains local pending security/CI/release gates.
