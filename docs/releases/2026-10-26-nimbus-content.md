# Nimbus content and source fidelity — 26 October 2026

Status: local implementation and verification; exact-head CI/merge pending. Production remains at the previously verified26bd9aa application release. Checkout stays disabled. This is an increment toward the complete content/fidelity goal, not a complete CMS or pixel-perfect claim.

## Change

Shop Admin → Existing pages now selects Our Story or The Nimbus Collection. Nimbus exposes page title, nine section order/visibility controls and eight copy groups: introduction, room tiles, origin, principles, room slideshow labels, series, project and promises. Switching pages retains unsaved edits. Section movement retains keyboard focus; save conflicts retain local values. Draft editing does not publish.

An optional strict plaintext nimbusPage contract preserves source defaults for legacy documents. Exact identity sets bind artwork, original local destinations and product selections independently of order or edited labels. Public page and metadata read only published content. Shared slideshow/value components accept optional stable keys so editing labels does not lose control identity; existing callers retain their behavior. No migration, dependency or commerce permission change.

Browser comparison to the actual Shopify Nimbus page found older fidelity differences. The introduction now matches the source's16px uppercase Red Hat Display label and40px Newsreader statement on desktop and mobile, with black/maroon colors and4px gap. Origin copy preserves the observed source `<br><br>` boundary as plain-text blank lines and scoped `white-space: pre-line`; words are unchanged.

## Test-first evidence

- Legacy contract characterization passed. New valid Nimbus document failed `false !== true`, and original defaults were absent. GREEN:15 Nimbus/existing-content contract tests, including every text-field bound, complete unique identities, nested unknown-field refusal, literal markup, clone isolation and retained128KiB document cap.
- Real DB RED: Nimbus save returned400 instead of200 while11 existing cases passed. GREEN:12 lifecycle cases, covering editor save, publisher403, public draft isolation, stale409, restore-as-draft and invalid payload refusal without mutation.
- Renderer RED: edited H1 remained original, hidden sections remained visible, reordered slide/media mapping was wrong, and editing a stable slide's label lost focus. GREEN:8 Nimbus tests plus13 related category/Story/video tests.
- Admin RED: Existing page selector absent. GREEN:26 related admin tests, including saved/conflict cases, page-switch preservation, nine section controls, bounded text editing and unchanged published version.
- Browser-discovered paragraph break RED: new exact blank-line expectation failed against single-space defaults. GREEN:15 contract cases. One subsequent focused run had15/16 pass because a renderer characterization still expected the old space; updating that assertion to the independently observed source boundary restored8/8 renderer tests. CSS is declarative and verified via the build and actual browser rather than source-string tests.

Focused commands (Node22):

```sh
cd apps/web
npx tsx --tsconfig test/tsconfig.json --test test/nimbus-contract.test.tsx test/content-contract.test.tsx
npx tsx --tsconfig test/tsconfig.json --test test/nimbus-content.test.tsx test/nimbus-slideshow.test.tsx
npx tsx --tsconfig test/tsconfig.json --test test/admin-nimbus.test.tsx test/admin-story.test.tsx test/admin-home-details.test.tsx test/admin-dashboard.test.tsx
cd ../api
npx tsx --env-file=../../.env --test --test-concurrency=1 test/admin-content.test.ts
```

## Integration and browser evidence

Initial integrated suite:202API,232web and53deployment tests passed; separate5database/recovery cases passed on dedicated loopback55439 databases. The complete suite repeated after source-format correction also passed:492 tests total including the5 database/recovery cases. Types and final production build pass. Dependency/history-secret/static checks passed; final staged/commit checks are separate gates. Independent manual final diff review and subsequent source-format/CSS review found no actionable issues; no exhaustive scan claim.

Rebuilt local browser at1280px and390px confirms original text, introduction16/40px typography and22.4/48px line heights, restored origin break, exactly one H1 and no horizontal overflow. No main-page links point to the old Shopify shop. Keyboard Enter selects Dining room and390px resolves its original mobile artwork. Viewport reset afterward. Staff editor behavior is covered by real component interactions and separate API/database publication tests; real production staff acceptance remains pending private account activation.

## Recovery and remaining scope

Older strict validators reject nimbusPage documents. Keep verified paired database/media recovery and deploy a compatible release or perform deliberate content recovery if rolling back after new content is saved. Preserve newer commerce/enquiry records; whole-database rewind is not routine application rollback.

Server capacity resolution and publisher private password setup remain pending. No release deletion, production account creation or application deployment occurred in this increment. Remaining content coverage includes Contact, Bulk Enquiry, Returns, policy and blog copy, further media/merchandising controls, plus service integrations, measured performance, operational monitoring and commerce gates. Keeri remains the product/stock/order/delivery authority.
