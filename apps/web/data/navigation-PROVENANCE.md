# Navigation provenance — 25 October 2026

The visual and content authority is the owner's existing [Maple Shopify storefront](https://shop.maplefurnishers.com/). This work preserves its menu hierarchy and presentation; it does not introduce a new design direction.

## Source records

- `navigation.json` was extracted from the public storefront header on 25 October 2026. It preserves the five top-level labels and source links, the four Living Room columns with 27 links, and the three Bedroom columns with 13 links. Living Room and Bedroom are disclosure controls in the implementation.
- The owner's exported `sections/header-group.json`, retained outside version control under `reference/shopify-153432359101/theme/` in the original workspace, corroborates the Red Hat Display menu treatment, gray submenu links (`#555`), black desktop headings and thin dividers. Its Liquid implementation was not copied into the running application.
- `navigation-products.json` records titles, original Shopify CDN image URLs, prices and compare-at prices from public `/products/{handle}.js` responses on the same date. Amounts are integer paise. The main mobile menu shows Veyra Chest of Drawers, Rowan Bookcase, Elion Storage Cabinet and Arden Console Cabinet; the Living Room submenu shows Morik Media Unit and Zylen Media Unit. Bedroom has no featured-product rail.
- These six product cards use Next.js image optimization and link to their exact Shopify product URLs. Their prices are a dated public snapshot, with no live availability claim or additional catalogue import implied.

## Destination adaptations

`../lib/navigation.ts` keeps implemented page routes and supported collection handles local. Collection support comes from the base local categories and `collection-membership.json`; other source collection paths retain their exact `https://shop.maplefurnishers.com` destination. In particular, Outdoors keeps `/collections/outdoor-furnitures` rather than an invented local alias.

Source links with the literal `#` receive usable destinations: Beds and By Size open `/collections/beds`, Dining Table opens `/collections/dining`, and the other leaf anchors open `/pages/contact?product=...` with the source label as enquiry context. These are deliberate functional adaptations; they do not establish new category inventory or serviceability.

## Review boundary

Desktop panels and the nested mobile drawer were compared with the public source. The accepted evidence and scoped menu-only review are recorded in [UI progress](../../../docs/ui-parity-progress.md). Minor font and line-position differences remain; no pixel-identical or complete storefront parity claim is made. Keyboard focus and dismissal remain usable, including a visible dark mobile close icon. The development-preview and unavailable-checkout boundaries continue to apply.
