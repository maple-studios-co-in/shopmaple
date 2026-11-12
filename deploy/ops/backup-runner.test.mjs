import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflight, runBackup } from './backup-runner.mjs';
import { listCompletePairs, pruneCompletePairs } from './backups.mjs';

const sha = 'a061826457d4033def0f2118c9b0cd82e0a04965';
function fixture(t, script = 'exit 0') {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'backup-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  chmodSync(root, 0o700);
  const release = join(root, 'releases', sha);
  mkdirSync(join(release, 'deploy'), { recursive: true, mode: 0o755 });
  chmodSync(join(root, 'releases'), 0o700); chmodSync(release, 0o755);
  writeFileSync(join(release, 'deploy', 'paired-backup.mjs'), '');
  writeFileSync(join(release, 'deploy', 'backup-shopmaple.sh'), `#!/bin/sh\n${script}\n`, { mode: 0o700 });
  mkdirSync(join(root, 'backups'), { mode: 0o700 });
  symlinkSync(`releases/${sha}`, join(root, 'current'));
  return { root, release, statusFile: join(root, 'ops', 'state', 'backup-last.json') };
}
const plenty = () => ({ freeBytes: 50 * 1024 ** 3 });

test('preflight accepts a private current release and names it', t => {
  const { root, release } = fixture(t);
  assert.deepEqual(preflight({ root, statfs: plenty }), { ok: true, release: { path: release, sha } });
});

test('a group-writable release directory is reported with the exact fix, as on the server since 27 Oct', t => {
  const { root, release } = fixture(t);
  chmodSync(release, 0o775);
  const result = preflight({ root, statfs: plenty });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'RELEASE_DIR_GROUP_WRITABLE');
  assert.equal(result.hint, `chmod go-w ${release}`);
});

test('a current link outside releases or without a full commit name is refused', t => {
  const { root } = fixture(t);
  rmSync(join(root, 'current'));
  mkdirSync(join(root, 'releases', `${sha}-shop`), { mode: 0o755 });
  symlinkSync(`releases/${sha}-shop`, join(root, 'current'));
  assert.equal(preflight({ root, statfs: plenty }).reason, 'RELEASE_PATH_INVALID');
});

test('a leftover backup lock, a missing tool and low disk each get their own reason', t => {
  const { root, release } = fixture(t);
  mkdirSync(join(root, 'backups', '.paired-backup.lock'));
  assert.equal(preflight({ root, statfs: plenty }).reason, 'BACKUP_LOCK_PRESENT');
  rmSync(join(root, 'backups', '.paired-backup.lock'), { recursive: true });
  assert.equal(preflight({ root, statfs: () => ({ freeBytes: 100 * 1024 ** 2 }) }).reason, 'LOW_DISK');
  rmSync(join(release, 'deploy', 'backup-shopmaple.sh'));
  assert.equal(preflight({ root, statfs: plenty }).reason, 'BACKUP_TOOL_MISSING');
});

test('a successful run records the new pair; the status file is private', async t => {
  const pairId = '20261112T024700000Z-6c6d624b-ecfd-4e4d-a0d6-6e7dfa611feb';
  const { root, statusFile } = fixture(t, `mkdir -m 700 "$BACKUPS/${pairId}" && echo '{}' > "$BACKUPS/${pairId}/COMPLETE.json" && echo '{"pairId":"${pairId}","complete":true}'`);
  const status = await runBackup({ root, statusFile, statfs: plenty, now: () => Date.parse('2026-11-12T02:47:00.000Z'), extraEnv: { BACKUPS: join(root, 'backups') } });
  assert.equal(status.ok, true); assert.equal(status.pairId, pairId);
  assert.deepEqual(JSON.parse(readFileSync(statusFile, 'utf8')), status);
  assert.equal(statSync(statusFile).mode & 0o777, 0o600);
});

test('a failed run records BACKUP_FAILED and never the tool output', async t => {
  const { root, statusFile } = fixture(t, 'echo "PGPASSWORD=SECRET_SENTINEL" >&2; echo "Paired backup failed; inspect retained run privately." >&2; exit 1');
  const status = await runBackup({ root, statusFile, statfs: plenty, now: () => 0 });
  assert.equal(status.ok, false); assert.equal(status.reason, 'BACKUP_FAILED');
  assert.equal(readFileSync(statusFile, 'utf8').includes('SECRET_SENTINEL'), false);
});

test('a success claim without a completion record is not trusted', async t => {
  const { root, statusFile } = fixture(t, `echo '{"pairId":"20261112T024700000Z-missing","complete":true}'`);
  const status = await runBackup({ root, statusFile, statfs: plenty, now: () => 0 });
  assert.equal(status.ok, false); assert.equal(status.reason, 'PAIR_NOT_COMPLETE');
});

test('a preflight problem is recorded without starting the backup', async t => {
  const { root, release, statusFile } = fixture(t, `touch "${'$'}MARKER"; exit 0`);
  chmodSync(release, 0o777);
  const marker = join(root, 'started');
  const status = await runBackup({ root, statusFile, statfs: plenty, now: () => 0, extraEnv: { MARKER: marker } });
  assert.equal(status.reason, 'RELEASE_DIR_GROUP_WRITABLE');
  assert.throws(() => statSync(marker), /ENOENT/);
});

/** A complete pair as paired-backup.mjs leaves it, finished `daysAgo` days before 12 Nov 2026 02:47 UTC. */
function completePair(backups, daysAgo) {
  const at = new Date(Date.parse('2026-11-12T02:47:00.000Z') - daysAgo * 86_400_000);
  const id = `${at.toISOString().replace(/[-:.]/g, '')}-pair${daysAgo}`;
  mkdirSync(join(backups, id), { mode: 0o700 });
  writeFileSync(join(backups, id, 'COMPLETE.json'), JSON.stringify({ version: 1, pairId: id, completedAt: at.toISOString() }));
  writeFileSync(join(backups, id, 'database.dump'), 'dump');
  return id;
}

test('after a good night the newest 7 complete pairs are kept and older ones deleted; partial runs and release files stay', async t => {
  const tonight = '20261112T024700000Z-tonight';
  const { root, statusFile } = fixture(t, `mkdir -m 700 "$BACKUPS/${tonight}" && printf '{"version":1,"pairId":"${tonight}","completedAt":"2026-11-12T03:10:00.000Z"}' > "$BACKUPS/${tonight}/COMPLETE.json" && echo '{"pairId":"${tonight}","complete":true}'`);
  const backups = join(root, 'backups');
  const older = Array.from({ length: 9 }, (_, i) => completePair(backups, i + 1));
  mkdirSync(join(backups, '20261101T024700000Z-partial'), { mode: 0o700 });
  writeFileSync(join(backups, 'a061826457d4033def0f2118c9b0cd82e0a04965.tar.gz'), 'release');
  const status = await runBackup({ root, statusFile, statfs: plenty, now: () => Date.parse('2026-11-12T02:47:00.000Z'), extraEnv: { BACKUPS: backups } });
  assert.equal(status.ok, true); assert.equal(status.pruned, 3);
  assert.deepEqual(listCompletePairs(backups).map(pair => pair.id), [tonight, ...older.slice(0, 6)], 'tonight plus the six nights before it');
  for (const kept of ['20261101T024700000Z-partial', 'a061826457d4033def0f2118c9b0cd82e0a04965.tar.gz']) assert.ok(readdirSync(backups).includes(kept), kept);
});

test('a failed night deletes nothing', async t => {
  const { root, statusFile } = fixture(t, 'echo "Paired backup failed" >&2; exit 1');
  const backups = join(root, 'backups');
  for (let day = 1; day <= 9; day++) completePair(backups, day);
  const status = await runBackup({ root, statusFile, statfs: plenty, now: () => 0 });
  assert.equal(status.ok, false); assert.equal(status.pruned, undefined);
  assert.equal(listCompletePairs(backups).length, 9);
});

test('pruning refuses to keep fewer than one backup', t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'backup-prune-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  completePair(root, 1);
  assert.throws(() => pruneCompletePairs(root, { keep: 0 }), /at least one/);
  assert.deepEqual(pruneCompletePairs(root, { keep: 1 }), []);
});
