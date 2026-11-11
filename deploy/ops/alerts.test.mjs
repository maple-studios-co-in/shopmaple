import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyDelivery, composeEmail, parseAlertConfig, planAlerts, readState, redact, sendEmail, writeState } from './alerts.mjs';

const t0 = Date.parse('2026-11-12T03:00:00.000Z');
const minutes = n => n * 60_000;
const fail = detail => ({ level: 'failure', detail });
const ok = detail => ({ level: 'ok', detail });
const kinds = plan => plan.notifications.map(n => `${n.key}:${n.kind}`);

test('a problem is announced only after it is seen on the configured number of consecutive runs', () => {
  const options = { now: t0, confirmRuns: 2, reminderHours: 6 };
  const first = planAlerts(undefined, { public_home: fail('home answered 502') }, options);
  assert.deepEqual(kinds(first), []);
  const second = planAlerts(first.nextState, { public_home: fail('home answered 502') }, { ...options, now: t0 + minutes(5) });
  assert.deepEqual(kinds(second), ['public_home:problem']);
  assert.equal(second.notifications[0].detail, 'home answered 502');
  assert.equal(second.notifications[0].since, new Date(t0).toISOString());
});

test('a one-run blip clears without any message', () => {
  const options = { now: t0, confirmRuns: 2 };
  const first = planAlerts(undefined, { public_home: fail('timeout') }, options);
  const second = planAlerts(first.nextState, { public_home: ok('200') }, { ...options, now: t0 + minutes(5) });
  assert.deepEqual(kinds(second), []);
});

test('checks configured for one run are announced on first sight', () => {
  const plan = planAlerts(undefined, { disk: fail('4 GB free') }, { now: t0, confirmRuns: 2, confirmOverrides: { disk: 1 } });
  assert.deepEqual(kinds(plan), ['disk:problem']);
});

test('an open problem is repeated only after the reminder interval, then clears with one recovered message', () => {
  const options = { confirmRuns: 1, reminderHours: 6 };
  let plan = planAlerts(undefined, { backup_freshness: fail('stale') }, { ...options, now: t0 });
  assert.deepEqual(kinds(plan), ['backup_freshness:problem']);
  plan = planAlerts(plan.nextState, { backup_freshness: fail('stale') }, { ...options, now: t0 + minutes(5 * 60 + 55) });
  assert.deepEqual(kinds(plan), []);
  plan = planAlerts(plan.nextState, { backup_freshness: fail('still stale') }, { ...options, now: t0 + minutes(6 * 60) });
  assert.deepEqual(kinds(plan), ['backup_freshness:reminder']);
  plan = planAlerts(plan.nextState, { backup_freshness: ok('fresh') }, { ...options, now: t0 + minutes(6 * 60 + 5) });
  assert.deepEqual(kinds(plan), ['backup_freshness:recovered']);
  plan = planAlerts(plan.nextState, { backup_freshness: ok('fresh') }, { ...options, now: t0 + minutes(6 * 60 + 10) });
  assert.deepEqual(kinds(plan), []);
});

test('a change between warning and failure is announced as a change, not a new problem', () => {
  const options = { confirmRuns: 1, reminderHours: 6 };
  let plan = planAlerts(undefined, { catalogue_sync: { level: 'warning', detail: '25 minutes' } }, { ...options, now: t0 });
  plan = planAlerts(plan.nextState, { catalogue_sync: fail('70 minutes') }, { ...options, now: t0 + minutes(45) });
  assert.deepEqual(kinds(plan), ['catalogue_sync:changed']);
  assert.equal(plan.notifications[0].level, 'failure');
});

test('undelivered messages are retried on the next run instead of being marked as sent', () => {
  const options = { confirmRuns: 1, reminderHours: 6 };
  const first = planAlerts(undefined, { disk: fail('4 GB free') }, { ...options, now: t0 });
  const kept = applyDelivery(undefined, first, false);
  const retry = planAlerts(kept, { disk: fail('4 GB free') }, { ...options, now: t0 + minutes(5) });
  assert.deepEqual(kinds(retry), ['disk:problem']);
  assert.equal(retry.notifications[0].since, new Date(t0).toISOString(), 'the problem keeps its original start');
  const sent = applyDelivery(kept, retry, true);
  const quiet = planAlerts(sent, { disk: fail('4 GB free') }, { ...options, now: t0 + minutes(10) });
  assert.deepEqual(kinds(quiet), []);
  const recovered = planAlerts(sent, { disk: ok('fine') }, { ...options, now: t0 + minutes(15) });
  const recoveredKept = applyDelivery(sent, recovered, false);
  assert.deepEqual(kinds(planAlerts(recoveredKept, { disk: ok('fine') }, { ...options, now: t0 + minutes(20) })), ['disk:recovered']);
});

test('the email lists new, changed, reminded and recovered problems with a summary subject', () => {
  const email = composeEmail([
    { key: 'public_home', kind: 'problem', level: 'failure', detail: 'home answered 502', since: '2026-11-12T03:00:00.000Z' },
    { key: 'disk', kind: 'reminder', level: 'failure', detail: '4.1 GB free (2.1%)', since: '2026-11-11T21:00:00.000Z' },
    { key: 'local_api', kind: 'recovered', level: 'ok', detail: 'health ok', since: '2026-11-12T02:40:00.000Z' },
  ], { now: t0, host: 'maple', openProblems: 2, okCount: 7 });
  assert.equal(email.subject, '[ShopMaple] 1 new problem, 1 still open, 1 recovered');
  assert.match(email.text, /NEW PROBLEMS\n- public_home \(failure\): home answered 502/);
  assert.match(email.text, /STILL OPEN \(reminder\)\n- disk \(failure, open since 2026-11-11 21:00 UTC\): 4\.1 GB free/);
  assert.match(email.text, /RECOVERED\n- local_api: health ok \(was open since 2026-11-12 02:40 UTC\)/);
  assert.match(email.text, /Host: maple/);
  assert.match(email.text, /docs\/operations-monitoring\.md/);
});

test('secret values from the environment and secret-looking strings never reach a message', () => {
  const env = { ORDER_RESEND_API_KEY: 're_live_value_123456', RAZORPAY_KEY_SECRET: 'abcSecretValue987', DATABASE_URL: 'postgresql://u:p@127.0.0.1:55440/shopmaple_store', SITE_URL: 'https://shop.maplefurnishers.com' };
  const text = redact('key re_live_value_123456 secret abcSecretValue987 db postgresql://u:p@127.0.0.1:55440/shopmaple_store live rzp_live_AbCdEf123 bearer Bearer xyz.abc site https://shop.maplefurnishers.com/', env);
  for (const secret of ['re_live_value_123456', 'abcSecretValue987', 'postgresql://u:p@', 'rzp_live_AbCdEf123', 'xyz.abc']) assert.equal(text.includes(secret), false, secret);
  assert.match(text, /https:\/\/shop\.maplefurnishers\.com\//, 'ordinary addresses stay readable');
  const path = '/home/deploy/shopmaple/ops/tools/ops/run-restore-drill.sh';
  assert.equal(redact(`run ${path}`, env), `run ${path}`, 'long file paths stay readable');
});

test('alert configuration accepts plain addresses only and needs a key unless dry-running', () => {
  const base = { ALERT_MAIL_TO: 'owner@example.com, ops@example.com', ORDER_RESEND_API_KEY: 're_x' };
  const config = parseAlertConfig(base);
  assert.deepEqual(config.to, ['owner@example.com', 'ops@example.com']);
  assert.equal(config.from, 'no-reply@maplefurnishers.com');
  assert.equal(config.reminderHours, 6);
  assert.throws(() => parseAlertConfig({ ...base, ALERT_MAIL_FROM: 'Maple <no-reply@maplefurnishers.com>' }), /ALERT_MAIL_FROM/);
  assert.throws(() => parseAlertConfig({ ...base, ALERT_MAIL_TO: 'not an address' }), /ALERT_MAIL_TO/);
  assert.throws(() => parseAlertConfig({ ALERT_MAIL_TO: 'owner@example.com' }), /RESEND/);
  assert.equal(parseAlertConfig({ ALERT_MAIL_TO: 'owner@example.com' }, { dryRun: true }).dryRun, true);
  assert.equal(parseAlertConfig({ ...base, ALERT_RESEND_API_KEY: 're_alert' }).apiKey, 're_alert');
  assert.throws(() => parseAlertConfig({ ...base, ALERT_REMINDER_HOURS: '0' }), /ALERT_REMINDER_HOURS/);
});

test('sending posts one Resend email with an idempotency key and hides the provider response on failure', async t => {
  const seen = [];
  let answer = 200;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; }).on('end', () => {
      seen.push({ url: req.url, method: req.method, headers: req.headers, body: JSON.parse(body) });
      res.writeHead(answer, { 'content-type': 'application/json' }).end(answer === 200 ? '{"id":"email_1"}' : '{"message":"PROVIDER_SECRET_DETAIL"}');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/emails`;
  const config = { to: ['owner@example.com'], from: 'no-reply@maplefurnishers.com', apiKey: 're_key', endpoint };
  await sendEmail(config, { subject: 'S', text: 'T' }, { idempotencyKey: 'shopmaple-alert-1' });
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers.authorization, 'Bearer re_key');
  assert.equal(seen[0].headers['idempotency-key'], 'shopmaple-alert-1');
  assert.deepEqual(seen[0].body, { from: 'no-reply@maplefurnishers.com', to: ['owner@example.com'], subject: 'S', text: 'T' });
  answer = 422;
  await assert.rejects(sendEmail(config, { subject: 'S', text: 'T' }, { idempotencyKey: 'k2' }), error => /422/.test(error.message) && !error.message.includes('PROVIDER_SECRET_DETAIL'));
});

test('state is written privately and atomically and read back', t => {
  const dir = mkdtempSync(join(tmpdir(), 'alert-state-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'state', 'monitor.json');
  assert.equal(readState(path), undefined);
  writeState(path, { checks: { disk: { level: 'ok' } } });
  assert.deepEqual(readState(path), { checks: { disk: { level: 'ok' } } });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  writeFileSync(path, '{broken');
  assert.throws(() => readState(path), /unreadable/);
  assert.equal(readFileSync(path, 'utf8'), '{broken', 'a corrupt state file is left for inspection');
});
