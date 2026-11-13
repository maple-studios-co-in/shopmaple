#!/usr/bin/env node
// Sets the store and Keeri up for shop-admin sign-in with Keeri accounts, on the server that runs both.
//
//   node deploy/keeri-admin-sign-in.mjs setup [--emergency-email you@example.com] [--replace]
//   node deploy/keeri-admin-sign-in.mjs status
//
// Keeri is the only way into the shop admin, so there is nothing to switch on or off: run `setup` from the
// new release before it is made live, and the store signs staff in with Keeri from its first request.
// `setup` makes one new random secret and writes it where each side needs it: the secret itself into the
// store's settings file, and only its SHA-256 into Keeri's, together with the company and the one address
// Keeri may send people back to. It never prints the secret, and nobody has to copy it by hand.
// Nothing here restarts anything, and a file that is already set up is left alone unless --replace is given.
// `setup --replace` makes a new secret and writes the return address afresh from the store's current WEB_ORIGIN:
// use it when the store's address changes, to change the secret, or if an earlier run stopped half-way.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

export const STORE_ENV = '/home/deploy/shopmaple/shared/store.env';
export const KEERI_ENV = '/home/deploy/keeri-secrets/keeri.env';
const APP = 'shop-admin';
const STORE_KEYS = ['KEERI_SIGN_IN_CLIENT_ID', 'KEERI_SIGN_IN_CLIENT_SECRET'];

class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };

/** A settings file is private: a regular file, this user's, readable by nobody else. */
function readPrivate(path, label) {
  let stat;
  try { stat = statSync(path); } catch { refuse(`${label} settings file not found: ${path}`); }
  if (!stat.isFile()) refuse(`${label} settings file is not a regular file: ${path}`);
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) refuse(`${label} settings file belongs to another user: ${path}`);
  if ((stat.mode & 0o077) !== 0) refuse(`${label} settings file can be read by other users (expected mode 600): ${path}`);
  return readFileSync(path, 'utf8');
}

/** Keeps a dated copy beside the file, then replaces it in one step so a crash cannot leave half a file. */
function writePrivate(path, text, stamp) {
  const backup = `${path}.before-keeri-sign-in-${stamp}`;
  copyFileSync(path, backup);
  chmodSync(backup, 0o600);
  const next = `${path}.next-${process.pid}`;
  writeFileSync(next, text, { mode: 0o600 });
  renameSync(next, path);
  return backup;
}

const OUR_COMMENTS = ['# Shop admin sign-in with Keeri accounts (set up ', "# The store's shop admin signs staff in through Keeri (set up "];
/** The file without the given settings and without the comment lines this helper wrote above them. */
const without = (text, keys) => text.split('\n')
  .filter((line) => !keys.some((key) => new RegExp(`^\\s*(?:export\\s+)?${key}=`).test(line)) && !OUR_COMMENTS.some((comment) => line.startsWith(comment)))
  .join('\n');
/** Other apps already registered in Keeri's setting, which a replace must keep. */
function otherClients(keeri) {
  const line = /^\s*(?:export\s+)?APP_SIGN_IN_CLIENTS='(.*)'\s*$/m.exec(keeri);
  if (!line) return has(keeri, 'APP_SIGN_IN_CLIENTS') ? refuse("Keeri's APP_SIGN_IN_CLIENTS is not in the form this helper writes. Nothing was changed.") : [];
  let clients;
  try { clients = JSON.parse(line[1]); } catch { clients = null; }
  if (!Array.isArray(clients)) refuse("Keeri's APP_SIGN_IN_CLIENTS is not in the form this helper writes. Nothing was changed.");
  return clients.filter((client) => client?.app !== APP);
}
const has = (text, key) => new RegExp(`^\\s*(?:export\\s+)?${key}=`, 'm').test(text);
const withLine = (text, lines) => `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${lines.join('\n')}\n`;

function httpsOrigin(value, key) {
  let url;
  try { url = new URL(value ?? ''); } catch { refuse(`${key} is missing from the store settings or is not an address.`); }
  if (url.protocol !== 'https:' || url.origin + '/' !== url.href) refuse(`${key} in the store settings must be a plain https address with nothing after the host.`);
  return url.origin;
}

export function setup({ storeEnv = STORE_ENV, keeriEnv = KEERI_ENV, emergencyEmail, replace = false, now = new Date() } = {}) {
  const store = readPrivate(storeEnv, 'Store');
  const keeri = readPrivate(keeriEnv, 'Keeri');
  const present = [...STORE_KEYS.filter((key) => has(store, key)), ...(has(keeri, 'APP_SIGN_IN_CLIENTS') ? ['APP_SIGN_IN_CLIENTS (Keeri)'] : [])];
  if (present.length && !replace) refuse(`Already set up: ${present.join(', ')} found. Nothing was changed. To make a new secret and return address, run setup again with --replace.`);
  if (emergencyEmail !== undefined && !/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(emergencyEmail)) refuse('--emergency-email is not an email address.');
  if (emergencyEmail !== undefined && has(store, 'ADMIN_EMERGENCY_EMAIL') && !replace) refuse('ADMIN_EMERGENCY_EMAIL is already in the store settings. Nothing was changed.');
  // Read before anything is written, so a setting this helper cannot understand stops it with both files intact.
  const kept = replace ? otherClients(keeri) : [];

  const settings = parseEnv(store);
  const webOrigin = httpsOrigin(settings.WEB_ORIGIN, 'WEB_ORIGIN');
  httpsOrigin(settings.KEERI_ORIGIN, 'KEERI_ORIGIN');
  const tenantId = settings.KEERI_TENANT_ID ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenantId)) refuse('KEERI_TENANT_ID is missing from the store settings.');

  const secret = randomBytes(32).toString('base64url');
  const client = { app: APP, tenantId, secretSha256: createHash('sha256').update(secret).digest('hex'), returnUrls: [`${webOrigin}/api/admin/keeri/callback`] };
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const storeLines = [
    `# Shop admin sign-in with Keeri accounts (set up ${day}); see docs/admin-release.md.`,
    `KEERI_SIGN_IN_CLIENT_ID=${APP}`,
    `KEERI_SIGN_IN_CLIENT_SECRET=${secret}`,
    ...(emergencyEmail ? [`ADMIN_EMERGENCY_EMAIL=${emergencyEmail.toLowerCase()}`] : []),
  ];
  // Keeri's file is read by a shell, so the JSON goes in single quotes (it contains none itself).
  const keeriLines = [
    `# The store's shop admin signs staff in through Keeri (set up ${day}). Holds a hash, not the secret; see docs/app-sign-in.md.`,
    `APP_SIGN_IN_CLIENTS='${JSON.stringify([...kept, client])}'`,
  ];
  // Keeri first: if the second write fails, the store has no secret that Keeri would not recognise.
  // A replace takes the old lines out first. The emergency address is only replaced when a new one is given.
  const storeBase = replace ? without(store, [...STORE_KEYS, ...(emergencyEmail ? ['ADMIN_EMERGENCY_EMAIL'] : [])]) : store;
  const keeriBase = replace ? without(keeri, ['APP_SIGN_IN_CLIENTS']) : keeri;
  const keeriBackup = writePrivate(keeriEnv, withLine(keeriBase, keeriLines), stamp);
  const storeBackup = writePrivate(storeEnv, withLine(storeBase, storeLines), stamp);
  return { replaced: replace && present.length > 0, returnUrl: client.returnUrls[0], tenantId, emergencyEmail: emergencyEmail?.toLowerCase() ?? null, backups: [keeriBackup, storeBackup] };
}

/** Which settings exist, by name only. */
export function status({ storeEnv = STORE_ENV, keeriEnv = KEERI_ENV } = {}) {
  const store = readPrivate(storeEnv, 'Store');
  const keeri = readPrivate(keeriEnv, 'Keeri');
  const settings = parseEnv(store);
  return {
    storeReady: STORE_KEYS.every((key) => Boolean(settings[key])),
    keeriReady: has(keeri, 'APP_SIGN_IN_CLIENTS'),
    emergencyAccount: Boolean(settings.ADMIN_EMERGENCY_EMAIL),
  };
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { 'store-env': { type: 'string' }, 'keeri-env': { type: 'string' }, 'emergency-email': { type: 'string' }, replace: { type: 'boolean' } },
  });
  const paths = { storeEnv: values['store-env'] ?? STORE_ENV, keeriEnv: values['keeri-env'] ?? KEERI_ENV };
  const [command] = positionals;
  if (command === 'setup') {
    const done = setup({ ...paths, emergencyEmail: values['emergency-email'], replace: values.replace === true });
    console.log(`${done.replaced ? 'Replaced' : 'Set up'}. A new secret is in the store settings and its hash is in Keeri\'s; it was not shown.`);
    console.log(`Keeri will send people back only to: ${done.returnUrl}`);
    if (done.emergencyEmail) console.log(`Emergency account: ${done.emergencyEmail}. It must be the address of an existing shop-admin account; the store API says so in its log at start if it is not.`);
    else if (!done.replaced) console.log('No emergency account was named (add --emergency-email to have one).');
    console.log('Copies of both files as they were:');
    for (const backup of done.backups) console.log(`  ${backup}`);
    console.log(done.replaced
      ? 'Next: restart Keeri and the store API. Until both have restarted they disagree about the secret, and only the emergency account can sign in.'
      : 'Next: restart Keeri so it reads its settings. The store reads its own when the new release starts.');
  } else if (command === 'status') {
    const found = status(paths);
    console.log(`Store settings ready: ${found.storeReady ? 'yes' : 'no'}`);
    console.log(`Keeri settings ready: ${found.keeriReady ? 'yes' : 'no'}`);
    console.log(`Emergency account named: ${found.emergencyAccount ? 'yes' : 'no'}`);
  } else {
    refuse('Usage: node deploy/keeri-admin-sign-in.mjs setup [--emergency-email you@example.com] [--replace] | status');
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Only this script's own refusals are repeated; anything else could quote a line from a settings file.
    console.error(error instanceof Refusal ? error.message : 'Stopped: the settings files could not be read or written. Nothing further was changed.');
    process.exitCode = 1;
  }
}
