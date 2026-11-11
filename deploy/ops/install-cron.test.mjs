import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installCron, renderCrontab } from './install-cron.mjs';

const current = `# Keeri managed backup: maplefurnishers
17 2 * * * cd /home/deploy/keeri/source && bash /home/deploy/keeri/ops-health/backup-all.sh >> /home/deploy/keeri-backups/backup-all.log 2>&1
# End Keeri managed backup: maplefurnishers

# ShopMaple isolated database nightly backup
47 2 * * * /bin/sh /home/deploy/shopmaple/operations/39064130264d569bbca34fcc7c74e828e954e52a/deploy/backup-shopmaple.sh >> /home/deploy/shopmaple/backups/backup.log 2>&1
# End ShopMaple isolated database nightly backup

# ShopMaple Keeri catalogue sync
*/5 * * * * /usr/bin/flock -n /home/deploy/shopmaple/shared/catalogue-sync.lock /bin/sh -c 'cd /home/deploy/shopmaple/current && /usr/bin/node --env-file=/home/deploy/shopmaple/shared/store.env --import tsx deploy/sync-store-catalogue.ts --apply' >> /home/deploy/shopmaple/shared/catalogue-sync.log 2>&1
# End ShopMaple Keeri catalogue sync
15 2 * * * /usr/bin/flock -n /home/deploy/.local/share/maple-studios-mongo/backup.lock /usr/bin/python3 /home/deploy/backup-growth-db.py >> /home/deploy/backups/maple-studios/backup.log 2>&1
`;

test('the pinned backup entry is replaced by the stable launchers; every other entry is kept as it was', () => {
  const next = renderCrontab(current);
  assert.doesNotMatch(next, /operations\/39064130264d569bbca34fcc7c74e828e954e52a/);
  assert.match(next, /^47 2 \* \* \* \/home\/deploy\/shopmaple\/ops\/tools\/ops\/run-backup\.sh$/m);
  assert.match(next, /^\*\/5 \* \* \* \* \/home\/deploy\/shopmaple\/ops\/tools\/ops\/run-monitor\.sh$/m);
  assert.match(next, /^30 3 \* \* 0 \/home\/deploy\/shopmaple\/ops\/tools\/ops\/run-restore-drill\.sh --email-summary$/m);
  for (const line of current.split('\n').filter(l => l && !/ShopMaple isolated database|operations\/3906/.test(l))) assert.ok(next.includes(line), `kept: ${line}`);
});

test('rendering is idempotent: a second install changes nothing', () => {
  const once = renderCrontab(current);
  assert.equal(renderCrontab(once), once);
});

function fakeCrontab(t, initial, { failList = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cron-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'crontab.txt');
  if (initial !== undefined) writeFileSync(file, initial);
  const bin = join(dir, 'crontab');
  writeFileSync(bin, `#!/bin/sh
if [ "$1" = "-l" ]; then
  ${failList ? 'echo "crontab: cannot open" >&2; exit 1' : `[ -f "${file}" ] || { echo "no crontab for deploy" >&2; exit 1; }; cat "${file}"`}
elif [ "$1" = "-" ]; then cat > "${file}"; else exit 2; fi
`, { mode: 0o700 });
  return { dir, file, bin, stateDir: join(dir, 'state') };
}

test('install keeps a private copy of the previous crontab and writes the new one', t => {
  const f = fakeCrontab(t, current);
  const result = installCron({ crontabBin: f.bin, stateDir: f.stateDir, now: () => Date.parse('2026-11-12T03:00:00.000Z') });
  assert.equal(readFileSync(f.file, 'utf8'), renderCrontab(current));
  assert.equal(readFileSync(result.backupPath, 'utf8'), current);
  assert.equal(statSync(result.backupPath).mode & 0o777, 0o600);
  assert.match(readdirSync(f.stateDir)[0], /^crontab\.before-ops-20261112T030000Z$/);
});

test('a dry run prints the new crontab and changes nothing', t => {
  const f = fakeCrontab(t, current);
  const result = installCron({ crontabBin: f.bin, stateDir: f.stateDir, dryRun: true });
  assert.equal(result.next, renderCrontab(current));
  assert.equal(readFileSync(f.file, 'utf8'), current);
});

test('an unreadable crontab is never replaced', t => {
  const f = fakeCrontab(t, current, { failList: true });
  assert.throws(() => installCron({ crontabBin: f.bin, stateDir: f.stateDir }), /Could not read the current crontab/);
  assert.equal(readFileSync(f.file, 'utf8'), current);
});
