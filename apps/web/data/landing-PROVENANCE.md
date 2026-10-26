# Landing page source evidence

Content and media were read from the owner's published Maple storefront on 25 October 2026. This is a dated content snapshot, not a live stock or price integration.

- `https://shop.maplefurnishers.com/pages/sofas`
- `https://shop.maplefurnishers.com/pages/tables`
- `https://shop.maplefurnishers.com/pages/chairs`
- `https://shop.maplefurnishers.com/pages/nimbus-collection`
- `https://shop.maplefurnishers.com/pages/our-story`

The owner-provided theme settings export at `reference/shopify-153432359101/theme/templates/` supplies section ordering, enabled content, desktop/mobile asset choices, grid column settings, and author copy. Category pages map to `page.sofas.json`, `page.tables.json`, and `page.chairs.json`. Nimbus uses `page.teracotta.json` (confirmed by public section IDs); Our Story uses `page.about-us.json`.

`landing-categories.json` contains the three category page content records. `landing-nimbus.json` and `landing-story.json` contain selected enabled section content and original media URLs. `landing-catalog.json` contains 73 distinct products visibly rendered across those landing pages, including their public title, first image and displayed price text. The rendered product order is preserved in each page record.

All application components, CSS, interaction behavior and responsive rendering are independently written React implementations. No Liquid implementation or vendor scripts are included. Public HTML was inspected transiently in `/tmp/maple-landing-source/`; only required content and original media references are retained here.

Product rows resolve the owned API's complete paginated catalogue once per server request through `React.cache`; API errors propagate rather than silently showing stale fallback cards. For products missing from that catalogue, the source card links to that exact product on the original store and has no fabricated local add-to-cart operation. Unsupported collection destinations likewise link to the exact original collection rather than a local 404. The public prices in fallback cards remain snapshot values.

The current public preview snapshot contains 85 products, and all 73 landing-page products resolve locally. At this catalogue size, the cached lookup makes two paginated API requests per server render; it is not one request per product row. Specialist collection destinations without local support retain their exact Shopify links.

Nimbus enquiries reuse the project form and POST to the persistent local enquiry endpoint. A successful response returns an idempotent preview reference with `mode: preview` and `notificationSent: false`; the UI explicitly states that the enquiry was saved in this development preview and that team notification is not confirmed. The asynchronous alert may be queued or accepted by its provider; the public receipt does not confirm inbox delivery. There is no email-app handoff. See `docs/enquiries.md` for persistence and retry boundaries.

Video controls respect reduced-motion preferences and provide a pause/play control. The source's embedded Judge.me widget on Our Story is not replaced by fabricated reviews.

Phase 3 browser evidence covers all five routes at desktop and mobile widths, with no horizontal overflow or broken loaded images in those checks. Read-more expansion/collapse, Nimbus pause, next-room response and a synthetic local enquiry receipt were exercised. Screenshots are retained under `.impeccable/review/phase3/` and indexed in `docs/ui-parity-progress.md`. The review accepted those captures and a bounded first-viewport visual match; it does not certify full-page, all-viewport or complete Shopify parity. TypeScript and HTTP reachability checks likewise do not establish pixel parity.
