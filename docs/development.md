# Development and verification

## Services and environment

Use Node 22+ and `npm ci` at the repo root. Copy `.env.example` to `.env` before running scripts. Both apps load that file; the API alone accesses the database. `API_URL` is server-side and also baked into the Next.js rewrite at build time: rebuild when it changes.

`docker compose up -d --wait` starts a dedicated PostgreSQL 17 instance on loopback port 55439 with a named volume. The example credentials are local development defaults only. Alternatively create dedicated `shopmaple` and `shopmaple_test` databases on a local PostgreSQL installation and update the URLs. Do not run both database options on the same port; never use Keeri's production database.

Run `npm run db:generate`, `npm run db:migrate`, then `npm run catalog:import`. The importer validates the full snapshot before writing, updates only preview IDs and unpublishes preview records omitted from a later import. It refuses `NODE_ENV=production`. This is a manual preview importer, not the future authenticated Keeri synchronizer.

`npm run dev` starts both services. Use **http://localhost:3000**; writing through a different origin is rejected unless `WEB_ORIGIN` is updated. The API defaults to loopback. No CORS is needed because browser traffic goes through Next.js.

## Tests

Create and migrate the dedicated test database once:

```sh
docker compose exec postgres createdb -U shopmaple shopmaple_test
npx dotenv -e .env -- sh -c 'DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma'
npm test
npm run typecheck
npm run build
```

The test command refuses a database URL whose database name is not `shopmaple_test`. Tests delete only fixture data in that dedicated database. Do not run multiple copies of the suite against the same test database concurrently.

The API suite covers published catalogue filtering, invalid requests, server-side pricing, cookie isolation and persistence, origin checks, quantity limits, unavailable/made-to-order items, concurrent absolute updates, expiry and disabled checkout. Browser checks additionally cover navigation, product variants, cart updates, persistence and desktop/mobile layouts. CI runs the automated API suite, typechecking and both production builds against a fresh PostgreSQL service; browser checks are currently manual.

## Production build versus deployment

`npm run build` compiles both apps. Start the built API with `NODE_ENV=production npm start -w @shopmaple/api` and frontend with `npm start -w @shopmaple/web` behind HTTPS. Production cookies require HTTPS. The repository intentionally accepts only `CATALOG_MODE=preview`, sets `noindex` and refuses checkout. Building successfully does not make it ready for real sales.

Before any release, configure trusted reverse-proxy behavior/rate limiting, TLS, backup/restore, monitoring, media persistence and gateway/Keeri secrets outside git. Verify reservations, shipping, immutable order totals, signed payment callbacks, deduplication, refunds, reconciliation and durable handoff. Never enable checkout by merely changing the UI flag.

## Known boundaries

- The preview is 20 dated products, not a full or live inventory feed. Unverified stock policies may enter a preview cart but never proceed to payment.
- Catalogue sorting/pagination currently loads matching products into the API process; move that work into indexed database queries for the full catalogue.
- Carts recalculate current catalogue prices; checkout/order snapshots are not implemented. An unavailable item remains visible for removal.
- Guest carts expire after 30 days; scheduled cleanup of expired rows is a deployment follow-up.
- Shopify-hosted image URLs remain dependencies until media migration. Page templates, app widgets, accounts/history and full content still need migration.
- The initial development dependency audit reports one low-severity esbuild Windows development-server advisory. This app does not expose esbuild's development server; production dependency audit is recorded separately.
