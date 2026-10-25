# Storefront foundation implementation plan

> For agentic workers: use superpowers:executing-plans to implement this plan task by task.

**Goal:** Deliver a runnable frontend and backend in one repository, with a source-backed storefront, catalogue, persistent guest cart and explicit checkout boundary.
**Architecture:** npm workspaces with apps/web (Next.js), apps/api (Express/Prisma), packages/contracts (Zod/types). Next.js proxies browser API calls; only the API connects to PostgreSQL.
**Tech Stack:** Node 22+, TypeScript, Next.js, React, Express, Prisma 6, PostgreSQL.
**Spec:** docs/architecture.md and the user's instruction to start building with both apps in this repo.

## Global constraints
- No Medusa. Preserve the existing Shopify UI using visual references, not redistributed theme implementation.
- Keeri remains the target product source. This slice uses an explicitly labelled, dated public Shopify preview snapshot until a real Keeri export is available.
- Use the gateway already connected to Shopify. Do not invent payment success or accept money in this slice.
- Integer paise, INR, private guest carts, server-calculated totals.
- No raw store exports, secrets or customer data in the public repository.

## Review focus
- Cart tampering and cross-origin writes must be rejected.
- Concurrent cart updates must not duplicate variant rows; old prices must be recalculated.
- Removed/unavailable items and made-to-order policies must remain visible and actionable, not silently purchasable.
- Unknown collections/products and upstream failures must have real empty/error behavior.
- Mobile menus, variants, filters and cart must work by keyboard and touch.

### Task 1: Contracts, PostgreSQL catalogue and guest cart API
Files: package.json, tsconfig.base.json, packages/contracts/src/index.ts, apps/api/{package.json,prisma/schema.prisma,src/app.ts,src/catalog.ts,src/cart.ts,src/server.ts,test/api.test.ts}, scripts/import-preview.ts.
Interfaces: Product, Variant, Cart schemas; GET /api/products, GET /api/products/:handle, GET /api/cart, PUT /api/cart/items/:variantId (absolute quantity 0..20), POST /api/checkout (503 until implemented). createApp(db, config) returns Express app.
- [x] Write integration tests for catalogue filtering, invalid queries, price tampering, cookie isolation, CSRF, quantity limits, MTO, unavailable products and checkout refusal.
- [x] Run tests and observe missing implementation failure.
- [x] Implement schema/migration, importer and API. Use opaque HttpOnly guest cookie, hashed database token, no-store cart responses, strict origin checks and validation.
- [x] Run the suite against isolated PostgreSQL, typecheck and build the API.
- [x] Commit the API slice.

### Task 2: Matching storefront and working shopping interactions
Files: apps/web/{package.json,next.config.ts,app/**,components/**,lib/**}, PRODUCT.md, DESIGN.md.
Interfaces: consume the shared schemas and HTTP contract from Task 1; frontend owns no commerce price truth.
- [x] Implement server-rendered home, collections/search, product detail and cart using real preview product imagery.
- [x] Preserve cream/burgundy header, centred Maple logo, green category tiles, workshop hero, font families and page spacing.
- [x] Provide filters, variant selection, quantity changes, remove, mobile menu, saved favourites and honest empty/error states.
- [x] Check interactions in a real browser, desktop/mobile layout and production compilation.
- [x] Commit the storefront slice.

### Task 3: Reproducibility and review
Files: README.md, .env.example, compose.yaml, .github/workflows/ci.yml, docs/development.md.
- [x] Document installation, database migration/import, dual-app commands, preview-data limitations and integration boundaries.
- [x] Run tests, typecheck, production builds and API/browser smoke checks.
- [x] Obtain a fresh branch review, fix important findings with regression tests.
- [ ] Commit and push the feature branch with a draft PR; keep the local preview available.

## Execution choices
The user explicitly instructed starting implementation. Execute natively without another design/plan approval round. Work in a managed worktree on codex/storefront-foundation. No live Shopify, Keeri, DNS or payment writes.


## Verification record

The initial code review found cart hydration and importer identity collisions. Regression tests reproduced both before fixes; the automated suite now has 10 PostgreSQL/API tests and 2 React provider tests. TypeScript and both production builds pass. Desktop/mobile browser interactions and screenshot review are separate from automated checks; production performance is not measured.
