# Store monitoring and alerts

A small monitor checks the live store every 5 minutes and emails the owner when something goes wrong, again as a reminder while it stays wrong, and once when it is fixed. It runs on the VPS from a stable path (`/home/deploy/shopmaple/ops/tools`), not from a release folder, so it keeps working across releases and rollbacks.

Code: `deploy/ops/store-monitor.mjs` (checks), `deploy/ops/alerts.mjs` (de-duplication and email), `deploy/ops/run-monitor.sh` (cron launcher). Backups and the restore drill are in [operations-backups.md](operations-backups.md); the staging copy is in [operations-staging.md](operations-staging.md).

## What is checked

| Check | What it does | Problem when |
| --- | --- | --- |
| `public_home` | `GET https://shop.maplefurnishers.com/` through Cloudflare | not HTTP 200 within 15 s |
| `public_health` | `GET /api/health` through Cloudflare | not `status: ok`, or `checkoutEnabled` is not `true` (set `MONITOR_EXPECT_CHECKOUT=false` while checkout is deliberately off) |
| `public_product` | reads the first product from `/api/products?limit=1`, then opens its page | product list fails or is empty, or the product page is not 200 |
| `local_api` | `GET http://127.0.0.1:4110/api/health` on the VPS (`shopmaple-api`) | as `public_health` |
| `local_web` | `GET http://127.0.0.1:3110/` on the VPS (`shopmaple-web`) | not 200 |
| `razorpay_webhook` | `POST /api/webhooks/razorpay` with an empty JSON body and **no signature** | anything but a refusal (400/401/415). 404 means the route is not registered (checkout off), 5xx or no answer means Razorpay's payment confirmations would be lost. The probe is refused by validation before anything is stored; no payment API is called. |
| `disk` | free space on `/home/deploy` | under 10% **or** under 5 GB free |
| `backup_freshness` | newest backup pair with a `COMPLETE.json`, plus the nightly run's own result | no complete backup in the last 26 hours; a warning when the last nightly run failed even though an older backup is still fresh |
| `catalogue_sync` | the sync's status file (`CATALOGUE_SYNC_STATUS_FILE`) | warning after 20 minutes without a successful sync, failure after 60 (the store keeps showing the old catalogue meanwhile); failure if the sync has not run at all for 60 minutes |
| `pm2` | `pm2 jlist` (parsed in memory only: it contains every process's environment) | `shopmaple-api`, `shopmaple-web` or `shopmaple-db` missing or not online; a warning when one restarted 3 or more times in the last hour |
| `restore_drill` | the weekly drill's result file | the last drill failed; a warning when the last good drill is older than 8 days |

Network checks (`public_*`, `local_*`, `razorpay_webhook`) must fail on two runs in a row (5 to 10 minutes) before an email, so a single slow answer does not wake anyone. Disk, backup, catalogue, PM2 and drill problems are reported on the first run.

### Catalogue sync status

`deploy/sync-store-catalogue.ts` still prints the same quiet line when it fails (`Store catalogue sync failed; existing catalogue retained. ...`), now followed by `Reason code: <CODE>`. When `CATALOGUE_SYNC_STATUS_FILE` is set in `store.env`, every run also writes that private file (0600, atomically):

```json
{"version":1,"ok":false,"at":"2026-11-12T03:05:00.000Z","lastSuccessAt":"2026-11-12T03:00:00.000Z","consecutiveFailures":1,"reason":"STALE_OR_FUTURE_SNAPSHOT"}
```

Reason codes are fixed identifiers only (`MISSING_CONFIGURATION`, `INVALID_ARGUMENTS`, `STALE_OR_FUTURE_SNAPSHOT`, `EMPTY_KEERI_REQUIRES_APPROVAL`, `CATALOGUE_APPLY_FAILED`, `ISOLATED_DATABASE_APPROVAL_REQUIRED`, a Keeri fetch code, or `UNEXPECTED`); error messages, which can hold addresses or tokens, are never recorded. A dry run (`--apply` missing) is not counted as a success.

## How alerts behave

- **One message per problem.** All changes found in one run go into one email.
- **Reminder** every 6 hours while a problem lasts (`ALERT_REMINDER_HOURS`).
- **Changed** when a problem moves between warning and failure.
- **Recovered** once when it clears. A problem that cleared before it was ever announced sends nothing.
- If Resend refuses or cannot be reached, nothing is marked as sent and the next run tries again. The monitor log shows `alert=DELIVERY-FAILED`.
- **No secrets.** Messages are built from fixed templates with numbers and codes. Before sending, every value of a `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*` or `DATABASE_URL` setting is replaced with `[redacted]`, as are URLs with credentials, Razorpay and Resend key shapes, `Bearer` values and any 48+ character token. The state file holds the same redacted text.
- The Resend endpoint is fixed in code; no setting can send the API key elsewhere.

Example (first email after the monitor was installed, before the backup fix):

```
Subject: [ShopMaple] 1 new problem

ShopMaple store monitor, 2026-11-12 03:00 UTC
Host: kalaakaari-prod

NEW PROBLEMS
- backup_freshness (failure): last complete backup was 15 days ago (completed 2026-10-27 05:46 UTC); last nightly run failed with RELEASE_DIR_GROUP_WRITABLE 12 minutes ago

Open problems now: 1. Checks passing: 10.
What each check means and what to do: docs/operations-monitoring.md in the shopmaple repository.
You get one message per problem, a reminder while it lasts, and one message when it clears.
```

Recovery:

```
Subject: [ShopMaple] 1 recovered

RECOVERED
- public_home: home page answered 200 in 312 ms (was open since 2026-11-12 03:00 UTC)
```

## Settings

`store.env` already holds `ORDER_RESEND_API_KEY`, which the monitor uses. Its own settings go in `/home/deploy/shopmaple/ops/alerts.env` (0600), read after `store.env`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `ALERT_MAIL_TO` | (required) | One to five plain addresses, comma-separated |
| `ALERT_MAIL_FROM` | `no-reply@maplefurnishers.com` | Plain address only (no display name), like the store's own senders |
| `ALERT_RESEND_API_KEY` | `ORDER_RESEND_API_KEY` | Only if alerts should use a separate Resend key |
| `ALERT_REMINDER_HOURS` | 6 | Reminder interval |
| `ALERT_CONFIRM_RUNS` | 2 | Consecutive failures before a network problem is announced |
| `MONITOR_EXPECT_CHECKOUT` | `true` | `false` while online checkout is deliberately switched off |
| `MONITOR_DISK_MIN_FREE_PERCENT` / `MONITOR_DISK_MIN_FREE_GB` | 10 / 5 | Disk limits |
| `MONITOR_BACKUP_MAX_AGE_HOURS` | 26 | Backup freshness limit |
| `MONITOR_SYNC_WARN_MINUTES` / `MONITOR_SYNC_FAIL_MINUTES` | 20 / 60 | Catalogue sync limits |
| `MONITOR_RESTART_WARN` | 3 | PM2 restarts per hour before a warning |
| `MONITOR_DRILL_MAX_AGE_DAYS` | 8 | Restore drill age limit |
| `MONITOR_PM2_APPS` | `shopmaple-api,shopmaple-web,shopmaple-db` | Add `shopmaple-staging-api,shopmaple-staging-web,shopmaple-staging-db` to watch staging too |

`CATALOGUE_SYNC_STATUS_FILE` goes in `store.env`, because the catalogue sync reads that file.

Files on the VPS: state in `/home/deploy/shopmaple/ops/state/` (`monitor.json`, `backup-last.json`, `restore-drill.json`), logs in `/home/deploy/shopmaple/ops/logs/` (each kept under about 1 MB, one older copy). Run by hand from a terminal, the launchers print to the screen instead of the log.

## Keeri's operational health monitor

Keeri already runs `/home/deploy/keeri/ops-health/run-operational-health.sh` every 5 minutes. It is email only (Resend, with Keeri's own key and sender, to `KEERI_ALERT_TO`); it has no WhatsApp alert path (WhatsApp is something it checks, not a channel it sends on). It alerts on state changes only, with no reminders and no confirmation runs, and it lives as an unversioned copy on the server reading Keeri's private environment. The store monitor follows the same approach (flock, a private state file, transitions, Resend, a short summary line per run in the log) but is kept separate: it uses the store's own Resend key and sender, is versioned and tested in this repository, and a Keeri change or outage cannot silence store alerts. Both can send to the same inbox.

Its log (`/home/deploy/keeri/ops-health/logs/monitor.log`, about 800 KB) is never rotated, and it has reported `disk=failure` (its limit is 85% used) since the disk passed 85%; that alert went out once and will not repeat.

## Owner setup, step by step

These steps assume a release that includes this change is staged (and, for the catalogue status, active). Replace `<sha>` with that release's full commit. Run each command on the VPS as `deploy`, one at a time, and check its output before the next.

1. Make the existing release directories private again (this is what has stopped every nightly backup since 27 October; see [operations-backups.md](operations-backups.md)):

   ```sh
   find /home/deploy/shopmaple/releases -mindepth 1 -maxdepth 1 -type d -perm /022 -exec chmod go-w {} +
   ```

2. Make future releases private by adding `umask 022` to the release staging script:

   ```sh
   sed -i 's/^set -euo pipefail$/set -euo pipefail\numask 022/' /home/deploy/shopmaple/shared/release-stage.sh
   ```

   Check: `grep -n umask /home/deploy/shopmaple/shared/release-stage.sh` shows line 5.

3. Install the operations tools from the release:

   ```sh
   sh /home/deploy/shopmaple/releases/<sha>/deploy/ops/install-ops.sh <sha>
   ```

4. Create the private alert settings file:

   ```sh
   install -m 600 /dev/null /home/deploy/shopmaple/ops/alerts.env
   ```

5. Add the alert recipient (replace the address):

   ```sh
   echo 'ALERT_MAIL_TO=owner@example.com' >> /home/deploy/shopmaple/ops/alerts.env
   ```

6. Tell the catalogue sync where to record its outcome:

   ```sh
   echo 'CATALOGUE_SYNC_STATUS_FILE=/home/deploy/shopmaple/shared/catalogue-sync-status.json' >> /home/deploy/shopmaple/shared/store.env
   ```

   No restart is needed: the sync reads `store.env` on every run. The file appears within 5 minutes once the active release contains the new sync script.

7. Send a test alert and confirm it arrives:

   ```sh
   /home/deploy/shopmaple/ops/tools/ops/run-monitor.sh --test-alert
   ```

   If Resend refuses it (HTTP 403/422), the sender domain is not verified for this key; fix that in Resend first.

8. See every check and the email it would send, without sending or saving anything:

   ```sh
   /home/deploy/shopmaple/ops/tools/ops/run-monitor.sh --dry-run
   ```

9. Take a backup now from the new launcher (about a minute):

   ```sh
   /home/deploy/shopmaple/ops/tools/ops/run-backup.sh
   ```

   It prints `backup ok <pair id>`, or `backup FAILED <REASON> (fix: ...)`.

10. Run the first restore drill (a few minutes; it removes everything it creates):

    ```sh
    /home/deploy/shopmaple/ops/tools/ops/run-restore-drill.sh --email-summary
    ```

11. Preview the new crontab:

    ```sh
    /usr/bin/node /home/deploy/shopmaple/ops/tools/ops/install-cron.mjs --dry-run
    ```

    It must still contain the Keeri, catalogue sync and other apps' entries unchanged, no longer contain `operations/39064130264d569bbca34fcc7c74e828e954e52a`, and end with the `# ShopMaple operations` block.

12. Install it:

    ```sh
    /usr/bin/node /home/deploy/shopmaple/ops/tools/ops/install-cron.mjs
    ```

    It saves the previous crontab privately and prints where.

13. After 10 minutes, check the monitor log:

    ```sh
    tail -3 /home/deploy/shopmaple/ops/logs/monitor.log
    ```

To upgrade the tools after a later release, repeat step 3 with the new commit. Cron keeps using the same path.

## Undoing

Kept apart from the steps above on purpose. To put the previous crontab back, use the file step 12 printed: `crontab /home/deploy/shopmaple/ops/state/crontab.before-ops-<time>`. To point the tools at the previous copy, run `install-ops.sh` with the previous commit. Removing `CATALOGUE_SYNC_STATUS_FILE` from `store.env` stops the status file; nothing else depends on it.
