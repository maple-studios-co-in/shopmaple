# Policy and blog content controls — 26 October 2026

Status: locally verified; exact-head CI and merge pending. No production deployment or staff activation. Checkout remains disabled.

## Behavior

Shop Admin → Policies & blogs edits the four existing policies, four blog landing titles and ten existing articles. The editor exposes title, article excerpt, structured text leaves and embedded image descriptions. Paragraphs, headings, lists and table cells remain structured; the interface does not require raw JSON or HTML. Page switching, cleared text fields and save conflicts retain local edits. Draft changes require explicit publisher publication.

Optional editorialContent stores only edited documents. The resolver merges those overrides with cloned original source content. Public pages and metadata use validated published content; original routes, article dates, artwork, ordering and default copy remain. The existing source JSON was not rewritten. All original documents plus existing defaults fit within the unchanged128KiB store cap; storing sparse overrides preserves more headroom than eagerly copying the85,477-byte original source into every draft.

Strict fixed identities prevent new or altered policy/blog/article routes through this field. Iterative node validation bounds depth20 and2,000 nodes before serialization; individual policy/article objects, including titles and excerpts, are bounded at48KiB. Unknown tags/attributes, executable destinations, credentials, raw traversal and unapproved media are rejected. Embedded images accept approved remote Shopify media only; private uploaded-media publication is not added here. Existing staff authorization, CSRF, optimistic versions, revision history and public draft isolation remain in force. No dependency or migration changes.

## Test-first evidence

- Contract acceptance RED: sparse editorial content rejected, false versus true. API RED: editorial save400 instead of200. Separate validation RED cases demonstrated accepted unsafe tags, invalid identities/depth, omitted title/excerpt byte accounting and absolute-path traversal normalization. Defaults RED exposed missing original/edited policy data. Final focused contract20/20 and API14/14 passed.
- Admin RED: Policies & blogs navigation absent. Final real component success/conflict cases edit a policy paragraph, blog title and nested article text/excerpt; source tables and siblings remain, invalid titles do not leave the browser, and drafts retain published version. Both editorial cases and two homepage cases pass with correctly initialized JSDOM. The earlier fixture imported ReactDOM before the DOM existed and triggered its old input-event fallback; initializing the DOM first removes those warnings without weakening assertions.
- Renderer characterization passed before changes. Four RED failures showed published titles/body still rendering legacy defaults. Final focused22/22 pass, including metadata, nested structure, literal HTML escaping, malformed/outage fallback, route identity, source sorting/dates/artwork and table behavior.
- Integration exposed invalid imported table markup. Structural RED assertions failed on direct whitespace nodes. Rendering now removes only whitespace and recursively empty decorative div/span under table structural parents, retains empty cells, and wraps substantive unexpected children with required table ancestors. Original two tables,11rows and34cells remain. A separate RED showed missing keyboard focus; tables now retain native semantics with a label and tab stop.

Focused commands use Node22:

```sh
cd apps/web
../../node_modules/.bin/tsx --tsconfig test/tsconfig.json --test test/editorial-contract.test.tsx test/content-contract.test.tsx
../../node_modules/.bin/tsx --tsconfig test/tsconfig.json --test test/editorial-pages.test.tsx test/blog-index.test.tsx test/blog-article.test.tsx test/store-content.test.tsx
../../node_modules/.bin/tsx --tsconfig test/tsconfig.json --test test/admin-editorial.test.tsx test/admin-home-details.test.tsx
cd ../api
../../node_modules/.bin/tsx --env-file=../../.env --test --test-concurrency=1 test/admin-content.test.ts
```

## Integrated verification and fidelity

Final verification:536 tests passed (204API,274web,58deployment/recovery, including five separate database recovery cases). Dedicated loopback55439 databases were guarded and used under an exclusive test lease. Full tests repeated after table and keyboard corrections; final run has no table hydration or legacy input-event fixture errors. Remaining test-environment notices include existing image stubs and experimental Node mock timers. Types and both production builds pass. Dependency, redacted history-secret and static checks pass; Semgrep74rules/142targets/zero findings. Staged and final-commit scans remain separate gates. Independent manual review of the complete diff and subsequent table/keyboard addenda found no actionable issue; no exhaustive security claim.

Browser comparison to the actual Shopify Dining article at390px found a409.7px source table in an overflowing container while the prior local table squeezed to354px and broke words. Scoped overflow-wrap:normal restores readable native horizontal scrolling. Final local table has354px viewport/405px scroll width; keyboard ArrowRight changes scrollLeft from0 to40 with a visible solid outline. The page itself remains390px wide. Original date, two tables,11rows and34cells remain visible; browser error log was empty for the inspected article. Policy and blog index at1280/390px each have oneH1, no page overflow, and original default titles. Index retains ten cards and source newest-first order. Temporary viewport reset afterward.

Local API4100 and web3000 run the final built source; health reports preview and checkoutEnabled:false. Staff behavior has real component and database lifecycle coverage, but production staff browser acceptance awaits private account setup. Browser checks are bounded, not a full pixel-parity/accessibility audit. General repair of arbitrary API-submitted HTML hierarchies is not promised; the UI edits text/alt within original structures. Future structural editing needs stricter hierarchy validation.

## Recovery and remaining work

Older strict-schema binaries reject editorialContent documents. After saving new content, rollback requires a compatible binary or deliberate content recovery that preserves newer commerce/enquiry records. Keep paired database/media backups available; whole-database rewind is not routine application rollback.

Production remains at the previously verified26bd9aa application release. Server capacity, the exact-target cleanup decision, private publisher activation and off-host automation remain pending. No deletion, application deployment, production account creation or public copy publication occurred. Further work includes new article authoring/structural editing, additional media and merchandising controls, measured performance/accessibility, full route/state parity, enquiry workflow and service/commerce readiness gates. Keeri remains product/inventory/order/delivery authority.
