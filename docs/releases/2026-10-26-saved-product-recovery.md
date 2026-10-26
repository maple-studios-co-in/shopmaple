# Saved-furniture recovery and current menu products

Saved furniture previously stayed loading indefinitely if headers or a response body stalled, and a failed item required refreshing the page. Reads now finish within six seconds with an actionable error. Retry failed items keeps loaded card DOM, missing-piece notices and unrelated pending reads. Cancellation, request ownership and bounded races prevent stale timeout/removal/unmount results from overwriting current state. Records must be published and match the requested saved handle. Only a focused disappearing Retry moves focus to the named Saved furniture region; unrelated focus is preserved.

The mobile menu previously rendered snapshot prices and links unconditionally. It now keeps the original six curated handles, source titles/artwork/order and layout while current validated published records determine identity and displayed pricing. Missing404 products disappear; malformed/unpublished/mismatched/failed records never fall back to source prices. Six reads begin only when opened; drilldown reuses results, close cancels, and reopening reads fresh. Failed-only retry retains successes and moves focus to the named Featured furniture region. Same-origin public API caching still applies; this is not a zero-staleness guarantee.

A single-variant product with a product gallery no longer says Photo for this option unavailable solely because there is no explicit variant-to-image mapping. Unmapped multi-variant and imageless warnings remain, and actual image errors retain the gallery fallback. No image mapping is inferred or created.

## TDD and independent review

- Saved furniture:10 existing continuity characterizations passed. Three RED assertions showed indefinite header/body loading and an unpublished card. Five further RED assertions showed absent retry. Focused/affected43 passed; pre-aborted-signal no-dispatch is additional passing characterization. Existing malformed/identity cases retained. Logs/commands `.local/saved-recovery/evidence.md`.
- Photos:11 characterizations passed; one RED assertion showed the false notice on a sole variant with gallery. Focused12 and affected47 passed. Imageless/image-error safeguards passed before the fix and are not claimed as RED. Logs `.local/variant-photo/`.
- Navigation:10 existing characterizations passed; five new tests failed against unconditional snapshot cards. Five then passed; a subsequent named-focus-region RED failed before adding region semantics. Final affected41 passed, including delayed-body completion after retry. Existing click/keyboard/drilldown assertions retain their intent with public transport fixtures. Logs `.local/navigation-current/README.md`.
- Early DOM-object assertions in photo/saved tests produced expensive Node formatting and were stopped; boolean presence assertions then produced clean genuine failures. An intermediate typecheck found unchecked array access in new test fixtures; it was fixed without weakening assertions. Final whole-project types pass.
- Independent frozen-diff review found no actionable issue in timeout versus owner cancellation, late-body settlement, failed-only invalidation, retained cards/404s, identity/publication validation, focus and navigation lifecycle. No credentials, permissions, API/schema/dependencies or commerce mutations changed.

## Final local verification

Node22 full project suite:840pass (271API,516web,53deployment), zero failures/skips. Five guarded local recovery tests pass separately: **845 total**. Full workspace types and production build pass. Dependency audit zero vulnerabilities; history secret scan no leaks; Semgrep74rules/163targets/zero findings, approximately100% parsed. Standard exclusions:124 ignored paths and one file above1MB. Staged and final-commit scans and exact-head CI remain merge gates. These checks are not merchant readiness or a penetration test.

Initial homepage JavaScript:242171raw/73359gzip bytes versus240299/72888 at PR40; +1872raw/+471gzip. No configured unrelated-template markers found. No dependency added. This bundle sample is not a Core Web Vitals or network timing measurement.

## Built-browser verification

Using the unchanged85-product local snapshot:

- Before rebuilding, Arden showed its5-image gallery alongside the false notice. After rebuilding, mobile390px and desktop1280px show the gallery without that notice; keyboard image2 selection remains functional. No page overflow.
- Five of six curated menu handles return404 locally; Arden returns200 with10620000paise/11800000compare-at. New menu shows only Arden at those prices. This local snapshot does not establish production product absence. Living Room drilldown shows its original categories without dead featured links; Back focuses Living Room and restores Arden. Clicking Arden closes the drawer. Resizing to1280 closes the mobile dialog.
- Only the owned local API was temporarily stopped for failure testing. Browser cache initially retained successful public responses; after expiry, Saved furniture showed the actionable error. Restoring API then keyboard Space on Retry recovered Aero and kept focus on Saved furniture. A separate menu failure/retry recovered Arden, removed alerts and kept focus on Featured furniture. Header/body stalls and stale-body races are component-tested, not browser network-injected.
- Desktop saved drawer displays loaded cards; a temporary saved Arden was removed through UI after testing, retaining existing Aero and moving focus to its remove button. Escape closes the drawer. An early verification used the wrong expected save-button label and was corrected using the actual DOM; final ordinary keyboard save/removal passed.
- Viewport override reset. Local homepage remains running with preview mode and checkout disabled. Screenshot: primary reports/shop-menu-current-products-2026-10-26.jpg.

## Release and remaining gates

No production deletion, restart, migration, account creation, publication, order, payment or message was performed. Last production capacity observation remains01:35:06UTC, root100% full with8848KiB available. Pending exact cache/release cleanup approvals do not authorize deletion of backups. Capacity and temporary backup headroom must be resolved before deployment; private publisher setup for aditya@maplefurnishers.com and live staff acceptance remain pending.

Master plan now distinguishes current acceptance from historical unchecked items. Remaining scope includes full visual/state/accessibility/CWV acceptance, global navigation/footer authoring, search ranking parity, customer/provider integrations, notification/retention, catalogue/shipping/payment/Keeri gates, off-host backup/alerts and SEO cutover. The full goal remains active.
