# Remaining storefront catalogue payload

Continue the active goal with a bounded read-only performance increment. Preserve original Shopify copy, layout, product order, pricing and incomplete-product handling. Keep the main PDP's full detail and checkout disabled.

- Home: one compact batch per enabled rail; recover individual compact cards after batch failure so one malformed/unavailable product does not erase healthy peers.
- Category: aggregate only enabled section handles once per page and share compact cards across rails. Nimbus and standalone rails read only their selected handles. Preserve known source-only fallback title/image, Price on request and contact destination; unknown handles stay omitted. API failure must remain distinct from an absent product.
- PDP: new strict `GET /api/catalogue/related?category=X`, published exact category, PostgreSQL title/ID order and SQL `take: 5`; return category-bound compact cards, not full records. Web preserves first-five, exclude current ID, then first four.
- Reader: validate category/shape/publication/unique handles/max five before caching, retain six-second headers/body timeout, coalescing, isolated return values and retry after failed reads.

Ownership: API agent owns contracts card schema/export, catalogue-view route and new related API tests; root owns web catalogue reader/cache tests, plan/release/integration; renderer agent owns home/category/Nimbus/PDP consumers and their transport-boundary tests. Only API agent may use dedicated `shopmaple_test` until explicitly released. Preserve development data.

Verification: genuine assertion RED then focused GREEN for each change; integration/full suite, types, build, bundle guard, dependency/staged/history/static scans, independent final review, local built desktop/mobile smoke and exact-head CI before merge. No new dependency, migration, production writes, mail or live commerce. Compare API-to-server bytes and SQL scope separately from browser performance; do not claim CWV improvement from payload measurements.

First publisher remains the user-confirmed `aditya@maplefurnishers.com`; password setup stays private. This does not choose an enquiry alert recipient. Production disk capacity and failed paired backup remain separate release gates.
