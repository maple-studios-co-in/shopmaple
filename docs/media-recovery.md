# Uploaded-media backup and recovery

`deploy/media-backup.mjs` is an offline Node.js 22 tool using only built-in modules. It never connects to a database, modifies the source, replaces existing backup/restore directories, removes files, or installs a schedule. Run it as the dedicated deployment owner on Linux or macOS. Windows is refused because this implementation cannot guarantee reparse-point exclusion.

## Scope and current operational gap

The production upload root is `/home/deploy/shopmaple/shared/media` (0700). A read-only check on 2026-10-26 found zero uploaded files. This does not establish recovery for future uploads.

The existing ShopMaple nightly job runs at 02:47 UTC. It uses PostgreSQL 16 `pg_dump -Fc` against the isolated socket/port, writes a `.partial` file, renames it after success, and writes a SHA-256 sidecar. It backs up the database only. No media backup schedule was installed by this change. The separate Keeri backup job is not a ShopMaple uploaded-media backup.

Database records hold media labels, publication state and references; files hold the image bytes. Recover both. Keep checkout disabled until the other documented commerce release gates pass.

## Format and verification

A new, private backup directory contains:

- `media.archive`: raw file bytes concatenated in manifest order, with no tar headers or executable extraction instructions.
- `manifest.json`: version 1 and ordered `{name, bytes}` entries. Names must be exactly 64 lowercase hexadecimal characters followed by `.webp`; the name's hash must match its bytes.
- `SHA256SUMS`: SHA-256 checksums of both archive and manifest, written last as the completion marker.

Files are 0600 and directories 0700. The tool fsyncs files and directories, validates the finished backup, and returns JSON containing file and byte counts. An empty source is a valid zero-file backup. A missing or invalid completion marker means the bundle is incomplete. Interrupted runs remain for operator inspection; rerun using a fresh destination.

Verification checks every checksum, filename, unique path, size and archive boundary before restoration creates a destination. Restoration rechecks each file's digest while writing. It refuses pre-existing destinations, symbolic-link files or path components, non-regular files, traversal, absolute or backslash entry paths, trailing/truncated data, and unsupported versions. Input paths must be normalized absolute paths without symbolic-link ancestors (use `/private/tmp`, not the macOS `/tmp` alias).

Limits are 4,096 files, 32 MiB per file, a 1 GiB archive, and a 1 MiB manifest. The current application quotas are lower. Memory use is bounded by an individual file rather than the full archive. Content-address verification does not decode WebP; image validation belongs to upload processing.

Checksums detect corruption; they do not authenticate a bundle against an attacker who can rewrite its checksum file. Use a trusted backup location, preserve provenance and restrict access. Parent directories must not be writable by other users unless protected by the POSIX sticky bit. Do not run alongside untrusted processes using the same OS account, which can race filesystem changes. The tool does not provide encryption, remote storage, retention, database consistency, or an atomic switch of the running application's media root.

## Backup procedure

Use a real release path for the script; the script itself may be reached through `current`, but media and backup arguments must have no symbolic-link ancestors. Create the backup parent separately as an owner-only directory if it does not already exist. Pick a fresh timestamped directory for every attempt.

1. Pause admin media uploads/publication and any media cleanup for the maintenance window. Drain in-flight writes. The tool fails on temporary upload files or a changed source inventory, rather than publishing an incomplete selection.
2. Complete the database dump first. Retain its checksum, release revision, dump start/end time and path as the recovery pair's evidence.
3. Back up media after the database dump succeeds. The application installs immutable content-addressed files before committing their database records and currently has no final-file cleanup. This ordering preserves the files needed by the earlier database snapshot. Do not assume this remains safe if deletion or garbage collection is introduced.
4. Verify the media bundle, record its counts and checksum-file digest alongside the database dump, then resume admin writes. Retain orphan media files; do not delete files based on the database snapshot.

Example media commands, with operator-selected unused paths:

```sh
umask 077
node deploy/media-backup.mjs backup /home/deploy/shopmaple/shared/media /home/deploy/shopmaple/backups/media-20261026T030000Z
node deploy/media-backup.mjs verify /home/deploy/shopmaple/backups/media-20261026T030000Z
```

For a proposed nightly integration, extend the existing 02:47 UTC database workflow after its successful dump/checksum steps: use one shared timestamp, invoke `backup`, then `verify`, and report success only when both database and media checks succeed. Prevent overlapping paired jobs with `flock`. The uploader does not take that lock; use a maintenance window, or explicitly rely on the documented append-only publication ordering and retry if the tool detects changes. A separately timed cron entry cannot prove a recovery pair. Do not treat the present database-only schedule as media protection. Alert on failure/missing daily evidence, copy complete pairs to access-controlled off-host storage, and define retention only after restoring a pair successfully. This document proposes integration; it does not install it.

## Offline restore drill

Copy a complete trusted bundle and its paired database dump to an isolated recovery environment. Verify database dump checksums and restore the database into a dedicated, disposable recovery database following the database runbook. Never use production or development data for destructive tests.

```sh
node deploy/media-backup.mjs verify /absolute/recovery/media-backup
node deploy/media-backup.mjs restore /absolute/recovery/media-backup /absolute/recovery/media-restored-new
```

The destination must not exist. If a write fails midway, preserve that partial directory for inspection and retry with a new path. The tool deliberately does not clean it up. Do not restore over the live media root.

Check recovered database media records against restored filename hashes and byte sizes; confirm all published content references resolve in the isolated application, and that unpublished assets remain unavailable publicly. Record file count, byte count, backup digests, database-to-file reconciliation, application checks and the release revision. A successful file-only round trip proves byte recovery, not database referential consistency or publication authorization.

A production recovery remains a separate controlled operation: stop relevant writers, preserve the original database and media root, select the validated recovery pair, and switch to the recovered data only after the isolated drill. No live-root replacement is performed by this tool.

## Development evidence

Run with Node.js 22:

```sh
node --test deploy/media-backup.test.mjs
```

The first RED run had 22 assertion failures against the interface scaffold: backup returned `undefined` instead of `{files: 2, bytes: 32}`, and missing validation produced `Missing expected exception`. The CLI RED then had 22 passing tests and one failure: expected `{"files":1,"bytes":20}` but observed empty stdout. Two additional RED regressions caught destination creation before rejecting a trailing slash and a CLI invoked through a release symlink returning no output. After those fixes, all 25 tests passed. Tests use temporary local directories and real files, never a database or live uploads. Whole-project checks and security review are performed by the integrating change and must be recorded separately; this focused result does not claim they passed.
