# Nightly backups and the restore drill

How the store's nightly backup runs, how its failures are now noticed, and the weekly drill that proves a backup can actually be restored. The backup format itself (a database dump and a media archive verified as one pair) is described in [paired-backups.md](paired-backups.md). Alerts are described in [operations-monitoring.md](operations-monitoring.md).

## What was wrong (found 11 November 2026)

The nightly 02:47 UTC job has failed every night since 27 October. `backups/backup.log` holds only `Paired backup failed; inspect retained run privately.`, nothing alerted, and the newest complete pair is `20261027T054640489Z-…`, taken before online checkout went live. **No backup contains any live order.**

Cause: `paired-backup.mjs` refuses to run from, or record, a release directory that other users could write to. `release-stage.sh` runs with the `deploy` user's umask 002, so every release staged since then is `drwxrwxr-x`; the active release `a061826…` is one of them. The tool's refusal is correct (its directory checks guard the backup's provenance); the release directories were wrong. A read-only check on the server reproduces it:

```
backup preflight: {"ok":false,"reason":"RELEASE_DIR_GROUP_WRITABLE","hint":"chmod go-w /home/deploy/shopmaple/releases/a061826457d4033def0f2118c9b0cd82e0a04965"}
```

The cron entry also ran the tool from a pinned folder (`operations/39064130…`), so fixes to the backup tool never reached it.

Fix (owner steps 1 and 2 in [operations-monitoring.md](operations-monitoring.md#owner-setup-step-by-step)): make the existing release directories private, add `umask 022` to `release-stage.sh`, and switch the cron entry to the stable launcher below.

## The nightly backup from a stable path

Cron runs `/home/deploy/shopmaple/ops/tools/ops/run-backup.sh` at 02:47 UTC. It runs `deploy/ops/backup-runner.mjs`, which:

1. Checks, before starting, the conditions the backup tool would otherwise refuse silently, and names each one:

   | Reason | Meaning | Fix |
   | --- | --- | --- |
   | `RELEASE_DIR_GROUP_WRITABLE` | the active release (or a folder above it) is writable by other users | `chmod go-w <the path shown>`; keep `umask 022` in `release-stage.sh` |
   | `RELEASE_PATH_INVALID` | `current` does not point at `releases/<full commit>` (for example a `-shop` suffixed folder) | point `current` at a normally staged release |
   | `BACKUP_TOOL_MISSING` | the active release has no `deploy/backup-shopmaple.sh` | activate a complete release |
   | `BACKUP_ROOT_UNSAFE` | `backups/` is not a private directory | `chmod 700 /home/deploy/shopmaple/backups` |
   | `BACKUP_LOCK_PRESENT` | a crashed run left `backups/.paired-backup.lock` | follow "Capacity and interrupted jobs" in [paired-backups.md](paired-backups.md) |
   | `LOW_DISK` | under 1 GB free | free space first |
   | `BACKUP_FAILED` | the backup tool ran and failed (its own log stays private) | inspect the newest pair folder |
   | `BACKUP_DID_NOT_START` | the tool exited without its failure line (usually its directory lock was busy) | check for another backup process |
   | `PAIR_NOT_COMPLETE` | the tool reported success but the pair has no `COMPLETE.json` | inspect the pair folder |

2. Runs the reviewed `deploy/backup-shopmaple.sh` of the **active release** (the backup tool only accepts its own location under `releases/<commit>` or `operations/<commit>`, so it upgrades with each release).
3. Writes `ops/state/backup-last.json` (`ok`, time, pair id or reason code; never the tool's output), which the monitor's `backup_freshness` check reads. A failed night is reported by the next monitor run, within 5 minutes.

## The weekly restore drill

Cron runs `/home/deploy/shopmaple/ops/tools/ops/run-restore-drill.sh --email-summary` on Sundays at 03:30 UTC (`deploy/ops/restore-drill.mjs`). It:

1. Picks the newest complete pair and verifies it with `verifyPair` (checksums, `pg_restore --list`, media archive).
2. Checks free space for the restore (1 GB plus the media archive plus four times the dump).
3. Starts a **throwaway PostgreSQL cluster of its own**: a new data directory under `/home/deploy/shopmaple/ops/drill/drill-<time>-<random>`, socket only (no TCP listener), on port 55449. The live cluster (55440) is only read, through its usual socket, for comparison counts.
4. Restores the dump into it with `pg_restore --no-owner --no-acl --exit-on-error`.
5. Checks:
   - row counts of the key tables (`Product`, `Variant`, `Enquiry`, `Contact`, `CheckoutAttempt`, `Customer`, `CustomerAddress`, `ShopAdmin`, `ShopContent`, `ShopContentRevision`, `ShopMediaAsset`, `OrderOutbox`, `OrderNotification`, `PaymentWebhookInbox`, `EnquiryDelivery`) against live, within 10% or 25 rows, whichever is larger (`DRILL_TOLERANCE_PERCENT`, `DRILL_TOLERANCE_ABSOLUTE` in `alerts.env`). Busy tables such as carts and sessions are not compared;
   - the latest paid order captured before the backup started exists in the restored copy (`MF-<number>`);
   - the applied Prisma migrations match live, apart from ones live applied after the backup was taken, with the same checksums;
   - the media archive extracts, and every uploaded file the restored database records exists in it.
6. Stops the cluster and deletes the whole drill folder, whether it passed or not. Leftovers from a crashed drill (only folders named `drill-<time>-<hex>`) are stopped and removed at the start of the next one.
7. Writes `ops/state/restore-drill.json`; the monitor alerts when it failed or is older than 8 days. With `--email-summary` it also emails the result:

```
Subject: [ShopMaple] Restore drill passed (20261116T024700)

Restore drill passed on kalaakaari-prod at 2026-11-16T03:30:02.114Z.
Backup: 20261116T024700512Z-… (completed 2026-11-16T02:47:03.020Z)
Restored tables: 35. Media files extracted: 15. Latest paid order: MF-10012 present.
```

The drill never restores over the live database, never writes to the live media folder and never starts the store against the restored copy.

## Disk impact

Measured on 11 November 2026: 193 GB disk, 24.7 GB free (12.8%); the monitor's limit is 10% (19.3 GB) or 5 GB.

| Item | Size | When |
| --- | --- | --- |
| One nightly pair today | about 2 to 5 MB (database dump under 1 MB in October, live database 20 MB; media 1.9 MB) | every night, kept (there is no retention) |
| A month of pairs | about 60 to 150 MB | grows with orders and uploads |
| Restore drill | about 100 to 150 MB at its peak (cluster files, restored database, extracted media), removed when it ends | Sundays, a few minutes |
| Monitor and logs | under 3 MB (logs rotate at 1 MB) | always |

Two things to decide before they become a problem:

- **Films in the media library (pending PR #134)** raise the media caps to 96 MB per file and 4 GB in all, and every nightly pair copies the whole media folder. With 3 GB of films, each night adds about 3 GB and the drill needs that much again while it runs; the disk would cross the 10% line within two nights. Retention (for example keep 7 nightly pairs plus one per week) or media de-duplication between pairs is needed before films are uploaded.
- `releases/` holds 29 builds (28 GB, about 1.1 GB each) and `backups/` holds 40 release archives (about 700 MB). Keeping the last five releases would free about 25 GB. Nothing here deletes them.

Backups are still on the same disk as the store. Off-host copies remain open (see [paired-backups.md](paired-backups.md)).

## Running by hand

```sh
/home/deploy/shopmaple/ops/tools/ops/run-backup.sh
/home/deploy/shopmaple/ops/tools/ops/run-restore-drill.sh
```

From a terminal both print their result; under cron they append to `/home/deploy/shopmaple/ops/logs/`.

## Tests

`deploy/ops/backup-runner.test.mjs` covers each preflight reason, success, failure without leaking tool output, and an unconfirmed success. `deploy/ops/restore-drill.test.mjs` covers the comparisons. `deploy/ops/restore-drill.db.test.mjs` (in `npm run test:deploy:db`) makes a real pair from the dedicated test database, restores it into a real throwaway cluster, checks it passes, that extra live rows fail it, that a tampered dump is refused, and that the cluster is stopped and its folder removed. CI installs the PostgreSQL 17 server binaries for `initdb`; production uses PostgreSQL 16's.
