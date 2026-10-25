# Diwali campaigns and original homepage sections

Source: supplied Maple Figma file nTEPXzov9IuWraGF0Ace6V, section 973:438. Sixteen desktop/mobile pairs use individual exported artwork layers and HTML copy; no flattened reference screenshots are used as implementation assets. Source frame IDs and exact layer geometry are retained in diwali-campaigns.json. The 96 PNG layers total 2.83 MB. Category banner placement is completed by the accompanying Suggested Pages change.

Six homepage campaigns occupy the original Shopify announcement, dining, sofa/chair and dining/storage/console positions. All shopping CTAs route internally. The original hero CTA, starting prices, category/bestseller headings, brand statement and four clearance cards are preserved from the public Shopify homepage. The existing testimonial copy/video, values, cities and project form remain in place.

Instagram contains six real posts from the Maple profile, captured 26 October 2026. Images are local optimized assets and links open the original posts. This is a curated snapshot, not an automatically refreshing API integration. Newsletter subscription is unavailable; the form truthfully says no email was submitted and links to local contact, replacing the prior Shopify handoff. Enquiry notification and checkout limitations remain unchanged.

## Verification

Node 22.21.1. Failing behavior assertions were observed before implementation:
- Home campaign sequence: zero campaigns instead of six.
- Instagram: zero post cards instead of six.
- Category CTA override: /collections/beds instead of #collection-products.
- Original brand statement: undefined instead of original text.

All four cases then passed with `tsx --tsconfig apps/web/test/tsconfig.json --test apps/web/test/home-banners.test.tsx`. Two obsolete hero assertions were updated because they required invented copy and explicitly prohibited the original starting prices; lazy-video behavior assertions remain.

Full project tests, type checks and web production build pass. Dependency audit: zero vulnerabilities. Staged secret scan and static analysis are release gates, repeated after staging. Desktop and mobile browser checks show supplied artwork/copy and six Instagram cards; final combined release receives a separate public browser check. No new payments, messages or orders were submitted by tests.

## Catalogue load and mobile targets

A bounded process-local public catalogue cache shares in-flight reads across visitors, expires results after 30 seconds, and retains at most 64 keys. Each caller receives an isolated clone. Failed or schema-invalid responses are never cached; expiry refresh failures remain visible rather than serving indefinitely stale data. The key includes the API origin and complete public request URL. Cart, account, payment and checkout APIs are not cached. Each web process has its own cache, so multiple replicas may still issue independent refreshes.

RED: two simultaneous reads loaded twice instead of once; capacity test loaded three times instead of twice. GREEN: TTL, concurrent coalescing, independent caller mutation, eviction, retry and integration tests pass. Twenty simultaneous `getProducts` calls make one transport request. Mobile campaign CTAs have a minimum 44px height and 12px font; small labels have a minimum 10px font for readability.
