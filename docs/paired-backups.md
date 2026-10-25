# Paired ShopMaple backups

A recovery point needs both PostgreSQL and uploaded media. `deploy/paired-backup.mjs` creates them as one verified pair; `deploy/media-backup.mjs` remains the bounded file archive implementation. Neither tool restores over a live database, deletes old backups, uploads off-host, or changes the running storefront.

## Contents and consistency

Each new private pair directory contains `database.dump`, `database.sha256`, one successful `media-N` bundle and `COMPLETE.json`. Failed media attempts and partial database output remain for inspection. Only a verified `COMPLETE.json` identifies a recoverable pair; a `.dump` suffix, nonzero file size or newest modification time is insufficient.

The database snapshot is taken first. Current application uploads install immutable content-addressed bytes before committing their database rows, and there is no final-media garbage collector. A later media snapshot therefore contains the bytes referenced by the earlier database snapshot. Extra orphan/newer files are retained. The restored database's publication metadata controls public access. Introducing deletion or replacing final files would invalidate this ordering and requires a coordinated backup/writer design.

Concurrent uploads may make an archive attempt fail. The job retries a bounded number of times into fresh destinations. The backup lock prevents overlapping backup jobs; it does not pause uploads or publication. Repeated churn fails closed without a completion record. A process timeout or storage failure also retains an incomplete attempt.

Before declaring success, the tool checks a nonempty database dump, its checksum and PostgreSQL archive readability, then verifies every media checksum and the pair manifest. Writes and completion metadata are fsynced. Checksums detect corruption, not a malicious actor able to replace both artifacts and their checksums. Keep the backup location trusted and access-controlled.

## Deployment and schedule

The launcher is an operations deployment: install the reviewed scripts under an immutable `/home/deploy/shopmaple/operations/<commit>/deploy` directory. It resolves the currently active application release once for provenance; it does not switch the application symlink or restart PM2. The production command fixes PostgreSQL 16, the isolated ShopMaple socket/port 55440, database `shopmaple_store`, role `deploy`, and the private media/backup roots. Inherited PostgreSQL connection settings must not redirect it.

After verification, replace only the existing ShopMaple 02:47 UTC database-only cron with the reviewed fixed-version launcher. Preserve other cron entries and keep a private before/after record. Verify a first complete pair and an isolated restore before claiming the schedule protects media. Actual installation evidence belongs in the release report; source implementation alone does not establish a scheduled job.

The job logs a pair identifier on success and fails nonzero on an incomplete run. Separate alert delivery, missing-daily-pair monitoring, retention and an automated off-host destination still need configuration. Do not claim a backup log is a delivered alert or a local disk copy is disaster recovery.

## Capacity and interrupted jobs

A 512 MiB reserve is checked before work and while writing subprocesses run; database output also has a size bound. These checks sample available capacity every 100 ms. They reduce the risk of exhausting storage but are not filesystem quotas: other writers and fast bursts can race the sampling interval. Check growth and storage capacity before enabling a retention schedule. No backup or release is deleted to make space.

The Linux launcher holds an OS directory lock. The portable library additionally owns an empty `.paired-backup.lock` directory, which ordinary completion and handled interruptions remove after workers stop. A process crash or SIGKILL can leave that directory behind. Do not automatically remove it based on age or a guessed PID. Confirm no backup process/child remains, inspect the retained incomplete attempt and preserve its files before an operator removes only the empty stale lock with `rmdir`. Failure to acquire either lock must remain visible as a failed invocation.

## Restore drill

Use a trusted complete pair and the matching PostgreSQL client version. Run `verifyPair` before accepting its paths. Restore the database only into a newly created, explicitly disposable recovery database; restore media only into a new directory using `restoreMediaBackup`. Never restore over development or production.

Reconcile each restored media record's storage key, hash and byte size. Resolve every published document/revision reference against the restored media. Confirm published images are available, private images require staff authorization and orphan files remain unavailable publicly. Do not discard orphans during the drill.

`deploy/paired-recovery.db.test.mjs` performs this with the real app schema, real PostgreSQL dump/restore, three actual WebP files and the real media HTTP routes. It verifies a published content reference, private staff preview, unauthenticated denials and byte-for-byte recovery. The source is restricted to local `shopmaple_test`; restoration uses a fresh owned `shopmaple_recovery_test_*` database. Cleanup drops only that owned disposable database and removes only generated test fixtures.

## Local and CI checks

Use Node 22 and a PostgreSQL 17 client for the dedicated test server. `PG_BIN_DIRECTORY` can select the installed client directory; it is not a database URL. CI uses the PostgreSQL project's [signed Ubuntu repository](https://www.postgresql.org/download/linux/ubuntu/) when the required clients are not already installed.

```sh
node --env-file=.env --test deploy/paired-backup.test.mjs
node --env-file=.env --import tsx --test deploy/paired-recovery.db.test.mjs
npm test
npm run test:deploy:db
npm run typecheck
npm run build
npm run security:check
```

The job tests run through `test:deploy`; the isolated application recovery drill runs through `test:deploy:db`. Missing database/client prerequisites fail the required checks rather than silently skipping them. These tests do not prove live off-host retention, delivered alerts or fulfilment readiness. Checkout remains disabled.
