# Shop Maple

Maple Furnishers' independent ecommerce storefront, using Keeri as the product source and an owned commerce backend.

## Project status

Repository foundation and architecture only. Application code, dependencies, database migrations, CI and deployment have not been created. There is no runnable storefront yet.

## Stack

- Next.js, React and TypeScript for the storefront.
- Node.js, Express and Zod for the commerce API.
- PostgreSQL and Prisma for persistence.
- Keeri integration for approved product data and operational order handoff.
- Cloudflare R2/CDN and responsive image processing for media delivery.
- A hosted payment gateway with server-side verification; provider selection is pending.

The project does not use Medusa. Exact supported dependency versions will be pinned during implementation.

## Experience

Preserve the existing Shopify storefront's appearance and interactions across desktop and mobile. The locally exported theme provides a reference; third-party theme implementation, app data and externally hosted media require separate treatment.

## Architecture

Read [the architecture decision](docs/architecture.md) for component ownership, checkout requirements and the first implementation slice.

## Reference material

Raw store exports and local research are intentionally excluded from this public repository. Do not commit customer/order exports, credentials, merchant configuration or third-party theme source without checking its permitted distribution and reuse.
