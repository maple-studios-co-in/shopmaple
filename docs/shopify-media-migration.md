# Page artwork after Shopify

**Owner decision, 11 November 2026: nothing from Shopify stays on the store.** No product data, photos, page artwork
or films are loaded from Shopify (`cdn.shopify.com`, `*.myshopify.com`, `shop.maplefurnishers.com/cdn/…`), and there
is no copy step: the earlier plan to copy Shopify's files to the server (`/media/shopify/…`, its copy tool, proxy and
`SHOPIFY_MEDIA_*` settings) was withdrawn.

- **Products** come from Keeri alone, with Keeri's photos ([keeri-integration.md](keeri-integration.md)).
- **Page artwork** is replaced by staff uploads in the store admin (Content, Artwork, and the homepage section
  fields). Until a placement has an upload it shows, where the store has one, a Keeri product's own photo (the
  placement's `product` in `apps/web/lib/template-media-defaults.ts` or `apps/web/data/landing-categories.json`), and
  otherwise nothing: icons, films and a few images are simply left out. An upload always wins.
- **Films** cannot be uploaded yet; the homepage hero, the Nimbus page and the testimonial show stills instead.
- **Stored content** saved before this decision may still name Shopify's files (the published homepage hero did). It is
  read without them (`withoutShopifyMedia` in `packages/contracts`), and new content naming Shopify media is refused.

`SITE_URL` is the store's address and `SITE_ALIASES` its other addresses during the move to `shop.maplefurnishers.com`
(see [seo.md](seo.md)); `shop.maplefurnishers.com` is the store's own new address, not Shopify.

A test (`apps/web/test/no-shopify-media.test.tsx`) fails if a data file, code constant or rendered public page names
a Shopify media address.
