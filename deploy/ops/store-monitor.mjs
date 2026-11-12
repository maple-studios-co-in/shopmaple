#!/usr/bin/env node
// ShopMaple store monitor: run every 5 minutes by cron (deploy/ops/run-monitor.sh). Checks the public store, the local
// API and web processes, the catalogue sync, the payment webhook route, disk, backups, the restore drill and PM2, then
// emails changes through Resend (deploy/ops/alerts.mjs). See docs/operations-monitoring.md.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync, realpathSync, statfsSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDelivery, composeEmail, parseAlertConfig, planAlerts, readState, redact, sendEmail, writeState } from './alerts.mjs';
import { listCompletePairs } from './backups.mjs';

const OPS_STATE = '/home/deploy/shopmaple/ops/state';
const USER_AGENT = 'shopmaple-monitor/1';
const ok = detail => ({ level: 'ok', detail });
const warning = detail => ({ level: 'warning', detail });
const failure = detail => ({ level: 'failure', detail });
const minutesSince = (now, at) => Math.round((now - Date.parse(at)) / 60_000);
function ageText(ms) {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(0, Math.round(ms / 60_000))} minutes`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.floor(hours / 24)} days`;
}
// Network surfaces must fail twice in a row (5-10 minutes) before an email; state on this host is reported at once.
const confirmOverrides = { disk: 1, backup_freshness: 1, catalogue_sync: 1, restore_drill: 1, pm2: 1 };

export function evaluateHealth(status, text, { expectCheckout }) {
  if (status !== 200) return failure(`health answered HTTP ${status}`);
  let body;
  try { body = JSON.parse(text); } catch { return failure('health answered something other than JSON'); }
  if (body?.status !== 'ok') return failure('health did not report status ok');
  if (expectCheckout && body.checkoutEnabled !== true) return failure('health says online checkout is switched off (checkoutEnabled is not true)');
  return ok(`status ok, checkout ${body.checkoutEnabled ? 'on' : 'off'}`);
}

export function evaluateDisk({ freeBytes, totalBytes }, { minFreePercent, minFreeGb }) {
  const gb = freeBytes / 1024 ** 3, percent = (freeBytes / totalBytes) * 100;
  const text = `${gb.toFixed(1)} GB free (${percent.toFixed(1)}%)`;
  if (percent < minFreePercent || gb < minFreeGb) return failure(`${text}; the limit is ${minFreePercent}% and ${minFreeGb} GB`);
  return ok(text);
}

export function evaluateCatalogueSync(status, now, { warnMinutes, failMinutes }) {
  if (!status) return warning('no catalogue sync status recorded; set CATALOGUE_SYNC_STATUS_FILE in store.env (docs/operations-monitoring.md)');
  const sinceAttempt = minutesSince(now, status.at);
  if (!Number.isFinite(sinceAttempt) || sinceAttempt > failMinutes) return failure(`catalogue sync has not run for ${sinceAttempt} minutes (check its cron entry and lock file)`);
  const reason = status.ok ? '' : `last attempt failed with ${status.reason ?? 'UNEXPECTED'}${status.consecutiveFailures ? ` (${status.consecutiveFailures} runs in a row)` : ''}`;
  if (!status.lastSuccessAt) return failure(`catalogue sync has not succeeded since status recording began; ${reason || 'no success recorded'}`);
  const sinceSuccess = minutesSince(now, status.lastSuccessAt);
  const text = `last successful sync ${sinceSuccess} minutes ago${reason ? `; ${reason}` : ''}`;
  if (sinceSuccess > failMinutes) return failure(`${text}. The store keeps showing the previous catalogue.`);
  if (sinceSuccess > warnMinutes) return warning(text);
  return ok(text);
}

export function evaluateBackup(latest, run, now, { maxAgeHours }) {
  const runText = !run ? 'the nightly backup run has not reported yet (is the new backup cron installed?)'
    : run.ok ? `last nightly run succeeded ${ageText(now - Date.parse(run.at))} ago`
      : `last nightly run failed with ${run.reason ?? 'UNEXPECTED'} ${ageText(now - Date.parse(run.at))} ago`;
  if (!latest) return failure(`no complete backup found; ${runText}`);
  const age = now - latest.completedAt;
  if (age > maxAgeHours * 3_600_000) return failure(`last complete backup was ${ageText(age)} ago (completed ${new Date(latest.completedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC); ${runText}`);
  if (run && !run.ok && Date.parse(run.at) > latest.completedAt) return warning(`${runText}; the last complete backup is ${ageText(age)} old`);
  return ok(`last complete backup ${ageText(age)} ago`);
}

export function evaluatePm2(list, history = {}, now, { apps, restartWarn, windowMinutes = 60 }) {
  const problems = [], warnings = [], nextHistory = {};
  for (const name of apps) {
    const proc = list.find(p => p.name === name);
    if (!proc) { problems.push(`${name} is missing`); continue; }
    if (proc.status !== 'online') problems.push(`${name} is ${proc.status}`);
    const earlier = (history[name] ?? []).filter(h => now - h.at <= windowMinutes * 60_000 && h.restarts <= proc.restarts);
    const lowest = Math.min(proc.restarts, ...earlier.map(h => h.restarts));
    if (proc.restarts - lowest >= restartWarn) warnings.push(`${name} restarted ${proc.restarts - lowest} times in the last hour`);
    nextHistory[name] = [...earlier, { at: now, restarts: proc.restarts }].slice(-24);
  }
  const result = problems.length ? failure([...problems, ...warnings].join('; '))
    : warnings.length ? warning(`${warnings.join('; ')} (memory limit or crash; see pm2 logs)`)
      : ok(`${apps.length} processes online`);
  return { result, history: nextHistory };
}

export function evaluateWebhook(status, error) {
  if (error) return failure(`payment webhook probe failed: ${error}`);
  if ([400, 401, 415].includes(status)) return ok(`payment webhook route reachable (unsigned probe refused with ${status})`);
  if (status === 404) return failure('payment webhook route is not registered: online checkout is off or the route moved; Razorpay payments would not be confirmed');
  return failure(`payment webhook answered HTTP ${status}`);
}

export function evaluateDrill(drill, now, { maxAgeDays }) {
  if (!drill) return warning('no restore drill recorded yet; run /home/deploy/shopmaple/ops/tools/ops/run-restore-drill.sh');
  const when = drill.at ? `${drill.at.slice(0, 10)}` : 'unknown date';
  if (!drill.ok) return failure(`restore drill on ${when} failed: ${(drill.problems ?? ['unknown']).slice(0, 5).join('; ')}`);
  const age = now - Date.parse(drill.at);
  if (!(age <= maxAgeDays * 86_400_000)) return warning(`last successful restore drill was ${ageText(age)} ago`);
  return ok(`restore drill passed ${ageText(age)} ago`);
}

function number(env, name, fallback, min, max) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return value;
}
function origin(env, name, fallback) {
  const url = new URL(env[name] || fallback);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${name} must be a plain http(s) origin.`);
  return url.origin;
}
export function monitorConfig(env) {
  const stateDir = env.MONITOR_STATE_DIR || OPS_STATE;
  return {
    publicOrigin: origin(env, 'MONITOR_PUBLIC_ORIGIN', 'https://shop.maplefurnishers.com'),
    localApi: origin(env, 'MONITOR_LOCAL_API', 'http://127.0.0.1:4110'),
    localWeb: origin(env, 'MONITOR_LOCAL_WEB', 'http://127.0.0.1:3110'),
    expectCheckout: (env.MONITOR_EXPECT_CHECKOUT ?? 'true') !== 'false',
    backupRoot: env.MONITOR_BACKUP_ROOT || '/home/deploy/shopmaple/backups',
    diskPath: env.MONITOR_DISK_PATH || '/home/deploy',
    stateFile: join(stateDir, 'monitor.json'),
    catalogueStatusFile: env.CATALOGUE_SYNC_STATUS_FILE || undefined,
    backupStatusFile: env.MONITOR_BACKUP_STATUS_FILE || join(stateDir, 'backup-last.json'),
    drillStatusFile: env.MONITOR_DRILL_STATUS_FILE || join(stateDir, 'restore-drill.json'),
    pm2Apps: (env.MONITOR_PM2_APPS || 'shopmaple-api,shopmaple-web,shopmaple-db').split(',').map(s => s.trim()).filter(Boolean),
    disk: { minFreePercent: number(env, 'MONITOR_DISK_MIN_FREE_PERCENT', 10, 1, 90), minFreeGb: number(env, 'MONITOR_DISK_MIN_FREE_GB', 5, 1, 1000) },
    backupMaxAgeHours: number(env, 'MONITOR_BACKUP_MAX_AGE_HOURS', 26, 2, 24 * 14),
    sync: { warnMinutes: number(env, 'MONITOR_SYNC_WARN_MINUTES', 20, 6, 1440), failMinutes: number(env, 'MONITOR_SYNC_FAIL_MINUTES', 60, 10, 2880) },
    restartWarn: number(env, 'MONITOR_RESTART_WARN', 3, 1, 100),
    drillMaxAgeDays: number(env, 'MONITOR_DRILL_MAX_AGE_DAYS', 8, 1, 60),
  };
}

async function probe(url, { method = 'GET', body, headers = {}, timeoutMs, redirect = 'follow' }) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method, body, redirect, headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    const text = (await response.text()).slice(0, 1024 * 1024);
    return { status: response.status, text, ms: Date.now() - started };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? `no answer within ${Math.round(timeoutMs / 1000)} s` : 'connection failed', ms: Date.now() - started };
  }
}
const page = async (url, label, timeoutMs) => {
  const r = await probe(url, { timeoutMs });
  if (r.error) return failure(`${label} ${r.error}`);
  return r.status === 200 ? ok(`${label} answered 200 in ${r.ms} ms`) : failure(`${label} answered HTTP ${r.status}`);
};
function readJson(path) {
  if (!path) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
export function pm2ListFromCli(bin = '/usr/bin/pm2') {
  // `pm2 jlist` includes every process's environment (secrets). It is parsed here and never printed or stored.
  return new Promise((resolve, reject) => execFile(bin, ['jlist'], { timeout: 20_000, maxBuffer: 64 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '/home/deploy' } }, (error, stdout) => {
    if (error) return reject(new Error('pm2 jlist failed'));
    try { resolve(JSON.parse(stdout).map(p => ({ name: p.name, status: p.pm2_env?.status, restarts: Number(p.pm2_env?.restart_time ?? 0) }))); }
    catch { reject(new Error('pm2 jlist was not JSON')); }
  }));
}
function statfsFree(path) { const s = statfsSync(path); return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }; }

export async function runMonitor(env = process.env, deps = {}) {
  const now = (deps.now ?? Date.now)();
  const dryRun = Boolean(deps.dryRun);
  const timeoutMs = deps.timeoutMs ?? 15_000;
  const config = monitorConfig(env);
  const alertConfig = { ...parseAlertConfig(env, { dryRun }), ...(deps.mailEndpoint ? { endpoint: deps.mailEndpoint } : {}) };
  let previous;
  try { previous = readState(config.stateFile); } catch { previous = undefined; deps.print?.('Monitor state was unreadable; starting from a clean state.'); }
  let pm2History = previous?.pm2History;
  const checks = {
    public_home: () => page(`${config.publicOrigin}/`, 'home page', timeoutMs),
    public_health: async () => { const r = await probe(`${config.publicOrigin}/api/health`, { timeoutMs }); return r.error ? failure(`public health ${r.error}`) : evaluateHealth(r.status, r.text, config); },
    public_product: async () => {
      const list = await probe(`${config.publicOrigin}/api/products?limit=1`, { timeoutMs });
      if (list.error || list.status !== 200) return failure(`product list ${list.error ?? `answered HTTP ${list.status}`}`);
      const handle = JSON.parse(list.text)?.products?.[0]?.handle;
      if (!handle) return failure('the public product list is empty');
      if (!/^[a-z0-9][a-z0-9-]{0,200}$/.test(handle)) return failure('the first product has an unexpected address');
      return page(`${config.publicOrigin}/products/${handle}`, `product page /products/${handle}`, timeoutMs);
    },
    local_api: async () => { const r = await probe(`${config.localApi}/api/health`, { timeoutMs }); return r.error ? failure(`local API (shopmaple-api) ${r.error}`) : evaluateHealth(r.status, r.text, config); },
    local_web: () => page(`${config.localWeb}/`, 'local web (shopmaple-web)', timeoutMs),
    razorpay_webhook: async () => {
      // An unsigned, empty JSON body is refused by validation before anything is stored or any payment call is made.
      const r = await probe(`${config.publicOrigin}/api/webhooks/razorpay`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, timeoutMs, redirect: 'manual' });
      return evaluateWebhook(r.status, r.error);
    },
    disk: () => evaluateDisk((deps.statfs ?? statfsFree)(config.diskPath), config.disk),
    backup_freshness: () => evaluateBackup(listCompletePairs(config.backupRoot)[0], readJson(config.backupStatusFile), now, { maxAgeHours: config.backupMaxAgeHours }),
    catalogue_sync: () => evaluateCatalogueSync(readJson(config.catalogueStatusFile), now, config.sync),
    pm2: async () => {
      const list = await (deps.pm2List ?? (() => pm2ListFromCli(env.PM2_BIN || '/usr/bin/pm2')))();
      const evaluated = evaluatePm2(list, previous?.pm2History, now, { apps: config.pm2Apps, restartWarn: config.restartWarn });
      pm2History = evaluated.history;
      return evaluated.result;
    },
    restore_drill: () => evaluateDrill(readJson(config.drillStatusFile), now, { maxAgeDays: config.drillMaxAgeDays }),
  };
  const entries = await Promise.all(Object.entries(checks).map(async ([key, check]) => {
    try { return [key, await check()]; } catch { return [key, failure('the check itself could not complete (see the monitor log)')]; }
  }));
  const results = Object.fromEntries(entries.map(([key, result]) => [key, { level: result.level, detail: redact(result.detail, env) }]));
  const plan = planAlerts(previous, results, { now, reminderHours: alertConfig.reminderHours, confirmRuns: alertConfig.confirmRuns, confirmOverrides });
  const openProblems = Object.values(results).filter(r => r.level !== 'ok').length;
  const composed = plan.notifications.length ? composeEmail(plan.notifications, { now, host: deps.host ?? hostname(), openProblems, okCount: Object.keys(results).length - openProblems }) : undefined;
  const email = composed && { subject: redact(composed.subject, env), text: redact(composed.text, env) };
  if (dryRun) {
    deps.print?.(Object.entries(results).map(([key, r]) => `${key}: ${r.level} - ${r.detail}`).join('\n'));
    deps.print?.(email ? `\nWould email ${alertConfig.to.join(', ')}:\nSubject: ${email.subject}\n\n${email.text}` : '\nNo email would be sent on this run.');
    return { results, notifications: plan.notifications, email, delivered: false };
  }
  let delivered = !email;
  if (email) {
    const idempotencyKey = `shopmaple-monitor-${createHash('sha256').update(`${now}\n${email.subject}\n${email.text}`).digest('hex').slice(0, 32)}`;
    try { await sendEmail(alertConfig, email, { idempotencyKey }); delivered = true; } catch { delivered = false; }
  }
  writeState(config.stateFile, { ...applyDelivery(previous, plan, delivered), pm2History, lastRunAt: new Date(now).toISOString() });
  return { results, notifications: plan.notifications, email, delivered };
}

export async function sendTestAlert(env = process.env, deps = {}) {
  const alertConfig = { ...parseAlertConfig(env), ...(deps.mailEndpoint ? { endpoint: deps.mailEndpoint } : {}) };
  const at = new Date((deps.now ?? Date.now)()).toISOString();
  await sendEmail(alertConfig, { subject: '[ShopMaple] Test alert', text: `This is a test message from the ShopMaple store monitor on ${deps.host ?? hostname()} at ${at}.\nIf you can read it, alert email works.` }, { idempotencyKey: `shopmaple-test-${at}` });
  return alertConfig.to;
}

let entryPath;
try { if (process.argv[1]) entryPath = realpathSync(process.argv[1]); } catch { /* imported as a library */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const print = text => console.log(text);
  if ([...args].some(a => !['--dry-run', '--test-alert'].includes(a))) { console.error('Usage: store-monitor.mjs [--dry-run | --test-alert]'); process.exit(2); }
  if (args.has('--test-alert')) {
    sendTestAlert().then(to => console.log(`Test alert sent to ${to.length} address(es).`)).catch(error => { console.error(`Test alert failed: ${redact(error.message, process.env)}`); process.exitCode = 1; });
  } else {
    runMonitor(process.env, { dryRun: args.has('--dry-run'), print }).then(({ results, email, delivered }) => {
      const summary = Object.entries(results).map(([key, r]) => `${key}=${r.level}`).join(' ');
      console.log(`${new Date().toISOString()} ${summary}${email ? (args.has('--dry-run') ? ' alert=dry-run' : delivered ? ' alert=sent' : ' alert=DELIVERY-FAILED') : ''}`);
      if (Object.values(results).some(r => r.level === 'failure')) process.exitCode = 1;
    }).catch(error => { console.error(`Store monitor could not run: ${redact(error.message, process.env)}`); process.exitCode = 2; });
  }
}
