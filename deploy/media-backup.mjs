#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = /^[a-f0-9]{64}\.webp$/;
const maxFile = 32 * 1024 * 1024, maxArchive = 1024 * 1024 * 1024, maxFiles = 4096;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };

// POSIX only: Windows reparse points cannot be safely excluded with these APIs.
function directory(path) {
  if (!['linux', 'darwin'].includes(process.platform) || process.versions.node.split('.')[0] !== '22') fail('Node.js 22 on Linux/macOS is required.');
  if (!isAbsolute(path) || path !== resolve(path)) fail('Use a normalized absolute directory path.');
  let current = parse(path).root;
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Refusing a symlink or non-directory path.');
    if ((stat.mode & 0o022) && !(stat.mode & 0o1000)) fail('Refusing a directory writable by other users.');
  }
}
function readFile(path, limit) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) fail('Invalid media file or size.');
    const bytes = readAt(fd, stat.size, 0);
    const after = fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) fail('Media file changed during backup.');
    return bytes;
  } finally { closeSync(fd); }
}
function readAt(fd, size, position) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(fd, bytes, offset, size - offset, position + offset);
    if (!count) fail('Truncated media archive.');
    offset += count;
  }
  return bytes;
}
function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}
function writeNew(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeAll(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function newDirectory(path) {
  if (!isAbsolute(path) || path !== resolve(path)) fail('Use a normalized absolute directory path.');
  directory(dirname(path)); mkdirSync(path, { mode: 0o700 });
}
function snapshot(source) {
  return readdirSync(source).sort().map(name => {
    if (!filename.test(name)) fail('Invalid media filename; stop uploads before backup.');
    const stat = lstatSync(join(source, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxFile) fail('Invalid media file or size.');
    return [name, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
  });
}
export function backupMedia(source, bundle) {
  directory(source);
  if (bundle === source || !relative(source, bundle).startsWith('..')) fail('Backup directory must be outside media source.');
  const before = snapshot(source);
  if (before.length > maxFiles) fail('Media backup file count exceeds limit.');
  newDirectory(bundle);
  const fd = openSync(join(bundle, 'media.archive'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const files = [], digest = createHash('sha256');
  let total = 0;
  try {
    for (const [name] of before) {
      const bytes = readFile(join(source, name), maxFile);
      if (sha256(bytes) !== name.slice(0, 64)) fail('Media content does not match filename.');
      total += bytes.length;
      if (total > maxArchive) fail('Media archive size exceeds limit.');
      writeAll(fd, bytes); digest.update(bytes); files.push({ name, bytes: bytes.length });
    }
    fsyncSync(fd);
  } finally { closeSync(fd); }
  if (JSON.stringify(snapshot(source)) !== JSON.stringify(before)) fail('Media source changed during backup; retry with uploads paused.');
  const manifest = Buffer.from(`${JSON.stringify({ version: 1, files })}\n`);
  writeNew(join(bundle, 'manifest.json'), manifest);
  // Last durable write is the completion marker. Failed runs are retained for inspection.
  writeNew(join(bundle, 'SHA256SUMS'), Buffer.from(`${digest.digest('hex')}  media.archive\n${sha256(manifest)}  manifest.json\n`));
  syncDirectory(bundle); syncDirectory(dirname(bundle));
  return verifyMediaBackup(bundle);
}
function verifiedArchive(bundle) {
  directory(bundle);
  const manifestBytes = readFile(join(bundle, 'manifest.json'), 1024 * 1024);
  const sums = readFile(join(bundle, 'SHA256SUMS'), 512).toString('utf8');
  const match = /^([a-f0-9]{64})  media\.archive\n([a-f0-9]{64})  manifest\.json\n$/.exec(sums);
  if (!match || match[2] !== sha256(manifestBytes)) fail('Backup manifest checksum mismatch.');
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { fail('Invalid backup manifest.'); }
  if (manifest?.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > maxFiles) fail('Invalid backup manifest.');
  const seen = new Set();
  let total = 0;
  for (const entry of manifest.files) {
    if (!entry || typeof entry.name !== 'string' || !filename.test(entry.name) || seen.has(entry.name)) fail('Invalid or duplicate media filename.');
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > maxFile) fail('Invalid archive entry size.');
    seen.add(entry.name); total += entry.bytes;
    if (total > maxArchive) fail('Archive size exceeds limit.');
  }
  const fd = openSync(join(bundle, 'media.archive'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== total) fail('Invalid archive file or size.');
    const digest = createHash('sha256');
    let offset = 0;
    for (const entry of manifest.files) {
      const bytes = readAt(fd, entry.bytes, offset);
      if (sha256(bytes) !== entry.name.slice(0, 64)) fail('Archive content checksum mismatch.');
      digest.update(bytes); offset += entry.bytes;
    }
    if (digest.digest('hex') !== match[1]) fail('Backup archive checksum mismatch.');
    return { fd, files: manifest.files, total };
  } catch (error) { closeSync(fd); throw error; }
}
export function verifyMediaBackup(bundle) {
  const verified = verifiedArchive(bundle);
  try { return { files: verified.files.length, bytes: verified.total }; } finally { closeSync(verified.fd); }
}
export function restoreMediaBackup(bundle, destination) {
  const verified = verifiedArchive(bundle);
  try {
    newDirectory(destination);
    let offset = 0;
    for (const entry of verified.files) {
      const bytes = readAt(verified.fd, entry.bytes, offset);
      if (sha256(bytes) !== entry.name.slice(0, 64)) fail('Archive changed during restore.');
      writeNew(join(destination, entry.name), bytes); offset += entry.bytes;
    }
    syncDirectory(destination); syncDirectory(dirname(destination));
    return { files: verified.files.length, bytes: verified.total };
  } finally { closeSync(verified.fd); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, first, second, ...extra] = process.argv.slice(2);
    let result;
    if (command === 'backup' && first && second && extra.length === 0) result = backupMedia(first, second);
    else if (command === 'verify' && first && !second) result = verifyMediaBackup(first);
    else if (command === 'restore' && first && second && extra.length === 0) result = restoreMediaBackup(first, second);
    else fail('Usage: media-backup.mjs backup SOURCE NEW_BUNDLE | verify BUNDLE | restore BUNDLE NEW_DESTINATION');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Media backup failed: ${error.code ?? error.message}`);
    process.exitCode = 1;
  }
}
