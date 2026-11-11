# Landing page source evidence

Content and media were read from the owner's published Maple storefront on 25 October 2026. This is a dated content snapshot, not a live stock or price integration.

- `https://shop.maplefurnishers.com/pages/sofas`
- `https://shop.maplefurnishers.com/pages/tables`
- `https://shop.maplefurnishers.com/pages/chairs`
- `https://shop.maplefurnishers.com/pages/nimbus-collection`
- `https://shop.maplefurnishers.com/pages/our-story`

The owner-provided theme settings export at `reference/shopify-153432359101/theme/templates/` supplies section ordering, enabled content, desktop/mobile asset choices, grid column settings, and author copy. Category pages map to `page.sofas.json`, `page.tables.json`, and `page.chairs.json`. Nimbus uses `page.teracotta.json` (confirmed by public section IDs); Our Story uses `page.about-us.json`.

`landing-categories.json` contains the three category page content records. `landing-nimbus.json` and `landing-story.json` contain selected enabled section content.

**11 November 2026 (owner: nothing from Shopify stays on the store).** The original media URLs were Shopify files and have been removed from these records. Each category banner and circle now names a Keeri product (`product`) whose own photo stands in until staff upload artwork; the values' icons are gone. Product rails name only Keeri products: a piece that existed only on Shopify was replaced by its Keeri version of the same design where Keeri has one, else by a published Keeri piece of the same kind with photos (`retired-products.json`, `replacements`). `landing-catalog.json`, the fallback "Price on request" cards drawn from Shopify for pieces missing from the catalogue, was deleted: a rail shows only what the catalogue lists.

All application components, CSS, interaction behavior and responsive rendering are independently written React implementations. No Liquid implementation or vendor scripts are included. Public HTML was inspected transiently in `/tmp/maple-landing-source/`; only required content and original media references are retained here.

Product rows resolve the named cards from the owned API in one batch per page; a piece the catalogue does not list is left out.

Nimbus enquiries reuse the project form and POST to the persistent local enquiry endpoint. A successful response returns an idempotent preview reference with `mode: preview` and `notificationSent: false`; the UI explicitly states that the enquiry was saved in this development preview and that team notification is not confirmed. The asynchronous alert may be queued or accepted by its provider; the public receipt does not confirm inbox delivery. There is no email-app handoff. See `docs/enquiries.md` for persistence and retry boundaries.

Video controls respect reduced-motion preferences and provide a pause/play control. The source's embedded Judge.me widget on Our Story is not replaced by fabricated reviews.

Phase 3 browser evidence covers all five routes at desktop and mobile widths, with no horizontal overflow or broken loaded images in those checks. Read-more expansion/collapse, Nimbus pause, next-room response and a synthetic local enquiry receipt were exercised. Screenshots are retained under `.impeccable/review/phase3/` and indexed in `docs/ui-parity-progress.md`. The review accepted those captures and a bounded first-viewport visual match; it does not certify full-page, all-viewport or complete Shopify parity. TypeScript and HTTP reachability checks likewise do not establish pixel parity.
