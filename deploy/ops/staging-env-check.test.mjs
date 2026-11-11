import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStagingEnv } from './staging-env-check.mjs';

const production = {
  DATABASE_URL: 'postgresql://shopmaple_store:prodpw@127.0.0.1:55440/shopmaple_store', RAZORPAY_KEY_ID: 'rzp_live_PROD', RAZORPAY_KEY_SECRET: 'prod-secret',
  RAZORPAY_WEBHOOK_SECRET: 'prod-hook', KEERI_COMMERCE_TOKEN: 'prod-commerce', KEERI_MERCHANT_SCOPE: 'maple', ORDER_MAIL_TO: 'orders@maplefurnishers.com',
  ADMIN_PREVIEW_SECRET: 'p'.repeat(40),
};
const good = {
  DATABASE_URL: 'postgresql://shopmaple_staging:stagepw@127.0.0.1:55441/shopmaple_staging', API_PORT: '4120', API_HOST: '127.0.0.1', API_URL: 'http://127.0.0.1:4120',
  WEB_ORIGIN: 'https://staging.maplefurnishers.com', SITE_URL: 'https://staging.maplefurnishers.com', SEO_INDEXING: 'off', NODE_ENV: 'production', CATALOG_MODE: 'preview',
  SHOP_MEDIA_ROOT: '/home/deploy/shopmaple-staging/shared/media', KEERI_LEADS_ENABLED: 'false', CHECKOUT_ENABLED: 'false', ADMIN_PREVIEW_SECRET: 's'.repeat(40),
};

test('the template-shaped staging environment passes', () => {
  assert.deepEqual(checkStagingEnv(good, production), []);
});

test('anything that could reach the live database, search engines, Keeri leads or live payments is refused', () => {
  const problems = checkStagingEnv({ ...good, DATABASE_URL: production.DATABASE_URL, SEO_INDEXING: 'on', KEERI_LEADS_ENABLED: 'true', RAZORPAY_KEY_ID: 'rzp_live_X', API_PORT: '4110', SHOP_MEDIA_ROOT: '/home/deploy/shopmaple/shared/media', KEERI_REVIEWS_TOKEN: 't', INSTAGRAM_ACCESS_TOKEN: 'i' }, production);
  for (const key of ['DATABASE_URL', 'SEO_INDEXING', 'KEERI_LEADS_ENABLED', 'RAZORPAY_KEY_ID', 'API_PORT', 'SHOP_MEDIA_ROOT', 'KEERI_REVIEWS_TOKEN', 'INSTAGRAM_ACCESS_TOKEN']) {
    assert.ok(problems.some(p => p.startsWith(`${key}:`)), `${key} not reported: ${problems.join(' | ')}`);
  }
});

test('copied production secrets and mail recipients are refused, by name only', () => {
  const problems = checkStagingEnv({ ...good, RAZORPAY_KEY_SECRET: 'prod-secret', ORDER_MAIL_TO: 'orders@maplefurnishers.com', ADMIN_PREVIEW_SECRET: production.ADMIN_PREVIEW_SECRET }, production);
  assert.ok(problems.some(p => p.startsWith('RAZORPAY_KEY_SECRET:')));
  assert.ok(problems.some(p => p.startsWith('ORDER_MAIL_TO:')));
  assert.ok(problems.some(p => p.startsWith('ADMIN_PREVIEW_SECRET:')));
  assert.equal(problems.join('\n').includes('prod-secret'), false, 'values are never printed');
});

test('staging checkout needs test keys and its own Keeri merchant scope and credential', () => {
  const base = { ...good, CHECKOUT_ENABLED: 'true', RAZORPAY_KEY_ID: 'rzp_test_X', RAZORPAY_KEY_SECRET: 'test-secret', RAZORPAY_WEBHOOK_SECRET: 'test-hook' };
  const same = checkStagingEnv({ ...base, KEERI_MERCHANT_SCOPE: 'maple', KEERI_COMMERCE_TOKEN: 'prod-commerce' }, production);
  assert.ok(same.some(p => p.startsWith('KEERI_MERCHANT_SCOPE:')));
  assert.ok(same.some(p => p.startsWith('KEERI_COMMERCE_TOKEN:')));
  assert.deepEqual(checkStagingEnv({ ...base, KEERI_MERCHANT_SCOPE: 'maple-staging', KEERI_COMMERCE_TOKEN: 'staging-commerce' }, production), []);
});

test('the command exits non-zero and lists only key names', t => {
  const dir = mkdtempSync(join(tmpdir(), 'staging-env-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = text => Object.entries(text).map(([k, v]) => `${k}=${v}`).join('\n');
  writeFileSync(join(dir, 'staging.env'), env({ ...good, RAZORPAY_KEY_SECRET: 'prod-secret' }));
  writeFileSync(join(dir, 'store.env'), env(production));
  const bad = spawnSync(process.execPath, [new URL('./staging-env-check.mjs', import.meta.url).pathname, join(dir, 'staging.env'), join(dir, 'store.env')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /RAZORPAY_KEY_SECRET/);
  assert.equal(bad.stderr.includes('prod-secret'), false);
  writeFileSync(join(dir, 'staging.env'), env(good));
  const fine = spawnSync(process.execPath, [new URL('./staging-env-check.mjs', import.meta.url).pathname, join(dir, 'staging.env'), join(dir, 'store.env')], { encoding: 'utf8' });
  assert.equal(fine.status, 0, fine.stderr);
});
