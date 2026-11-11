#!/usr/bin/env node
// Scheduled restore drill (deploy/ops/run-restore-drill.sh, weekly). Restores the newest complete paired backup into a
// throwaway PostgreSQL cluster of its own (a temporary data directory, socket-only, never the live cluster), compares it
// with the live database, extracts the media archive, records the result for the store monitor and cleans up.
// See docs/operations-backups.md.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statfsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPair } from '../paired-backup.mjs';
import { restoreMediaBackup } from '../media-backup.mjs';
import { parseAlertConfig, redact, sendEmail, writeState } from './alerts.mjs';
import { listCompletePairs } from './backups.mjs';

// Tables whose loss would hurt: catalogue, content, enquiries, customers, orders and their delivery queues.
const KEY_TABLES = ['Product', 'Variant', 'Enquiry', 'Contact', 'CheckoutAttempt', 'Customer', 'CustomerAddress', 'ShopAdmin', 'ShopContent', 'ShopContentRevision', 'ShopMediaAsset', 'OrderOutbox', 'OrderNotification', 'PaymentWebhookInbox', 'EnquiryDelivery'];
const workPattern = /^drill-\d{8}T\d{6}Z-[a-f0-9]{8}$/;
const timestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?Z$/;

export function compareCounts(live, restored, { percent, absolute }) {
  const problems = [];
  for (const table of KEY_TABLES) {
    if (!(table in live)) continue;
    if (!(table in restored)) { problems.push(`table ${table} is missing from the restored database`); continue; }
    const allowed = Math.max(absolute, Math.ceil((live[table] * percent) / 100));
    const difference = Math.abs(live[table] - restored[table]);
    if (difference > allowed) problems.push(`row count ${table}: live ${live[table]}, restored ${restored[table]} (allowed difference ${allowed})`);
  }
  return problems;
}

export function compareMigrations(live, restored, dumpStartedAt) {
  const problems = [], cutoff = Date.parse(dumpStartedAt);
  const liveByName = new Map(live.map(row => [row.name, row]));
  const restoredByName = new Map(restored.map(row => [row.name, row]));
  for (const row of restored) {
    const match = liveByName.get(row.name);
    if (!match) problems.push(`migration ${row.name} is in the backup but not applied live`);
    else if (match.checksum !== row.checksum) problems.push(`migration ${row.name} has a different checksum in the backup`);
  }
  for (const row of live) {
    if (!restoredByName.has(row.name) && !(Date.parse(row.finishedAt) > cutoff)) problems.push(`migration ${row.name} is applied live (before the backup) but missing from the backup`);
  }
  return problems;
}

export function drillWorkName(now) {
  return `drill-${new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}-${randomBytes(4).toString('hex')}`;
}

export function summarise(result) {
  const lines = [
    `Restore drill ${result.ok ? 'passed' : 'FAILED'} on ${hostname()} at ${result.at}.`,
    `Backup: ${result.pairId ?? 'none'}${result.pairCompletedAt ? ` (completed ${result.pairCompletedAt})` : ''}`,
  ];
  if (result.facts) lines.push(`Restored tables: ${result.facts.tables ?? '?'}. Media files extracted: ${result.facts.mediaFiles ?? '?'}. Latest paid order: ${result.facts.latestOrder ?? '?'}.`);
  if (result.problems?.length) lines.push('', 'Problems:', ...result.problems.map(p => `- ${p}`));
  lines.push('', 'The throwaway database and extracted media were removed afterwards. See docs/operations-backups.md.');
  return { subject: `[ShopMaple] Restore drill ${result.ok ? 'passed' : 'FAILED'}${result.pairId ? ` (${result.pairId.slice(0, 16)})` : ''}`, text: lines.join('\n') };
}

function exec(file, args, { env, input, timeoutMs = 10 * 60_000, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', chunk => { if (stdout.length < maxBytes) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 16_384) stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else { const error = new Error(`${file.split('/').at(-1)} exited with ${code}`); error.stderr = stderr; reject(error); }
    });
    child.stdin.end(input ?? '');
  });
}

/** psql against one explicit target; SQL goes through stdin so -v variables are interpolated as quoted literals. */
export function psqlRunner(binDir, { host, port, database, user, password }) {
  const env = { PGCONNECT_TIMEOUT: '10', ...(password ? { PGPASSWORD: password } : {}) };
  return (sql, vars = {}) => exec(join(binDir, 'psql'), [
    '-X', '-A', '-t', '-q', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-h', host, '-p', String(port), '-U', user, '-d', database,
    ...Object.entries(vars).flatMap(([key, value]) => ['-v', `${key}=${value}`]), '-f', '-',
  ], { env, input: sql }).then(out => out.split('\n').filter(Boolean).map(line => line.split('\t')));
}

export async function inspectDatabase(psql) {
  const tables = (await psql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;`)).map(([name]) => name);
  if (!tables.every(name => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name))) throw new Error('Unexpected table name.');
  const counts = {};
  if (tables.length) {
    const rows = await psql(`${tables.map(name => `SELECT '${name}', count(*) FROM public."${name}"`).join('\nUNION ALL\n')};`);
    for (const [name, count] of rows) counts[name] = Number(count);
  }
  const migrations = tables.includes('_prisma_migrations')
    ? (await psql(`SELECT migration_name, checksum, to_char(finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1;`))
      .map(([name, checksum, finishedAt]) => ({ name, checksum, finishedAt }))
    : [];
  return { tables, counts, migrations };
}

async function latestOrderCheck(livePsql, restoredPsql, live, restored, dumpStartedAt) {
  if (!live.tables.includes('CheckoutAttempt')) return { fact: 'no order table', problems: [] };
  if (!timestamp.test(dumpStartedAt)) return { fact: 'unknown', problems: ['the backup has no valid dump start time'] };
  const hasNumber = (await livePsql(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'CheckoutAttempt' AND column_name = 'orderNumber';`))[0][0] === '1';
  const [row] = await livePsql(`SELECT id, ${hasNumber ? 'coalesce("orderNumber"::text, \'\')' : "''"} FROM "CheckoutAttempt" WHERE "capturedAt" IS NOT NULL AND "capturedAt" < :'cutoff'::timestamptz ORDER BY "capturedAt" DESC LIMIT 1;`, { cutoff: dumpStartedAt });
  if (!row) return { fact: 'none captured before the backup', problems: [] };
  const [id, number] = row;
  const label = number ? `MF-${number}` : `attempt ${id.slice(0, 8)}`;
  if (!restored.tables.includes('CheckoutAttempt')) return { fact: `${label} missing`, problems: [`latest paid order ${label} is missing: no order table in the backup`] };
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return { fact: 'unknown', problems: ['unexpected order id format'] };
  const [[found]] = await restoredPsql(`SELECT count(*) FROM "CheckoutAttempt" WHERE id = :'id' AND "capturedAt" IS NOT NULL;`, { id });
  return found === '1' ? { fact: `${label} present`, problems: [] } : { fact: `${label} missing`, problems: [`latest paid order before the backup (${label}) is missing from the restored database`] };
}

/** A private, socket-only PostgreSQL cluster in workDir; stop() shuts it down. */
export async function startTempCluster(binDir, workDir, port) {
  const data = join(workDir, 'pg'), socket = join(workDir, 'sock');
  // Unix socket paths are limited to about 100 bytes; fail clearly rather than with a postmaster error.
  if (join(socket, `.s.PGSQL.${port}`).length > 100) throw new Error('The drill work path is too long for a PostgreSQL socket.');
  mkdirSync(socket, { mode: 0o700 });
  const user = userInfo().username;
  await exec(join(binDir, 'initdb'), ['-D', data, '-U', user, '-A', 'trust', '--no-sync', '-E', 'UTF8', '--locale=C'], { timeoutMs: 120_000 });
  await exec(join(binDir, 'pg_ctl'), ['-D', data, '-w', '-t', '60', '-l', join(workDir, 'postgres.log'), '-o', `-c listen_addresses='' -k ${socket} -p ${port} -c fsync=off -c full_page_writes=off`, 'start'], { timeoutMs: 90_000 });
  return {
    target: { host: socket, port, user, database: 'postgres' },
    stop: () => exec(join(binDir, 'pg_ctl'), ['-D', data, '-w', '-t', '60', '-m', 'fast', 'stop'], { timeoutMs: 90_000 }).catch(() => exec(join(binDir, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']).catch(() => {})),
  };
}

async function cleanStale(workRoot, binDir) {
  for (const name of readdirSync(workRoot)) {
    if (!workPattern.test(name)) continue;
    const dir = join(workRoot, name);
    if (existsSync(join(dir, 'pg', 'postmaster.pid'))) await exec(join(binDir, 'pg_ctl'), ['-D', join(dir, 'pg'), '-m', 'immediate', 'stop']).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function runDrill({
  backupRoot, workRoot, binDir, live, port = 55449, statusFile, tolerance = { percent: 10, absolute: 25 },
  minFreeBytes = 1024 ** 3, now = Date.now, keepWork = false,
}) {
  const at = new Date(now()).toISOString();
  const problems = [], facts = {};
  let pair, workDir, cluster;
  const finish = ok => {
    const result = { ok, at, pairId: pair?.id, pairCompletedAt: pair ? new Date(pair.completedAt).toISOString() : undefined, problems, facts };
    if (statusFile) writeState(statusFile, result);
    return result;
  };
  try {
    pair = listCompletePairs(backupRoot)[0];
    if (!pair) { problems.push('no complete backup to restore'); return finish(false); }
    try { await verifyPair(pair.path, { pgRestorePath: join(binDir, 'pg_restore') }); }
    catch { problems.push('the backup pair failed checksum or archive verification'); return finish(false); }
    mkdirSync(workRoot, { recursive: true, mode: 0o700 });
    const workStat = lstatSync(workRoot);
    if (!workStat.isDirectory() || workStat.isSymbolicLink() || (workStat.mode & 0o077)) { problems.push('the drill work directory is not private'); return finish(false); }
    await cleanStale(workRoot, binDir);
    // Room for the extracted media, a restored database several times the dump, and the fixed reserve.
    const needed = minFreeBytes + (pair.record.media?.bytes ?? 0) + 4 * (pair.record.database?.bytes ?? 0);
    const space = statfsSync(workRoot);
    if (space.bavail * space.bsize < needed) { problems.push(`not enough free disk space for a restore drill (needs ${Math.ceil(needed / 1024 ** 3)} GB)`); return finish(false); }
    workDir = join(workRoot, drillWorkName(now()));
    mkdirSync(workDir, { mode: 0o700 });
    cluster = await startTempCluster(binDir, workDir, port);
    const admin = psqlRunner(binDir, cluster.target);
    await admin('CREATE DATABASE shopmaple_drill;');
    const target = { ...cluster.target, database: 'shopmaple_drill' };
    try {
      await exec(join(binDir, 'pg_restore'), ['--no-owner', '--no-acl', '--exit-on-error', '-h', target.host, '-p', String(target.port), '-U', target.user, '-d', target.database, join(pair.path, 'database.dump')], { timeoutMs: 30 * 60_000 });
    } catch { problems.push('pg_restore could not restore the database dump'); return finish(false); }
    const restoredPsql = psqlRunner(binDir, target), livePsql = psqlRunner(binDir, live);
    const [restored, current] = [await inspectDatabase(restoredPsql), await inspectDatabase(livePsql)];
    facts.tables = restored.tables.length;
    problems.push(...compareCounts(current.counts, restored.counts, tolerance));
    problems.push(...compareMigrations(current.migrations, restored.migrations, pair.record.database?.startedAt));
    const order = await latestOrderCheck(livePsql, restoredPsql, current, restored, pair.record.database?.startedAt);
    facts.latestOrder = order.fact; problems.push(...order.problems);
    const media = restoreMediaBackup(join(pair.path, pair.record.media.directory), join(workDir, 'media'));
    facts.mediaFiles = media.files;
    if (restored.tables.includes('ShopMediaAsset')) {
      const keys = (await restoredPsql(`SELECT "storageKey" FROM "ShopMediaAsset";`)).map(([key]) => key);
      // Images are .webp; films (once the media library accepts them) are .mp4 or .webm. All are named by content hash.
      const missing = keys.filter(key => !/^[a-f0-9]{64}\.(webp|mp4|webm)$/.test(key) || !existsSync(join(workDir, 'media', key)));
      if (missing.length) problems.push(`${missing.length} uploaded media file(s) recorded in the database are missing from the media archive`);
    }
    return finish(problems.length === 0);
  } catch (error) {
    problems.push(`the drill stopped: ${redact(error?.message ?? 'unexpected error')}`);
    return finish(false);
  } finally {
    await cluster?.stop();
    if (workDir && !keepWork) rmSync(workDir, { recursive: true, force: true });
  }
}

let entryPath;
try { if (process.argv[1]) entryPath = realpathSync(process.argv[1]); } catch { /* imported */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(a => a !== '--email-summary')) { console.error('Usage: restore-drill.mjs [--email-summary]'); process.exit(2); }
  const root = '/home/deploy/shopmaple';
  const number = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);
  runDrill({
    backupRoot: join(root, 'backups'), workRoot: join(root, 'ops', 'drill'), binDir: '/usr/lib/postgresql/16/bin',
    live: { host: join(root, 'shared', 'socket'), port: 55440, database: 'shopmaple_store', user: userInfo().username },
    statusFile: join(root, 'ops', 'state', 'restore-drill.json'),
    tolerance: { percent: number('DRILL_TOLERANCE_PERCENT', 10), absolute: number('DRILL_TOLERANCE_ABSOLUTE', 25) },
  }).then(async result => {
    const summary = summarise(result);
    console.log(`${summary.subject}\n${summary.text}`);
    if (args.has('--email-summary')) {
      try { await sendEmail(parseAlertConfig(process.env), { subject: redact(summary.subject, process.env), text: redact(summary.text, process.env) }, { idempotencyKey: `shopmaple-drill-${result.at}` }); }
      catch (error) { console.error(`Drill summary email failed: ${redact(error.message, process.env)}`); }
    }
    if (!result.ok) process.exitCode = 1;
  }).catch(() => { console.error('Restore drill could not record its result.'); process.exitCode = 2; });
}
