# Shop Content and Motion Implementation Plan

> **For agentic workers:** Use the user-requested parallel agents with separate file ownership. Steps use checkbox syntax for tracking.

**Goal:** Deliver a protected content dashboard and accurate, accessible storefront motion, while tracking remaining storefront/commerce work.

**Architecture:** Typed published content drives server-rendered storefront components. Same-origin Express endpoints manage session-authorized drafts and immutable revisions in the isolated shop database. Keeri stays the commerce authority.

**Tech Stack:** Existing Next 16, React 19, Express 5, Prisma 6, PostgreSQL and Node 22; native CSS/scrolling for motion.

**Spec:** `docs/superpowers/specs/2026-10-26-shop-content-motion-design.md`

## Global constraints

- Original Shopify copy and approved contact overrides remain defaults.
- No public signup, arbitrary HTML/CSS, unbounded media fetches or customer-data reads.
- No checkout activation or changes to Keeri authority.
- All new behavior follows assertion-based RED/GREEN; real dedicated DB tests only.
- Security scans and immutable diff review are release gates.

## Review focus

- Draft leakage via SSR/public cache: public response and HTML tests.
- Session/CSRF/replay/role downgrade: HTTP adversarial tests with real session persistence.
- Simultaneous edits/publications: real CAS transaction tests.
- Malicious content and conflicting routes: contract/parser plus rendered escaping tests.
- Motion interruption, reduced-motion changes and JS failure: component lifecycle/keyboard tests plus browser checks.

## Tasks and ownership

### 1. Shared content and storefront integration — parent

Files: `packages/contracts/src/content.ts`, `apps/web/lib/content-defaults.ts`, `apps/web/lib/content.ts`, `apps/web/components/content-page.tsx`, existing homepage/section/campaign/custom-page routes and focused content tests.

- [x] Write failing contract tests: reject unsafe links, media, duplicate keys, reserved slugs and oversized content while accepting source defaults.
- [x] Implement `storefrontContentSchema` / `StorefrontContent`; export from contracts.
- [x] Write failing rendering/read tests: published content controls order/visibility/copy; drafts never appear; unavailable service preserves defaults; safe custom-page output escapes markup.
- [x] Implement default source content and fresh public reader, homepage mapping and custom page renderer; wire agent motion components.
- [x] Focused contract/render tests and integrated suite/types passed; final release build/scans tracked below.

### 2. Protected content API — backend agent

Files: `apps/api/src/admin/**`, `apps/api/src/app.ts`, Prisma schema/migration, dedicated API/DB tests, private bootstrap CLI.

Interfaces: `/api/admin/login`, `/session`, `/logout`; GET/PUT `/api/admin/content`, POST `/content/publish`, GET `/content/revisions`, POST `/content/rollback`; GET public `/api/content/storefront`.
Document response `{version,draft,publishedVersion,updatedAt}`; absent document is version 0 with null draft. Writes include `expectedVersion`. Public output `{version,content}` excludes draft. Login/session output `{user:{id,email,role},csrfToken}`. Session mutation header `X-CSRF-Token`.

- [x] RED anonymous draft read, login/session and write-role/CSRF behaviors.
- [x] GREEN auth/session and isolated models; test expiry/logout/fixation/role downgrade/rate limits.
- [x] RED draft/publication isolation, stale/concurrent writes, restore-as-draft and content validation.
- [x] GREEN transactions/revisions; run dedicated DB and API suites.
- [x] Document secure owner provisioning and deployment rollback; independent final security review.

### 3. Shop Admin forms — dashboard agent

Files: `apps/web/app/admin/page.tsx`, `components/admin/**`, `styles/admin.css`, `test/admin-*.test.tsx`.

- [x] RED login/error/session states using real components and transport-only mocks.
- [x] GREEN login shell with no secrets in SSR/storage.
- [x] RED section movement/edit/save, conflict handling, publisher-only publication and revision restore.
- [x] GREEN accessible form tabs and explicit draft/published status; local preview without public draft URLs.
- [x] Run focused UI tests and review against backend contract.

### 4. Motion parity — motion agent

Files: `components/motion-rail.tsx`, `styles/motion-rail.css`, `data/instagram-posts.json`, approved local media, `home-carousel.tsx`, dedicated motion tests.
Exports `InstagramRail({posts,autoplay?})`, `MovingCities({children,autoplay?})`; parent wires existing section wrappers.

- [x] Capture verified original 24-post assets/layout; preserve original links/copy.
- [x] RED controls, autoplay suspension, reduced-motion, focus and cleanup behavior.
- [x] GREEN progressive native rails, six desktop Instagram cards, mobile source layout.
- [x] Browser verified 24 posts, 6 desktop / 2 mobile columns, full-width row, manual/pause controls and no page overflow.

### 5. Integration and release — parent

- [x] Verified agent boundaries and recorded RED/GREEN evidence in the release note.
- [x] Complete test suite, types, builds, dependency/secret/static scans and final security review.
- [x] Local browser verified draft/save/publish/restore using an isolated synthetic staff fixture; no production test content/orders. Final logout regression verification remains part of the release gate.
- [x] PR/CI/merge then backup/migration/runtime verification if production setup is ready; otherwise clearly separate implemented from activated.
- [ ] Update this backlog and goal; do not mark the broader goal complete while roadmap work remains.

## Next increments

- [ ] Existing-page layouts and copy controls, media library/uploads and scheduling.
- [ ] Shop enquiry CRM inbox, assignment, notes and team notification integration.
- [ ] More product image transitions, menus and reveal effects with performance evidence.
- [ ] Source catalogue refresh and complete photos/details/price-basis normalization.
- [ ] Shipping/merchant/payment/Keeri order/recovery gates and sandbox proof before checkout activation.


## First release evidence

PR #16 merged to main 76a6e21; reviewed runtime 67a05d3 deployed with identical tree. 268 integrated tests plus 4 deployment database tests, typechecks, builds and scanners passed. Database backup restored to disposable database with matching counts. Public store and admin login checked separately. Publisher account activation remains pending private setup; no production content or users were seeded. See docs/releases/2026-10-26-shop-content-motion.md.

## Current increment: category controls, media and customer enquiries

- [x] Category agent: source-preserving sofas/tables/chairs controls; stable section and campaign identities, title/copy/visibility/order edits. Assertion RED then focused GREEN.
- [x] Inbox agent: separate deny-by-default enquiry capability, metadata-only paginated list, authorized detail and versioned review audit. No outbound messages.
- [x] Media agent: bounded authenticated image uploads, persistent private originals normalized to WebP, library/picker and transactional publication. Final adversarial checks in progress.
- [x] Root: compatible content normalization, responsive artwork rendering, forms/tabs, models/migration and publishing hook.
- [x] PR #17: 311 integrated tests plus 4 deployment DB tests, types/builds/scanners and final review; local media publish/private preview and mobile browser checks.
- [x] PR #17 CI passed and merged as 7eda8c6; identical b38d9a0 runtime deployed with persistent media root and restored DB backup evidence.
- [ ] Activate owner privately and grant enquiry access only after pending scope decision.

Remaining after this increment: assignment/notes/notifications, campaign scheduling, product gallery/menu/reveal effects and measured performance, remaining page parity, catalogue completeness, shipping/payment/Keeri checkout gates. Checkout stays disabled.


## Current increment: interactions and media recovery

- [x] Gallery keyboard arrows, horizontal swipe, load-gated image dissolve and fallback; source hero destinations restored. Focused RED/GREEN recorded.
- [x] Optional section reveals controlled by existing CMS field, default off; visible without JavaScript, reduced-motion and focus interruption. Focused RED/GREEN recorded.
- [x] Offline private media backup/verify/restore tools, adversarial filesystem tests and runbook; nightly paired integration still pending.
- [x] Bounded source/live page audit with remaining catalogue, chairs and blog parity findings.
- [x] PR #18: 350 tests, types/builds, scanners and independent review; all CI passed, merged 8a29804, identical runtime 9522ab8 deployed with restored backup and public/browser proof.

## Current increment: source copy and remaining page parity

- [x] Exact mapped products/variants retain original Shopify display copy; no identity or price inference. Unit/database RED then GREEN.
- [x] PDP mapped-photo default, explicit variant precedence, honest missing-photo state and public item codes for duplicated names; RED then GREEN.
- [x] Blog newest-first source excerpts/artwork and editorial layout; chairs obsolete self-link removed; RED then GREEN.
- [ ] Integrated build, security review, browser and release evidence.


## Current content coverage — 26 October follow-up

- [x] PR24: Our Story copy/order/visibility and source page fidelity; merged, not deployed.
- [x] PR25: eight homepage copy groups;475 local tests and eight CI checks; merged, not deployed.
- [ ] Nimbus fixed-template copy/order/visibility and source typography: implemented; final verification/release gate in progress.
- [ ] Contact/Bulk Enquiry/Returns, policy and blog copy controls; further media and merchandising controls.

Private owner activation and capacity resolution are still pending. These implementation increments do not complete live staff acceptance, full visual/performance acceptance or commerce readiness.
