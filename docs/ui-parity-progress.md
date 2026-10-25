# Storefront UI progress — 25 October 2026

The development preview includes the homepage, product presentation, collection filters, contact/help, bulk enquiry, shared footer and five added landing pages: Sofas, Tables, Chairs, Nimbus and Our Story. This is an ordinary extension of the existing Shopify-preserving direction in `PRODUCT.md`; it is not a redesign or a claim of complete visual or functional parity.

The visual authority remains [Maple's existing shop](https://shop.maplefurnishers.com) and the owner's exported theme, retained outside version control at `reference/shopify-153432359101/theme/` in the original workspace. Relevant source templates are `index.json`, `product.json`, `collection.json`, `collection.chairs.json`, `page.chairs.json`, `page.contact.json` and `page.bulk-enquiry.json`. Source templates are references, not proof that every section or app behavior has been reproduced.

## Menu correction — current extension and evidence

The shared navigation now follows the public Shopify menu structure rather than the earlier abbreviated dropdown and flat mobile popup. This is an ordinary extension of the existing source-preservation direction, with no new visual identity. Desktop Living Room opens a full-width panel containing four category columns; Bedroom contains three. The mobile menu is a left-side drawer with the same category hierarchy, nested views, a Back control and horizontally scrolling product previews. The mobile breakpoint is 749px. The source and destination adaptations are recorded in [navigation provenance](../apps/web/data/navigation-PROVENANCE.md).

The navigation uses Red Hat Display, the source's gray links and thin column dividers, and the existing cream canvas. The layout now self-hosts Red Hat Display weight 700 as well. Pointer hover, click and keyboard interaction open desktop groups one at a time; Escape, outside pointer interaction and focus leaving the navigation dismiss them. The mobile drawer locks background scrolling, closes on Escape and returns focus to the opening control; Back returns to the selected category control. Supported local destinations remain local, unsupported collections retain their exact Shopify URLs, and previously dead source anchors receive local category or contextual-enquiry destinations. The six featured product cards continue to link to Shopify and display dated snapshot prices, not live Keeri prices or stock.

The focused review disposition is **SHIP for this menu correction only**. The valid source/implementation screenshot pairs show the Bedroom desktop panel, mobile root drawer and Living Room mobile submenu. Their structure and presentation are source-aligned, with minor font and line-position differences still visible; this is not a claim of pixel-identical navigation or whole-site parity. Evidence is retained locally under `.impeccable/review/menu/`:

- `source-bedroom.png` and `implementation-bedroom.png`.
- `source-mobile.png` and `implementation-mobile.png`.
- `source-mobile-submenu.png` and `implementation-mobile-submenu.png`.
- `implementation-desktop.png` records the Living Room desktop panel. `source-desktop.png` is excluded from visual acceptance because a newsletter overlay obscures that capture.

The integrating agent reported desktop opening/dismissal checks, both mobile groups and Back navigation, plus Escape closure, trigger focus restoration and body-scroll restoration. The final local suite passed 74 tests (14 web and 60 API); workspace typechecks and production builds passed. The JSDOM harness substitutes only Next Image rendering; actual optimized image loading was checked in the browser. Latest-commit CI and merge status are verified separately. These tests establish the checked behaviors, not exhaustive viewport or live-service equivalence.

`DESIGN.md` and `.impeccable/design.json` are unchanged by this correction. Their historical native-disclosure navigation, generic mobile dialog, 700px header breakpoint and earlier font inventory do not describe this menu. The current implementation is in `components/navigation.tsx`, `lib/navigation.ts` and `styles/navigation-parity.css` under `apps/web/`; this scoped record does not silently refresh the broader design specification.

## Phase 3 — landing extension and evidence

The five new local routes are `/pages/sofas`, `/pages/tables`, `/pages/chairs`, `/pages/nimbus-collection` and `/pages/our-story`. Their section order, enabled copy, media and page-specific typography follow the published storefront and exported theme settings, as recorded in `apps/web/data/landing-PROVENANCE.md`. The homepage promotional links and story link now reach these local pages. The bespoke Chairs landing is `/pages/chairs`; `/collections/chairs` remains a filtered collection. Unsupported specialist collection destinations retain links to the exact original Shopify collection.

The dated public snapshot now contains **85 products**, captured at `2026-10-25T16:27:34.633934+00:00`; **all 73 products used by the landing pages resolve locally**. This covers those landing products, not an independently verified complete Shopify inventory or live Keeri stock. Category product rows share a `React.cache` catalogue lookup that makes two paginated API requests per server render at the current catalogue size. Missing products retain exact source-product links, and API failures propagate rather than silently substituting fallback cards.

Contact, bulk and home/Nimbus project forms now POST to `/api/enquiries` through the same-origin proxy. The backend durably stores validated enquiries and returns an idempotent reference with `mode: preview` and `notificationSent: false`. The UI says that the enquiry was saved in this development preview and has not been sent to the team. This supersedes the Phase 2 email-app handoff. There is no team notification, staff inbox or verified email delivery; see `enquiries.md` for retry and production-readiness limits.

The unmounted order foundation freezes server-calculated pricing, gates provider-order creation on a verified reservation, persists authenticated webhook events in an inbox, and atomically records capture with a pending Keeri outbox entry. It has no real reservation adapter, running inbox/outbox worker, merchant gateway access or confirmed Keeri delivery. Checkout remains unavailable and continues to return `503 CHECKOUT_NOT_AVAILABLE`. These are local service foundations, not completed checkout or order fulfillment; see `order-flow.md` and `payments.md`.

The integration run reported **71 passing tests: 60 API and 11 web**, with workspace typecheck and production build passing. The browser checks covered all five new routes at desktop and mobile widths and found no horizontal overflow or broken images among loaded images. Read-more expanded and collapsed, Nimbus pause worked, the next-room control responded, and a synthetic local enquiry submission displayed a preview reference. HTTP smoke checks passed for **92 unique internal destinations**; reachability does not prove every destination's behavior.

Phase 3 screenshots are retained under `.impeccable/review/phase3/`:

- `sofas-desktop.png`, `sofas-mobile.png`, `sofas-reference-desktop.png`.
- `tables-desktop.png`, `tables-mobile.png`.
- `chairs-desktop.png`, `chairs-mobile.png`.
- `nimbus-desktop.png`, `nimbus-collection-mobile.png`.
- `our-story-desktop.png`, `our-story-mobile.png`.
- `enquiry-mobile.png`.

The reviewer accepted the screenshots as valid evidence and a bounded first-viewport visual match. The packet records actual widths of 1269px desktop and 379px mobile (390px requested), with a supplied desktop Sofas source comparison; other routes use recorded theme/public-source settings. This is not full-page, all-viewport or complete Shopify parity. The review's remaining documentation corrections were the obsolete Red Hat Display statement in `DESIGN.md` and the obsolete email-app handoff in landing provenance; both are corrected by this documentation pass. No detector rerun or broader design-system rewrite is part of that disposition.

## Phase 2 — historical implementation record

The sections below retain the earlier Phase 2 implementation and evidence. Product counts, handoffs, route coverage and test totals in this historical record describe that earlier state; the Phase 3 section above supersedes them where behavior has changed.

### Implemented surfaces at Phase 2

| Route or surface | Phase 2 implementation | Phase 2 boundary |
| --- | --- | --- |
| `/` | Existing workshop/category hero; responsive promotional artwork; Maple Difference; category and offer tiles; Nimbus reveal; social links; bestseller and chair product rails; collection tiles; testimonial; newsletter handoff; values; city imagery; project enquiry. | Instagram is a profile link, not a live feed. Promotional category landing pages and Nimbus continue on Shopify. Product rails use the available preview records. |
| `/products/[handle]` | Desktop vertical thumbnails and image stage, mobile gallery controls, image enlargement, variant image cards, selected price, quantity/cart, save control, custom enquiry, pincode enquiry context, accordions and review handoff. | Only imported products resolve locally. Serviceability is an enquiry prompt, not a live delivery result. Reviews and review writing remain on Shopify. Made-to-order or unavailable variants use enquiry. |
| `/collections/[handle]` | Desktop sidebar and mobile filter disclosure; search, availability, price and category filters; sorting, grid controls, counts and pagination. Public membership aliases are intersected with the imported catalogue. | `/collections/chairs` is a generic filtered collection. It does not reproduce the bespoke chair landing in the source theme. Collection counts and results describe the preview, not the full Shopify inventory. |
| `/pages/contact` | Contact details, map, enquiry form, help categories with expandable answers, mobile help dialog and cities. Product, variant, SKU and validated pincode query context can prefill an enquiry. | Submission composes email. Existing account/order services link to the live shop. Source help copy does not establish that those services exist locally. |
| `/pages/bulk-enquiry` | Source living-room hero and proposal form, trust/proof content, three-step process, IndiaMART section and cities. | Submission composes email; IndiaMART opens the existing business channel. Source marketing claims are reproduced content, not independently validated operating metrics. |
| Shared header/footer, `/cart`, `/favourites`, `/checkout` | Existing navigation, search, saved furniture and cart remain; footer now uses source logo artwork, shop/help links, customer care, collaboration contacts and social links. | Accounts, policies, story, blog and returns continue on existing services. Checkout remains unavailable. |

The collection aliases include dining chairs, center tables, accent chairs, dining sets, clearance, minimum-discount, price-band, dining and console-table collections. Membership is recorded in `apps/web/data/collection-membership.json`; it does not import the products named there. Unknown collection handles and unsupported `/pages/*` routes remain not-found responses.

### Phase 2: Content and media provenance

- The dated public snapshot in `apps/api/data/preview-catalog.json` contains **24 products**, captured at `2026-10-25T16:10:59.195Z`. Prices and availability are snapshot values, not live Keeri stock.
- Homepage copy, banners, icons, category imagery, testimonial content, contact/help content, bulk-page imagery and footer assets follow the public theme and original Shopify media. Product presentation supplements are in `apps/web/data/product-presentation.json`.
- The workshop clip and poster are local derivatives of the published Maple video; their source and conversion are documented in `apps/web/public/media/PROVENANCE.md`. Other media still uses original Shopify CDN URLs. No new generated product images were introduced in this extension; the filename of an inherited source asset is not a claim about how the original asset was created.
- Red Hat Display weights 400, 500 and 600 are now self-hosted alongside Manrope and Newsreader. The added home accents, footer and bulk-page treatment use it where assigned in the parity stylesheets.
- Next.js image handling supplies responsive optimization for supported image elements. Some original media remains direct video or picture content. This is not a completed asset-hosting migration or a production performance certification; R2 migration and production Core Web Vitals remain pending.

### Phase 2: Deliberate handoffs and unavailable behavior

Newsletter submission reveals a link to the live store and explicitly says the email has not been submitted. Reviews, account services and newsletter enrollment remain on Shopify. Instagram opens the actual profile. Nimbus, table and sofa promotional banners open their existing Shopify landing pages; the festive chair banner opens the current chair collection. These links preserve usable destinations while local bespoke templates and integrations remain incomplete.

Contact and homepage project forms compose email to `contact@maplefurnishers.com`; bulk enquiry composes email to `aayushi@maplefurnishers.com`. The visitor must send the message in their email app. There is no local lead persistence, delivery receipt or verified email-delivery result.

The frontend keeps the development-preview disclosure visible. Checkout is disabled, and the API retains `503 CHECKOUT_NOT_AVAILABLE`. Cart interaction does not reserve stock, collect payment or create a production order. The isolated backend adapters described in `keeri-integration.md` and `payments.md` do not enable live checkout, live Keeri publication or order handoff.

### Phase 2: Verification evidence

The integration run reported **44 passing tests: 37 API and 7 web**, followed by a passing workspace typecheck and production build. The web tests cover returning-cart initialization and failure handling, collection membership, same-variant price/availability filtering, malformed query handling, price sorting without list mutation, and pagination query preservation. Those checks do not certify visual parity or third-party service behavior.

The integrating agent completed these browser checks on the local preview:

| Check | Observed result |
| --- | --- |
| Product gallery | Selecting the second image changed the displayed image. |
| Variant and cart | Selecting Desert Taupe and adding to cart produced a cart line for Desert Taupe with quantity 1. |
| Mobile collection filters | Applying maximum price ₹24,000 returned 10 of the 24 preview products. |
| Mobile contact help | Payment & Invoice opened the help dialog; Escape closed it. |
| Contextual enquiry | Contact displayed the linked product, variant, SKU and pincode `110015`. |
| Homepage carousel | Next on the Bestsellers rail advanced the rail. |
| Route rendering | Desktop/mobile captures of home, product, collection, contact and bulk enquiry showed no horizontal overflow or broken images among loaded images. |
| Homepage internal links | HTTP smoke checks returned 200 for 33 unique internal homepage destinations. This is route reachability, not proof of complete destination behavior. |

Mail composition/submission, newsletter enrollment and payment were not submitted in these browser checks. No actual email delivery, subscriber creation, payment, shipment, production order or live stock reservation is claimed.

Review evidence is retained locally under `.impeccable/review/phase2/`:

- `home-desktop.png`, `home-mobile.png`, `home-full-desktop.png`, `home-full-mobile.png`.
- `product-desktop.png`, `product-mobile.png`, `product-reference-desktop.png`, `product-reference-mobile.png`.
- `collection-desktop.png`, `collection-mobile.png`.
- `contact-desktop.png`, `contact-mobile.png`, `bulk-desktop.png`, `bulk-mobile.png`.

The final UI review reported its three findings closed: four promotional link destinations, bulk-page text contrast, and variant thumbnail presentation. Its verdict permits a bounded development preview. The screenshots, spot checks and review verdict do not establish pixel equivalence at every viewport or full storefront parity.

## Design-document scope and remaining drift

`DESIGN.md` frontmatter and `.impeccable/design.json` remain the historical incumbent design snapshot. No new visual system was approved. The Phase 3 documentation pass narrowly corrected the obsolete font claim and recorded extension provenance in `DESIGN.md`; it preserved all existing token values and left the sidecar untouched. The subsequent menu correction leaves both files unchanged and records its differences above. The following pre-existing drift remains documented rather than broadly repaired:

- The obsolete Red Hat Display statement in `DESIGN.md` is corrected: `app/layout.tsx` self-hosts weights 400, 500, 600 and 800, and the parity stylesheets assign it. The preserved frontmatter and sidecar do not provide a complete inventory of these page-specific typography roles.
- Their text-footer description predates the source-image footer now rendered by `components/footer.tsx`.
- Their initial product sizes, rounded image treatment and abbreviated layout inventory do not describe the new product overrides, vertical gallery or variant cards. For example, the current product title is 28px on desktop and 26px below 750px.
- Their 700px banner breakpoint and local `/collections/chairs` destination predate the current 749px responsive banner and `/collections/chair-collection` destination. The added templates also use their own 749px, 767px, 990px and 1100px adjustments; these are not a silently approved replacement global breakpoint scale.
- Their original screenshot references and component samples describe the earlier implementation. The Phase 2 and Phase 3 evidence above provides the later review sets; neither certifies full parity.

This drift is recorded rather than broadly repaired. Any future design-spec refresh should reconcile the current source and rendered templates deliberately, keeping the existing Shopify identity as authority and avoiding promotion of page-specific overrides into universal tokens.

Remaining work includes verifying catalogue coverage beyond the landing-page snapshot, live integrations for reviews/account/newsletter and social feeds, production enquiry operations and notifications, complete responsive/template comparison, URL migration, asset hosting, live Keeri publication/reservations/order handoff, gateway activation and production deployment. No production deploy, DNS switch or modification to the live Shopify shop is included in this UI progress claim.
