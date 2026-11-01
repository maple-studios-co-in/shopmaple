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

## Enabling checkout (operational release gate)

The API composes live checkout only when `CHECKOUT_ENABLED=true` **and** every key below is present and valid in the private environment. Any other state, including a credential set without the flag, runs exactly as the preview: `/api/health` reports `checkoutEnabled: false`, `POST /api/checkout` refuses with 503, no order or payment workers run, and `/checkout` renders the preview placeholder. With the flag set and a key missing or malformed, startup fails loudly naming the key, so a half-configured release cannot half-work. `CATALOG_MODE` stays `preview`; it does not control checkout.

| Key | Release gate it belongs to |
| --- | --- |
| `CHECKOUT_ENABLED` | Final activation switch. Set it last, only after every gate below is recorded. |
| `KEERI_ORIGIN` | Keeri storefront service origin (HTTPS only). Shared with the catalogue media reader. |
| `KEERI_COMMERCE_TOKEN` | Keeri service credential with `quotes:write`, `reservations:write` and `orders:write` scopes. The existing catalogue-only token does not qualify. |
| `KEERI_TENANT_ID` | Keeri tenant whose catalogue identities the stored bindings reference. |
| `KEERI_MERCHANT_SCOPE` | Merchant scope bound to the commerce credential and to the reviewed Keeri `STOREFRONT_COMMERCE_POLICIES` entry. Also namespaces attempts, webhooks and outbox rows. |
| `RAZORPAY_KEY_ID` | Gateway merchant and mode (test or live). The only payment value the browser receives. |
| `RAZORPAY_KEY_SECRET` | Server-only gateway secret for order creation and captured-payment verification. |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only secret configured on the `POST /api/webhooks/razorpay` endpoint in the Razorpay dashboard. |
| `CHECKOUT_DELIVERY_METHODS` | JSON array of `{ "id", "label" }` pairs. Each `id` must exist in the reviewed Keeri delivery policy with `carrierPriced: true`; labels are what buyers see. Amounts and tax come only from the Keeri quote, and only a Shiprocket-priced delivery line can be paid. |
| `ENQUIRY_RESEND_API_KEY`, `ENQUIRY_MAIL_FROM`, `ENQUIRY_MAIL_TO` (or `ORDER_RESEND_API_KEY`, `ORDER_MAIL_FROM`, `ORDER_MAIL_TO`) | Order emails: the buyer's confirmation and staff "new order" / "needs attention" alerts. Each `ORDER_*` key overrides its `ENQUIRY_*` counterpart. The sender domain must be verified in Resend. |
| `WEB_ORIGIN` | The public store origin, used for links in order emails (already set for the API). |

Gates before `CHECKOUT_ENABLED=true` on the VPS, in order:

1. Keeri: the commerce-scoped credential exists, `STOREFRONT_COMMERCE_POLICIES` holds exactly one reviewed policy for this tenant and merchant scope, and the delivery method ids above match it.
2. Razorpay: test-mode keys first. The webhook endpoint `https://store.maplefurnishers.com/api/webhooks/razorpay` is registered with the `payment.captured` and `order.paid` events and the same webhook secret. Confirm the merchant, capture settings and that the Tunnel passes the request body uncompressed.
3. Sandbox evidence: a complete test-mode purchase on the deployed host reaches `fulfillmentStatus: confirmed` with a Keeri order reference, a forged webhook returns 401, and a dismissed payment leaves the attempt payable. Record the attempt ids; never use a real card.
4. Operations: the order worker (every 5 seconds inside `shopmaple-api`, 90-second row leases) is observed processing inbox, outbox and notification rows; the staff "needs attention" email arrives for `reconciliation_required` and `paid_hold_lapsed` attempts, failed Keeri deliveries and unmatched payments (see `docs/checkout-recovery.md`); the backup/restore gate above has been repeated with commerce tables populated.
5. Only then switch to live Razorpay keys and set `CHECKOUT_ENABLED=true`, restart `shopmaple-api`, and verify `/api/health` reports `checkoutEnabled: true` and `/checkout` renders the form. Rollback is removing the flag and restarting; in-flight attempts stay in the database for reconciliation.

A merged pull request, a passing local suite or a green CI run is none of these gates.

Shutdown and restarts: on SIGINT/SIGTERM the API first stops scheduling worker cycles, stops accepting connections, then waits for any in-flight enquiry or order cycle to finish before disconnecting the database and exiting, so a PM2 restart drains a whole cycle (bounded by the Keeri and Razorpay timeouts, about 30 s worst case; `kill_timeout` is 10 s, so PM2 may SIGKILL first). A hard kill is still safe: every inbox and outbox row is processed under a 90-second lease and a killed worker's lease simply expires, after which the next cycle retries the row. Paid goods are removed from the guest cart inside the capture transaction, and a cart with a payable attempt cannot be quoted again until that attempt is released, so a retry never produces a second order for the same payment.

## Launch checklist (online checkout)

Run in this order; tick each with the date, the person, and where the evidence is saved. Steps marked **owner** need the owner's accounts or a production action that only the owner runs.

**Keeri (owner, with Keeri admin access)**
- [ ] Keeri `develop` with PRs #788 (made-to-order eligibility), #789 (Shiprocket-priced quotes) and #793 (whole-unit serviceability request, not-serviceable reply) is deployed, and its migrations are applied.
- [ ] A Shiprocket **API user** exists (Shiprocket → Settings → API → Create API User, with an email different from the Shiprocket login, Couriers module allowed).
- [ ] Keeri's `STOREFRONT_SHIPROCKET_ACCOUNTS` holds one row for tenant + merchant scope. ShopMaple never holds Shiprocket credentials; Keeri logs in, keeps the token (renewed after 9 days, or on a 401) and calls serviceability. For a local sandbox run it goes in the Keeri checkout's `apps/admin/.env.local` (git-ignored); on the server, in Keeri's private environment. One line:
  `STOREFRONT_SHIPROCKET_ACCOUNTS='[{"tenantId":"<KEERI_TENANT_ID>","merchantScope":"<KEERI_MERCHANT_SCOPE>","email":"<API-user email>","password":"<API-user password>","version":"1","pickupPincode":"<Delhi pickup pincode>","mode":"Surface"}]'`
  `tenantId` and `merchantScope` are the same values as ShopMaple's `KEERI_TENANT_ID` and `KEERI_MERCHANT_SCOPE`. `version` is any label; change it whenever the password changes so Keeri drops the cached token.
- [ ] `STOREFRONT_COMMERCE_POLICIES` holds one reviewed policy for the scope, `gstMode: "included"` (store prices include GST), and every delivery method listed in `CHECKOUT_DELIVERY_METHODS` has `carrierPriced: true`.
- [ ] Every variant to be sold has its packed weight and carton size (Keeri variant drawer → Shipping), a ShopMaple selection, and for made-to-order pieces an approval with a lead time.
- [ ] A commerce-scoped Keeri credential (`quotes:write`, `reservations:write`, `orders:write`) is issued for ShopMaple.

**Catalogue**
- [ ] After a catalogue sync, the count of purchasable variants is what the owner expects (owner runs on the VPS: `SELECT count(*) FROM "Variant" WHERE available AND published;`). A variant is purchasable only when Keeri sells it **and** the store's price equals Keeri's MRP; a mismatch keeps it enquiry-only. Fix the price on whichever side is wrong.

**Razorpay (owner)**
- [ ] Test-mode keys in `store.env`; webhook `https://store.maplefurnishers.com/api/webhooks/razorpay` (later the `shop.` host) registered for `payment.captured` and `order.paid` with `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Payment capture is **automatic** in Razorpay settings (the store only accepts captured payments).

**Email (owner)**
- [ ] The Resend sender domain is verified; `ENQUIRY_MAIL_TO`/`ORDER_MAIL_TO` is a monitored staff inbox.

**Local sandbox run with doubles (done 2026-11-01).** Real API, workers, PostgreSQL and production web build; Keeri, Razorpay, Shiprocket (recorded serviceability shape) and Resend were in-process doubles, and the Razorpay window was a stand-in that returned a correctly signed callback. Verified in the browser: an unserviceable pincode is refused with the enquiry offer; a stocked plus a made-to-order piece were quoted with the cheapest Shiprocket surface courier, paid, verified, confirmed by the Keeri double and emailed to buyer and staff; the payment window was set to the hold minus two minutes (779 s); a payment completed after the buyer released the attempt was kept as `paid_hold_lapsed` with both emails; a forged webhook got 401. This does not replace the step below with the real accounts.

**Sandbox evidence on the deployed host (test keys)**
- [ ] A stocked piece and a made-to-order piece bought with a Razorpay test method reach `fulfillmentStatus: confirmed` with a Keeri order reference; the buyer and staff emails arrive.
- [ ] A pincode Shiprocket cannot serve is refused with "We can't price delivery…" and no payment.
- [ ] A forged webhook returns 401; a dismissed payment leaves the attempt payable; a payment completed after the hold lapses shows "payment has been received" and raises the staff alert.
- [ ] Staff walk through `docs/checkout-recovery.md` once (find the payment in Razorpay, practise a refund in test mode).

**Operations**
- [ ] The daily reconciliation queries in `docs/checkout-recovery.md` return what the Razorpay dashboard shows.
- [ ] The backup/restore check is repeated with commerce tables populated.

**Go live (owner)**
- [ ] Switch to live Razorpay keys (and the live webhook secret), set `CHECKOUT_ENABLED=true`, restart `shopmaple-api`, confirm `/api/health` → `checkoutEnabled: true`, then one small live purchase refunded in full.
- [ ] Rollback: unset `CHECKOUT_ENABLED` and restart; in-flight attempts stay for reconciliation.

## Release sequence

1. Record the fully reviewed and validated Git SHA. Export that exact commit to a new release directory (never copy the dirty working tree). Keep prior releases intact.
2. Symlink the private environment as the release `.env`, install with `npm ci` on Node22, generate Prisma and apply committed migrations to the isolated shop database. Capture a pre-migration custom-format database dump on subsequent releases.
3. Build the release with the production API URL and web origin. The API must be healthy before Next.js static data generation; verify whether product pages are dynamic/cached and rebuild/revalidate after initial catalogue bootstrap if required.
4. Run API/web on their assigned loopback ports, test health, catalogue counts, a product, menu, cart, security headers, cookies, and that checkout is disabled unless the checkout gate above has been passed and recorded. Never submit live synthetic customer enquiries or orders for a smoke test.
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

## Live release evidence — 2026-10-26

- Deployed tested commit `f5246c6f3aa939f5be10679f3436c9f0c8639419` (PR #9, merged as `04afb6f374dbb4804fe1cd3427c185ea6efee40c`). Prior retained release: `824c5b911776dbf422383befea81ffc7401161b2`.
- Server Node22 lockfile install, Prisma generation/migrations, API build and Next.js production build passed. `current` points to the exact tested release; only the two shop application processes were restarted. PM2 saved all three shop processes.
- `API_TRUST_PROXY_LOOPBACK=true` is enabled with `API_HOST=127.0.0.1`. A synthetic loopback Next-to-API probe verified independent visitor rate-limit counters (`299, 298, 299`); changing the leftmost forwarded address cannot reset the actual rightmost visitor's counter.
- Cloudflare published route 12 maps `store.maplefurnishers.com` to `http://127.0.0.1:3110`. The previous 11 Maple routes are unchanged. DNS targets the existing tunnel. Both public resolvers 1.1.1.1 and 8.8.8.8 resolve the hostname.
- Ordinary public HTTPS from the VPS passed certificate verification and returned 200 for home, chairs collection, Aera product, favourites, contact, API health/catalogue/cart. Three optimized homepage images returned 200 (AVIF: 12,736 / 22,224 / 64,128 bytes). Disallowed image origins return 400. Checkout POST returns the expected safe 503. Shopify's existing home remains 200.
- The 85 public preview products contain 115 variants, all unavailable/unverified; zero enquiry and checkout rows existed at prelaunch backup time. No live payment test, stock write, synthetic customer submission or order was performed.
- Populated backup `/home/deploy/shopmaple/backups/shopmaple-prelaunch-20261025T192438Z.dump` was restored into a disposable database and validated. SHA-256: `49eaa263ca8a6c4cf45aafa545bbf912fd7f50f00aaae79631e101df092303fc`.
- Raw public release checks: `/home/deploy/shopmaple/shared/public-release-evidence.json`; restore evidence: `shared/prelaunch-restore.json`. A local copy is retained under `.local/store-release-20261026/`.

The user's upstream resolver initially cached NXDOMAIN; after it expired, macOS retained a separate negative lookup. The user cleared the local system DNS cache. Ordinary local HTTPS then returned 200 with successful certificate verification, and the public URL rendered fully in the in-app browser, including navigation, category tiles and images. The health endpoint confirmed `catalogMode=preview` and `checkoutEnabled=false`. Browser evidence: `/Users/adityaagrawal/.codex/verification/shiprocket-setup-20261026/store-public-live.jpg`. No DNS settings, VPN configuration or security protections were changed.

### Client rate-limit identity

The production API binds only to `127.0.0.1` and opts into `API_TRUST_PROXY_LOOPBACK=true`. Express trusts loopback proxy hops only and selects the nearest untrusted address from right to left. Cloudflare appends the connecting visitor/proxy to `X-Forwarded-For`; the local Next rewrite preserves that chain. Never use blanket `trust proxy=true`, expose the API port, or enable this setting on a public API listener. Startup rejects this setting with any non-loopback `API_HOST`. The enquiry regression test exhausts one visitor's quota, proves a forged earlier address cannot bypass it, and allows a different visitor through.

Cloudflare header behavior: https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-for . Confirm the actual tunnel/proxy configuration on deployment; this trust setting assumes that trusted ingress.
