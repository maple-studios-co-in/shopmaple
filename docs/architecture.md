# Custom commerce architecture

Decision recorded: 25 October 2026.

The product owner selected an independent storefront with an owned commerce backend and Keeri as the product source. Medusa is excluded. The technical defaults below guide implementation; they do not represent completed or tested integrations.

## Components

| Component | Choice | Responsibility |
|---|---|---|
| Storefront | Next.js, React, TypeScript | Server-rendered catalogue pages and interactive shopping UI matching the current shop. |
| Commerce API | Node.js, Express, Zod | Carts, checkout attempts, orders, gateway integration, refunds and reservation coordination. |
| Persistence | PostgreSQL, Prisma | Transactions, uniqueness constraints, immutable commercial snapshots and a durable integration outbox. |
| Product source | Keeri service API | Approved products, stable variant IDs, price inputs, stock policy, product specifications and media references. |
| Media | Cloudflare R2/CDN plus image processing | Versioned responsive image variants, modern formats and caching. |
| Payments | Hosted gateway with server adapter | Provider handles payment credentials; our API verifies payment state and reconciles events. |

Use the existing Maple TypeScript/Express/Prisma conventions. Keep the commerce module separate from Keeri's admin interface and database migrations. Redis is not a first-release prerequisite; durable work is recorded in PostgreSQL.

## Ownership and integration

Keeri remains the product and operational system. The commerce API owns online carts, checkout attempts, payment/refund transitions and online order snapshots. Paid orders are handed to Keeri through a durable, idempotent integration keyed by the commerce order ID. Reuse Keeri's sales-order and invoice capabilities rather than build another ERP.

Publish approved catalogue data into a local read model so browsing does not depend on Keeri's availability. Revalidate prices and availability at checkout. Historical order totals do not change when catalogue prices change. Persist money in integer paise with explicit currency.

Stock reservation must work across online and offline sales. A periodically copied stock count is insufficient. Require either a shared atomic reservation operation or a protected online stock allocation that offline sales cannot consume. Otherwise the affected item stays enquiry-only. Define expiration, cancellation and late-payment reconciliation for reservations.

## Checkout correctness

- Calculate prices, shipping and taxes on the server. Freeze the commercial facts accepted by the buyer.
- Scope guest carts and order access with opaque credentials; public order numbers are not authentication.
- Persist checkout attempts and deduplicate repeat submissions before creating gateway orders.
- Verify gateway callbacks, expected amount/currency and provider order identity. Do not mark an order paid solely from a browser redirect.
- Deduplicate events and handle retries, timeouts and out-of-order delivery transactionally.
- Persist Keeri handoff and notification jobs alongside order transitions; recover and alert when downstream delivery fails.
- Track refunds separately from cancellations and reconcile provider confirmation before updating operational payment records.

## UI and performance

Reproduce the current storefront's layout, typography, spacing, product cards, variants, menus and cart behavior. Compare rendered pages at matching desktop and mobile viewports. Theme files are references, not proof of visual parity; product media and app-owned widgets/data are separate migration work.

Server-render and cache public catalogue pages; invalidate on publication. Generate responsive image sizes, prioritise visible hero media, lazy-load below-fold content and reserve media dimensions. Avoid shared caches for carts, checkout and account responses. Load third-party functionality only where needed while preserving required customer behavior.

Initial performance targets are LCP at most 2.5 seconds, CLS at most 0.1 and INP at most 200 milliseconds. These are targets, not measurements or guarantees.

## First implementation slice

1. Catalogue adapter and matching home, collection and product pages.
2. Guest cart and server-calculated checkout for one approved ready-stock variant.
3. One payment gateway in sandbox, verified payment confirmation and one Keeri order handoff.
4. Refund, duplicate-event, last-item concurrency and handoff-retry verification.
5. Made-to-order enquiries with the correct selected variant context.

The initial development target is a release candidate on 26 October 2026. Live switching depends on successful end-to-end verification, shipping rules, stock safety, URL coverage and a rollback path. Existing accounts, order history, reviews, discounts and app functionality require a migration inventory before claiming replacement parity.

## Decisions needed before live checkout

- Confirm the payment provider, merchant access and webhook configuration.
- Confirm shipping serviceability, charges and product purchase/enquiry rules.
- Establish the reservation contract and authenticated order handoff with Keeri.
- Verify hosting capacity, backups, monitoring and final deployment configuration.

None of these pending integrations prevents implementing the catalogue and storefront in isolation.
