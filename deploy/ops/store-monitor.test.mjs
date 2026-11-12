import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluateBackup, evaluateCatalogueSync, evaluateDisk, evaluateDrill, evaluateHealth, evaluatePm2, evaluateWebhook, runMonitor,
} from './store-monitor.mjs';
import { listCompletePairs } from './backups.mjs';

const now = Date.parse('2026-11-12T03:00:00.000Z');
const ago = minutes => new Date(now - minutes * 60_000).toISOString();
const GB = 1024 ** 3;

test('health must be ok and, when the store sells online, report checkout enabled', () => {
  assert.equal(evaluateHealth(200, '{"status":"ok","checkoutEnabled":true}', { expectCheckout: true }).level, 'ok');
  const off = evaluateHealth(200, '{"status":"ok","checkoutEnabled":false}', { expectCheckout: true });
  assert.equal(off.level, 'failure'); assert.match(off.detail, /checkout is switched off/);
  assert.equal(evaluateHealth(200, '{"status":"ok","checkoutEnabled":false}', { expectCheckout: false }).level, 'ok');
  assert.equal(evaluateHealth(502, '<html>bad gateway</html>', { expectCheckout: true }).level, 'failure');
  assert.equal(evaluateHealth(200, 'not json', { expectCheckout: true }).level, 'failure');
});

test('disk fails under 10 percent or under 5 GB free', () => {
  assert.equal(evaluateDisk({ freeBytes: 25 * GB, totalBytes: 193 * GB }, { minFreePercent: 10, minFreeGb: 5 }).level, 'ok');
  const low = evaluateDisk({ freeBytes: 18 * GB, totalBytes: 193 * GB }, { minFreePercent: 10, minFreeGb: 5 });
  assert.equal(low.level, 'failure'); assert.match(low.detail, /18\.0 GB free \(9\.3%\)/);
  assert.equal(evaluateDisk({ freeBytes: 4 * GB, totalBytes: 20 * GB }, { minFreePercent: 10, minFreeGb: 5 }).level, 'failure');
});

test('catalogue sync is judged by the age of its last success, and names the last failure reason', () => {
  const thresholds = { warnMinutes: 20, failMinutes: 60 };
  assert.equal(evaluateCatalogueSync({ ok: true, at: ago(3), lastSuccessAt: ago(3) }, now, thresholds).level, 'ok');
  const blip = evaluateCatalogueSync({ ok: false, at: ago(2), lastSuccessAt: ago(7), reason: 'KEERI_TIMEOUT' }, now, thresholds);
  assert.equal(blip.level, 'ok'); assert.match(blip.detail, /KEERI_TIMEOUT/);
  const warn = evaluateCatalogueSync({ ok: false, at: ago(2), lastSuccessAt: ago(32), reason: 'KEERI_TIMEOUT', consecutiveFailures: 6 }, now, thresholds);
  assert.equal(warn.level, 'warning'); assert.match(warn.detail, /32 minutes ago.*KEERI_TIMEOUT.*6 runs/);
  assert.equal(evaluateCatalogueSync({ ok: false, at: ago(2), lastSuccessAt: ago(61), reason: 'X_Y' }, now, thresholds).level, 'failure');
  const never = evaluateCatalogueSync({ ok: false, at: ago(2), lastSuccessAt: null, reason: 'MISSING_CONFIGURATION' }, now, thresholds);
  assert.equal(never.level, 'failure');
  const stopped = evaluateCatalogueSync({ ok: true, at: ago(90), lastSuccessAt: ago(90) }, now, thresholds);
  assert.equal(stopped.level, 'failure'); assert.match(stopped.detail, /has not run for 90 minutes/);
  const missing = evaluateCatalogueSync(undefined, now, thresholds);
  assert.equal(missing.level, 'warning'); assert.match(missing.detail, /CATALOGUE_SYNC_STATUS_FILE/);
});

function pairFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'monitor-backups-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const add = (id, completedAt, { complete = true } = {}) => {
    mkdirSync(join(root, id), { mode: 0o700 });
    writeFileSync(join(root, id, 'database.dump'), 'x'.repeat(10));
    if (complete) writeFileSync(join(root, id, 'COMPLETE.json'), JSON.stringify({ version: 1, pairId: id, completedAt, database: { bytes: 10 }, media: { files: 2 } }));
  };
  return { root, add };
}

test('only pairs with a completion record count, newest first', t => {
  const { root, add } = pairFixture(t);
  add('20261027T054640489Z-6c6d624b-ecfd-4e4d-a0d6-6e7dfa611feb', '2026-10-27T05:46:40.933Z');
  add('20261111T024700000Z-aaaaaaaa-ecfd-4e4d-a0d6-6e7dfa611feb', '2026-11-11T02:47:01.000Z', { complete: false });
  add('20261026T042526685Z-32c10ece-8f70-4cce-906f-9272879c909c', '2026-10-26T04:25:27.000Z');
  writeFileSync(join(root, 'backup.log'), '');
  const pairs = listCompletePairs(root);
  assert.deepEqual(pairs.map(p => p.id), ['20261027T054640489Z-6c6d624b-ecfd-4e4d-a0d6-6e7dfa611feb', '20261026T042526685Z-32c10ece-8f70-4cce-906f-9272879c909c']);
});

test('backup freshness fails after 26 hours and carries the nightly run failure reason', () => {
  const pair = { id: 'p1', completedAt: now - 2 * 3_600_000 };
  assert.equal(evaluateBackup(pair, { ok: true, at: ago(120) }, now, { maxAgeHours: 26 }).level, 'ok');
  const stale = evaluateBackup({ id: 'p0', completedAt: now - 15 * 86_400_000 }, { ok: false, at: ago(13 * 60), reason: 'RELEASE_DIR_GROUP_WRITABLE' }, now, { maxAgeHours: 26 });
  assert.equal(stale.level, 'failure');
  assert.match(stale.detail, /15 days ago \(completed 2026-10-28 03:00 UTC\)/); assert.match(stale.detail, /RELEASE_DIR_GROUP_WRITABLE/);
  assert.equal(evaluateBackup(undefined, undefined, now, { maxAgeHours: 26 }).level, 'failure');
  const lastRunFailed = evaluateBackup(pair, { ok: false, at: ago(30), reason: 'BACKUP_FAILED' }, now, { maxAgeHours: 26 });
  assert.equal(lastRunFailed.level, 'warning');
});

test('pm2: each store process must be online; restart bursts are warned about', () => {
  const apps = ['shopmaple-api', 'shopmaple-web'];
  const list = [{ name: 'shopmaple-api', status: 'online', restarts: 22 }, { name: 'shopmaple-web', status: 'online', restarts: 21 }, { name: 'other', status: 'stopped', restarts: 0 }];
  const first = evaluatePm2(list, undefined, now, { apps, restartWarn: 3 });
  assert.equal(first.result.level, 'ok');
  const later = evaluatePm2([{ name: 'shopmaple-api', status: 'online', restarts: 22 }, { name: 'shopmaple-web', status: 'online', restarts: 25 }], first.history, now + 40 * 60_000, { apps, restartWarn: 3 });
  assert.equal(later.result.level, 'warning'); assert.match(later.result.detail, /shopmaple-web restarted 4 times in the last hour/);
  const calm = evaluatePm2([{ name: 'shopmaple-api', status: 'online', restarts: 22 }, { name: 'shopmaple-web', status: 'online', restarts: 25 }], later.history, now + 120 * 60_000, { apps, restartWarn: 3 });
  assert.equal(calm.result.level, 'ok', 'history older than an hour is forgotten');
  const down = evaluatePm2([{ name: 'shopmaple-api', status: 'errored', restarts: 22 }], first.history, now, { apps, restartWarn: 3 });
  assert.equal(down.result.level, 'failure'); assert.match(down.result.detail, /shopmaple-api is errored/); assert.match(down.result.detail, /shopmaple-web is missing/);
});

test('the payment webhook must answer a signature-less probe with a client error, never 404 or 5xx', () => {
  assert.equal(evaluateWebhook(400).level, 'ok');
  assert.match(evaluateWebhook(404).detail, /not registered/);
  assert.equal(evaluateWebhook(503).level, 'failure');
  assert.equal(evaluateWebhook(undefined, 'timeout').level, 'failure');
});

test('restore drill must have passed within the allowed days', () => {
  assert.equal(evaluateDrill({ ok: true, at: ago(3 * 1440) }, now, { maxAgeDays: 8 }).level, 'ok');
  assert.equal(evaluateDrill({ ok: true, at: ago(9 * 1440) }, now, { maxAgeDays: 8 }).level, 'warning');
  const failed = evaluateDrill({ ok: false, at: ago(60), problems: ['row count Product: live 385, restored 12'] }, now, { maxAgeDays: 8 });
  assert.equal(failed.level, 'failure'); assert.match(failed.detail, /row count Product/);
  assert.equal(evaluateDrill(undefined, now, { maxAgeDays: 8 }).level, 'warning');
});

async function storeDouble(t, routes) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; }).on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const route = routes[`${req.method} ${req.url.split('?')[0]}`];
      if (!route) return res.writeHead(404).end('missing');
      const [status, type, text] = typeof route === 'function' ? route() : route;
      res.writeHead(status, { 'content-type': type }).end(text);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

test('a full run checks every surface, sends one deduplicated email, and a dry run sends and records nothing', async t => {
  let home = [502, 'text/html', 'bad gateway'];
  const store = await storeDouble(t, {
    'GET /': () => home,
    'GET /api/health': [200, 'application/json', '{"status":"ok","checkoutEnabled":true}'],
    'GET /api/products': [200, 'application/json', '{"products":[{"handle":"alain"}]}'],
    'GET /products/alain': [200, 'text/html', '<html>chair</html>'],
    'POST /api/webhooks/razorpay': [400, 'application/json', '{"code":"INVALID_INPUT"}'],
  });
  const localWeb = await storeDouble(t, { 'GET /': [200, 'text/html', '<html>local</html>'] });
  const mail = await storeDouble(t, { 'POST /emails': [200, 'application/json', '{"id":"e1"}'] });
  const dir = mkdtempSync(join(tmpdir(), 'monitor-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { root, add } = pairFixture(t);
  add('20261112T024700000Z-6c6d624b-ecfd-4e4d-a0d6-6e7dfa611feb', ago(60));
  writeFileSync(join(dir, 'sync.json'), JSON.stringify({ ok: true, at: ago(2), lastSuccessAt: ago(2) }));
  writeFileSync(join(dir, 'drill.json'), JSON.stringify({ ok: true, at: ago(600) }));
  const env = {
    MONITOR_PUBLIC_ORIGIN: store.origin, MONITOR_LOCAL_API: store.origin, MONITOR_LOCAL_WEB: localWeb.origin,
    MONITOR_BACKUP_ROOT: root, MONITOR_STATE_DIR: dir, CATALOGUE_SYNC_STATUS_FILE: join(dir, 'sync.json'),
    MONITOR_DRILL_STATUS_FILE: join(dir, 'drill.json'), MONITOR_BACKUP_STATUS_FILE: join(dir, 'backup.json'),
    ALERT_MAIL_TO: 'owner@example.com', ORDER_RESEND_API_KEY: 're_test_secret_value', ALERT_CONFIRM_RUNS: '2',
  };
  const deps = {
    now: () => now, host: 'maple',
    statfs: () => ({ freeBytes: 25 * GB, totalBytes: 193 * GB }),
    pm2List: async () => [{ name: 'shopmaple-api', status: 'online', restarts: 1 }, { name: 'shopmaple-web', status: 'online', restarts: 1 }, { name: 'shopmaple-db', status: 'online', restarts: 0 }],
    mailEndpoint: `${mail.origin}/emails`,
  };
  const first = await runMonitor(env, deps);
  assert.equal(first.results.public_home.level, 'failure');
  for (const key of ['public_health', 'public_product', 'local_api', 'local_web', 'razorpay_webhook', 'disk', 'backup_freshness', 'catalogue_sync', 'pm2', 'restore_drill']) assert.equal(first.results[key].level, 'ok', key);
  assert.equal(mail.requests.length, 0, 'not confirmed after one run');
  const probe = store.requests.find(r => r.url === '/api/webhooks/razorpay');
  assert.equal(probe.headers['x-razorpay-signature'], undefined, 'the probe never carries a signature');

  const dry = await runMonitor(env, { ...deps, now: () => now + 300_000, dryRun: true, print: () => {} });
  assert.equal(dry.email.subject, '[ShopMaple] 1 new problem');
  assert.equal(mail.requests.length, 0, 'a dry run sends nothing');

  await runMonitor(env, { ...deps, now: () => now + 300_000 });
  assert.equal(mail.requests.length, 1);
  const sent = JSON.parse(mail.requests[0].body);
  assert.match(sent.subject, /1 new problem/); assert.match(sent.text, /public_home \(failure\): home page answered HTTP 502/);
  assert.equal(sent.text.includes('re_test_secret_value'), false);

  await runMonitor(env, { ...deps, now: () => now + 600_000 });
  assert.equal(mail.requests.length, 1, 'still the same problem: no second email');
  home = [200, 'text/html', '<html>home</html>'];
  await runMonitor(env, { ...deps, now: () => now + 900_000 });
  assert.equal(mail.requests.length, 2);
  assert.match(JSON.parse(mail.requests[1].body).subject, /1 recovered/);
  assert.ok(existsSync(join(dir, 'monitor.json')));
  assert.equal(readFileSync(join(dir, 'monitor.json'), 'utf8').includes('re_test_secret_value'), false);
});

test('a check that throws is reported as a failure of that check, not a crash', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-throw-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { MONITOR_PUBLIC_ORIGIN: 'http://127.0.0.1:9', MONITOR_LOCAL_API: 'http://127.0.0.1:9', MONITOR_LOCAL_WEB: 'http://127.0.0.1:9', MONITOR_BACKUP_ROOT: join(dir, 'missing'), MONITOR_STATE_DIR: dir, ALERT_MAIL_TO: 'owner@example.com' };
  const result = await runMonitor(env, { now: () => now, host: 'maple', dryRun: true, print: () => {}, statfs: () => { throw new Error('boom'); }, pm2List: async () => { throw new Error('pm2 missing'); }, timeoutMs: 2000 });
  assert.equal(result.results.disk.level, 'failure');
  assert.equal(result.results.pm2.level, 'failure');
  assert.equal(result.results.public_home.level, 'failure');
  assert.equal(result.results.backup_freshness.level, 'failure');
});
