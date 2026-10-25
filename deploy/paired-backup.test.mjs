import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, realpathSync, existsSync, symlinkSync, rmSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { backupPair, verifyPair } from './paired-backup.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pgBin = process.env.PG_BIN_DIRECTORY || (process.platform === 'darwin' ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
const release = realpathSync(new URL('..', import.meta.url).pathname);
function fixture(t, script = 'exit 1') {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'paired-job-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const d of ['backups', 'media', 'bin']) mkdirSync(join(root, d), { mode: 0o700 });
  for (const name of ['pg_dump', 'pg_restore']) writeFileSync(join(root, 'bin', name), `#!/bin/sh\n${script}\n`, { mode: 0o700 });
  const bytes = Buffer.from('paired media fixture');
  writeFileSync(join(root, 'media', `${hash(bytes)}.webp`), bytes, { mode: 0o600 });
  return { root, options: { backupRoot: join(root, 'backups'), mediaSource: join(root, 'media'), sourceRelease: { path: release, sha: 'a'.repeat(40) }, pairId: '20261026T040000Z-test', postgres: { binDirectory: join(root, 'bin'), host: '127.0.0.1', port: 55439, database: 'shopmaple_test', user: 'shopmaple' }, timeoutMs: 1000, mediaAttempts: 2 } };
}
function noCompletion(options) { assert.equal(existsSync(join(options.backupRoot, options.pairId, 'COMPLETE.json')), false); }
test('dump subprocess failure retains the incomplete run without media or completion', async t => {
  const { options } = fixture(t, 'echo SECRET_SENTINEL >&2; exit 7');
  await assert.rejects(backupPair(options), e => /database dump failed/.test(e.message) && !e.message.includes('SECRET_SENTINEL'));
  noCompletion(options);
  assert.equal(readdirSync(join(options.backupRoot, options.pairId)).some(x => x.startsWith('media-')), false);
});
test('successful empty dump is refused', async t => {
  const { options } = fixture(t, 'exit 0');
  await assert.rejects(backupPair(options), /empty|nonempty/);
  noCompletion(options);
});
test('nonarchive bytes are refused by real pg_restore', async t => {
  const { root, options } = fixture(t, 'printf invalid-archive');
  rmSync(join(root, 'bin', 'pg_restore')); symlinkSync(join(pgBin, 'pg_restore'), join(root, 'bin', 'pg_restore'));
  await assert.rejects(backupPair(options), /database archive verification failed/);
  noCompletion(options);
});
test('bounded subprocess timeout fails closed', async t => {
  const { options } = fixture(t, 'exec sleep 10'); options.timeoutMs = 60;
  const started = Date.now();
  await assert.rejects(backupPair(options), /timed out/);
  assert.ok(Date.now() - started < 3000); noCompletion(options);
});
test('overlapping jobs are rejected before another run is created', async t => {
  const { options } = fixture(t, 'exec sleep 10'); options.timeoutMs = 300;
  const first = backupPair(options); const checked = assert.rejects(first, /timed out/);
  await new Promise(resolve => setTimeout(resolve, 40));
  await assert.rejects(backupPair({ ...options, pairId: 'second' }), /already running|lock/);
  assert.equal(existsSync(join(options.backupRoot, 'second')), false); await checked;
});
test('existing destination is preserved', async t => {
  const { options } = fixture(t); const path = join(options.backupRoot, options.pairId);
  mkdirSync(path, { mode: 0o700 }); writeFileSync(join(path, 'sentinel'), 'original');
  await assert.rejects(backupPair(options)); assert.equal(readFileSync(join(path, 'sentinel'), 'utf8'), 'original');
});
test('unsafe IDs, limits and symbolic-link paths are rejected before writing', async t => {
  const { root, options } = fixture(t);
  for (const patch of [{ pairId: '../escape' }, { mediaAttempts: 0 }, { mediaAttempts: 9 }, { timeoutMs: 0 }, { sourceRelease: { path: release, sha: 'not-a-revision' } }]) await assert.rejects(backupPair({ ...options, ...patch }));
  symlinkSync(options.backupRoot, join(root, 'alias'));
  await assert.rejects(backupPair({ ...options, backupRoot: join(root, 'alias') }));
  assert.deepEqual(readdirSync(options.backupRoot), []);
});
test('incomplete and symlinked pair markers are never recoverable', async t => {
  const { root, options } = fixture(t); const path = join(options.backupRoot, options.pairId); mkdirSync(path, { mode: 0o700 });
  await assert.rejects(verifyPair(path, { pgRestorePath: '/usr/bin/false' }));
  writeFileSync(join(root, 'marker'), '{}'); symlinkSync(join(root, 'marker'), join(path, 'COMPLETE.json'));
  await assert.rejects(verifyPair(path, { pgRestorePath: '/usr/bin/false' }));
});
test('real PostgreSQL dump pairs exact media bytes and detects subsequent corruption', async t => {
  const { options } = fixture(t); const db = new URL(process.env.TEST_DATABASE_URL);
  assert.equal(db.pathname, '/shopmaple_test'); assert.equal(db.hostname, '127.0.0.1');
  options.postgres = { binDirectory: pgBin, host: db.hostname, port: Number(db.port), database: db.pathname.slice(1), user: decodeURIComponent(db.username), password: decodeURIComponent(db.password) };
  const result = await backupPair(options);
  assert.ok(result, 'a complete pair must return a verified manifest');
  assert.equal(result.version, 1); assert.equal(result.media.files, 1); assert.equal(result.media.bytes, 20);
  assert.ok(result.database.bytes > 0); assert.equal(result.release.sha, 'a'.repeat(40));
  const path = join(options.backupRoot, options.pairId);
  assert.equal(statSync(path).mode & 0o777, 0o700);
  for (const name of ['database.dump', 'database.sha256', 'COMPLETE.json']) assert.equal(statSync(join(path, name)).mode & 0o777, 0o600);
  assert.deepEqual(await verifyPair(path, { pgRestorePath: join(options.postgres.binDirectory, 'pg_restore') }), result);
  writeFileSync(join(path, result.media.directory, 'media.archive'), 'corruption');
  await assert.rejects(verifyPair(path, { pgRestorePath: join(options.postgres.binDirectory, 'pg_restore') }));
});

function realDatabase(options) {
  const db = new URL(process.env.TEST_DATABASE_URL);
  assert.equal(db.hostname, '127.0.0.1'); assert.equal(db.pathname, '/shopmaple_test');
  options.postgres = { binDirectory: pgBin, host: db.hostname, port: Number(db.port), database: 'shopmaple_test', user: decodeURIComponent(db.username), password: decodeURIComponent(db.password) };
  options.timeoutMs = 5000; options.mediaRetryDelayMs = 150;
}
test('media failures record each retained attempt and never publish completion', async t => {
  const { options } = fixture(t); realDatabase(options);
  writeFileSync(join(options.mediaSource, 'upload-in-progress.tmp'), 'incomplete');
  await assert.rejects(backupPair(options), /attempts exhausted/); noCompletion(options);
  const pair = join(options.backupRoot, options.pairId);
  for (const n of [1, 2]) assert.equal(JSON.parse(readFileSync(join(pair, `media-${n}.failure.json`), 'utf8')).attempt, n);
  assert.ok(statSync(join(pair, 'database.dump')).size > 0);
});
test('an actual concurrent uploader finishes after a failed attempt and fresh retry includes its file', async t => {
  const { options } = fixture(t); realDatabase(options);
  const temporary = join(options.mediaSource, 'upload-in-progress.tmp');
  const added = Buffer.from('newly uploaded bytes'); writeFileSync(temporary, added);
  const pair = join(options.backupRoot, options.pairId);
  const job = backupPair(options);
  let completed = false;
  const checked = job.then(result => { completed = true; return result; }, error => { completed = true; throw error; });
  // Catch immediately so a failed background backup cannot cause an unhandled rejection.
  checked.catch(() => {});
  const end = Date.now() + 6000;
  while (!existsSync(join(pair, 'media-1.failure.json')) && !completed && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(existsSync(join(pair, 'media-1.failure.json')), true, 'first unstable inventory must leave failure evidence');
  writeFileSync(join(options.mediaSource, `${hash(added)}.webp`), added); rmSync(temporary);
  const result = await checked;
  assert.equal(result.media.directory, 'media-2'); assert.equal(result.media.files, 2); assert.equal(result.media.bytes, 40);
  assert.equal(JSON.parse(readFileSync(join(pair, 'media-2', 'manifest.json'), 'utf8')).files.some(entry => entry.name === `${hash(added)}.webp`), true);
});

test('insufficient free-space reserve fails before creating a run', async t => {
  const { options } = fixture(t); const space = statfsSync(options.backupRoot);
  options.minimumFreeBytes = space.bavail * space.bsize + 1;
  await assert.rejects(backupPair(options), /free space/);
  assert.deepEqual(readdirSync(options.backupRoot), []);
});
test('a growing subprocess dump is stopped at the configured bound and retained incomplete', async t => {
  const { options } = fixture(t, 'dd if=/dev/zero bs=65536 count=16 2>/dev/null; exec sleep 5');
  options.maxDatabaseBytes = 1024; options.timeoutMs = 3000;
  const started = Date.now();
  await assert.rejects(backupPair(options), /size limit/);
  assert.ok(Date.now() - started < 2000); noCompletion(options);
  assert.ok(statSync(join(options.backupRoot, options.pairId, 'database.dump.partial')).size > 0);
});

test('SIGTERM stops the active database worker before releasing the overlap guard', async t => {
  const { options } = fixture(t, 'echo $$; exec sleep 10'); options.timeoutMs = 15000;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import { backupPair } from ${JSON.stringify(new URL('./paired-backup.mjs', import.meta.url).href)}; try { await backupPair(JSON.parse(process.argv[2])); } catch { process.exitCode = 1; }`, new URL('./paired-backup.test.mjs', import.meta.url).pathname, JSON.stringify(options)], { stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(() => child.kill('SIGKILL'));
  const partial = join(options.backupRoot, options.pairId, 'database.dump.partial');
  const deadline = Date.now() + 3000;
  while ((!existsSync(partial) || statSync(partial).size === 0) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(existsSync(partial));
  const worker = Number(readFileSync(partial, 'utf8').trim()); assert.ok(worker > 1);
  child.kill('SIGTERM'); const outcome = await exited;
  assert.equal(outcome.code, 1); assert.equal(existsSync(join(options.backupRoot, '.paired-backup.lock')), false);
  assert.throws(() => process.kill(worker, 0), { code: 'ESRCH' }); noCompletion(options);
});
test('production CLI refuses a working checkout and does not expose inherited connection secrets', () => {
  const result = spawnSync(process.execPath, [new URL('./paired-backup.mjs', import.meta.url).pathname, 'production'], { encoding: 'utf8', env: { ...process.env, PGHOST: 'SECRET_SENTINEL', PGPASSWORD: 'SECRET_SENTINEL' } });
  assert.equal(result.status, 1); assert.equal(result.stderr.includes('SECRET_SENTINEL'), false);
  assert.match(result.stderr, /Paired backup failed/);
});
test('inherited PostgreSQL routing and option overrides cannot change the explicit test target', async t => {
  const { options } = fixture(t); realDatabase(options);
  const poison = { PGHOST: 'invalid.invalid', PGPORT: '1', PGDATABASE: 'unintended_database', PGUSER: 'unintended_user', PGSERVICE: 'unintended_service', PGSERVICEFILE: '/missing/service', PGOPTIONS: '--definitely-invalid' };
  const originals = Object.fromEntries(Object.keys(poison).map(key => [key, process.env[key]]));
  Object.assign(process.env, poison);
  try { assert.equal((await backupPair(options)).media.files, 1); }
  finally { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
test('a dot-prefixed descendant cannot be mistaken for a backup outside the source', async t => {
  const { options } = fixture(t);
  const nested = join(options.mediaSource, '..nested'); mkdirSync(nested, { mode: 0o700 });
  await assert.rejects(backupPair({ ...options, backupRoot: nested }), /outside media source/);
  assert.deepEqual(readdirSync(nested), []);
});
test('capacity loss after the database stage aborts before media writes and is never retried', async t => {
  const { options } = fixture(t); realDatabase(options);
  const pair = join(options.backupRoot, options.pairId);
  let mediaCapacityChecks = 0;
  // Capacity is an external measurement boundary: model another filesystem writer
  // consuming the reserve without filling the test machine's actual filesystem.
  options.measureFreeBytes = () => {
    if (existsSync(join(pair, 'database.sha256'))) { mediaCapacityChecks++; return 0; }
    return Number.MAX_SAFE_INTEGER;
  };
  await assert.rejects(backupPair(options), error => error.code === 'BACKUP_CAPACITY');
  assert.equal(mediaCapacityChecks, 1, 'capacity exhaustion must not retry media');
  assert.equal(readdirSync(pair).some(name => name.startsWith('media-')), false, 'capacity exhaustion must not start media output');
  noCompletion(options);
});
