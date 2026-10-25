# Storefront continuation: Shopify UI and commerce adapters

The custom store keeps Next.js/React and Express/Prisma in one repository. Preserve the exported Shopify theme's content, section order, typography and imagery while moving presentation into React. Keeri remains the intended product source; Medusa is excluded.

## Work tracks
- Homepage: source-order sections, offer/category links, product rails, Nimbus selector, newsletter, brand values, cities, project form and footer.
- Product pages: vertical gallery, selected variant cards, sale/compare pricing, customization and delivery enquiries, source descriptions, related products.
- Collection browsing: source listing/sidebar/sort/grid layout; exact public collection membership for preview aliases.
- Contact and bulk enquiry: enabled theme sections and forms that honestly compose an email until submission storage exists.
- Keeri: strict export projection, validated public mapping, atomic full-snapshot sync, stale/replay protection, published-variant filtering and unavailable purchase state.
- Payments: isolated Razorpay adapter, authenticated signatures and captured-payment verification, no public payment routes yet.

## Verification and boundaries
Run API/database and web tests, types and production build. Compare actual local desktop/mobile pages with the live reference and check gallery, variants, filters, enquiry forms, carousel and cart. Review backend changes independently.

Shopify app integrations are not copied: Instagram uses the real profile, reviews/account/newsletter continue on the current store. Preview catalogue membership is a public snapshot, not a complete live feed. Keeri service authentication, reservations, durable orders, payment inbox/reconciliation and order export remain necessary before checkout can be enabled. No production deploy or DNS switch is part of this change.
