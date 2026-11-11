// Read-only views of the paired backups in /home/deploy/shopmaple/backups (see deploy/paired-backup.mjs).
// Only a directory with a parseable COMPLETE.json counts; partial runs and release tarballs are ignored.
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

function readSmall(path, limit) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid completion record.');
    const buffer = Buffer.alloc(stat.size);
    let offset = 0, count;
    while (offset < stat.size && (count = readSync(fd, buffer, offset, stat.size - offset, offset)) > 0) offset += count;
    return buffer.subarray(0, offset).toString('utf8');
  } finally { closeSync(fd); }
}

/** Complete pairs, newest completion first: [{ id, path, completedAt (ms), record }]. */
export function listCompletePairs(root) {
  const pairs = [];
  for (const id of readdirSync(root)) {
    if (!idPattern.test(id)) continue;
    const path = join(root, id);
    try {
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      const record = JSON.parse(readSmall(join(path, 'COMPLETE.json'), 16 * 1024));
      const completedAt = Date.parse(record?.completedAt);
      if (record?.version !== 1 || record.pairId !== id || !Number.isFinite(completedAt)) continue;
      pairs.push({ id, path, completedAt, record });
    } catch { /* not a complete pair */ }
  }
  return pairs.sort((a, b) => b.completedAt - a.completedAt);
}
