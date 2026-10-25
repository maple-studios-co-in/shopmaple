# Shop Maple

Maple Furnishers' independent ecommerce storefront and commerce API in one repository. No Medusa.

## Running foundation

- `apps/web`: Next.js 16 / React 19 storefront, collections/search, product variants, favourites and cart.
- `apps/api`: Express / Prisma / PostgreSQL catalogue and persistent guest carts.
- `packages/contracts`: shared Zod validation and TypeScript contracts.
- `scripts/import-preview.ts`: validated import of the dated public preview catalogue.

The homepage preserves the current shop's cream/burgundy header, Maple logo, workshop video and category tiles. It is an initial recreation, **not complete visual or functional parity** with Shopify.

**Preview only:** 20 public Shopify products captured on 25 October 2026. Keeri remains the intended product source. Price and availability are snapshot data; checkout deliberately returns `503 CHECKOUT_NOT_AVAILABLE`. No payments or orders can be placed. Existing accounts/policies still link to the current shop.

## Start locally

Requires Node 22+, npm and Docker Compose (or PostgreSQL 17).

```sh
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run catalog:import
npm run dev
```

Open http://localhost:3000. The API listens on 127.0.0.1:4100; the browser uses the frontend's same-origin `/api` proxy. Keep `WEB_ORIGIN` consistent with the URL used in the browser. See [development and verification](docs/development.md) for the isolated test database and commands.

## Next integrations

Keeri publication, atomic stock reservation and order handoff; the existing merchant gateway (Razorpay is present in historical Shopify order records); shipping/tax rules; payment verification and reconciliation; accounts/history/reviews; complete template fidelity and URL migration. Merchant access and current gateway configuration still need verification.

Images currently use Shopify CDN sources with Next.js responsive AVIF/WebP optimization. Fonts are self-hosted; the local workshop clip is compressed and deferred. R2 migration and production Core Web Vitals measurement are still pending.

Read [architecture](docs/architecture.md) and [the implementation plan](docs/superpowers/plans/2026-10-25-storefront-foundation.md). This branch does not change the live Shopify store, Keeri, DNS or deployment.

Raw theme exports, customer/order records, merchant configuration and credentials must stay out of this public repository. Public preview product data and Maple brand media are the only store assets included; see [media provenance](apps/web/public/media/PROVENANCE.md).
