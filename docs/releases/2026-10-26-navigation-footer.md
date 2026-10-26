# Navigation and footer authoring

Shop Admin now has a Navigation & footer tab for announcement/WhatsApp settings, utility links, desktop/mobile menus, submenu columns, discovery links, footer ordering/headings/contacts/social links and policies. Editors can add, remove, reorder or hide bounded entries, retain intermediate invalid text, save a draft and explicitly publish through the existing workflow. Restore originals removes only this override. Column visibility explicitly toggles all contained links.

The optional strict siteChrome document keeps original copy, artwork, destinations and approved contact details when absent. Stable IDs preserve keyboard focus and selection across label/order edits; artwork presets remain independent of labels. Only the validated published slice reaches storefront chrome. Public reading falls back to source defaults on missing/malformed/unavailable content. Enquiry subjects are encoded as one query parameter; no arbitrary external destination, HTML or CSS is accepted. Public header/footer changes become visible on a fresh server-rendered load; persistent client layouts are not pushed updates.

Publication validates enabled destinations within the existing content transaction, including same-candidate pages/articles and currently published product records. Missing targets reject publication without replacing public content or creating revision/publication-ledger changes. Hidden links/parent groups do not block publication; re-enabling validates them. Source defaults also publish successfully through the real router. Existing role, session, CSRF, origin and optimistic version gates remain unchanged.

No dependency or schema migration. Keeri remains responsible for product price/stock/orders/delivery. This does not create a staff account, grant enquiry permissions, publish website copy or activate checkout.

## TDD and review

- Contract RED: valid chrome rejected by the existing document schema. Publication RED: nonexistent and unpublished destinations wrongly returned200. Focused affected40 passed, plus the real-source-default publication characterization1/1.
- Renderer RED: original announcement remained, disabled announcement persisted, renamed submenu was absent, hidden groups retained stale controls, and renamed enquiry exposed an old accessible label. Final affected34 passed, including current menu-product authority and safe fallback/default clones.
- Editor RED: new tab absent; then column visibility absent. Focused6 and affected108 passed, covering invalid draft retention/save rejection, stable identities, move/remove focus, bounds, override reset and existing role/conflict/session behavior.
- Independent combined-diff review found no actionable issue in draft isolation, URL/contact encoding, transaction atomicity, stale revisions, permissions or source defaults. This was code/focused-test review, not a penetration test or live staff acceptance.
- Evidence is under .local/site-chrome-contract, .local/site-chrome-renderer, .local/site-chrome-admin and .local/site-chrome-integration. One early API test invocation used the wrong cwd and failed an existing bootstrap path lookup; documented apps/api cwd passed without changing assertions. Diagnostic DOM assertions were changed to bounded boolean checks before recording renderer failures. No failing behavior was suppressed.

## Local verification

Node22 complete suite:869 tests (283API,533web,53deployment), all pass with no skips. Five separately guarded recovery tests pass: **874 total**. Full workspace types and production build pass. Dependency audit:zero vulnerabilities. History secret scan:no leaks. Semgrep:74rules,166targets,zero findings,approximately100% parsed;132 standard-ignored paths and one file above1MB. Final staged/commit checks and exact-head CI remain release gates until recorded below.

Initial homepage entry-script sample:248961raw/75604gzip bytes, versus242171/73359 before (+6790raw/+2245gzip). Existing unrelated-template/admin marker gate passes; no full CMS document is passed to public chrome. This is a bundle-size sample, not Core Web Vitals or a network timing measurement.

Built localhost checks at1280/390px preserve previous announcement/header/footer default text and links, original menu categories and published local featured-product pricing. Desktop ArrowDown opens and Escape restores trigger focus; mobile drilldown/Back/Close restores the appropriate trigger. No horizontal overflow. API health is preview/checkoutfalse; anonymous admin session returns401/private-no-store through API and web proxy.

Separate hydrated real-component fixtures use synthetic unsaved local state: navigation reorder retains label and focuses moved row; expanded nested fields fit390px; footer reorder/reset preserves focus and reset removes only the override. Custom public fixture shows care-before-shop/help-hidden and service-before-bulk/marketplace-hidden with no reserved empty columns; desktop menu with no artwork/discovery uses one full track. Both1280/390px fit. Standalone public fixture disables Next image optimization because its static server has no optimizer; it uses the real components and styles. This is not an authenticated production save/publish acceptance run.

## Release boundaries

Read-only production check at2026-10-26T02:07:46Z: root100% full,315704KiB available (~308MiB), current release26bd9aa185a4cecdf173bd0e550003e594a7205b. No production deletion/restart/migration/account creation/publication/order/payment/message occurred. Capacity and backup temporary headroom must be resolved before deployment. First publisher is confirmed as aditya@maplefurnishers.com; private password setup and separately scoped enquiry access remain pending. Checkout stays disabled. Full project goal remains active.

Saving new strict-schema fields requires compatible application/content recovery before rolling back to an older binary. Target checks apply at publication time; subsequent catalogue unpublishing can still invalidate a previously valid product link and needs operational reconciliation. Full visual/state/accessibility/performance acceptance, search ranking parity, customer/provider integrations, notification/retention, catalogue/shipping/payment/Keeri gates, off-host backups/alerts and SEO cutover remain open.
