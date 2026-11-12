#!/usr/bin/env node
// Nightly backup launcher run from the stable ops path (deploy/ops/run-backup.sh), replacing the cron entry that
// pointed at a pinned operations/<commit> folder. It checks the conditions paired-backup.mjs silently refuses, runs
// the reviewed backup tool from the active release, and records the outcome for the store monitor, which alerts.
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, statfsSync } from 'node:fs';
import { basename, dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeState } from './alerts.mjs';
import { pruneCompletePairs } from './backups.mjs';

const ROOT = '/home/deploy/shopmaple';
const sha = /^[a-f0-9]{40}$/;
const pairId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

function unsafeComponent(path) {
  let current = parse(path).root;
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return current;
    if ((stat.mode & 0o022) && !(stat.mode & 0o1000)) return current;
  }
  return undefined;
}

export function preflight({ root = ROOT, minFreeBytes = 1024 ** 3, statfs = path => { const s = statfsSync(path); return { freeBytes: s.bavail * s.bsize }; } } = {}) {
  const refuse = (reason, hint) => ({ ok: false, reason, ...(hint ? { hint } : {}) });
  let release;
  try { release = realpathSync(join(root, 'current')); } catch { return refuse('RELEASE_PATH_INVALID', `${root}/current does not resolve`); }
  if (dirname(release) !== join(root, 'releases') || !sha.test(basename(release))) return refuse('RELEASE_PATH_INVALID', 'current must point at releases/<full commit>');
  const unsafe = unsafeComponent(release);
  // paired-backup.mjs refuses a release directory other users could write to; every release staged with umask 002 is one.
  if (unsafe) return refuse('RELEASE_DIR_GROUP_WRITABLE', `chmod go-w ${unsafe}`);
  if (!existsSync(join(release, 'deploy', 'backup-shopmaple.sh')) || !existsSync(join(release, 'deploy', 'paired-backup.mjs'))) return refuse('BACKUP_TOOL_MISSING');
  const backups = join(root, 'backups');
  let stat;
  try { stat = lstatSync(backups); } catch { return refuse('BACKUP_ROOT_UNSAFE'); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) return refuse('BACKUP_ROOT_UNSAFE', `chmod 700 ${backups}`);
  if (existsSync(join(backups, '.paired-backup.lock'))) return refuse('BACKUP_LOCK_PRESENT', 'a crashed run left its lock; see docs/paired-backups.md "Capacity and interrupted jobs"');
  if (statfs(backups).freeBytes < minFreeBytes) return refuse('LOW_DISK');
  return { ok: true, release: { path: release, sha: basename(release) } };
}

function run(script, env, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn('/bin/sh', [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', chunk => { if (stdout.length < 4096) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += chunk; });
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout, stderr }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

export async function runBackup({ root = ROOT, statusFile = join(root, 'ops', 'state', 'backup-last.json'), statfs, now = Date.now, timeoutMs = 2 * 3_600_000, extraEnv = {}, keepPairs = 7 } = {}) {
  const started = now();
  const check = preflight({ root, ...(statfs ? { statfs } : {}) });
  let status;
  if (!check.ok) status = { ok: false, reason: check.reason, ...(check.hint ? { hint: check.hint } : {}) };
  else {
    const result = await run(join(check.release.path, 'deploy', 'backup-shopmaple.sh'), { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', ...extraEnv }, timeoutMs);
    // Only the pair id is taken from the tool's output; its error text stays out of the status file.
    let claimed;
    try { claimed = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? ''); } catch { claimed = undefined; }
    if (result.code !== 0) status = { ok: false, reason: /Paired backup failed/.test(result.stderr) ? 'BACKUP_FAILED' : 'BACKUP_DID_NOT_START', release: check.release.sha };
    else if (!claimed?.complete || !pairId.test(claimed.pairId ?? '') || !existsSync(join(root, 'backups', claimed.pairId, 'COMPLETE.json'))) status = { ok: false, reason: 'PAIR_NOT_COMPLETE', release: check.release.sha };
    else {
      status = { ok: true, pairId: claimed.pairId, release: check.release.sha };
      // Old pairs go only after tonight's is complete, so a failing night never eats into the ones kept.
      try { status.pruned = pruneCompletePairs(join(root, 'backups'), { keep: keepPairs }).length; } catch { status.pruneFailed = true; }
    }
  }
  const record = { at: new Date(started).toISOString(), durationMs: now() - started, ...status };
  writeState(statusFile, record);
  return record;
}

let entryPath;
try { if (process.argv[1]) entryPath = realpathSync(process.argv[1]); } catch { /* imported as a library */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  runBackup().then(status => {
    console.log(`${status.at} backup ${status.ok ? `ok ${status.pairId}` : `FAILED ${status.reason}${status.hint ? ` (fix: ${status.hint})` : ''}`}`);
    if (!status.ok) process.exitCode = 1;
  }).catch(() => { console.error('Backup runner could not record its outcome.'); process.exitCode = 2; });
}
