#!/usr/bin/env node
// Installs the ShopMaple operations cron block (monitor every 5 minutes, nightly backup, weekly restore drill) from the
// stable ops path, and removes the old backup entry that ran from a pinned operations/<commit> folder. Every other entry
// (Keeri, the catalogue sync, other apps) is kept byte for byte. The previous crontab is saved privately first.
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const START = '# ShopMaple operations start (deploy/ops/install-cron.mjs)';
const END = '# ShopMaple operations end';
const TOOLS = '/home/deploy/shopmaple/ops/tools/ops';
const BLOCK = [
  START,
  `*/5 * * * * ${TOOLS}/run-monitor.sh`,
  `47 2 * * * ${TOOLS}/run-backup.sh`,
  `30 3 * * 0 ${TOOLS}/run-restore-drill.sh --email-summary`,
  END,
];
// Blocks this installer owns or replaces: its own, and the database-only/pinned backup entry it supersedes.
const OWNED = [[START, END], ['# ShopMaple isolated database nightly backup', '# End ShopMaple isolated database nightly backup']];

export function renderCrontab(text) {
  const kept = [];
  let skipping;
  for (const line of text.replace(/\n$/, '').split('\n')) {
    if (skipping) { if (line === skipping) skipping = undefined; continue; }
    const owned = OWNED.find(([start]) => line === start);
    if (owned) { skipping = owned[1]; continue; }
    kept.push(line);
  }
  while (kept.length && kept.at(-1) === '') kept.pop();
  return `${[...kept, '', ...BLOCK].join('\n')}\n`;
}

function stamp(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

export function installCron({ crontabBin = '/usr/bin/crontab', stateDir = '/home/deploy/shopmaple/ops/state', dryRun = false, now = Date.now } = {}) {
  const listed = spawnSync(crontabBin, ['-l'], { encoding: 'utf8' });
  let current;
  if (listed.status === 0) current = listed.stdout;
  else if (/no crontab for/i.test(listed.stderr)) current = '';
  else throw new Error('Could not read the current crontab; nothing was changed.');
  const next = renderCrontab(current);
  if (dryRun) return { next, changed: next !== current };
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const backupPath = join(stateDir, `crontab.before-ops-${stamp(now())}`);
  const temporary = `${backupPath}.tmp`;
  writeFileSync(temporary, current, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, backupPath);
  const written = spawnSync(crontabBin, ['-'], { input: next, encoding: 'utf8' });
  if (written.status !== 0) throw new Error(`Installing the crontab failed; the previous one is saved at ${backupPath}.`);
  return { next, backupPath, changed: next !== current };
}

let entryPath;
try { if (process.argv[1]) entryPath = realpathSync(process.argv[1]); } catch { /* imported */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--dry-run')) { console.error('Usage: install-cron.mjs [--dry-run]'); process.exit(2); }
  try {
    const result = installCron({ dryRun: args.includes('--dry-run') });
    if (args.includes('--dry-run')) console.log(`The crontab would become:\n\n${result.next}`);
    else console.log(`Installed the ShopMaple operations cron block. Previous crontab saved privately at ${result.backupPath}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
