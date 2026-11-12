import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { backupPair } from '../paired-backup.mjs';
import { psqlRunner, runDrill } from './restore-drill.mjs';

// Source is only the dedicated local test database; the drill restores into its own temporary cluster.
const source = new URL(process.env.TEST_DATABASE_URL ?? '');
assert.equal(source.hostname, '127.0.0.1');
assert.equal(source.pathname, '/shopmaple_test');
const pgBin = process.env.PG_BIN_DIRECTORY ?? (process.platform === 'darwin' ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
const live = { host: source.hostname, port: Number(source.port), database: 'shopmaple_test', user: decodeURIComponent(source.username), password: decodeURIComponent(source.password) };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const portOpen = port => new Promise(resolve => { const s = createConnection({ port, host: '127.0.0.1' }); s.on('connect', () => { s.destroy(); resolve(true); }); s.on('error', () => resolve(false)); });

async function makePair(t) {
  // A short root keeps the temporary cluster's Unix socket path within the platform limit.
  const root = mkdtempSync(join(realpathSync('/tmp'), 'drill-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const d of ['backups', 'media', 'work', 'state']) mkdirSync(join(root, d), { mode: 0o700 });
  const bytes = Buffer.from('drill media fixture');
  writeFileSync(join(root, 'media', `${hash(bytes)}.webp`), bytes, { mode: 0o600 });
  const pairId = `20261112T024700000Z-${randomBytes(4).toString('hex')}`;
  await backupPair({
    backupRoot: join(root, 'backups'), mediaSource: join(root, 'media'), pairId,
    sourceRelease: { path: realpathSync(new URL('../..', import.meta.url).pathname), sha: 'b'.repeat(40) },
    postgres: { binDirectory: pgBin, host: live.host, port: live.port, database: live.database, user: live.user, password: live.password },
    timeoutMs: 60_000, minimumFreeBytes: 1,
  });
  return { root, pairId };
}

test('a fresh pair restores into a throwaway cluster that matches live, and everything is cleaned up', async t => {
  const { root, pairId } = await makePair(t);
  const port = 55460 + Math.floor(Math.random() * 30);
  const result = await runDrill({ backupRoot: join(root, 'backups'), workRoot: join(root, 'work'), binDir: pgBin, live, port, statusFile: join(root, 'state', 'drill.json'), tolerance: { percent: 0, absolute: 0 }, minFreeBytes: 1 });
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.pairId, pairId);
  assert.equal(result.facts.mediaFiles, 1);
  assert.ok(result.facts.tables > 20, 'the application schema was restored');
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'state', 'drill.json'), 'utf8')).ok, true);
  assert.deepEqual(readdirSync(join(root, 'work')), [], 'the work directory is removed');
  assert.equal(await portOpen(port), false, 'the temporary cluster is stopped');
});

test('live rows the backup lacks beyond tolerance fail the drill and name the table', async t => {
  const { root } = await makePair(t);
  const psql = psqlRunner(pgBin, live);
  const marker = `drill-${randomBytes(6).toString('hex')}`;
  t.after(() => psql(`DELETE FROM "Enquiry" WHERE id LIKE :'marker' || '%';`, { marker }));
  await psql(`INSERT INTO "Enquiry" (id, "idempotencyHash", "payloadHash", kind, name, email, phone, message, context)
    SELECT :'marker' || g, :'marker' || g, 'x', 'contact', 'n', 'e@example.invalid', '0', 'm', '{}'::jsonb FROM generate_series(1, 3) AS g;`, { marker });
  const result = await runDrill({ backupRoot: join(root, 'backups'), workRoot: join(root, 'work'), binDir: pgBin, live, port: 55460 + Math.floor(Math.random() * 30), tolerance: { percent: 0, absolute: 2 }, minFreeBytes: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => /^row count Enquiry: live \d+, restored \d+ \(allowed difference 2\)$/.test(p)), result.problems.join('; '));
  assert.equal(existsSync(join(root, 'work')) && readdirSync(join(root, 'work')).length, 0);
});

test('a tampered dump is refused before anything is restored', async t => {
  const { root, pairId } = await makePair(t);
  writeFileSync(join(root, 'backups', pairId, 'database.dump'), 'corrupted');
  const result = await runDrill({ backupRoot: join(root, 'backups'), workRoot: join(root, 'work'), binDir: pgBin, live, port: 55460 + Math.floor(Math.random() * 30), minFreeBytes: 1 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ['the backup pair failed checksum or archive verification']);
});
