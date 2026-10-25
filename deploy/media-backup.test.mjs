import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, realpathSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupMedia, verifyMediaBackup, restoreMediaBackup } from './media-backup.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'media-backup-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'); mkdirSync(source, { mode: 0o700 });
  return { root, source, bundle: join(root, 'backup'), restored: join(root, 'restored') };
}
function add(source, value = 'uploaded image bytes') {
  const bytes = Buffer.from(value), name = `${hash(bytes)}.webp`;
  writeFileSync(join(source, name), bytes, { mode: 0o600 }); return { bytes, name };
}
test('backup verifies and restores byte-identical files with private permissions', t => {
  const f = fixture(t), a = add(f.source), b = add(f.source, 'second image');
  assert.deepEqual(backupMedia(f.source, f.bundle), { files: 2, bytes: 32 });
  assert.deepEqual(verifyMediaBackup(f.bundle), { files: 2, bytes: 32 });
  assert.deepEqual(restoreMediaBackup(f.bundle, f.restored), { files: 2, bytes: 32 });
  assert.deepEqual(readdirSync(f.restored).sort(), [a.name, b.name].sort());
  for (const item of [a, b]) {
    assert.deepEqual(readFileSync(join(f.restored, item.name)), item.bytes);
    assert.equal(lstatSync(join(f.restored, item.name)).mode & 0o777, 0o600);
  }
  assert.equal(lstatSync(f.restored).mode & 0o777, 0o700);
  assert.equal(lstatSync(f.bundle).mode & 0o777, 0o700);
});
test('empty media root produces a verifiable empty archive', t => {
  const f = fixture(t);
  assert.deepEqual(backupMedia(f.source, f.bundle), { files: 0, bytes: 0 });
  assert.deepEqual(restoreMediaBackup(f.bundle, f.restored), { files: 0, bytes: 0 });
  assert.deepEqual(readdirSync(f.restored), []);
});
for (const kind of ['symlink', 'directory', 'invalid-name', 'wrong-content']) {
  test(`backup refuses ${kind} source entries without a complete backup`, t => {
    const f = fixture(t), name = `${'a'.repeat(64)}.webp`;
    if (kind === 'symlink') symlinkSync('/etc/passwd', join(f.source, name));
    if (kind === 'directory') mkdirSync(join(f.source, name));
    if (kind === 'invalid-name') writeFileSync(join(f.source, '../source/unknown.txt'), 'x');
    if (kind === 'wrong-content') writeFileSync(join(f.source, name), 'x');
    assert.throws(() => backupMedia(f.source, f.bundle), /media|file|content|name/i);
  });
}
function crafted(bundle, entries, archive = Buffer.from('abc')) {
  mkdirSync(bundle, { mode: 0o700 });
  const manifest = Buffer.from(JSON.stringify({ version: 1, files: entries }));
  writeFileSync(join(bundle, 'media.archive'), archive);
  writeFileSync(join(bundle, 'manifest.json'), manifest);
  writeFileSync(join(bundle, 'SHA256SUMS'), `${hash(archive)}  media.archive\n${hash(manifest)}  manifest.json\n`);
}
const abc = { name: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.webp', bytes: 3 };
for (const [kind, entries, archive] of [
  ['traversal', [{ ...abc, name: '../outside.webp' }]],
  ['absolute path', [{ ...abc, name: '/tmp/outside.webp' }]],
  ['backslash path', [{ ...abc, name: '..\\outside.webp' }]],
  ['duplicate paths', [abc, abc], Buffer.from('abcabc')],
  ['content mismatch', [abc], Buffer.from('xyz')],
  ['truncated data', [abc], Buffer.from('ab')],
  ['trailing data', [abc], Buffer.from('abcd')],
  ['negative size', [{ ...abc, bytes: -1 }]],
  ['oversized size', [{ ...abc, bytes: 2 ** 40 }]],
]) {
  test(`restore refuses ${kind} before creating destination`, t => {
    const f = fixture(t); crafted(f.bundle, entries, archive);
    assert.throws(() => restoreMediaBackup(f.bundle, f.restored), /backup|archive|manifest|content|size|name|duplicate/i);
    assert.equal(readdirSync(f.root).includes('restored'), false);
  });
}
test('restore refuses an existing destination and preserves its files', t => {
  const f = fixture(t); crafted(f.bundle, [abc]);
  mkdirSync(f.restored); writeFileSync(join(f.restored, 'keep'), 'original');
  assert.throws(() => restoreMediaBackup(f.bundle, f.restored), /exist/i);
  assert.equal(readFileSync(join(f.restored, 'keep'), 'utf8'), 'original');
});
test('backup refuses an existing bundle and preserves it', t => {
  const f = fixture(t); mkdirSync(f.bundle); writeFileSync(join(f.bundle, 'keep'), 'original');
  assert.throws(() => backupMedia(f.source, f.bundle), /exist/i);
  assert.equal(readFileSync(join(f.bundle, 'keep'), 'utf8'), 'original');
});
test('restore refuses symlink ancestors', t => {
  const f = fixture(t); crafted(f.bundle, [abc]);
  symlinkSync(f.source, join(f.root, 'alias'));
  assert.throws(() => restoreMediaBackup(f.bundle, join(f.root, 'alias', 'restored')), /symlink|directory/i);
  assert.deepEqual(readdirSync(f.source), []);
});
for (const file of ['media.archive', 'manifest.json', 'SHA256SUMS']) {
  test(`verification refuses a symlink ${file}`, t => {
    const f = fixture(t); crafted(f.bundle, [abc]);
    const content = readFileSync(join(f.bundle, file));
    writeFileSync(join(f.root, 'outside'), content);
    rmSync(join(f.bundle, file)); symlinkSync(join(f.root, 'outside'), join(f.bundle, file));
    assert.throws(() => verifyMediaBackup(f.bundle), /file|symlink|ELOOP/i);
  });
}
test('checksum modification and incomplete bundles are rejected', t => {
  const f = fixture(t); crafted(f.bundle, [abc]);
  writeFileSync(join(f.bundle, 'SHA256SUMS'), `${'0'.repeat(64)}  media.archive\n${'0'.repeat(64)}  manifest.json\n`);
  assert.throws(() => verifyMediaBackup(f.bundle), /checksum/i);
  rmSync(join(f.bundle, 'SHA256SUMS'));
  assert.throws(() => verifyMediaBackup(f.bundle), /ENOENT|incomplete/i);
});

test('CLI backup, verify, restore produce machine-readable counts; invalid command fails', async t => {
  const { spawnSync } = await import('node:child_process');
  const f = fixture(t); add(f.source);
  const cli = (...args) => spawnSync(process.execPath, [new URL('./media-backup.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
  for (const args of [['backup', f.source, f.bundle], ['verify', f.bundle], ['restore', f.bundle, f.restored]]) {
    const run = cli(...args);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), '{"files":1,"bytes":20}');
  }
  assert.equal(cli('delete', f.bundle).status, 1);
  assert.equal(cli('verify', join(f.root, 'missing')).status, 1);
});

test('backup refuses non-normalized destination before creating anything', t => {
  const f = fixture(t);
  assert.throws(() => backupMedia(f.source, `${f.bundle}/`), /normalized|absolute/i);
  assert.equal(readdirSync(f.root).includes('backup'), false);
});
test('CLI works when invoked through a release symlink', async t => {
  const { spawnSync } = await import('node:child_process');
  const f = fixture(t), alias = join(f.root, 'current-tool.mjs');
  symlinkSync(new URL('./media-backup.mjs', import.meta.url).pathname, alias);
  const run = spawnSync(process.execPath, [alias, 'backup', f.source, f.bundle], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), '{"files":0,"bytes":0}');
});
