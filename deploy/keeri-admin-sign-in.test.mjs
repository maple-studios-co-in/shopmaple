import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setup, status } from './keeri-admin-sign-in.mjs';

const script = fileURLToPath(new URL('./keeri-admin-sign-in.mjs', import.meta.url));
// Stands in for a credential that is already in the file; made here so no literal looks like one.
const EXISTING = 'e'.repeat(40);
const STORE = ['DATABASE_URL=postgresql://store:pw@127.0.0.1:55440/shopmaple_store', 'WEB_ORIGIN=https://shop.example.test', 'KEERI_ORIGIN=https://keeri.example.test', 'KEERI_TENANT_ID=tenant_maple', `KEERI_COMMERCE_TOKEN=${EXISTING}`, ''].join('\n');
const KEERI = ['export DATABASE_URL="postgresql://keeri:pw@127.0.0.1/keeri"', "STOREFRONT_SERVICE_CREDENTIALS='[{\"id\":\"store\"}]'", ''].join('\n');

function files(t, { store = STORE, keeri = KEERI } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'keeri-sign-in-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = { storeEnv: join(dir, 'store.env'), keeriEnv: join(dir, 'keeri.env'), dir };
  writeFileSync(paths.storeEnv, store, { mode: 0o600 });
  writeFileSync(paths.keeriEnv, keeri, { mode: 0o600 });
  return paths;
}
const run = (paths, ...args) => spawnSync(process.execPath, [script, ...args, '--store-env', paths.storeEnv, '--keeri-env', paths.keeriEnv], { encoding: 'utf8' });
const keeriClients = (path) => {
  // As Keeri's start script reads it: a shell assignment in single quotes.
  const line = readFileSync(path, 'utf8').split('\n').find((row) => row.startsWith('APP_SIGN_IN_CLIENTS='));
  assert.match(line, /^APP_SIGN_IN_CLIENTS='[^']+'$/);
  return JSON.parse(line.slice("APP_SIGN_IN_CLIENTS='".length, -1));
};

test('setup writes one secret to the store and only its hash to Keeri, and shows neither', (t) => {
  const paths = files(t);
  const result = run(paths, 'setup', '--emergency-email', 'Owner@Example.Test');
  assert.equal(result.status, 0, result.stderr);
  const store = parseEnv(readFileSync(paths.storeEnv, 'utf8'));
  const secret = store.KEERI_SIGN_IN_CLIENT_SECRET;
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(store.KEERI_SIGN_IN_CLIENT_ID, 'shop-admin');
  assert.equal(store.ADMIN_EMERGENCY_EMAIL, 'owner@example.test');
  // There is no switch to write: Keeri is the only way in.
  assert.equal(store.ADMIN_SIGN_IN, undefined);
  const clients = keeriClients(paths.keeriEnv);
  assert.deepEqual(clients, [{
    app: 'shop-admin', tenantId: 'tenant_maple',
    secretSha256: createHash('sha256').update(secret).digest('hex'),
    returnUrls: ['https://shop.example.test/api/admin/keeri/callback'],
  }]);
  const keeri = readFileSync(paths.keeriEnv, 'utf8');
  assert.ok(!keeri.includes(secret), 'Keeri must never hold the secret itself');
  const shown = result.stdout + result.stderr;
  assert.ok(!shown.includes(secret) && !shown.includes(clients[0].secretSha256));
  assert.match(shown, /https:\/\/shop\.example\.test\/api\/admin\/keeri\/callback/);
  // What was there before is untouched, and both files stay private.
  assert.ok(readFileSync(paths.storeEnv, 'utf8').startsWith(STORE));
  assert.ok(keeri.startsWith(KEERI));
  for (const name of readdirSync(paths.dir)) assert.equal(statSync(join(paths.dir, name)).mode & 0o777, 0o600, name);
  // A dated copy of each file as it was.
  const backups = readdirSync(paths.dir).filter((name) => name.includes('.before-keeri-sign-in-'));
  assert.equal(backups.length, 2);
  assert.equal(readFileSync(join(paths.dir, backups.find((name) => name.startsWith('store.env'))), 'utf8'), STORE);
});

test('two set-ups never share a secret', (t) => {
  const first = files(t), second = files(t);
  setup(first);
  setup(second);
  assert.notEqual(parseEnv(readFileSync(first.storeEnv, 'utf8')).KEERI_SIGN_IN_CLIENT_SECRET, parseEnv(readFileSync(second.storeEnv, 'utf8')).KEERI_SIGN_IN_CLIENT_SECRET);
});

test('setup refuses to run twice and changes nothing the second time', (t) => {
  const paths = files(t);
  assert.equal(run(paths, 'setup').status, 0);
  const before = [readFileSync(paths.storeEnv, 'utf8'), readFileSync(paths.keeriEnv, 'utf8')];
  const again = run(paths, 'setup');
  assert.equal(again.status, 1);
  assert.match(again.stderr, /Already set up/);
  assert.deepEqual([readFileSync(paths.storeEnv, 'utf8'), readFileSync(paths.keeriEnv, 'utf8')], before);
  assert.ok(!again.stderr.includes(parseEnv(before[0]).KEERI_SIGN_IN_CLIENT_SECRET));
});

for (const [name, change, message] of [
  ['the store has no public address', (s) => s.replace('WEB_ORIGIN=https://shop.example.test\n', ''), /WEB_ORIGIN/],
  ['the store address is not https', (s) => s.replace('https://shop.example.test', 'http://shop.example.test'), /WEB_ORIGIN/],
  ['the store address has a path', (s) => s.replace('https://shop.example.test', 'https://shop.example.test/admin'), /WEB_ORIGIN/],
  ['the store does not know its Keeri company', (s) => s.replace('KEERI_TENANT_ID=tenant_maple\n', ''), /KEERI_TENANT_ID/],
  ['the store does not know where Keeri is', (s) => s.replace('KEERI_ORIGIN=https://keeri.example.test\n', ''), /KEERI_ORIGIN/],
]) {
  test(`setup stops before writing anything when ${name}`, (t) => {
    const paths = files(t, { store: change(STORE) });
    const result = run(paths, 'setup');
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.equal(readFileSync(paths.keeriEnv, 'utf8'), KEERI);
    assert.equal(readFileSync(paths.storeEnv, 'utf8'), change(STORE));
    assert.deepEqual(readdirSync(paths.dir).sort(), ['keeri.env', 'store.env']);
  });
}

test('setup refuses a settings file other users can read, a missing one, and a bad emergency address', (t) => {
  const open = files(t);
  chmodSync(open.keeriEnv, 0o644);
  assert.match(run(open, 'setup').stderr, /can be read by other users/);
  const missing = files(t);
  rmSync(missing.keeriEnv);
  assert.match(run(missing, 'setup').stderr, /not found/);
  const bad = files(t);
  assert.match(run(bad, 'setup', '--emergency-email', "owner'; rm -rf /").stderr, /not an email address/);
  for (const paths of [open, bad]) assert.equal(readFileSync(paths.storeEnv, 'utf8'), STORE);
});

test('a failure never repeats a line from a settings file', (t) => {
  const paths = files(t, { keeri: KEERI });
  writeFileSync(paths.storeEnv, STORE, { mode: 0o600 });
  // The folder cannot be written to: an unexpected error, not one of the script's own refusals.
  chmodSync(paths.dir, 0o500);
  let result;
  try { result = run(paths, 'setup'); } finally { chmodSync(paths.dir, 0o700); }
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not be read or written/);
  assert.ok(!(result.stdout + result.stderr).includes(EXISTING));
  assert.ok(!(result.stdout + result.stderr).includes('pw@'));
});

test('status names what exists and never a value', (t) => {
  const paths = files(t);
  setup({ ...paths, emergencyEmail: 'owner@example.test' });
  const result = run(paths, 'status');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Store settings ready: yes/);
  assert.match(result.stdout, /Keeri settings ready: yes/);
  assert.deepEqual(status(paths), { storeReady: true, keeriReady: true, emergencyAccount: true });
  assert.match(result.stdout, /Emergency account named: yes/);
  const secret = parseEnv(readFileSync(paths.storeEnv, 'utf8')).KEERI_SIGN_IN_CLIENT_SECRET;
  for (const value of [secret, EXISTING, 'owner@example.test', 'tenant_maple', 'pw@']) assert.ok(!result.stdout.includes(value));
});

test('an unknown command explains itself and touches nothing', (t) => {
  const paths = files(t);
  // Including the switch that an earlier draft had: there is none to turn.
  for (const command of ['on', 'off']) assert.equal(run(paths, command).status, 1);
  const result = run(paths, 'rotate');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.equal(readFileSync(paths.storeEnv, 'utf8'), STORE);
});

test('setup --replace recovers a half-finished set-up', (t) => {
  // An earlier run wrote Keeri's file and then stopped: Keeri holds a hash for a secret nobody has.
  const paths = files(t, { keeri: `${KEERI}APP_SIGN_IN_CLIENTS='[{"app":"shop-admin","tenantId":"tenant_maple","secretSha256":"${'0'.repeat(64)}","returnUrls":["https://shop.example.test/api/admin/keeri/callback"]}]'\n` });
  assert.match(run(paths, 'setup').stderr, /run setup again with --replace/);
  const result = run(paths, 'setup', '--replace', '--emergency-email', 'owner@example.test');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Replaced\./);
  const store = parseEnv(readFileSync(paths.storeEnv, 'utf8'));
  const clients = keeriClients(paths.keeriEnv);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].secretSha256, createHash('sha256').update(store.KEERI_SIGN_IN_CLIENT_SECRET).digest('hex'));
  assert.equal(readFileSync(paths.keeriEnv, 'utf8').match(/APP_SIGN_IN_CLIENTS=/g).length, 1);
});

test("setup --replace follows the store's new address, changes the secret, and keeps everything else", (t) => {
  const paths = files(t);
  setup({ ...paths, emergencyEmail: 'owner@example.test' });
  const before = parseEnv(readFileSync(paths.storeEnv, 'utf8'));
  // Another app registered in Keeri since, and the store has moved to a new address.
  const other = { app: 'another-app', tenantId: 'tenant_maple', secretSha256: 'a'.repeat(64), returnUrls: ['https://other.example.test/cb'] };
  writeFileSync(paths.keeriEnv, readFileSync(paths.keeriEnv, 'utf8').replace("APP_SIGN_IN_CLIENTS='[", `APP_SIGN_IN_CLIENTS='[${JSON.stringify(other)},`), { mode: 0o600 });
  writeFileSync(paths.storeEnv, readFileSync(paths.storeEnv, 'utf8').replace('https://shop.example.test', 'https://store.example.test'), { mode: 0o600 });
  const result = run(paths, 'setup', '--replace');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Replaced\./);
  assert.match(result.stdout, /restart Keeri and the store API/);
  const after = parseEnv(readFileSync(paths.storeEnv, 'utf8'));
  assert.notEqual(after.KEERI_SIGN_IN_CLIENT_SECRET, before.KEERI_SIGN_IN_CLIENT_SECRET);
  // The emergency address was not given again, so it stays as it was; so does every unrelated setting.
  assert.equal(after.ADMIN_EMERGENCY_EMAIL, 'owner@example.test');
  assert.equal(after.DATABASE_URL, before.DATABASE_URL);
  assert.equal(after.KEERI_COMMERCE_TOKEN, EXISTING);
  const text = readFileSync(paths.storeEnv, 'utf8');
  for (const key of ['KEERI_SIGN_IN_CLIENT_ID', 'KEERI_SIGN_IN_CLIENT_SECRET', 'ADMIN_EMERGENCY_EMAIL']) assert.equal(text.match(new RegExp(`^${key}=`, 'gm')).length, 1, key);
  const clients = keeriClients(paths.keeriEnv);
  assert.deepEqual(clients[0], other);
  assert.deepEqual(clients[1], {
    app: 'shop-admin', tenantId: 'tenant_maple',
    secretSha256: createHash('sha256').update(after.KEERI_SIGN_IN_CLIENT_SECRET).digest('hex'),
    returnUrls: ['https://store.example.test/api/admin/keeri/callback'],
  });
  const shown = result.stdout + result.stderr;
  assert.ok(!shown.includes(after.KEERI_SIGN_IN_CLIENT_SECRET) && !shown.includes(before.KEERI_SIGN_IN_CLIENT_SECRET));
  assert.ok(readFileSync(paths.keeriEnv, 'utf8').startsWith(KEERI));
  // A new emergency address is taken when one is given.
  assert.equal(run(paths, 'setup', '--replace', '--emergency-email', 'new-owner@example.test').status, 0);
  assert.equal(parseEnv(readFileSync(paths.storeEnv, 'utf8')).ADMIN_EMERGENCY_EMAIL, 'new-owner@example.test');
});

test('setup --replace changes nothing when Keeri\'s setting is not one it can read', (t) => {
  const keeri = `${KEERI}export APP_SIGN_IN_CLIENTS="$(cat /somewhere/clients.json)"\n`;
  const paths = files(t, { keeri });
  const result = run(paths, 'setup', '--replace');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not in the form this helper writes/);
  assert.equal(readFileSync(paths.keeriEnv, 'utf8'), keeri);
  assert.equal(readFileSync(paths.storeEnv, 'utf8'), STORE);
});
