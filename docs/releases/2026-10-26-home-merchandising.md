# Homepage merchandising — 26 October 2026

Status: locally verified; exact-head CI and merge pending. No production deployment or public copy publication. Checkout remains disabled.

## Staff and storefront behavior

Shop Admin → Merchandising manages the existing Bestsellers and Chairs product rails and the category/offer tiles. Staff search the published catalogue, page through results, select products, and reorder or remove selections. Each list accepts up to12 entries. Prices, stock, variants and product records remain catalogue-owned. A product selected earlier can subsequently disappear or become unpublished; the public renderer omits it and retains the existing honest unavailable state if no products remain. Staff can hide whole sections through the existing Homepage visibility controls.

Tile controls expose title, canonical collection handle, approved artwork, image description, visibility and ordering. New tiles start disabled and require valid artwork before saving. Offer titles identify tiles for staff; the original storefront layout shows the offer artwork rather than an additional text heading. Links always target the new store's local collection routes. Collection handles are syntax-validated, not checked for existing collection membership.

The optional homeMerchandising object preserves legacy documents. Its resolver clones the original six categories, four offers and both six-product rails; browsing without editing does not materialize overrides or dirty the draft. No original website copy, source artwork or default product selection was rewritten. Existing top-level section order and visibility remain authoritative.

All edits use the existing explicit Save draft/Publish workflow, publisher role, CSRF, optimistic version and revision history. Conflicts preserve local changes. The contract rejects duplicate identities, invalid slugs, unsafe images, blank/control-character text, unexpected fields and oversized lists; the complete document remains capped at128KiB. Category and offer uploads join the existing transaction that verifies files before making them public, including images in disabled tiles. Missing references/files reject publication without exposing other draft images or changing the published revision.

## TDD and review evidence

- Contract/defaults: RED rejected valid merchandising; cloning/default resolution and adversarial boundaries covered. Focused5/5 passed.
- API: RED returned404 for tile media after publication, incorrectly allowed a missing hidden image and failed to reject a missing file. New cases and existing media/content suite32/32 passed on dedicated loopback test PostgreSQL.
- Renderer: original behavior characterized first. RED showed ignored configured tiles/products and empty lists reverting to originals. An additional RED caught an unpublished product rendered from a transport response. Focused5/5 and affected15/15 passed.
- Admin: RED showed absent Merchandising navigation. A later boundary RED sent81 search characters where the API supports80. Focused7/7 cover real component edits, media selection, keyboard focus, safe payloads, sibling preservation, CSRF/version binding, conflicts, search errors/retry/pagination, stale results, bounds, legacy cleanliness and invalid payloads.
- Responsive regression: a static HTML fixture rendered the real merchandising component with a valid200-character handle and actual admin CSS. At390px, inherited flex styling produced a1314px-wide document. Scoped metadata wrapping and action wrapping reduce the document to390px; at1280px it remains1280px. This is a layout fixture, not authenticated production acceptance.

Commands (Node22):

```sh
cd apps/web
../../node_modules/.bin/tsx --tsconfig test/tsconfig.json --test test/home-merchandising-contract.test.tsx test/home-merchandising-render.test.tsx test/admin-home-merchandising.test.tsx
cd ../api
../../node_modules/.bin/tsx --env-file=../../.env --test --test-concurrency=1 test/admin-home-merchandising.test.ts test/admin-content.test.ts test/admin-media.test.ts
cd ../..
npm test
npm run test:deploy:db # requires guarded disposable recovery database configuration
npm run typecheck
npm run build
npm run security:check
npm run security:secrets:staged
```

Raw development evidence is retained privately under `.local/home-merchandising/`. Final verification after the responsive fix passed552 tests plus five separate database recovery cases (557 total:208 API,291 web,58 deployment/recovery), types and production builds. Dependency, redacted history/staged-secret and static checks pass; Semgrep ran74 rules on144 targets with zero findings. Independent review accounted for every changed source/test file and found no open actionable issue after the responsive correction. A temporary concurrent-development frontend run failed an incorrect checkbox-as-button test selector; that fixture was corrected without changing the behavior assertion, and subsequent frontend runs passed. Existing experimental timer/image-stub warnings remain visible in logs. Scanners and this manual review are not an exhaustive security assessment.

The rebuilt homepage was checked at1280px and390px: six category tiles, four offers and both original six-product sequences remain, with zero links to the old shop domain and no document overflow. Mobile category tiles use two169px columns; keyboard Tab moves from Sofas to Dining Chair. The local API4100 and web3000 run the new build. Static admin layout and component/database tests supplement these checks; real production staff browser acceptance still requires private account setup. Final-commit scans and exact-head CI remain separate merge gates.

## Recovery and outstanding gates

No dependency or database migration is introduced. Older strict-schema binaries reject documents containing homeMerchandising. After saving such documents, use a compatible binary or deliberate content-only recovery; do not rewind commerce/enquiry data as routine application rollback. Keep the paired database/media backup available.

Production application rollout remains pending server capacity resolution. The first publisher is aditya@maplefurnishers.com; private password setup and live staff acceptance are pending. This increment does not create production accounts or change catalogue/payment/shipping configuration. Remaining whole-goal work includes new article authoring, additional page/media controls, measured performance/accessibility, remaining source fidelity, enquiry workflows, customer services, catalogue reconciliation, backup operations and commerce readiness gates.
