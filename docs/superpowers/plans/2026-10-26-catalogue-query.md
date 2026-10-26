# Compact Catalogue Queries Implementation Plan

> **For agentic workers:** User-authorized parallel workers have exclusive file ownership; root integrates. TDD steps apply to executable changes.

**Goal:** Remove repeated full-catalogue collection transfers and full product card reads while preserving browsing semantics; repair ordinary cart removal focus.
**Architecture:** Shared strict summary/query contracts and source registry; API computes facets/pagination from one minimal read, web consumes bounded display responses. Full PDP and Keeri authority remain unchanged.
**Tech Stack:** Existing Node22/Next16/React19/Express/Prisma/PostgreSQL/Zod; no migration/dependency.
**Spec:** docs/superpowers/specs/2026-10-26-catalogue-query-design.md

## Global constraints
Original copy/layout/identity/price rules, strict published-only reads, same-variant filters, fail-closed malformed responses, checkout disabled. Dedicated test DB only. API worker owns DB testing until freeze. Root alone fullsuite/build/production reads.

## Review focus
- SQL/ORM selectors must exclude unpublished variants/products and full source/PDP payload.
- Pagination cannot precede membership/filtering; count/facets and null-price/tie semantics must retain behavior.
- Client malformed/mismatched summary cannot revive hidden products or fall back to stale price data.
- Cache/timeout/cancellation/retry remain correct with new transport, including late response bodies.
- Cart focus moves only when a successful removed control still owns it; avoid focus theft on failed writes or shopper movement.

## API/shared — audit_catalogue
- [x] Characterize existing projection/filter/ordering semantics; shared module/registry extraction only while tests green.
- [x] RED real HTTP absence/incorrect behavior for compact collection/card/batch routes and539-item facet/pagination acceptance.
- [x] Implement bounded contracts/minimal ORM queries/public routes; adversarial query/data tests; affected tests/types then freeze/release DB.

## Web — audit_customer_features
- [x] RED existing collection makes all-page reads, compact transport rejected, query mismatch.
- [x] Consume shared contracts/engine, one collection read, exact editorial batches, compact search/saved/menu; preserve original transport safeguards.
- [x] Update boundary fixtures to new real HTTP contract without weakening failure assertions; affected web tests/types then freeze.

## Cart — audit_accessibility
- [x] RED successful ordinary Remove/decrement-to-zero loses focus; include adjacent/empty/no-steal/failure/unmount.
- [x] Implement scoped focus ownership, retain recovery behavior; affected cart tests/types then freeze.

## Root integration
- [x] Independent final-diff review, source-copy/authority check, query/payload measurement.
- [x] Full suite/recovery/types/build/scans and390/1280 browser acceptance, source-appropriate evidence.
- [ ] Commit/exact-head CI/merge and tree comparison; update current backlog and operational status, no premature goal completion.

## Review-driven corrections

Three issues were caught before release and have genuine failing regressions: invalid stored output was classified as cacheable400; clicking nonfocusable content during removal allowed focus theft; shared registry exports added about5KB gzip to initial home JavaScript. Output is now generic500/no-store, pointer/Tab departures cancel restoration, and registry data uses an explicit server subpath. The built-artifact guard is part of CI. See `docs/releases/2026-10-26-catalogue-query.md` for integrated evidence and limitations.
