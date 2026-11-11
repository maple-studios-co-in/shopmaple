// Alert de-duplication and delivery shared by the store monitor (and anything that reports through it).
// One message per new problem, a reminder every N hours while it lasts, one "recovered" message when it clears.
// Messages are built from fixed templates and then passed through redact(), so no secret reaches an inbox.
import { closeSync, constants, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DOCS = 'docs/operations-monitoring.md';
// The same shape the store's z.email() sender check accepts: a plain address, no display name.
const plainAddress = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const problem = level => level === 'warning' || level === 'failure';
const iso = ms => new Date(ms).toISOString();
const readable = value => (value ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC` : 'unknown');

function integerSetting(env, name, fallback, min, max) {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  return value;
}

export function parseAlertConfig(env, { dryRun = false } = {}) {
  const to = (env.ALERT_MAIL_TO ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!to.length || to.length > 5 || !to.every(address => plainAddress.test(address))) throw new Error('ALERT_MAIL_TO must hold one to five plain email addresses, comma-separated.');
  const from = (env.ALERT_MAIL_FROM ?? 'no-reply@maplefurnishers.com').trim();
  if (!plainAddress.test(from)) throw new Error('ALERT_MAIL_FROM must be a plain email address, without a display name.');
  const apiKey = (env.ALERT_RESEND_API_KEY || env.ORDER_RESEND_API_KEY || env.ENQUIRY_RESEND_API_KEY || '').trim();
  const dry = dryRun || env.ALERT_DRY_RUN === '1';
  if (!apiKey && !dry) throw new Error('A Resend key is needed: ORDER_RESEND_API_KEY from store.env, or ALERT_RESEND_API_KEY.');
  return {
    to, from, apiKey, dryRun: dry, endpoint: RESEND_ENDPOINT,
    reminderHours: integerSetting(env, 'ALERT_REMINDER_HOURS', 6, 1, 168),
    confirmRuns: integerSetting(env, 'ALERT_CONFIRM_RUNS', 2, 1, 12),
  };
}

/**
 * previous: { checks: { [key]: { level, detail, since, consecutive, alertedAt, alertedLevel } } } or undefined.
 * results:  { [key]: { level: 'ok' | 'warning' | 'failure', detail } }.
 * Returns the messages due now and the state to keep if they are delivered.
 */
export function planAlerts(previous, results, { now, reminderHours = 6, confirmRuns = 2, confirmOverrides = {} }) {
  const before = previous?.checks ?? {};
  const checks = {}, notifications = [];
  for (const [key, result] of Object.entries(results)) {
    const prev = before[key];
    if (!problem(result.level)) {
      if (prev?.alertedAt) notifications.push({ key, kind: 'recovered', level: 'ok', detail: result.detail, since: prev.since });
      checks[key] = { level: 'ok', detail: result.detail };
      continue;
    }
    const continuing = prev && problem(prev.level);
    const entry = {
      level: result.level, detail: result.detail,
      since: continuing ? prev.since : iso(now),
      consecutive: continuing ? (prev.consecutive ?? 1) + 1 : 1,
      alertedAt: continuing ? prev.alertedAt : undefined,
      alertedLevel: continuing ? prev.alertedLevel : undefined,
    };
    let kind;
    if (!entry.alertedAt) { if (entry.consecutive >= (confirmOverrides[key] ?? confirmRuns)) kind = 'problem'; }
    else if (entry.alertedLevel !== entry.level) kind = 'changed';
    else if (now - Date.parse(entry.alertedAt) >= reminderHours * 3_600_000) kind = 'reminder';
    if (kind) {
      notifications.push({ key, kind, level: entry.level, detail: entry.detail, since: entry.since });
      entry.alertedAt = iso(now); entry.alertedLevel = entry.level;
    }
    checks[key] = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
  }
  return { notifications, nextState: { checks } };
}

/** The state to persist: a plan's state once its messages went out, otherwise one that sends them again next run. */
export function applyDelivery(previous, plan, delivered) {
  if (delivered || !plan.notifications.length) return plan.nextState;
  const checks = { ...plan.nextState.checks };
  const before = previous?.checks ?? {};
  for (const { key, kind } of plan.notifications) {
    if (kind === 'recovered') { checks[key] = before[key]; continue; }
    const entry = { ...checks[key] };
    if (before[key]?.alertedAt && problem(before[key].level)) { entry.alertedAt = before[key].alertedAt; entry.alertedLevel = before[key].alertedLevel; }
    else { delete entry.alertedAt; delete entry.alertedLevel; }
    checks[key] = entry;
  }
  return { checks };
}

export function composeEmail(notifications, { now, host, openProblems = 0, okCount = 0 }) {
  const group = kinds => notifications.filter(n => kinds.includes(n.kind));
  const fresh = group(['problem']), changed = group(['changed']), reminders = group(['reminder']), recovered = group(['recovered']);
  const parts = [];
  if (fresh.length) parts.push(`${fresh.length} new problem${fresh.length === 1 ? '' : 's'}`);
  if (changed.length) parts.push(`${changed.length} changed`);
  if (reminders.length) parts.push(`${reminders.length} still open`);
  if (recovered.length) parts.push(`${recovered.length} recovered`);
  const lines = [`ShopMaple store monitor, ${readable(iso(now))}`, `Host: ${host}`, ''];
  const section = (title, items, render) => { if (items.length) lines.push(title, ...items.map(render), ''); };
  section('NEW PROBLEMS', fresh, n => `- ${n.key} (${n.level}): ${n.detail}`);
  section('CHANGED', changed, n => `- ${n.key} (now ${n.level}, open since ${readable(n.since)}): ${n.detail}`);
  section('STILL OPEN (reminder)', reminders, n => `- ${n.key} (${n.level}, open since ${readable(n.since)}): ${n.detail}`);
  section('RECOVERED', recovered, n => `- ${n.key}: ${n.detail} (was open since ${readable(n.since)})`);
  lines.push(`Open problems now: ${openProblems}. Checks passing: ${okCount}.`);
  lines.push(`What each check means and what to do: ${DOCS} in the shopmaple repository.`);
  lines.push('You get one message per problem, a reminder while it lasts, and one message when it clears.');
  return { subject: `[ShopMaple] ${parts.join(', ') || 'no changes'}`, text: lines.join('\n') };
}

const secretName = /(KEY|SECRET|TOKEN|PASSWORD|PASS|DATABASE_URL|CIPHER)/i;
export function redact(text, env = {}) {
  let out = String(text);
  const values = Object.entries(env).filter(([name, value]) => secretName.test(name) && typeof value === 'string' && value.trim().length >= 6).map(([, value]) => value.trim());
  for (const value of values.sort((a, b) => b.length - a.length)) out = out.split(value).join('[redacted]');
  return out
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@\S+/gi, '[redacted-url]')
    .replace(/\brzp_(live|test)_[A-Za-z0-9]+/g, 'rzp_$1_[redacted]')
    .replace(/\bre_[A-Za-z0-9_]{8,}/g, '[redacted]')
    .replace(/\bBearer(\s+Bearer)*\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(password|secret|token|api[_-]?key)(\s*[=:]\s*)\S+/gi, '$1$2[redacted]')
    // Long opaque tokens; '/' is left out so file paths stay readable (configured secrets are removed by value above).
    .replace(/[A-Za-z0-9+_=-]{48,}/g, '[redacted]');
}

export async function sendEmail(config, { subject, text }, { idempotencyKey, fetcher = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const response = await fetcher(config.endpoint ?? RESEND_ENDPOINT, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ from: config.from, to: config.to, subject, text }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  // The provider's body can echo request details; only the status is reported.
  await response.body?.cancel().catch(() => {});
  if (!response.ok) throw new Error(`Alert email was refused (HTTP ${response.status}).`);
}

export function readState(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return undefined; throw new Error('Monitor state unreadable.'); }
  try { return JSON.parse(text); } catch { throw new Error('Monitor state unreadable; inspect or move the file aside.'); }
}

export function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const bytes = Buffer.from(`${JSON.stringify(state)}\n`);
    let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } catch (error) { closeSync(fd); rmSync(temporary, { force: true }); throw error; }
  closeSync(fd);
  renameSync(temporary, path);
}
