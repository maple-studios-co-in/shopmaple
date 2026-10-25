# Suggested-page UI and source-content provenance

Captured 26 October 2026 from the authorized Maple Shopify Admin connector and public shop.maplefurnishers.com pages. No customer, order, credential or private account data is included.

## Original copy

- `store-content.json` contains the four published legal policies and ten published Recent Stories articles, as a text/element tree. Public page HTML was compared against the generated tree for all 14 documents: visible text matches after whitespace normalization and the user-authorized phone (9211819727 → 8796130252) and support email (support@ → contact@maplefurnishers.com) changes.
- Script/style/widget/form markup, inline styling and event attributes are omitted. The React renderer escapes text, permits a small set of structural tags, validates URL schemes and permits only approved public media hosts. Navigation to the former shop is mapped locally.
- `source-collections.json` contains 66 complete Shopify collection memberships, fetched with pagination. The canonical Chairs collection was deliberately excluded from this supplemental snapshot because its first 50 products were incomplete; canonical collections use the live catalogue categories. Exact source handles determine specialist collection membership, including products whose generic category is unknown.
- Collection membership is a migration snapshot, not live Shopify synchronization. New unknown-category Keeri models remain discoverable through All Furniture. Membership should eventually be maintained in Keeri.
- About, contact, category and bulk enquiry copy continues to come from the existing exported Shopify theme/data. The original timeline and business claims were retained without adding new claims.
- Account availability, missing prices/media, enquiries and disabled checkout use truthful operational copy instead of simulating unavailable functionality.

## Suggested Figma reference

File `nTEPXzov9IuWraGF0Ace6V`, Suggested page `251:453`; high-fidelity contexts read for Help Center `251:512`, Our Story `251:515`, Wishlist/Account `251:518`, Chair category `251:517`, listing `251:619`, PDP `251:527`. These references contain raster screenshots rather than editable component trees. Implemented the useful layout and interaction changes in native responsive components; pixel-for-pixel certification of every raster screen is not claimed.

This pass covers compact contact/help sections, the story hero/values/timeline, circular category shortcuts, collection/product hierarchy, a working local wishlist drawer, truthful local account support, internal policies/articles/returns, source collection routes and the Sofas & Chairs union. Existing nullable-product enquiry behavior is retained. Campaign artwork/components and homepage Instagram/reviews are handled separately.

The fixed WhatsApp link uses the user-authorized business number +91 8796130252. The SVG glyph comes from Simple Icons (`icons/whatsapp.svg`, CC0), fetched from its official GitHub repository; it opens a user-initiated conversation without a message payload. No third-party chat widget or tracking script is embedded.

## Verification

Meaningful RED → GREEN regressions cover internal menu/footer destinations, complete specialist membership, the Sofas & Chairs union, safe source-content rendering, wishlist/account panels, absence of Shopify review handoff, WhatsApp destination/accessibility, page metadata, and current category campaign routing. Full tests, types, production build and security results are reported with the immutable implementation commit rather than implied by this provenance document.
