import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Each command-line module must also import cleanly as a library, including from stdin ('-') or with a nonexistent
// script argument, without running its command.
for (const name of ['alerts.mjs', 'backups.mjs', 'store-monitor.mjs', 'backup-runner.mjs', 'restore-drill.mjs', 'staging-scrub.mjs', 'staging-env-check.mjs', 'install-cron.mjs']) {
  const url = new URL(`./${name}`, import.meta.url).href;
  test(`${name} imports from stdin and with an unrelated script argument without running`, () => {
    const viaStdin = spawnSync(process.execPath, ['--input-type=module', '-'], { input: `await import(${JSON.stringify(url)}); console.log('imported');`, encoding: 'utf8' });
    assert.equal(viaStdin.status, 0, viaStdin.stderr);
    assert.equal(viaStdin.stdout.trim(), 'imported');
    const withArgument = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('imported');`, 'not-a-file'], { encoding: 'utf8' });
    assert.equal(withArgument.status, 0, withArgument.stderr);
    assert.equal(withArgument.stdout.trim(), 'imported');
  });
}
