# Store deployment

Target: `https://store.maplefurnishers.com`, moving to `https://shop.maplefurnishers.com` (which Shopify serves until the move). Nothing on the store is loaded from Shopify ([shopify-media-migration.md](shopify-media-migration.md)). The store's addresses are the `SITE_URL` and `SITE_ALIASES` settings, not code.

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

The ordinary local preview importer intentionally refuses production. The separate deployment bootstrap accepts only the committed `apps/api/data/preview-catalog.json`, Keeri identities (`keeri:<tenant>:<id>`) with one `keeri:<tenant>` source. It strips unknown fields, forces every variant to `available=false` / `stockPolicy=unverified`, requires an empty catalogue and exact loopback database target, and writes atomically. It never copies carts, enquiries, orders, credentials or customers from a developer database.

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
| `KEERI_REVIEWS_TOKEN` | Optional. Keeri service credential allowed to write reviews. With it and `KEERI_ORIGIN`, reviews from the product page go to Keeri; without it they are kept in Admin → Enquiries. See [product reviews](product-reviews.md). |
| `KEERI_COMMERCE_TOKEN` | Keeri service credential with `quotes:write`, `reservations:write` and `orders:write` scopes (and `leads:write` once enquiries go to Keeri). The existing catalogue-only token does not qualify. |
| `KEERI_TENANT_ID` | Keeri tenant whose catalogue identities the stored bindings reference. |
| `KEERI_MERCHANT_SCOPE` | Merchant scope bound to the commerce credential and to the reviewed Keeri `STOREFRONT_COMMERCE_POLICIES` entry. Also namespaces attempts, webhooks and outbox rows. |
| `RAZORPAY_KEY_ID` | Gateway merchant and mode (test or live). The only payment value the browser receives. |
| `RAZORPAY_KEY_SECRET` | Server-only gateway secret for order creation and captured-payment verification. |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only secret configured on the `POST /api/webhooks/razorpay` endpoint in the Razorpay dashboard. |
| `CHECKOUT_DELIVERY_METHODS` | JSON array of `{ "id", "label" }` pairs. Each `id` must exist in the reviewed Keeri delivery policy with `carrierPriced: true`; labels are what buyers see. Amounts and tax come only from the Keeri quote, and only a Shiprocket-priced delivery line can be paid. |
| `ENQUIRY_RESEND_API_KEY`, `ENQUIRY_MAIL_FROM`, `ENQUIRY_MAIL_TO` (or `ORDER_RESEND_API_KEY`, `ORDER_MAIL_FROM`, `ORDER_MAIL_TO`) | Order emails: the buyer's confirmation, the buyer's "payment unsuccessful" and "payment pending" emails, and staff "new order" / "needs attention" alerts. Each `ORDER_*` key overrides its `ENQUIRY_*` counterpart. The sender domain must be verified in Resend. |
| `WEB_ORIGIN` | The public store origin, used for links in order emails (already set for the API). |

Gates before `CHECKOUT_ENABLED=true` on the VPS, in order:

1. Keeri: the commerce-scoped credential exists, `STOREFRONT_COMMERCE_POLICIES` holds exactly one reviewed policy for this tenant and merchant scope, and the delivery method ids above match it.
2. Razorpay: test-mode keys first. The webhook endpoint `https://store.maplefurnishers.com/api/webhooks/razorpay` is registered with the `payment.captured`, `order.paid`, `payment.failed` and `payment.authorized` events and the same webhook secret. The last two only drive the buyer's payment emails: `payment.failed` sends "payment unsuccessful", and `payment.authorized` keeps it from a buyer whose later try went through. Without them no such email is sent, and orders are unaffected. Confirm the merchant, capture settings and that the Tunnel passes the request body uncompressed.
3. Sandbox evidence: a complete test-mode purchase on the deployed host reaches `fulfillmentStatus: confirmed` with a Keeri order reference, a forged webhook returns 401, and a dismissed payment leaves the attempt payable. Record the attempt ids; never use a real card.
4. Operations: the order worker (every 5 seconds inside `shopmaple-api`, 90-second row leases) is observed processing inbox, outbox and notification rows; the staff "needs attention" email arrives for `reconciliation_required` and `paid_hold_lapsed` attempts, failed Keeri deliveries and unmatched payments (see `docs/checkout-recovery.md`); the backup/restore gate above has been repeated with commerce tables populated.
5. Only then switch to live Razorpay keys and set `CHECKOUT_ENABLED=true`, restart `shopmaple-api`, and verify `/api/health` reports `checkoutEnabled: true` and `/checkout` renders the form. Rollback is removing the flag and restarting; in-flight attempts stay in the database for reconciliation.

A merged pull request, a passing local suite or a green CI run is none of these gates.

### Payment emails (migrate, then API)

1. Apply migration `20261112100000_payment_status_emails` with the release's `prisma migrate deploy`. It widens the email table's allowed kinds and states and adds two indexes, so it is safe under the running release.
2. Release the API. If it starts before the migration, the payment emails wait (logged as `Payment email sweep failed`) and every other email carries on.
3. In the Razorpay dashboard, add `payment.failed` and `payment.authorized` to the webhook's events (above).

Shutdown and restarts: on SIGINT/SIGTERM the API first stops scheduling worker cycles, stops accepting connections, then waits for any in-flight enquiry or order cycle to finish before disconnecting the database and exiting, so a PM2 restart drains a whole cycle (bounded by the Keeri and Razorpay timeouts, about 30 s worst case; `kill_timeout` is 10 s, so PM2 may SIGKILL first). A hard kill is still safe: every inbox and outbox row is processed under a 90-second lease and a killed worker's lease simply expires, after which the next cycle retries the row. Paid goods are removed from the guest cart inside the capture transaction, and a cart with a payable attempt cannot be quoted again until that attempt is released, so a retry never produces a second order for the same payment.

## Sending enquiries to Keeri as leads

Independent of checkout. With `KEERI_LEADS_ENABLED=true`, contact, project and bulk enquiries are also queued as Keeri leads and sent to `POST {KEERI_ORIGIN}/api/storefront/leads` with `KEERI_COMMERCE_TOKEN`; the staff email keeps going and links the Keeri lead when there is one. The flag needs valid `KEERI_ORIGIN` and `KEERI_COMMERCE_TOKEN`, or startup fails naming the key. `KEERI_ADMIN_ORIGIN` is optional (defaults to `KEERI_ORIGIN`; production `https://maplefurnishers.keeri.in`). Order: Keeri's leads endpoint and the credential's `leads:write` scope first, then the store with the flag. Rollback is `KEERI_LEADS_ENABLED=false` and a restart. Details in [Keeri leads](keeri-leads.md).

## Enabling WhatsApp order updates

`WHATSAPP_ORDER_UPDATES=true` in the API's private environment shows "Send my order updates on WhatsApp" at checkout
and sends a ticked buyer's consent to Keeri with their paid order; Keeri sends the messages. Unset or `false` is off;
any other value stops the API at start-up. It needs `CHECKOUT_ENABLED=true`. **Set it only after Keeri runs a release
that accepts the consent** (its WhatsApp order messages): an older Keeri refuses an order that carries it, and that
order waits for staff. Rollback is unsetting it and restarting. Migration `20261113120000_whatsapp_order_opt_in` adds
one nullable column and is safe under the running release. See [WhatsApp order messages](whatsapp-order-confirmation.md).

## Private order links, cancel and tracking

A buyer opens their order from the order email, or Keeri's WhatsApp "View order" button, without an account (owner,
14 Nov 2026). The link is `/orders/MF-<n>-<32 hex>`: the order number and the first 128 bits of an HMAC of it under
`ORDER_LINK_SECRET`. Nothing is stored; a forged or altered link is the same 404 as a missing order. The page shows the
pieces, photos, options, totals, address (phone masked), status and journey; `/orders/<ref>/tracking` adds Keeri's
shipment (courier, AWB, Shiprocket's page). **Cancel** sends the buyer's reason to Keeri's cancellation requests while
the order is still only confirmed; staff then **Cancel and refund** or **Decline** in Keeri, and the page follows
Keeri's order events. The pages are never cached and send no Referer.

| Key | Purpose |
| --- | --- |
| `ORDER_LINK_SECRET` | 32–512 random characters, private, for example `openssl rand -hex 32`. Turns private links on: the order emails link them (with "Track your order"), `/api/orders/link/*` answers, and account orders carry the same links and Cancel. **Set it once**: changing it retires every link already sent. Unset: emails link as before and the routes answer 404. Shorter than 32 or longer than 512: the API still starts, private links stay off, and its log says `ORDER_LINK_SECRET must be 32 to 512 characters` (never the value). |
| `WHATSAPP_ORDER_LINKS` | `true` also hands Keeri each paid order's links and the bought variant's slug, so WhatsApp's "View order" opens the private page (the dispatched message opens tracking) and the confirmation's picture is the variant bought. Needs `ORDER_LINK_SECRET`. **Set it only once Keeri accepts `whatsappUpdates.orderLinks`**: an older Keeri refuses such an order. Unset or `false`: Keeri receives what it does today. Any other value, or `true` without a valid secret: the API still starts, Keeri receives what it does today, and the log names the setting. |

Tracking and Cancel ask Keeri with the store's commerce credential, which then needs Keeri's `orders:read` and
`orders:write` scopes. Without `orders:read` the tracking page says tracking isn't available; without checkout there
is no Keeri to ask and Cancel is not offered. Migration `20261114130000_order_cancellation_requests` adds one table and
`20261114120000_product_min_order_quantity` one nullable column; both are safe under the running release.

## Enabling customer accounts

Customer accounts (password sign-in with emailed codes for sign-up and resets, order history, saved addresses; see [architecture](architecture.md#customer-accounts)) have their own switch in the API's private environment. They are **off in production** until it is set. While they are off, every `/api/account` route answers 404, `/api/health` reports `accountsEnabled: false`, and `/account` keeps its "not available yet" page. Guest order status is unchanged either way.

| Key | Purpose |
| --- | --- |
| `CUSTOMER_ACCOUNTS_ENABLED` | `true` turns accounts on, `false` off. Unset, accounts are on only when `NODE_ENV` is `development` or `test`. Any other `NODE_ENV`, unset included, gets production's rules and is off (fail closed). Any other flag value stops the API at start-up. |
| `API_TRUST_PROXY_LOOPBACK` | Must be `true` (the API bound to loopback behind the local proxy, as in "Client rate-limit identity" below) when accounts are on in production. Without it every visitor would count as one network, so the API refuses to start. |
| `ACCOUNT_CODE_SECRET` | 32–256 random characters, private, for example `openssl rand -hex 32`. Keys the HMACs of sign-in codes and of requesting networks. Required in production once accounts are on. Changing it voids codes in flight, but not sessions. Never commit it or reuse another secret. |
| `ORDER_RESEND_API_KEY`, `ORDER_MAIL_FROM`, `ORDER_MAIL_TO` (each falling back to its `ENQUIRY_*` value) and `WEB_ORIGIN` | Sign-in codes go out through the same Resend sender as order emails. Production with accounts on refuses to start without them. A development API without them prints each code, with a masked email, to its console instead. |
| `KEERI_MERCHANT_SCOPE` | Optional here. When set, the account pages list only that merchant scope's orders. |

**Limits and alerts.** Networks are an IPv4 address or an IPv6 /64.
- **Codes emailed:** 3 per email per network in 15 minutes, 10 per email a day, 10 per network an hour, and 300 store-wide an hour.
- **Failed tries:** 20 per network an hour, and 10 per email a day. Once an email's budget is spent, each new code gets a single try.
- **Flood guard:** an in-memory guard (20 a minute per network) turns floods away before they reach the database.
- **Alert:** when the store-wide cap is reached, the API logs one line an hour with no personal data. Alert on it:
  `[accounts] sign-in email cap reached: 300 codes in the past hour; new codes are held back until the count falls`
  It means someone is pushing sign-in emails through the store (Resend sending, sender reputation). Codes resume on their own as the hour's count falls.
- **Cookie:** start sets the HttpOnly sign-in cookie `__Host-maple_signin` (ten minutes). A code works only in the browser that asked for it.

Rollout order: **migrate, then API, then web.**
1. Apply migrations `20261111140000_customer_accounts` and `20261111140100_customer_passwords` (both additive, safe under the running release) with the release's `prisma migrate deploy`.
2. Release the API. At start-up it links and numbers any attempts the previous release froze or captured in between, idempotently. Set the keys above together with `CUSTOMER_ACCOUNTS_ENABLED=true`, restart `shopmaple-api`, and confirm `/api/health` reports `accountsEnabled: true`.
3. Then release the web pages that call `/api/account`.

Rollback: unset the flag (or set `false`) and restart the API. Accounts, sessions and addresses stay in the database, and the additive migration needs no reversal. Order numbers stay assigned and keep appearing in order emails and on the guest status page.

## Order progress from Keeri

Keeri reports each store order's status moves, delivery, cancellation and refund to the store ([order flow](order-flow.md#order-progress-from-keeri-13-nov-2026)). Until both sides are configured, Keeri keeps its events queued and the order pages stop at "Confirmed".

| Where | Key | Purpose |
| --- | --- | --- |
| Store API (`store.env`) | `KEERI_DELIVERY_WEBHOOK_SECRET` | 32–512 random characters, private, for example `openssl rand -hex 32`. Keeri signs every event with it. Unset, the route does not exist. A short value, or a value without `KEERI_MERCHANT_SCOPE`, stops the API at start-up. |
| Keeri (`keeri.env`) | `STOREFRONT_WEBHOOKS` | A JSON array with one entry for this store: `{"tenantId": "<Keeri tenant id>", "merchantScope": "<the store's KEERI_MERCHANT_SCOPE>", "secret": "<the same secret>", "endpoints": {"default": "https://shop.maplefurnishers.com/api/integrations/keeri/order-events"}}`. |

Rollout order: **migrate and release the store first, then set the two keys.**
1. Release the store. `prisma migrate deploy` applies `20261113100000_keeri_order_events` (a new table only).
2. Put the same secret in both files, restart `shopmaple-api`, then restart Keeri. Never print or paste the secret.
3. Keeri's "Store order updates" job (Settings → Background jobs) sends what it has queued within five minutes, oldest first. An event that waited with "no endpoint configured" is retried on the hour.

Check: move a test order's status in Keeri, wait for the job, and open the order on the store. Rollback: unset the store's key and restart the API; Keeri queues again and nothing is lost for about a day and a half.

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
- [ ] Test-mode keys in `store.env`; webhook `https://store.maplefurnishers.com/api/webhooks/razorpay` (later the `shop.` host) registered for `payment.captured`, `order.paid`, `payment.failed` and `payment.authorized` with `RAZORPAY_WEBHOOK_SECRET`.
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
2. Symlink the private environment as the release `.env`, install with `npm ci` on Node22, generate Prisma and apply committed migrations to the isolated shop database. Capture a pre-migration custom-format database dump on subsequent releases. Migrations are additive and go first: the running release keeps working on the migrated database, and the API is released before the web pages that depend on it (for example customer accounts: migrate, then API, then web).
3. Build the release with the production API URL and web origin. The API must be healthy before Next.js static data generation; verify whether product pages are dynamic/cached and rebuild/revalidate after initial catalogue bootstrap if required.
4. Run API/web on their assigned loopback ports, test health, catalogue counts, a product, menu, cart, security headers, cookies, and that checkout is disabled unless the checkout gate above has been passed and recorded. Never submit live synthetic customer enquiries or orders for a smoke test.
5. Atomically point `current` to the verified release and restart only `shopmaple-api` and `shopmaple-web` using `deploy/ecosystem.config.cjs`. Keep `shopmaple-db` running. Save PM2 state.
   `pm2 restart <name>` keeps the options a process was started with; after changing `node_args` or limits in `deploy/ecosystem.config.cjs`, copy it to `/home/deploy/shopmaple/ecosystem.config.cjs`, then `pm2 delete shopmaple-web && pm2 start /home/deploy/shopmaple/ecosystem.config.cjs --only shopmaple-web && pm2 save` (or the same for `shopmaple-api`), and confirm the flag in `/proc/$(pm2 pid shopmaple-web)/cmdline`. `shopmaple-web` runs with `--max-old-space-size=384`: without a cap Node rarely collects garbage below its multi-gigabyte default ceiling, so the store grew about 0.9 MB per homepage view until PM2 restarted it at 768 MB. With the cap it holds near 140 MB at the same speed (measured on the VPS, 2 Nov 2026).
   Then warm the image resizer from any machine: `node deploy/warm-image-cache.mjs https://store.maplefurnishers.com`. Next.js keeps the photos it resizes in the release's own `.next/cache`, so a new release starts with none, and each photo's first visitor otherwise waits the two to three seconds the server takes to make it (9 Nov 2026). The script only reads: it opens the homepage, the four room pages and the full range, then asks for every resized photo they name up to 1920px wide, two at a time; a few minutes on the VPS. Its summary counts photos made now, already made and failed.
   Cloudflare does not cache `/_next/image` (its responses show `cf-cache-status: DYNAMIC`, as the address has no file extension), so every visitor's photos come from the VPS. A Cloudflare Cache Rule for URI path starting with `/_next/image`, set to Eligible for cache and to respect the origin's `Cache-Control` (`public, max-age=604800`), would serve them from Cloudflare's edge. It is the owner's Cloudflare account and decision; a photo replaced under the same file name would then stay cached until purged.
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

The production API binds only to `127.0.0.1` and opts into `API_TRUST_PROXY_LOOPBACK=true`. Express trusts loopback proxy hops only and selects the nearest untrusted address from right to left. Cloudflare appends the connecting visitor/proxy to `X-Forwarded-For`; the local Next rewrite preserves that chain. Never use blanket `trust proxy=true`, expose the API port, or enable this setting on a public API listener. Startup rejects this setting with any non-loopback `API_HOST`. The global 300-a-minute API limit skips loopback requests that carry no `X-Forwarded-For`, so the storefront's own server-side reads, which come from Next on this host, don't share one bucket for every visitor. This relies on the same two facts: the API port is not public, and every browser request arrives with `X-Forwarded-For` added by the tunnel and the Next proxy. If either ever changes, remove that exemption (`apps/api/src/app.ts`). The enquiry regression test exhausts one visitor's quota, proves a forged earlier address cannot bypass it, and allows a different visitor through.

Cloudflare header behavior: https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-for . Confirm the actual tunnel/proxy configuration on deployment; this trust setting assumes that trusted ingress.
