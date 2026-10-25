# Storefront UI progress — 25 October 2026

The development preview now includes the homepage's extended section sequence, product presentation, collection filters, contact/help, bulk enquiry and the shared footer. This is an ordinary extension of the existing Shopify-preserving direction in `PRODUCT.md`; it is not a redesign or a claim of complete visual or functional parity.

The visual authority remains [Maple's existing shop](https://shop.maplefurnishers.com) and the owner's exported theme, retained outside version control at `reference/shopify-153432359101/theme/` in the original workspace. Relevant source templates are `index.json`, `product.json`, `collection.json`, `collection.chairs.json`, `page.chairs.json`, `page.contact.json` and `page.bulk-enquiry.json`. Source templates are references, not proof that every section or app behavior has been reproduced.

## Implemented surfaces

| Route or surface | Current implementation | Boundary |
| --- | --- | --- |
| `/` | Existing workshop/category hero; responsive promotional artwork; Maple Difference; category and offer tiles; Nimbus reveal; social links; bestseller and chair product rails; collection tiles; testimonial; newsletter handoff; values; city imagery; project enquiry. | Instagram is a profile link, not a live feed. Promotional category landing pages and Nimbus continue on Shopify. Product rails use the available preview records. |
| `/products/[handle]` | Desktop vertical thumbnails and image stage, mobile gallery controls, image enlargement, variant image cards, selected price, quantity/cart, save control, custom enquiry, pincode enquiry context, accordions and review handoff. | Only imported products resolve locally. Serviceability is an enquiry prompt, not a live delivery result. Reviews and review writing remain on Shopify. Made-to-order or unavailable variants use enquiry. |
| `/collections/[handle]` | Desktop sidebar and mobile filter disclosure; search, availability, price and category filters; sorting, grid controls, counts and pagination. Public membership aliases are intersected with the imported catalogue. | `/collections/chairs` is a generic filtered collection. It does not reproduce the bespoke chair landing in the source theme. Collection counts and results describe the preview, not the full Shopify inventory. |
| `/pages/contact` | Contact details, map, enquiry form, help categories with expandable answers, mobile help dialog and cities. Product, variant, SKU and validated pincode query context can prefill an enquiry. | Submission composes email. Existing account/order services link to the live shop. Source help copy does not establish that those services exist locally. |
| `/pages/bulk-enquiry` | Source living-room hero and proposal form, trust/proof content, three-step process, IndiaMART section and cities. | Submission composes email; IndiaMART opens the existing business channel. Source marketing claims are reproduced content, not independently validated operating metrics. |
| Shared header/footer, `/cart`, `/favourites`, `/checkout` | Existing navigation, search, saved furniture and cart remain; footer now uses source logo artwork, shop/help links, customer care, collaboration contacts and social links. | Accounts, policies, story, blog and returns continue on existing services. Checkout remains unavailable. |

The collection aliases include dining chairs, center tables, accent chairs, dining sets, clearance, minimum-discount, price-band, dining and console-table collections. Membership is recorded in `apps/web/data/collection-membership.json`; it does not import the products named there. Unknown collection handles and unsupported `/pages/*` routes remain not-found responses.

## Content and media provenance

- The dated public snapshot in `apps/api/data/preview-catalog.json` contains **24 products**, captured at `2026-10-25T16:10:59.195Z`. Prices and availability are snapshot values, not live Keeri stock.
- Homepage copy, banners, icons, category imagery, testimonial content, contact/help content, bulk-page imagery and footer assets follow the public theme and original Shopify media. Product presentation supplements are in `apps/web/data/product-presentation.json`.
- The workshop clip and poster are local derivatives of the published Maple video; their source and conversion are documented in `apps/web/public/media/PROVENANCE.md`. Other media still uses original Shopify CDN URLs. No new generated product images were introduced in this extension; the filename of an inherited source asset is not a claim about how the original asset was created.
- Red Hat Display weights 400, 500 and 600 are now self-hosted alongside Manrope and Newsreader. The added home accents, footer and bulk-page treatment use it where assigned in the parity stylesheets.
- Next.js image handling supplies responsive optimization for supported image elements. Some original media remains direct video or picture content. This is not a completed asset-hosting migration or a production performance certification; R2 migration and production Core Web Vitals remain pending.

## Deliberate handoffs and unavailable behavior

Newsletter submission reveals a link to the live store and explicitly says the email has not been submitted. Reviews, account services and newsletter enrollment remain on Shopify. Instagram opens the actual profile. Nimbus, table and sofa promotional banners open their existing Shopify landing pages; the festive chair banner opens the current chair collection. These links preserve usable destinations while local bespoke templates and integrations remain incomplete.

Contact and homepage project forms compose email to `contact@maplefurnishers.com`; bulk enquiry composes email to `aayushi@maplefurnishers.com`. The visitor must send the message in their email app. There is no local lead persistence, delivery receipt or verified email-delivery result.

The frontend keeps the development-preview disclosure visible. Checkout is disabled, and the API retains `503 CHECKOUT_NOT_AVAILABLE`. Cart interaction does not reserve stock, collect payment or create a production order. The isolated backend adapters described in `keeri-integration.md` and `payments.md` do not enable live checkout, live Keeri publication or order handoff.

## Verification evidence

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

`DESIGN.md` and `.impeccable/design.json` are preserved as the incumbent design snapshot. No new visual system was approved, and this progress record does not rewrite their tokens, component previews or narrative. The following implementation differences were present when this documentation pass began:

- Their statement that Red Hat Display is not loaded is now historical; `app/layout.tsx` loads it and the new home/contact styles assign it.
- Their text-footer description predates the source-image footer now rendered by `components/footer.tsx`.
- Their initial product sizes, rounded image treatment and abbreviated layout inventory do not describe the new product overrides, vertical gallery or variant cards. For example, the current product title is 28px on desktop and 26px below 750px.
- Their 700px banner breakpoint and local `/collections/chairs` destination predate the current 749px responsive banner and Shopify destination. The added templates also use their own 749px, 767px, 990px and 1100px adjustments; these are not a silently approved replacement global breakpoint scale.
- Their original screenshot references and component samples describe the earlier implementation. The phase-two evidence above is the newer review set.

This drift is recorded rather than broadly repaired. Any future design-spec refresh should reconcile the current source and rendered templates deliberately, keeping the existing Shopify identity as authority and avoiding promotion of page-specific overrides into universal tokens.

Remaining work includes bespoke category landings, full catalogue coverage, live integrations for reviews/account/newsletter and social feeds, durable enquiry submission, complete responsive/template comparison, URL migration, asset hosting, live Keeri publication/reservations/order handoff, gateway activation and production deployment. No production deploy, DNS switch or modification to the live Shopify shop is included in this UI progress claim.
