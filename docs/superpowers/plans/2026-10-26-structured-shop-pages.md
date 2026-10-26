# Structured Shop Pages Implementation Plan

> **For agentic workers:** Use the user-requested parallel agents with explicit file ownership. Steps use checkbox syntax for tracking.

**Goal:** Allow safe structured custom-page content in Shop Admin while preserving legacy pages and article workflows.

**Architecture:** Optional page blocks reuse the article schema, renderer and editor. Existing transactional content publication validates page destinations and private media. No migration or new service.

**Tech Stack:** Next.js 16, React 19, Express, Prisma, PostgreSQL, Zod and Node.js 22.

**Spec:** `docs/superpowers/specs/2026-10-26-structured-shop-pages.md`

## Global constraints

- Preserve existing source copy, legacy serialization and article behavior.
- Use 1–60 bounded blocks, unique stable IDs, 48 KiB per structured page and 128 KiB per storefront document.
- Only published content is public; no arbitrary HTML or external link targets.
- No database migration, production content mutation or checkout activation.
- Assertion RED before implementation; final integrated suite and security review.

## Review focus

- Page-only publications must not bypass article-only early returns.
- Image/link checks must cover private, missing, tampered and canonical-path cases atomically.
- Conversion and restoration must not silently lose original text or current block edits.
- Shared editor extraction must preserve article focus, private preview and session behavior.
- Legacy readers/rendering, source defaults and page switching must remain compatible.

## Task 1: Contract and API — contract agent

Own `packages/contracts/src/authored-articles.ts`, `content.ts`, `index.ts`; `apps/api/src/admin/authored-articles.ts`, `content.ts`, `media.ts`; new structured-page contract/DB tests.

- [x] Characterize legacy pages/articles, then RED through the existing storefront parser for optional page blocks, bounds and invalid content.
- [x] Export `authoredBlocksSchema` (same article block array validator) and add optional page blocks with a conditional 48 KiB page cap.
- [x] RED page-only missing link and managed-media publication, permissions/CSRF/version conflicts, rollback and same-snapshot destinations using guarded dedicated test DB.
- [x] Extend shared destination collection and media traversal without changing legacy banners or article error behavior.
- [x] Run focused and full API tests; release DB lease and report evidence.

## Task 2: Shared editor and page controls — editor agent

Own `apps/web/components/admin/field.tsx`, `authored-block-fields.tsx`, `authored-article-fields.tsx`, `forms.tsx`; new page-editor tests and article tests only if required to preserve observed behavior.

- [x] Run article and legacy page characterization before extraction.
- [x] RED page conversion, blank required content, safe preview, add/edit/reorder/remove, page switching, limits and confirmation before restoring retained body.
- [x] Extract `Field` with a forms re-export; extract shared `AuthoredBlockFields` with value/onChange/session?/onExpired? and configurable block label.
- [x] Preserve article controls and labels; wire page blocks with independent ephemeral state per selected page, private preview and explicit conversion/reset.
- [x] Run affected editor suites and typecheck; report evidence without committing.

## Task 3: Public rendering — renderer agent

Own `apps/web/components/content-page.tsx`; new `apps/web/test/structured-pages.test.tsx` and related renderer tests only.

- [x] Characterize exact legacy markup, then RED ordered block rendering, escaped text, safe media and suppression of retained legacy body.
- [x] Render optional blocks through the existing semantic article body, preserving banner position and legacy output.
- [x] Verify published-only reader/route behavior, metadata and original fallback through existing real components and transport boundaries.
- [x] Run affected rendering tests and report evidence.

## Task 4: Integration — parent

- [x] Review shared boundaries and final security-sensitive diff independently.
- [x] Verify editor desktop/mobile layout and keyboard behavior; add scoped CSS only for observed defects.
- [ ] Run complete suite/recovery tests, types/build and final-commit security checks.
- [ ] Create PR, inspect exact-head CI, merge when passed and compare fetched main tree.
- [ ] Update backlog with implemented-versus-deployed evidence; keep full goal active.
