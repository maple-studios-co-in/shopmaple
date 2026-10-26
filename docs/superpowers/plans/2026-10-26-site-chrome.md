# Navigation and Footer Implementation Plan

> **For agentic workers:** Use the user-requested parallel agents with separate ownership; root integrates and reviews the combined result. Steps use checkbox syntax.

**Goal:** Let Shop Admin manage navigation/footer content and order through existing secure draft/publication workflow while preserving exact original defaults.

**Architecture:** Optional strict siteChrome document slice, source-derived defaults, published-only server read into public chrome, existing authenticated content mutations and transactional target validation. Stable IDs separate identity from editable copy.

**Tech Stack:** Existing Next16/React19, Express/Prisma/PostgreSQL, Zod/TypeScript/Node22; no new dependency or database migration.

**Spec:** `docs/superpowers/specs/2026-10-26-site-chrome-design.md`

## Global constraints

- Original copy/artwork/contact overrides remain default. Omitted siteChrome and read failure preserve them.
- No external/arbitrary destination URLs; enquiry subjects are plain text encoded only at rendering.
- No draft/public publication leak, no automatic publish, no new signup/permissions or commerce activation.
- Native accessible controls; same identity after label changes/reordering; bounded safe fields and lists.
- Dedicated test database only; contract/API worker owns DB execution until freeze.

## Review focus

- Renaming/reordering submenu labels must not switch artwork or lose Back/Escape focus; renderer tests stable IDs/presets.
- Same-candidate custom pages and enabled product targets must validate transactionally; deleted/unpublished targets cannot overwrite live content.
- Prototype/control/query/encoded URL and mail-header tricks must fail contract parsing; public render escapes plain text.
- Removing/reordering controls at boundaries must retain keyboard focus; invalid intermediate form text must remain editable until explicit Save.
- Legacy defaults and public outage fallback must match existing HTML links/text; draft-only content cannot reach public header/footer.

### 1. Contract and publication — chrome_contract

Files: new packages/contracts/src/site-chrome.ts; content.ts/index.ts integration; API authored-articles target validator; new contract and dedicated DB tests.
Interfaces: exact SiteChrome/ChromeLink/ChromeNavigationItem/Column/Link/ActionLink from spec; optionally export FooterContent. Optional StorefrontContent.siteChrome.

- [x] Characterize existing content parsing/publication.
- [x] Add behavior tests proving a valid new slice survives parsing and malicious/ambiguous/oversized structures fail; observe genuine RED using existing storefront schema.
- [x] Implement strict schemas/exports with lazy shared-validator use where necessary to avoid circular initialization.
- [x] Add actual DB RED for missing enabled chrome target publication, same-candidate valid pages and unchanged prior public revision; implement validation.
- [x] Run focused contract/DB tests, API/types, record commands/results and freeze/release DB ownership.

### 2. Source defaults and public rendering — chrome_renderer

Files: new lib/site-chrome-defaults.ts; layout.tsx; StoreChrome/Header/Footer/Navigation/WhatsApp; focused public tests/minimal styles.
Interfaces: defaultSiteChrome; resolveSiteChrome(value?:SiteChrome):SiteChrome; chromeHref(link:ChromeLink):string. Components accept optional chrome slice preserving old callers.

- [x] Capture existing render defaults and safe source enquiry destinations in characterization tests.
- [x] Write/observe RED for published override labels/order/visibility/contact/links and ID-stable renamed submenus.
- [x] Implement deep-cloned defaults, URLSearchParams enquiry encoding and published-only layout wiring; pass only slice to clients.
- [x] Implement header/footer/WhatsApp content and menu behavior preserving source CSS/featured product authority.
- [x] Verify all-hidden group behavior, legacy/default parity, focus and no draft propagation; focused/affected tests/types and freeze.

### 3. Admin authoring — chrome_admin

Files: editor.tsx integration; new site-chrome-fields.tsx and small helpers; scoped admin styles; new real editor interaction tests.
Interfaces: SiteChrome types and renderer defaults; onChange updates optional slice only; Restore originals removes slice.

- [x] Characterize current editor save/dirty/role/conflict behavior.
- [x] Observe RED for navigating new tab, editing labels/link targets, reorder/toggle/add/remove with stable IDs, original reset and draft preservation.
- [x] Implement fields per spec without validating away intermediate text or causing server writes.
- [x] Add RED and fix boundary move/remove focus and invalid-input save feedback as needed.
- [x] Run focused/affected editor tests/types; freeze with evidence.

### 4. Integration and release — root

- [x] Review combined contract/default/editor/publication behavior, architecture and invalid links; independent frozen security review.
- [x] Run full project suite plus guarded recovery tests, types, Node22 build, dependency/secret/static checks. Do not run DB suites concurrently.
- [x] Verify unchanged public defaults at390/1280 in built browser; synthetic real editor fixture for new controls; distinguish fixture from live authenticated acceptance.
- [x] Measure initial public JS and ensure no full admin/content payload in public bundle; record tradeoffs.
- [ ] Stage/commit/scans; PR exact-head CI then merge and compare fetched main tree to tested tree.
- [ ] Update current backlog, private evidence and deployment status. Keep production changes gated by capacity/private publisher setup and checkout disabled.
