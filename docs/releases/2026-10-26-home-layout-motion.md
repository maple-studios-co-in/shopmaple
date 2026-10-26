# Homepage editorial layout and accessible source ticker

The homepage now follows the suggested inset testimonial/newsletter composition while retaining original Shopify copy, customer video and published overrides. Bestsellers and Chairs have visible headings and contextual View all links. Bestsellers retains the original all collection destination; Chairs opens the existing chairs collection.

The original slogan scrolls using CSS transforms with native Pause/Resume, sticky visitor pause, temporary hover/focus suspension, and offscreen/hidden-page suspension. Server/no-JS, reduced-motion and unsupported-browser cases retain the full static copy. No animation dependency was added. Shop Admin can edit the Chairs heading and ticker autoplay through the existing private draft/publisher/version controls.

## TDD evidence

All commands used Node22.21.1. Web commands run from apps/web; API commands from apps/api. Initial assertion failures were observed before implementation, not inferred from setup failures.

- `npx tsx --tsconfig test/tsconfig.json --test test/home-ticker.test.tsx`: RED1 characterization pass/7 assertion failures; visible hydrated ticker was not animated. GREEN8/8; affected motion/carousel suite26/26.
- `npx tsx --tsconfig test/tsconfig.json --test test/home-editorial-layout.test.tsx`: initial RED2 pass/1 named-region assertion failure, then GREEN3/3. Browser feedback added a genuine failing default-logo contrast regression, then an independently reviewed failing alt-only override regression. Final5/5; affected editorial/details/enquiry suite14/14.
- `npx tsx --tsconfig test/tsconfig.json --test test/admin-ticker-motion.test.tsx`: genuine missing accessible ticker switch/Chairs-field assertions before implementation; affected editor/contract suite31/31 GREEN.
- `npx tsx --env-file=../../.env --test --test-concurrency=1 test/ticker-motion.test.ts`: legacy behavior passed, new draft save failed400 versus200; GREEN3/3, affected API suite18/18. Real isolated test database verifies publication, editor/anonymous/CSRF/stale rejection, invalid values and no rejected writes. Transport-only doubles are used in UI tests.
- `npx tsx --tsconfig test/tsconfig.json --test test/home-merchandising-render.test.tsx`: RED6 pass/2 rail heading/browse assertions fail; affected rail/banner suite13/13 GREEN.

Full final project suite, guarded recovery, types/build/bundle, scans and exact-head CI are recorded in the final PR/release evidence. Declarative CSS uses real browser geometry and screenshots rather than artificial source-text tests.

## Browser evidence

Built preview checked at320/390/1280px. A320px promise-grid min-content overflow was observed before the minmax/wrapping fix; final homepage and Aero Dining Chair page document width309 within320px viewport. Original newsletter logo is readable white on burgundy; original image with edited alt retains that treatment, different uploaded artwork retains its colours. Mobile headline no longer strands its final period. Shared product newsletter also fits.

Native keyboard pause/resume was exercised. After focus/hover left, running transform changed from x=-194.941 to x=-365.539 across observations; offscreen suspension was verified. Reduced-motion/lifecycle cases are component tests, not an OS preference acceptance claim. No forms, customer messages, orders or payments were sent. Browser error log empty at final check. Desktop/mobile screenshots retained in workspace reports.

## Security and compatibility

Optional `motion.autoplayTicker` and `homeCopy.chairsHeading` preserve omitted fields in legacy documents. UI fallbacks are true/Chairs without dirtying legacy drafts. No migration or authorization expansion. Existing origin/session/publisher/version checks remain enforced. Text stays escaped; validated media paths retained; visual ticker duplicates are aria-hidden and noninteractive.

Deploy compatible API/web together. Older strict readers reject newly persisted fields; rollback requires compatible content as well as compatible application code. Newsletter still reports unavailable and does not pretend to subscribe. Checkout and enquiry delivery remain disabled. Confirmed alert recipient is contact@maplefurnishers.com; sender/private credentials, controlled activation and receipt verification remain pending.

This source increment is not a production deployment. Production capacity and successful backup/recovery gates remain unresolved based on earlier observations; this increment performs no production writes or cleanup. Broader catalogue, commerce, reviews, newsletter-provider and full-route acceptance work remains on the active backlog.
