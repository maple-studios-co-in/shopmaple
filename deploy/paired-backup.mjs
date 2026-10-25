#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, rmdirSync, writeSync, statfsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const maxDatabase = 32 * 1024 ** 3;
const mediaTool = fileURLToPath(new URL('./media-backup.mjs', import.meta.url));
const fail = message => { throw new Error(message); };
const cleanEnv = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
function integer(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function directory(path) {
  if (!['linux', 'darwin'].includes(process.platform) || process.versions.node.split('.')[0] !== '22') fail('Node.js 22 on Linux/macOS is required.');
  if (typeof path !== 'string' || !isAbsolute(path) || path !== resolve(path)) fail('Use a normalized absolute directory path.');
  let current = parse(path).root;
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, part); const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || ((stat.mode & 0o022) && !(stat.mode & 0o1000))) fail('Unsafe directory path.');
  }
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function writeNew(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset); fsyncSync(fd); } finally { closeSync(fd); }
}
function inspect(path, limit, capture = false) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) fail('Invalid backup file.');
    const digest = createHash('sha256'), buffer = Buffer.alloc(64 * 1024), chunks = [];
    let bytes = 0, count;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      bytes += count; if (bytes > limit) fail('Backup file exceeds limit.');
      digest.update(buffer.subarray(0, count)); if (capture) chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const after = fstatSync(fd);
    if (bytes !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) fail('Backup file changed.');
    return { bytes, sha256: digest.digest('hex'), ...(capture ? { text: Buffer.concat(chunks).toString('utf8') } : {}) };
  } finally { closeSync(fd); }
}
function child(command, args, { timeoutMs, label, env = cleanEnv, outputFd, capture = false, resourceCheck }) {
  return new Promise((resolvePromise, reject) => {
    // Recheck immediately before starting any writer; periodic checks alone leave
    // a window in which a retry could write into an already depleted filesystem.
    resourceCheck?.();
    const proc = spawn(command, args, { env, detached: true, stdio: ['ignore', outputFd ?? (capture ? 'pipe' : 'ignore'), 'ignore'] });
    let output = '', timedOut = false, overflow = false, stopped;
    const check = () => { try { resourceCheck?.(); } catch (error) { stopped = error; kill(); } };
    const kill = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const monitor = resourceCheck ? setInterval(check, 100) : undefined;
    const interrupted = () => { stopped = new Error(`${label} interrupted.`); stopped.code = 'BACKUP_INTERRUPTED'; kill(); };
    process.once('SIGTERM', interrupted); process.once('SIGINT', interrupted);
    const cleanup = () => { clearTimeout(timer); clearInterval(monitor); process.removeListener('SIGTERM', interrupted); process.removeListener('SIGINT', interrupted); };
    proc.stdout?.on('data', bytes => { output += bytes.toString('utf8'); if (output.length > 4096) { overflow = true; kill(); } });
    proc.on('error', () => { cleanup(); reject(new Error(`${label} failed.`)); });
    proc.on('close', code => {
      cleanup();
      if (!stopped) { try { resourceCheck?.(); } catch (error) { stopped = error; } }
      if (stopped) reject(stopped);
      else if (timedOut) reject(new Error(`${label} timed out.`));
      else if (code !== 0 || overflow) reject(new Error(`${label} failed.`));
      else resolvePromise(output);
    });
  });
}
function timeout(value = 30 * 60 * 1000) {
  if (!integer(value, 1, 60 * 60 * 1000)) fail('Invalid process timeout.'); return value;
}
function media(command, source, destination, timeoutMs, resourceCheck) {
  return child(process.execPath, [mediaTool, command, source, ...(destination ? [destination] : [])], { timeoutMs, label: `media ${command}`, capture: true, resourceCheck }).then(text => JSON.parse(text));
}
// Injectable measurement supports quota-aware callers and deterministic tests of
// external disk consumption; production always uses the actual filesystem.
function filesystemFreeBytes(path) { const stat = statfsSync(path); return stat.bavail * stat.bsize; }
export async function backupPair({ backupRoot, mediaSource, sourceRelease, postgres, pairId = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID()}`, timeoutMs = 30 * 60 * 1000, mediaAttempts = 3, mediaRetryDelayMs = 1000, minimumFreeBytes = 512 * 1024 ** 2, maxDatabaseBytes = maxDatabase, toolRevision, measureFreeBytes = filesystemFreeBytes }) {
  timeout(timeoutMs);
  if (typeof measureFreeBytes !== 'function') fail('Invalid free-space measurement provider.');
  if (!integer(minimumFreeBytes, 0, Number.MAX_SAFE_INTEGER) || !integer(maxDatabaseBytes, 1, maxDatabase) || (toolRevision !== undefined && !revisionPattern.test(toolRevision))) fail('Invalid resource limits or tool revision.');
  if (!idPattern.test(pairId) || !integer(mediaAttempts, 1, 8) || !integer(mediaRetryDelayMs, 0, 30000)) fail('Invalid pair ID or retry bounds.');
  if (!sourceRelease || !revisionPattern.test(sourceRelease.sha)) fail('Invalid source release.');
  directory(sourceRelease.path); directory(backupRoot); directory(mediaSource);
  const sourceRelative = relative(mediaSource, backupRoot);
  if (sourceRelative !== '..' && !sourceRelative.startsWith('../')) fail('Backups must be outside media source.');
  if ((lstatSync(backupRoot).mode & 0o077) !== 0) fail('Backup root must be private.');
  if (!postgres || typeof postgres.binDirectory !== 'string' || !isAbsolute(postgres.binDirectory) || !integer(postgres.port, 1, 65535) || !/^[A-Za-z0-9_]+$/.test(postgres.database) || !/^[A-Za-z0-9_-]+$/.test(postgres.user) || typeof postgres.host !== 'string' || !postgres.host || /[\r\n\0]/.test(postgres.host) || (postgres.password !== undefined && typeof postgres.password !== 'string')) fail('Invalid PostgreSQL configuration.');
  const resourceCheck = () => {
    const available = measureFreeBytes(backupRoot);
    if (!integer(available, 0, Number.MAX_SAFE_INTEGER) || available < minimumFreeBytes) {
      const error = new Error('Insufficient free space for backup reserve.');
      error.code = 'BACKUP_CAPACITY'; throw error;
    }
  };
  resourceCheck();
  const lock = join(backupRoot, '.paired-backup.lock');
  try { mkdirSync(lock, { mode: 0o700 }); } catch { fail('Backup lock unavailable; another run may already be running.'); }
  try {
    const pair = join(backupRoot, pairId); mkdirSync(pair, { mode: 0o700 }); syncDirectory(backupRoot);
    const startedAt = new Date().toISOString(), dumpStart = new Date().toISOString();
    const partial = join(pair, 'database.dump.partial');
    const fd = openSync(partial, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await child(join(postgres.binDirectory, 'pg_dump'), ['--no-password', '--host', postgres.host, '--port', String(postgres.port), '--username', postgres.user, '--dbname', postgres.database, '--format=custom'], { timeoutMs, label: 'database dump', outputFd: fd, resourceCheck: () => { resourceCheck(); if (fstatSync(fd).size > maxDatabaseBytes) fail('Database dump size limit exceeded.'); }, env: { ...cleanEnv, ...(postgres.password === undefined ? {} : { PGPASSWORD: postgres.password }) } });
      fsyncSync(fd);
    } finally { closeSync(fd); }
    const database = inspect(partial, maxDatabaseBytes);
    if (!database.bytes) fail('Database dump must be nonempty.');
    await child(join(postgres.binDirectory, 'pg_restore'), ['--list', partial], { timeoutMs, label: 'database archive verification' });
    renameSync(partial, join(pair, 'database.dump'));
    writeNew(join(pair, 'database.sha256'), Buffer.from(`${database.sha256}  database.dump\n`)); syncDirectory(pair);
    const dumpEnd = new Date().toISOString();
    let mediaResult;
    for (let attempt = 1; attempt <= mediaAttempts; attempt++) {
      const name = `media-${attempt}`, bundle = join(pair, name);
      try {
        await media('backup', mediaSource, bundle, timeoutMs, resourceCheck);
        const result = await media('verify', bundle, undefined, timeoutMs);
        mediaResult = { directory: name, checksumSha256: inspect(join(bundle, 'SHA256SUMS'), 512).sha256, ...result }; break;
      } catch (error) {
        if (error.code === 'BACKUP_CAPACITY') throw error;
        writeNew(join(pair, `${name}.failure.json`), Buffer.from(`${JSON.stringify({ attempt, failedAt: new Date().toISOString() })}\n`));
        syncDirectory(pair);
        if (error.code === 'BACKUP_INTERRUPTED') throw error;
        if (attempt === mediaAttempts) fail('Media backup attempts exhausted; incomplete pair retained.');
        await new Promise(resolvePromise => setTimeout(resolvePromise, mediaRetryDelayMs));
      }
    }
    const manifest = { version: 1, pairId, release: { sha: sourceRelease.sha }, ...(toolRevision ? { toolRevision } : {}), startedAt, completedAt: new Date().toISOString(), database: { file: 'database.dump', ...database, startedAt: dumpStart, completedAt: dumpEnd }, media: mediaResult };
    // Recheck both artifacts before publishing the durable completion record.
    await validateArtifacts(pair, manifest, join(postgres.binDirectory, 'pg_restore'), timeoutMs);
    resourceCheck();
    manifest.completedAt = new Date().toISOString();
    writeNew(join(pair, 'COMPLETE.json.partial'), Buffer.from(`${JSON.stringify(manifest)}\n`));
    syncDirectory(pair); renameSync(join(pair, 'COMPLETE.json.partial'), join(pair, 'COMPLETE.json'));
    syncDirectory(pair); syncDirectory(backupRoot);
    return manifest;
  } finally {
    // Only the empty lock owned by this invocation is removed; backups are retained.
    rmdirSync(lock); syncDirectory(backupRoot);
  }
}
function validTime(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
async function validateArtifacts(pair, record, pgRestorePath, timeoutMs) {
  if ((record?.toolRevision !== undefined && !revisionPattern.test(record.toolRevision)) || record?.version !== 1 || !idPattern.test(record.pairId) || record.pairId !== basename(pair) || !revisionPattern.test(record.release?.sha) || record.database?.file !== 'database.dump' || !shaPattern.test(record.database?.sha256) || !integer(record.database?.bytes, 1, maxDatabase) || !/^media-[1-8]$/.test(record.media?.directory) || !shaPattern.test(record.media?.checksumSha256) || !integer(record.media?.files, 0, 4096) || !integer(record.media?.bytes, 0, 1024 ** 3)) fail('Invalid pair completion record.');
  const times = [record.startedAt, record.database.startedAt, record.database.completedAt, record.completedAt];
  if (!times.every(validTime) || times.some((v, i) => i && v < times[i - 1])) fail('Invalid pair timestamps.');
  const dump = inspect(join(pair, 'database.dump'), maxDatabase);
  if (dump.bytes !== record.database.bytes || dump.sha256 !== record.database.sha256 || inspect(join(pair, 'database.sha256'), 128, true).text !== `${dump.sha256}  database.dump\n`) fail('Database checksum mismatch.');
  await child(pgRestorePath, ['--list', join(pair, 'database.dump')], { timeoutMs, label: 'database archive verification' });
  const bundle = join(pair, record.media.directory); directory(bundle);
  const result = await media('verify', bundle, undefined, timeoutMs);
  if (result.files !== record.media.files || result.bytes !== record.media.bytes || inspect(join(bundle, 'SHA256SUMS'), 512).sha256 !== record.media.checksumSha256) fail('Media pair checksum mismatch.');
}
export async function verifyPair(pairDirectory, { pgRestorePath, timeoutMs = 30 * 60 * 1000 } = {}) {
  timeout(timeoutMs); directory(pairDirectory);
  if (typeof pgRestorePath !== 'string' || !isAbsolute(pgRestorePath)) fail('An absolute pg_restore path is required.');
  const record = JSON.parse(inspect(join(pairDirectory, 'COMPLETE.json'), 16 * 1024, true).text);
  await validateArtifacts(pairDirectory, record, pgRestorePath, timeoutMs); return record;
}

let entryPath;
try { if (process.argv[1] && process.argv[1] !== '-') entryPath = realpathSync(process.argv[1]); }
catch { /* Library imports can have arbitrary non-file process arguments. */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'production') fail('Usage: paired-backup.mjs production');
    const toolRoot = dirname(dirname(fileURLToPath(import.meta.url))), toolRevision = basename(toolRoot);
    if (!['/home/deploy/shopmaple/operations', '/home/deploy/shopmaple/releases'].includes(dirname(toolRoot)) || !revisionPattern.test(toolRevision)) fail('Invalid production tool path.');
    directory(toolRoot);
    // Resolve the application pointer exactly once, independently from this tool's revision.
    const release = realpathSync('/home/deploy/shopmaple/current'), sha = basename(release);
    if (dirname(release) !== '/home/deploy/shopmaple/releases' || !revisionPattern.test(sha)) fail('Invalid production release path.');
    const record = await backupPair({ backupRoot: '/home/deploy/shopmaple/backups', mediaSource: '/home/deploy/shopmaple/shared/media', sourceRelease: { path: release, sha }, toolRevision, postgres: { binDirectory: '/usr/lib/postgresql/16/bin', host: '/home/deploy/shopmaple/shared/socket', port: 55440, database: 'shopmaple_store', user: 'deploy' } });
    console.log(JSON.stringify({ pairId: record.pairId, complete: true }));
  } catch { console.error('Paired backup failed; inspect retained run privately.'); process.exitCode = 1; }
}
