# Compact catalogue queries and cart focus

Collection pages formerly fetched every 50-product API page before rendering 24 cards. Each API request reread the full catalogue and variants. Collections now receive one compact page with matching counts and facets. Search uses the same matching and alphabetical ordering as View all. Saved items, recent items and menu cards use compact single-card responses; the editorial Chairs route requests its exact 19 curated handles. Original copy, source membership, featured ordering, same-variant filtering, unknown-price behaviour and enquiry-only fallbacks are preserved. Keeri remains the commerce authority and checkout stays disabled.

## Boundaries and review

Strict shared contracts bind publication, identity, query, page and bounded display fields. Products and variants must be published. Cards omit full descriptions, galleries, variant arrays, source metadata and PDP content. Malformed input is400; invalid stored output is a generic500 with private,no-store. Public cache headers are applied only after validation. Existing cancellation, six-second header/body deadlines, stale-response rejection and failed-only retries remain. No migration or dependency was added. Deploy API and web together because the new web consumers require the new routes.

Collection registries moved unchanged into the shared package. An explicit `@shopmaple/contracts/catalogue-registry` subpath keeps them out of browser query/schema imports. The new `npm run test:homepage-payload` guard reads actual production entry assets and runs after the CI build.

Successful ordinary cart removal or decrement-to-zero focuses the adjacent remaining Remove control, or Explore furniture when empty. Focus moves only when the initiating control owned it. Failed writes, focus movement, pointer interaction elsewhere, Tab, closed drawers and unmount cancel restoration. Automatic blur caused by disabling a pending button remains recoverable. Persistence and uncertain-write recovery are unchanged.

Independent review and root integration caught and corrected three issues: cacheable400 output failures, focus theft after clicking a nonfocusable background, and a registry payload leak. The final independent source review found no additional actionable issue. This was a bounded manual review, not a full penetration test.

## TDD and verification

Use Node22. API commands run from apps/api with `npx tsx --env-file=../../.env --test --test-concurrency=1`; web commands from apps/web with `npx tsx --tsconfig test/tsconfig.json --test`. Dedicated loopback shopmaple_test only; recovery uses shopmaple_preview_import_test.

- API RED: `test/catalogue-view-db.test.ts` failed five intended404 versus200/400 assertions before route implementation. The final file covers 539 products, real SQL query events, complete facets, pagination/clamping, same-variant filtering, null/zero/tie prices, source ordering, publication, compact500-option projection and malformed/duplicate queries.
- Card-contract RED: nine inconsistent price/option summaries were accepted before cross-field guards; all ten contract cases then passed.
- Web RED: `test/compact-catalogue-consumers.test.tsx` observed11 requests instead of1, the old editorial endpoint, and rejected compact search/saved envelopes. A separate blank-query regression failed before optional empty fields were omitted. Existing adversarial transport fixtures retain their assertions.
- Cart RED: `test/cart-removal-focus.test.tsx` failed four focus assertions. Later native-browser reproduction and two additional test failures drove pointer/Tab cancellation. Existing recovery tests remain unchanged.
- Output-error RED: `--test-name-pattern='invalid stored catalogue output' test/catalogue-view-db.test.ts` observed400 instead of500 for an oversized stored image URL. All three routes now return generic500/no-store; malformed requests remain400.
- Bundle RED: `node scripts/check-homepage-payload.mjs` detected three registry-only markers in actual initial browser assets. After the boundary fix, the same guard passed.
- Initial integration found two category-campaign fixtures still serving the former full-product contract. Their transports were updated; original campaign/link assertions remain.
- Final `npm test`:299 API,559 web and53 deployment tests passed. Separate guarded `npm run test:deploy:db`:5 recovery/bootstrap tests passed. **916 total**, no skipped/failing tests. `npm run typecheck`, API/web build and production bundle guard passed after the final module-boundary change.
- Local dependency audit:0 vulnerabilities. History/staged secret scans: no leaks. Strict Semgrep:74 rules,172 targets,0 findings, approximately100% parsed lines;138 default-ignored files and one oversized workshop video. These scanners have documented coverage limits. Final-commit scans and exact-head CI remain required before merge.

## Measurements and browser acceptance

The 539-product dedicated fixture measured a 24-card response of4,440 bytes and1 Product+1 Variant SQL read, versus186,047 bytes and11+11 reads for the former eleven-page approach. The local85-product dataset measured7,687 raw response bytes for one collection page versus94,900 across the former two full-product pages. Same-run level9 gzip totals were1,794 versus16,468 bytes. These are transport/query measurements, not production Core Web Vitals.

The final initial homepage scripts total253,293 raw /76,875 gzip bytes: +4,332/+1,271 versus PR42. An intermediate regression reached284,129/80,620 and was rejected. The guard excludes registry/template markers and enforces270,000 raw /79,500 gzip budgets. It covers initial home/layout assets, not all routes or lazy bundles.

Native browser checks on the final built preview confirmed390/1280 layouts without horizontal overflow, oneH1, unchanged24 card titles/prices/links/count/facets/pagination versus the PR42 DOM snapshot, Next/Previous navigation,26 chair search matches with matching first-four suggestions/View all, mobile price filtering to8 pieces, and Filter Escape/focus restoration. Existing saved Aero resolved without a saved/cart mutation. Editorial Chairs rendered its source sections and fallback copy. Final verification tab had no captured console errors.

Cart acceptance used actual ShopProvider, CartContents, CartDrawer and Modal with isolated delayed in-memory transport: adjacent/empty focus, pointer-away preservation and closing the drawer while a write settled all passed. The fixture sent no real API writes and was stopped afterward. Local85 products,115 variants,1 enquiry,1 cart and1 item were preserved. A real populated production cart and assistive-technology testing remain separate.

## Remaining and operational status

One collection query still reads the complete minimal catalogue to compute facets; this is not indexed SQL scaling. Homepage/category/PDP-related full-record reads, fuzzy ranking, all-route visual/VoiceOver/CWV acceptance and cache invalidation beyond existing freshness remain on the backlog.

The Shop Admin publisher email is aditya@maplefurnishers.com; private setup and production staff acceptance remain pending. Enquiry inbox/assignment/notes are implemented, while notification delivery, retention, reviews, newsletters, customer identity/order history and returns integrations remain incomplete. Shipping/package/payment/Keeri recovery gates still prevent checkout activation.

No production deployment or cleanup occurred. At02:19UTC the server root had only4KiB free after the02:17Keeri media backup failed with ENOSPC and left about304MiB partial data. The two exact server package-cache cleanup requests remain unanswered; earlier Mac cleanup authorization does not cover them. Even2.43GiB of reclaimed caches would not provide the roughly11.8GiB temporary space plus reserve needed for another full media snapshot. Never remove recovery assets based on this performance increment.
