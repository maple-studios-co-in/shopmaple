# Storefront presentation and local catalogue — 26 October 2026

The floating development badge no longer covers public pages. Checkout remains unavailable because its real commerce dependencies are not activated; removal of the badge does not enable purchases or change transaction messages, noindex, stock, or pricing.

Offer artwork now uses its original 288:126 proportions and `contain`, preserving embedded text. The exact 12 Shopify WOFF2 faces are locally hosted with their OFL notices and provenance. This includes real Newsreader bold italic; the testimonial heading follows source styling at 48px desktop / 32px through 990px. The favicon is the original Maple logo image.

Workshop, ticker, and autoplay-carousel play/pause controls appear on desktop hover or keyboard focus. Touch/coarse-pointer devices retain visible controls. Carousel arrows, disabled/reduced-motion states, playback scheduling, and explicit video start are unchanged.

## Verification

- Badge regression: existing characterization 2/2 passed; new rendered-component test failed with an unexpected `HTMLElement` instead of `null`; removing the aside made 3/3 pass. Focused related integration: 40/40, including video lifecycle cases. Command: `cd apps/web && npx tsx --tsconfig test/tsconfig.json --test test/admin-chrome.test.tsx` with Node 22.
- Declarative CSS: browser showed original 288×126 artwork cropped into 285.25×190.156 with `cover`; corrected desktop result is 285.25×124.797 with `contain`. Mobile at 390px has no document overflow and preserves the artwork ratio. PostCSS parses all modified stylesheets.
- Browser confirmed badge absence, generated `/icon.jpg` metadata, Manrope body and Newsreader headings, 700 italic testimonial styling at 48px desktop / 32px mobile, hidden desktop controls revealed by hover/focus, and visible carousel arrows. Physical touch hardware was not tested; coarse-pointer behavior was reviewed in CSS.
- Independent review matched all 12 font binaries and the icon byte-for-byte to the original storefront; font metadata and source declarations agree. Included licenses match embedded notices.
- Final `npm test`: 1,021 passing tests (334 API, 634 web, 53 deployment); separate guarded recovery suite: 5 passing tests. Dedicated test database only. Node 22 typecheck and API/web build pass.
- Homepage initial JavaScript: 257,391 raw / 77,874 gzip bytes, within the existing budget. No animation dependency or new client logic was added.
- Dependency, redacted secret and static checks passed before commit. Final-commit scan and exact-head CI are separate release gates recorded with the PR; this document does not claim deployment.

## Local catalogue operation

Local development used an obsolete 85-product / 115-variant seed. A restore-tested private backup preceded the existing transactional union import. Local now contains 539 published products / 1,050 variants, matching the production union: the complete pinned Shopify capture from 25 October (186 products / 284 variants) plus a fresh Keeri export (385 / 798), with 32 exact model merges.

All prior product/variant IDs and handles survived; all 18 non-catalogue tables retained identical row counts and content fingerprints, including carts and enquiries. Eleven API pages returned 539 unique products and 1,050 variants; representative new Shopify and Keeri product pages returned 200. No production data was changed. This operational refresh is not a new continuous sync job or a fresh Shopify capture.

Missing details remain explicit: 776 variants lack verified buyer prices and 363 products lack approved images. No stock, prices, or images were invented.

## Checkout and production limitations

Read-only production audit found no checkout-eligible stocked variants, no Keeri inventory rows, and a catalogue-only service credential. Current Keeri variants are made to order; checkout requires an agreed made-to-order payment/lead-time policy or real stocked inventory. Razorpay composition/credentials, commerce policy and worker activation are absent. Keeri includes a Shiprocket serviceability client, but checkout quotes do not consume it. Keeri's deployed v2 order path does create confirmed sales orders after validated capture; source presence is not live end-to-end evidence.

The production root filesystem is full and the latest scheduled paired backup failed. Production release remains `26bd9aa185a4cecdf173bd0e550003e594a7205b`. Safe capacity, successful backup/recovery and compatible rollout verification are required before deploying this increment. The broader project goal and checkout work remain open.
