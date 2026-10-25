# Shop Maple

Maple Furnishers' independent ecommerce storefront and commerce API in one repository. No Medusa.

## Running storefront

- `apps/web`: Next.js 16 / React 19 storefront, collections/search, product variants, favourites and cart.
- `apps/api`: Express / Prisma / PostgreSQL catalogue, persistent guest carts, local enquiries and isolated order/payment services.
- `packages/contracts`: shared Zod validation and TypeScript contracts.
- `scripts/import-preview.ts`: validated import of the dated public preview catalogue.

The storefront recreates the Shopify homepage sections, product gallery and variant layout, collection filters, contact/help and bulk-enquiry pages using the original public media and theme settings. It is **not complete visual or functional parity**: additional templates and Shopify app integrations remain separate work. Sofas, tables, chairs, Nimbus and Our Story now have local landing pages.

**Preview only:** 85 public Shopify products in the dated preview snapshot. Keeri remains the intended product source. Price and availability are snapshot data; checkout deliberately returns `503 CHECKOUT_NOT_AVAILABLE`. No payments or orders can be placed. Existing accounts/policies still link to the current shop.

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

## Backend integration progress

The [Keeri adapter](docs/keeri-integration.md) validates explicit offline exports and applies a full catalogue snapshot atomically, with tenant isolation, publication checks, stale/replay protection and retired-variant handling. Imported Keeri items remain unavailable until reservations are connected.

The [Razorpay adapter](docs/payments.md) creates and validates provider orders through an injectable transport, verifies callback/webhook signatures and checks captured payment evidence. It is isolated from public routes; no payment is enabled.

The [order service](docs/order-flow.md) freezes server-priced quotes, gates payment creation on verified reservations and persists authenticated payment events plus an atomic Keeri handoff outbox. It has no public checkout routes or active workers.

[Enquiry forms](docs/enquiries.md) save locally with idempotent retries and a receipt. No team notification is sent. Newsletter, reviews, accounts and unsupported collection aliases continue on the existing shop; Instagram links to the real profile.

## Next integrations

Keeri publication, atomic stock reservation and order handoff; the existing merchant gateway (Razorpay is present in historical Shopify order records); shipping/tax rules; payment verification and reconciliation; accounts/history/reviews; complete template fidelity and URL migration. Merchant access and current gateway configuration still need verification.

Images currently use Shopify CDN sources with Next.js responsive AVIF/WebP optimization. Fonts are self-hosted; the local workshop clip is compressed and deferred. R2 migration and production Core Web Vitals measurement are still pending.

Read [architecture](docs/architecture.md) and [the implementation plan](docs/superpowers/plans/2026-10-25-storefront-foundation.md). This branch does not change the live Shopify store, Keeri, DNS or deployment.

Raw theme exports, customer/order records, merchant configuration and credentials must stay out of this public repository. Public preview product data and Maple brand media are the only store assets included; see [media provenance](apps/web/public/media/PROVENANCE.md).
