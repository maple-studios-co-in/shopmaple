# Staging site

A private copy of the store for trying a release before production: `https://staging.maplefurnishers.com`, on the same VPS, with its own processes, database, media and settings. It is built from the same release archives as production, with customer personal data and payment data removed, no live payments, no Keeri leads and no search indexing.

## Layout

| Part | Staging | Production (for comparison) |
| --- | --- | --- |
| Folder | `/home/deploy/shopmaple-staging` (0700) | `/home/deploy/shopmaple` |
| Releases | `releases/<sha>`, `current` link; two newest kept | `releases/<sha>` |
| Settings | `shared/staging.env` (0600) | `shared/store.env` |
| Web | `shopmaple-staging-web`, `127.0.0.1:3120` | `shopmaple-web`, 3110 |
| API | `shopmaple-staging-api`, `127.0.0.1:4120` | `shopmaple-api`, 4110 |
| Database | `shopmaple-staging-db`: its **own** PostgreSQL 16 cluster, `127.0.0.1:55441`, socket `shared/socket`, database `shopmaple_staging`, role `shopmaple_staging` | cluster on 55440 |
| Media | `shared/media`, copied from the backup (not shared with production, so staging uploads never reach the store) | `shared/media` |
| PM2 file | `ecosystem.config.cjs` (from `deploy/ops/ecosystem.staging.config.cjs`) | `ecosystem.config.cjs` |

Staging needs its own build: Next.js fixes the site address and API address into the build (`apps/web/next.config.ts`), so a production build would link to and load images from the live store.

## What keeps staging away from live data and customers

- **Data.** `staging-refresh-db.sh` restores the newest verified backup into `shopmaple_staging_next`, runs `deploy/ops/staging-scrub.mjs` on it, and only then swaps it in. The scrub empties orders, payments, webhook and order-email queues, carts, customer accounts and addresses, sign-in records, staff sessions, enquiry delivery queues and the stored Instagram token; it replaces every name, email, phone, address, message, note, follow-up and staff email text in enquiries and the CRM with placeholders (`…@example.invalid`, `+910000000000`). Every table must be listed in the scrub's policy: a table it does not know (a new migration) stops the refresh before any data is copied. It checks afterwards that nothing it should have removed remains. Staff accounts are kept so staff can sign in to the staging admin with their usual passwords (behind Cloudflare Access); see owner decisions.
- **Settings.** `deploy/ops/staging-env-check.mjs` runs before every refresh and deploy and refuses: any database but `127.0.0.1:55441/shopmaple_staging`; ports other than 4120; media outside the staging folder; `SEO_INDEXING=on`; `KEERI_LEADS_ENABLED=true`; Keeri review, Instagram and Meta credentials; a Razorpay key that is not `rzp_test_…`; and any secret or mail recipient equal to production's (`store.env`). It names keys only, never values.
- **Email.** Enquiry emails, Keeri leads and customer accounts are off. Order emails exist only if staging checkout is turned on, and then go to one test inbox (staff copies) and to the address the tester types (buyer copy). The restored queues are emptied, so nothing restored is ever sent.
- **Search engines.** `SEO_INDEXING=off`: every page says `noindex`. Cloudflare Access also keeps crawlers out.

## Access protection: Cloudflare Access (recommended)

The free Cloudflare plan includes Zero Trust Access for up to 50 users. Each visitor signs in with a one-time code sent to an allowed email address; nothing is added to the store's code or server, and nothing is public even for a moment if Access is set up before the hostname. HTTP basic auth would need code in the web app (Next.js proxy) and a shared password, and is weaker. Use Access.

Razorpay's test webhooks cannot sign in, so `/api/webhooks/razorpay` on staging gets a bypass rule (only needed if staging checkout is turned on; the route itself only accepts correctly signed requests).

## Cloudflare checklist (done in the Cloudflare dashboard)

Account: the one holding `maplefurnishers.com` and tunnel `maplefurnishers-revamp` (`11502ea7-e8d0-4865-bfb4-6785c9759eba`). Do these in this order, so the hostname is protected before it exists:

- [ ] Zero Trust → Settings → Authentication: the "One-time PIN" login method is enabled.
- [ ] Zero Trust → Access → Applications → Add → Self-hosted: name `ShopMaple staging`, domain `staging.maplefurnishers.com`, path empty, session 24 hours. Policy `Maple team`: Action Allow, Include → Emails: the owner's and staff addresses that may see staging.
- [ ] Only if staging checkout will be turned on: a second Self-hosted application `ShopMaple staging webhook`, domain `staging.maplefurnishers.com`, path `api/webhooks/razorpay`, policy Action **Bypass**, Include → Everyone.
- [ ] Zero Trust → Networks → Tunnels → `maplefurnishers-revamp` → Public Hostname → Add: subdomain `staging`, domain `maplefurnishers.com`, path empty, type `HTTP`, URL `127.0.0.1:3120`. Keep every existing route and the catch-all.
- [ ] DNS → Records: Cloudflare created `staging` CNAME → `11502ea7-e8d0-4865-bfb4-6785c9759eba.cfargotunnel.com`, Proxied. (If not, add exactly that record.)
- [ ] In a private window, `https://staging.maplefurnishers.com` shows the Cloudflare Access sign-in page, not the store.

## Owner setup, step by step

Prerequisites: the operations tools are installed and a complete backup exists ([operations-monitoring.md](operations-monitoring.md), steps 1 to 9). Replace `<sha>` with a release whose archive `/home/deploy/shopmaple/backups/<sha>.tar.gz` exists. Run each command on the VPS as `deploy`, one at a time.

1. Create the staging folder, settings, database cluster, role and database (starts only `shopmaple-staging-db`):

   ```sh
   bash /home/deploy/shopmaple/ops/tools/ops/staging-setup.sh
   ```

2. Read the settings it generated and add anything else wanted (see "Checkout on staging"); values stay on the server:

   ```sh
   nano /home/deploy/shopmaple-staging/shared/staging.env
   ```

3. Check the settings:

   ```sh
   node /home/deploy/shopmaple/ops/tools/ops/staging-env-check.mjs
   ```

4. Copy the newest backup in, with customer and payment data removed:

   ```sh
   bash /home/deploy/shopmaple/ops/tools/ops/staging-refresh-db.sh
   ```

5. Build and start the release on staging (about 5 to 10 minutes; it builds while the store keeps running, so prefer a quiet hour):

   ```sh
   bash /home/deploy/shopmaple/ops/tools/ops/staging-deploy.sh <sha>
   ```

   It ends with `STAGING NOW RUNS <sha>`.

6. Claude in the main session does the Cloudflare checklist above.

7. Save the PM2 process list so staging comes back after a server restart:

   ```sh
   pm2 save
   ```

8. Optional: let the store monitor also watch the staging processes:

   ```sh
   echo 'MONITOR_PM2_APPS=shopmaple-api,shopmaple-web,shopmaple-db,shopmaple-staging-api,shopmaple-staging-web,shopmaple-staging-db' >> /home/deploy/shopmaple/ops/alerts.env
   ```

## Everyday use

- Try a release before production: stage it as usual (its archive lands in `backups/<sha>.tar.gz`), then `bash /home/deploy/shopmaple/ops/tools/ops/staging-deploy.sh <sha>`. Staging migrates its own database with that release's migrations first, which is a rehearsal of the production migration.
- Fresh data: `bash /home/deploy/shopmaple/ops/tools/ops/staging-refresh-db.sh` (uses last night's backup).
- Staging's catalogue is the one in the copied backup; it does not run the 5-minute Keeri sync. Product photos still load, through the read-only Keeri catalogue settings copied into `staging.env` by the setup.

## Checkout on staging

Off by default. Razorpay test keys alone are not enough: checkout also asks Keeri for quotes, **stock reservations and orders** with `KEERI_COMMERCE_TOKEN` and `KEERI_MERCHANT_SCOPE`. Reusing production's would reserve and order real stock in Keeri from test purchases. Turning it on needs, in `staging.env`: `CHECKOUT_ENABLED=true`, Razorpay **test** keys and a test webhook secret (with the webhook `https://staging.maplefurnishers.com/api/webhooks/razorpay` registered in Razorpay's test mode), a **separate Keeri merchant scope and commerce credential** for staging (with its own `STOREFRONT_COMMERCE_POLICIES` and Shiprocket rows in Keeri), `CHECKOUT_DELIVERY_METHODS`, and `ORDER_RESEND_API_KEY`/`ORDER_MAIL_FROM`/`ORDER_MAIL_TO` (one test inbox). The settings check refuses the production scope or credential. Then restart the staging API: `pm2 restart shopmaple-staging-api --update-env`.

## Cost on the server

- Disk: about 1.1 GB per staging build, two kept (2.2 GB), plus 1.1 GB while a new one builds; database about 60 MB; media 2 MB. Roughly 2.3 GB steady and 3.4 GB at peak, leaving about 21 GB free (11%) today: close to the monitor's 10% line. Pruning old production releases first is advisable (see [operations-backups.md](operations-backups.md#disk-impact)).
- Memory: about 600 to 900 MB for the three staging processes (caps: API 384 MB, web 512 MB). The server has about 11 GB available.
- CPU: builds use all four cores for a few minutes.

## Undoing

Kept apart from the steps above on purpose. Removing staging: delete the public hostname and Access applications in Cloudflare, then `pm2 delete shopmaple-staging-api shopmaple-staging-web shopmaple-staging-db`, `pm2 save`, and remove `/home/deploy/shopmaple-staging`. Production is not affected by any of it.
