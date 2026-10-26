# Product-card payload and remaining acceptance

Previous goal turn made concrete progress: PR39 merged after786tests, independent review, final scanners and all eight exact-head checks. Fresh main equals its tested tree. This increment continues the complete storefront/CMS goal; live checkout remains disabled.

## Product-card boundary

Full product records currently cross into client collection/card components, carrying descriptions, extra galleries, source metadata and complete variants. Introduce an explicitly projected card model containing only the identity, display image and derived display price/compare-at/from/options state. Keep original visible copy, links, saved state and image sizing. Full records remain available for server collection membership/facets/filtering and product-detail interactions.

Characterize null prices, zero prices, mixed known/unknown variants, equal versus different prices, compare-at ties, option counts, links and favourites before refactoring. Observe genuine behavioral RED for omitted surplus fields at real server-to-client callsites, not just a type change. Project explicitly at every card boundary; never pass a full record under a narrower type. Client favourites may project after the existing API validation, but this does not reduce that API response transfer. No API/shared schema change is planned.

## Parallel work

- Card agent owns helper/types, card/listing/favourites and server card callsites plus tests.
- UI auditor independently identifies material remaining route/state/fidelity gaps; read-only until ownership is assigned.
- Operations auditor diagnoses production capacity with bounded read-only metadata. No removal/restart/write authority is granted by this investigation.
- Integrator owns baseline/final response measurements, review, complete suite/build/security/CI, browser checks and backlog/release evidence.

## Verification

Measure identical locally built routes before/after: /collections/storage, /, /products/aero-dining-chair and /favourites. Count full HTML response bytes and deterministic gzip as document payload evidence, separate from JavaScript and CWV. Preserve rendered card text/links and full product details. Browser check selection/favourites/density/filter navigation at suitable desktop/mobile sizes. Run full tests, guarded recovery checks, typecheck, Node22 build, dependency/history/staged-secret/static checks and independent review before exact-head CI/merge.

Production capacity, private publisher setup, off-host operations and commerce gates remain unresolved. Do not claim that an optimized local response resolves catalogue completeness or deployment. Keep the full goal active.

## Added source-backed search parity

Read-only comparison of Shopify's Aera page established a rich Search dialog: Search placeholder/title, Recently viewed/Clear, Products, Reset search, View all, live result count and exact no-match feedback. Desktop reference is672px wide with four147px cards and a scrollable panel. Local Header only had an input/submit. This is a material remaining UI gap, so the UI agent now owns a dedicated search component/styles/history helper/tests plus Header wiring and a narrow product-visit component. Card projection files stay frozen.

Load search only while open. Store at most8canonical recently viewed handles locally, never search queries, full product data or customer information. Storage denial/corruption must not break browsing. Resolve current public product data rather than cached prices. Bound network and body reads, debounce queries, cancel stale/closed work, expose explicit retry and preserve input/focus. Use keyboard-accessible native links and semantic named sections. Keep all result/navigation destinations on local collection/product routes. Existing catalogue substring matching differs from Shopify fuzzy matching; do not claim algorithm parity. No new API is planned.

Next separately tracked findings: saved-furniture requests lack a deadline/inline retry; single-option PDPs can show misleading missing-option-photo text despite a usable gallery. These are not silently folded into this assignment.
