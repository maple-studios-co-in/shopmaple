# Store deployment

Target: `https://store.maplefurnishers.com`. Shopify remains at `https://shop.maplefurnishers.com`.

## Isolated runtime

| Component | Location / listener |
| --- | --- |
| Releases | `/home/deploy/shopmaple/releases/<full-git-sha>` |
| Active symlink | `/home/deploy/shopmaple/current` |
| Private environment | `/home/deploy/shopmaple/shared/store.env` (0600) |
| Next.js | `shopmaple-web`, `127.0.0.1:3110` |
| Express | `shopmaple-api`, `127.0.0.1:4110` |
| PostgreSQL 16 | `shopmaple-db`, `127.0.0.1:55440` |
| Database | `shopmaple_store`, separate cluster and non-superuser app role |
| Data / socket | `/home/deploy/shopmaple/shared/postgres`, `shared/socket` |
| Backups | `/home/deploy/shopmaple/backups` (0700) |

Cloudflare should route only `store.maplefurnishers.com` to `http://127.0.0.1:3110` through a managed Tunnel on this VPS. Next.js forwards `/api/*` to the API. Do not expose database/API ports, modify Shopify DNS, replace apex routing, or reuse the Keeri database. Preserve existing Tunnel ingress entries and its final catch-all. A running connector token alone does not authorize the API configuration changes.

Existing authenticated Cloudflare route target: `maplefurnishers-revamp`, tunnel `11502ea7-e8d0-4865-bfb4-6785c9759eba`. At preparation it has 11 routes covering the apex, www and admin. Add the new exact hostname as a twelfth published application; the dashboard creates its DNS record. The connector is healthy and already runs on the same VPS.

The isolated database and PM2 database process were provisioned on 2026-10-26. A nightly 02:47 UTC custom-format dump uses a temporary file, promotes it only after pg_dump succeeds, and writes SHA-256 alongside. The prior crontab is retained as `shared/crontab.before-store`. This initial backup is an empty provisioning snapshot; the populated prelaunch restore check is still a separate required step. Backups remain private on the VPS, so off-host disaster recovery is not yet established.

## Initial catalogue release

Until Keeri publication metadata, channel selections, delivery rates, and payment verification are complete, the new hostname serves the approved public Shopify catalogue snapshot as a preview. It must retain `CATALOG_MODE=preview`, checkout disabled, and noindex. Prices are a snapshot; neither displayed pricing nor stock is a live Keeri quote.

The ordinary local preview importer intentionally refuses production. The separate deployment bootstrap accepts only the committed `apps/api/data/preview-catalog.json`, numeric `preview-*` identities and `shopify-preview` sources. It strips unknown fields, forces every variant to `available=false` / `stockPolicy=unverified`, requires an empty catalogue and exact loopback database target, and writes atomically. It never copies carts, enquiries, orders, credentials or customers from a developer database.

Run once from a validated release, using the private environment:

```sh
NODE_ENV=production PREVIEW_DATABASE_NAME=shopmaple_store \
APPROVE_PUBLIC_PREVIEW=publish-public-preview-no-checkout \
node --env-file=/home/deploy/shopmaple/shared/store.env \
  --import tsx deploy/bootstrap-public-preview.ts
```

Repeated bootstraps fail closed; they never replace a populated or Keeri-synced catalogue. Later catalogue changes must use the reviewed Keeri integration, not this bootstrap. Enquiry persistence is not evidence that staff received a notification or can action it in Keeri.

## Release sequence

1. Record the fully reviewed and validated Git SHA. Export that exact commit to a new release directory (never copy the dirty working tree). Keep prior releases intact.
2. Symlink the private environment as the release `.env`, install with `npm ci` on Node22, generate Prisma and apply committed migrations to the isolated shop database. Capture a pre-migration custom-format database dump on subsequent releases.
3. Build the release with the production API URL and web origin. The API must be healthy before Next.js static data generation; verify whether product pages are dynamic/cached and rebuild/revalidate after initial catalogue bootstrap if required.
4. Run API/web on their assigned loopback ports, test health, catalogue counts, a product, menu, cart, security headers, cookies, and disabled checkout. Never submit live synthetic customer enquiries or orders for a smoke test.
5. Atomically point `current` to the verified release and restart only `shopmaple-api` and `shopmaple-web` using `deploy/ecosystem.config.cjs`. Keep `shopmaple-db` running. Save PM2 state.
6. Add the exact Cloudflare hostname route and DNS record, verify ordinary public DNS and trusted HTTPS from a browser, and inspect network/image loading. A `curl --resolve` response alone is not launch evidence.
7. Save deployed SHA, dependency/build results, public checks, migration status, dump checksum, restore test, and rollback target. Enable nightly isolated database backups; verify restore into a disposable database before accepting customer data.

## Rollback

Point `current` back to the retained previous SHA, restart only the two shop application processes and verify public routes. On the first release, remove only the new hostname route/record and stop `shopmaple-web`/`shopmaple-api` if necessary; retain the database, backups, and source release for diagnosis. Database rollback requires a reviewed migration compatibility decision; do not automatically restore over new customer writes. Keeri, Shopify and other PM2 processes must remain untouched.

## Deployment-tool verification

TDD evidence (2026-10-26): the first tests failed on `false !== true` for stock clearing and missing source-rejection errors; database test then failed `0 !== 2` before inserts were implemented; target restrictions failed on missing rejection before hostname/port enforcement. After implementation all five tests passed, including real PostgreSQL persistence and refusing a repeat bootstrap.

```sh
# The database suite requires a separately migrated disposable database named exactly
# shopmaple_preview_import_test. It deletes fixture products/variants only there.
npx tsx --test deploy/public-preview.test.ts
PREVIEW_IMPORT_TEST_DATABASE_URL='<dedicated test URL>' \
  npx tsx --test deploy/public-preview.db.test.ts
node -e 'console.log(require("./deploy/ecosystem.config.cjs").apps.map(a => a.name))'
```

The public hostname is not considered deployed until the final release evidence is recorded. A provisioned database or successful build alone is not deployment.

### Client rate-limit identity

The production API binds only127.0.0.1 and opts into `API_TRUST_PROXY_LOOPBACK=true`. Express trusts loopback proxy hops only and selects the nearest untrusted address from right to left. Cloudflare appends the connecting visitor/proxy to `X-Forwarded-For`; the local Next rewrite preserves that chain. Never use blanket `trust proxy=true`, expose theAPIport, or enable this setting on a publicAPIlistener. Startup rejects this setting with any non-loopback API_HOST. The enquiry regression test exhausts one visitor's quota, proves a forged earlier address cannot bypass it, and allows a different visitor through.

Cloudflare header behavior: https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-for . Confirm the actual tunnel/proxy configuration on deployment; this trust setting assumes that trusted ingress.
