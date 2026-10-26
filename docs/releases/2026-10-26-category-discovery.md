# Category catalogue discovery — 26 October 2026

## Scope and behavior

The bare `/collections/chairs` page previously rendered only the legacy Shopify editorial template. Its footer linked to the chair-filtered all-furniture page, and explicit filter/sort/page query parameters could already open the chair catalogue. The complete category catalogue was therefore difficult to discover from the category destination itself.

The page now retains its editorial sections and appends the existing chair catalogue listing, with a hero link to `#collection-products`. It requests the canonical `chairs` collection, rather than the narrower `chair-collection` editorial membership. Its existing filters, sorting, counts, compact product cards and pagination remain in use. The embedded listing uses an h2 so the original editorial heading remains the page's sole h1; its existing visual heading size is retained. Scoped hero CSS preserves the description's desktop two-column placement and mobile stacking after the link is added.

Tracking-only URLs retain both editorial content and the appended listing. Explicit browsing parameters retain the existing grid-only route behavior, including existing reset and pagination destinations. `/pages/chairs`, its six category tiles and Best Sellers destination, other category landings, source editorial copy, campaign content and catalogue contracts are unchanged. Missing prices continue to display `Price on request` through the existing product card.

## Test-first evidence

Node v22.21.1, existing dependencies. Commands below ran from `apps/web` with the Node 22 executable directory on PATH.

Characterization:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/legacy-chairs.test.tsx test/collections.test.tsx
```

Result: 12 passing tests before implementation.

RED and GREEN:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/legacy-chairs.test.tsx
```

RED: 7 passed, 1 failed. The new observable route test failed with `The editorial page must also expose the complete chair catalogue` because `#collection-products` was absent. GREEN after implementation: all 8 passed.

The regression exercises the real route, rendered components and catalogue-response parser; only API HTTP transport is replaced. Independent fixture data contains 26 chairs outside the curated collection, one unrelated table and one unpriced chair. Assertions cover the existing editorial heading, single h1, embedded h2, hero jump target, 26-item total, 24 rendered cards on page one, unrelated-product exclusion, `Price on request`, filter form destination, and following the actual Next link to the remaining two chairs. It runs both bare and tracking-only URL cases. Existing tests cover filter/sort/reset compatibility and distinct editorial variants.

Affected integration checks:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/legacy-chairs.test.tsx test/legacy-chairs-motion.test.tsx test/collections.test.tsx test/internal-navigation.test.tsx test/category-campaigns.test.tsx test/category-content.test.tsx test/collection-image-sizing.test.tsx test/product-card-boundary.test.tsx
npm run typecheck
```

Results: 32 tests passed; web typecheck passed; `git diff --check` passed.

### Integration regression found and corrected

Independent review identified an affected test omitted from that initial focused set: `test/compact-catalogue-consumers.test.tsx`. Running it reproduced 4 passing tests and 1 failure in `parseCataloguePage`. Its previous bare-Chairs transport fixture returned a cards envelope for every request and asserted that only curated cards were read, so it did not model the intentional new compact category-page request. This was a real integration-test regression from the change; the initial 32-test result was not a complete affected-suite result.

The revised test returns a valid canonical `chairs` page envelope and asserts exactly one compact category-page request, page 1, limit 24, title sorting, and no search/category narrowing. It verifies the returned catalogue card reaches the listing, editorial batches remain nonempty and bounded to 50 handles, handles are unique across all batches, source editorial handle membership is preserved, and no full-product or unrelated catalogue reads occur. The behavior change is retained rather than bypassed.

Final focused command:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/compact-catalogue-consumers.test.tsx test/legacy-chairs.test.tsx test/legacy-chairs-motion.test.tsx test/collections.test.tsx test/internal-navigation.test.tsx test/category-campaigns.test.tsx test/category-content.test.tsx test/collection-image-sizing.test.tsx test/product-card-boundary.test.tsx
```

Result: 37 tests passed, 0 failed.

## Verification limits and handoff

`npm run security:check` from repository root failed in its first dependency-audit step because the npm registry certificate could not be verified (`unable to verify the first certificate`). No TLS settings were weakened. The chained secret/static scans did not run, and their executables were absent from this agent's inherited PATH. This is an unpassed environmental gate, not a clean scan.

The integrating agent owns the full repository suite, build and final security checks after parallel changes land. No production endpoints were called, no production mutation or deployment was performed, no dependencies were installed, and no caches were deleted. No commit was created by this agent.

Desktop/mobile browser layout and focus acceptance remain to be performed. Local route tests do not certify production product counts, API category completeness, image layout or visual parity. The bare editorial route now makes one additional compact collection request alongside its existing compact editorial-card requests; both use the existing bounded catalogue transport/cache behavior. Existing unavailable-catalogue error handling remains in force.
