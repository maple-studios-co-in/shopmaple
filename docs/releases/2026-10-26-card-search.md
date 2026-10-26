# Compact product cards and rich storefront search

Collection, home, category and related-product server boundaries now pass nine explicit display fields to client cards instead of full catalogue records. Prices, compare-at ties, incomplete-option notices, saved handles, images and links retain existing behavior. Collection filtering still uses full server records; the main product detail retains its variants and gallery. Favourites validates its existing full API response before retaining the compact model; its network response is not reduced.

Search now follows the observed Shopify panel: current product cards, recently viewed products, Clear, reset, no-result copy and View all. Requests begin only when opened, debounce typed queries, cancel on changes/close and time out after six seconds including body reads. Retry and independent recent-item failure states are visible. Only eight validated public product handles are stored locally; searches, prices and customer identifiers are not persisted. Fresh published records supply display data. Native links/form submission, Escape, focus restoration and explicit Tab boundary wrapping are retained.

## Test-first evidence and review

- Card model: eight original display/save characterizations passed. Five actual server-boundary assertions failed because full records were still passed; all13 then passed, followed by67 affected tests. Commands and logs: `.local/card-payload/implementation-evidence.md`.
- Search: one original form characterization passed and nine new behavior assertions failed before implementation; ten then passed. Six additional cases characterize cancellation/storage/races. Seven adversarial helper cases exposed six metadata/pre-abort failures, then passed. A card-fidelity regression demonstrated three links instead of one before the dedicated renderer.
- Built-browser boundary testing exposed native modal focus moving to BODY. Three new tests failed before explicit wrapping, then all53 affected tests passed. Hidden/disabled controls and dynamic loading/error/results are covered. Interior Tab and Enter remain native.
- The seven helper tests initially used `.test.ts`, outside the project's `.test.tsx` glob. Renamed before final verification; all are included below. Earlier partial results are not reported as complete coverage.
- Independent read-only review of card boundaries, search transport/storage/links and final focus handling found no remaining blocker. No API/auth/schema/dependency changes; display prices never become checkout authority.

## Integrated verification

Node22 full suite:822 passed (271 API,498 web,53 deployment), zero failed/skipped. Five guarded recovery tests pass separately:827 total. Full workspace types and production build pass. Dependency audit found zero vulnerabilities; history scan no leaks; strict Semgrep74 rules/162 targets, zero findings, approximately100% parsed. Standard exclusions:122 ignored paths and one file over1MB. Staged and final-commit scans plus exact-head CI are merge gates. Evidence remains local/private; these checks are not a penetration test or commerce certification.

## Built-browser checks

At390 and1280 pixels, Shift+Tab from input reaches the final result and Tab returns to input; focus stays within Search. Escape closes and returns focus to Search furniture. Native Enter navigates to `/collections/all?q=Aero`, showing the matching product. Earlier built checks cover query/reset/no-match, canonical product navigation, recent clearing and retry after stopping/restarting only the owned local API. Six-second hung-body behavior is component-tested. Mobile two-column and desktop four-column layouts fit without horizontal overflow. Desktop panel is672px wide at top94px. Viewport override reset and local homepage left available.

A browser assertion mistakenly looked for a Products heading on the All Furniture route; current DOM confirmed the expected All Furniture heading and correct filtered result. This was a test locator error, not an application failure. Screenshots are in primary project reports. No orders, payments or external messages were sent.

## Payload measurement

Same six local routes and unchanged85-product snapshot compared with PR39. Full HTML responses include embedded RSC; these are not isolated RSC or Core Web Vitals measurements. Rendered card text, all links and image alt/src match the saved baseline on all routes.

| Route | Before raw bytes | After raw bytes | Before gzip | After gzip | Cards |
|---|---:|---:|---:|---:|---:|
| Storage |55900|53821|9845|9182|1|
| Home |336988|315796|36300|33396|12|
| Aero detail |90460|85321|14491|13126|4|
| Favourites |41192|40394|7363|7174|0|
| All Furniture |188059|161643|21902|15827|24|
| Chairs |194020|178886|23475|19064|19|

All Furniture gzip is27.7% smaller; home8.0% smaller in this sample. Streaming order can vary compression. Both card projection and removing the closed search's SSR markup contribute. Initial home JavaScript is240299raw/72888gzip bytes versus232781/70048 before: +7518raw/+2840gzip for richer search. Search mount/network are deferred; its code is not split into a separate lazy chunk. No configured unrelated-template markers were found.

## Limits and remaining work

Shopify fuzzy search returned Aera for Aero; this API still uses substring matching. Exact ranking parity is not claimed. Recently viewed history starts locally and does not import Shopify history. Full internal catalogue reads, detail records and favourites API transfer remain. Further performance/route/accessibility acceptance, bounded favourites retry, misleading single-variant gallery copy, provider/customer integrations and commerce readiness remain on the backlog.

Not deployed. Last read-only production capacity check at01:35:06UTC on26October showed root100% full with8848KiB available. No production deletion, restart, migration, account creation or publication occurred. First publisher is aditya@maplefurnishers.com; private password setup remains pending. Capacity and backup headroom require resolution before production writes. Checkout remains disabled and the overall project goal remains active.
