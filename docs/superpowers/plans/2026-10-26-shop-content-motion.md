# Shop Content and Motion Implementation Plan

> **For agentic workers:** Use the user-requested parallel agents with separate file ownership. Steps use checkbox syntax for tracking.

**Goal:** Deliver a protected content dashboard and accurate, accessible storefront motion, while tracking remaining storefront/commerce work.

**Architecture:** Typed published content drives server-rendered storefront components. Same-origin Express endpoints manage session-authorized drafts and immutable revisions in the isolated shop database. Keeri stays the commerce authority.

**Tech Stack:** Existing Next 16, React 19, Express 5, Prisma 6, PostgreSQL and Node 22; native CSS/scrolling for motion.

**Spec:** `docs/superpowers/specs/2026-10-26-shop-content-motion-design.md`

## Current acceptance status (supersedes historical task snapshots)

Verified source baseline: PR40, merged as53f21a4029dc265107f4f63d65ca5936937fe6ee. The checklists below retain implementation history; an old unchecked item does not override the current evidence, and a checked implementation item does not establish production acceptance.

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Shop content backend and dashboard | Protected content API, draft/publish/revisions/restore, role/CSRF checks; original defaults; PR16–17 and later content releases | First publisher private setup, production staff save/preview/publish/restore/logout; no account created yet |
| Banners, pages, positions and copy | Campaign scheduling; homepage/category/Nimbus/Story/contact/policy/blog controls; merchandising and artwork; new structured articles/pages (PR25–36) | Complete source layout/state audit and live publisher acceptance; global navigation/footer authoring is still fixed source |
| Instagram and moving sections | Source24-post rail, pause/manual/reduced-motion behavior; gallery gestures/transitions; optional reveals; deferred category films | Full-route visual/accessibility/performance acceptance, including assistive-technology testing |
| Product discovery and interaction | PR37–40 continuity/cart recovery, image sizing, rich search and compact card projection;827 tests at PR40 | Favourites bounded retry, single-variant photo notice and current menu-product publication/prices are the active increment; fuzzy search parity remains |
| Keeri commerce authority | Separate catalogue read model; Keeri owns products, stock, orders and delivery | Catalogue identity/price/package completeness, shipping and merchant activation, sandbox payment/order recovery proof; checkout disabled |
| Customer services and CRM | Saved enquiries, separately authorized inbox, assignment and notes | Notification transport/retention, reviews/newsletter/accounts/order history/returns integrations |
| Security and TDD | Assertion-based RED/GREEN, complete tests/types/build, scans, independent review and exact-commit CI per increment | Continue on every change; green checks do not establish external provider or production readiness |
| Production operations | Earlier paired backup/restore evidence; latest changes merged only | Resolve full disk and backup temporary headroom; observe schedule; off-host/retention/alerts; deploy and verify ordinary public behavior; SEO cutover |

No full-goal completion is claimed. Existing native CSS and scroll behavior remains the chosen motion approach; adding a heavy animation library is not itself an acceptance requirement.

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
- [x] PR26: Nimbus fixed-template copy/order/visibility and source typography;492 tests and eight CI checks; merged, not deployed.
- [x] PR27: Contact/Bulk Enquiry/Returns copy and section controls;510 tests and eight CI checks; merged, not deployed.
- [x] PR28: existing policy/blog copy controls and readable keyboard tables;536 integrated tests, local gates and eight exact-head CI checks pass; merged284be7a, not deployed.
- [ ] New article authoring/structural editing; further media and merchandising controls.

Private owner activation and capacity resolution are still pending. These implementation increments do not complete live staff acceptance, full visual/performance acceptance or commerce readiness.

## Homepage merchandising increment

- [x] Contract/API agent: optional bounded homepage selections and tile configuration, cloned original defaults, strict safe links/media, transactional uploaded-image publication and isolated database regressions.
- [x] Renderer agent: published-only selections/order/visibility, original fallback layouts, local collection links, catalogue-owned prices and honest missing-product states.
- [x] Admin agent: catalogue search/pagination with bounded transport and stale-result protection; keyboard selection/reorder/remove; category/offer artwork and copy fields; existing draft, conflict and permission controls.
- [x] Parent:557 tests, types/build/scanners and independent review; desktop/mobile original defaults, local links and overflow checks; static admin layout regression corrected with browser RED/GREEN.
- [x] PR29: eight exact-head CI checks passed atbf8c76e; mergedf1fe854, identical tested tree. Separately gated deployment remains pending. No production change claimed.

Lists are bounded at12 items each. New tile identities are stable and separate from editable collection destinations. Uploaded tile artwork must pass the same private-file checks as existing campaign/page images before a publisher makes it public. This increment does not change the catalogue, commerce rules, source copy defaults or production configuration. New article creation, remaining visual/performance work, customer-service integrations and production readiness remain in the overall goal.

## Fixed-template artwork increment

- [x] Contract/API agent:21 fixed image placements, six required responsive pairs, sparse overrides, original registry defaults, bounded safe media/description validation, transactional publication and adversarial database regressions.
- [x] Renderer agent: consume published overrides on Homepage, Nimbus and Our Story; preserve original imagery/copy/links, responsive source selection, video files and playback controls.
- [x] Admin agent: grouped Artwork tab, existing media picker/private previews, explicit desktop/mobile fields, restore-original for each placement, retained sibling/draft/conflict behavior.
- [x] Parent: 577 tests, types/build, independent review and responsive/browser default checks. Final security and exact-head CI/merge remain release gates.
- [x] PR30: eight exact-head checks passed at 5e8de71; merged bfc3b47 with an identical tree. Production deployment remains separately gated.

The fixed placements cover hero category tiles, workshop/testimonial posters, the homepage Nimbus banner and newsletter illustration; Nimbus room tiles, origin/project images, room slides and film posters; Our Story hero and film poster. Defaults remain unchanged until a publisher explicitly publishes a saved override. Original descriptions that are intentionally decorative stay valid. This does not add video uploads, edit source video files, change product media authority or enable checkout.

## Enquiry ownership and internal notes

- [x] API agent: additive assignment/activity persistence, strict shared contracts, eligible staff directory, bounded cursor activity/owner filters, versioned transactional writes; assertion RED and database/security regressions.
- [x] UI agent: eligible assignee selection, unassign, own/unassigned filters, internal note composer and paginated activity; retain unsent notes safely on recoverable failures, reject stale responses and clear private data after access loss.
- [x] Audit agent: inspect image loading and interaction costs; identify measured or directly evidenced next storefront improvements without claiming Core Web Vitals from source.
- [x] Parent: reviewed migration/permission/concurrency boundaries; guarded local/test migrations, 597 tests, typecheck/build, desktop/mobile component checks and independent review passed.
- [x] PR31: final security checks and all eight exact-head CI checks passed at b402b84; merged b725727 with the tested tree. Production deployment remains capacity-gated.

Acceptance: authorised staff can assign a real enquiry only to an active account already permitted to manage enquiries, append plain-text internal notes and view immutable actor/version/time history. Assignment, review and notes share the enquiry version so competing changes cannot silently overwrite each other. Lists remain metadata-only; notes/contact details and the directory require the existing separate capability. There is no new permission grant, customer reply, email/WhatsApp notification or checkout activation. Production migration/deployment remains separately gated.

## Category films and homepage loading

- [x] PR32: responsive video source deferral, persistent manual Pause, offscreen/background/reduced-motion handling, stale play events and observer-batch regression coverage.
- [x] Homepage client defaults and published props exclude unrelated landing templates and staff labels. Built page/layout manifest scripts fell by 22,503 raw / 5,413 gzip bytes; this is not a Web Vitals measurement.
- [x] 618 tests, types/build, final-commit scanners and independent review; desktop/mobile browser playback acceptance. All eight checks passed at c86099d; merged 80889f8 with the tested tree. Not deployed.

## Remaining homepage artwork and city-rail controls

- [x] Contracts/API: 26 additional fixed artwork placements and exact-identity city ordering/visibility, preserving validation, draft isolation, publisher/CSRF/version checks and private media publication.
- [x] Storefront: all original assets/copy/order when absent; published replacement descriptions and images, stable identity on reorder, hidden items omitted, whole city section omitted when all hidden.
- [x] Shop Admin: grouped artwork choices, decorative descriptions, private picker and per-slot restore; keyboard city ordering, show/hide and layout reset without changing artwork.
- [x] Shared carousel: latest queued visibility state, aligned15% threshold and conservative no-observer autoplay; assertion RED then11/11 GREEN.
- [x] Parent:637 tests, types/build, retained homepage payload boundary, working-tree security checks, independent review and responsive browser acceptance.
- [x] Final-commit security checks and all eight exact-head CI checks passed; PR33 merged as52a0b21. Production release remains separately gated.

Scope: four Difference icons, four value illustrations and 18 city-rail images. The eight unnamed original city illustrations keep neutral admin labels and their original empty storefront descriptions; no city identity is invented. This does not change Keeri serviceability, shipping rates or products. No staff account, capability grant, outbound notification or checkout activation is part of this increment. New keys/layout require compatible content recovery before rolling back to an older strict-schema binary.

## New article authoring

- [x] Bounded structured blocks, fixed identities and optional legacy-compatible article field.
- [x] Transactional server-owned first-publication ledger, candidate link validation and managed-media integrity checks.
- [x] Published article routes/index/metadata; original ten source articles preserved.
- [x] Editor creation, reorder/remove, private preview, empty required content and image descriptions; stable keyboard focus at reorder boundaries.
- [x] Independent security review findings fixed with regression tests; mobile editor overflow corrected from observed525px to390px document width at390px viewport.
- [x] Integrated666 tests:238API,370web,58deployment/recovery. Development backup made before additive migration;85products/115variants/1enquiry unchanged.
- [ ] Final commit scans and exact-head CI/merge. Production capacity, private publisher activation and live staff acceptance remain separate gates.

See [article authoring release notes](../../releases/2026-10-26-authored-articles.md). This increment does not publish an article or change existing website copy. New articles become unavailable during content API outage while original source fallback remains available. The overall goal remains active: full visual/state/performance acceptance, richer page structure, customer integrations, operational readiness and live commerce gates still need work.
