#!/usr/bin/env node
// Checks /home/deploy/shopmaple-staging/shared/staging.env before staging starts or is rebuilt: it must point only at the
// staging database, ports and media, stay out of search engines, send nothing to Keeri leads, take no live payments and
// share no secret or mail recipient with production (store.env). Problems name keys only, never values.
import { readFileSync, realpathSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const STAGING_ORIGIN = 'https://staging.maplefurnishers.com';
const must = (env, key, expected, problems) => { if (env[key] !== expected) problems.push(`${key}: must be ${expected}`); };
const differs = ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'KEERI_COMMERCE_TOKEN', 'ADMIN_PREVIEW_SECRET', 'ACCOUNT_CODE_SECRET', 'ORDER_MAIL_TO', 'ENQUIRY_MAIL_TO', 'DATABASE_URL'];

export function checkStagingEnv(env, production = {}) {
  const problems = [];
  let db;
  try { db = new URL(env.DATABASE_URL); } catch { db = undefined; }
  if (!db || db.hostname !== '127.0.0.1' || db.port !== '55441' || db.pathname !== '/shopmaple_staging') problems.push('DATABASE_URL: must be the staging cluster (127.0.0.1:55441/shopmaple_staging)');
  must(env, 'API_PORT', '4120', problems);
  must(env, 'API_HOST', '127.0.0.1', problems);
  must(env, 'API_URL', 'http://127.0.0.1:4120', problems);
  must(env, 'WEB_ORIGIN', STAGING_ORIGIN, problems);
  must(env, 'SITE_URL', STAGING_ORIGIN, problems);
  must(env, 'NODE_ENV', 'production', problems);
  must(env, 'CATALOG_MODE', 'preview', problems);
  must(env, 'SHOP_MEDIA_ROOT', '/home/deploy/shopmaple-staging/shared/media', problems);
  if (env.SITE_ALIASES) problems.push('SITE_ALIASES: must be unset on staging');
  if (env.SEO_INDEXING === 'on') problems.push('SEO_INDEXING: must not be on (staging must stay out of search engines)');
  if (env.KEERI_LEADS_ENABLED === 'true') problems.push('KEERI_LEADS_ENABLED: must not be true (staging enquiries would become real Keeri leads)');
  for (const key of ['KEERI_REVIEWS_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID', 'META_APP_ID', 'META_APP_SECRET', 'SHOPIFY_CATALOGUE_FILE']) {
    if (env[key]) problems.push(`${key}: must be unset on staging (it would act on live services)`);
  }
  if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) problems.push('RAZORPAY_KEY_ID: must be a Razorpay TEST key (rzp_test_...)');
  for (const key of differs) {
    if (env[key] && production[key] && env[key].trim() === production[key].trim()) problems.push(`${key}: must not be the production value`);
  }
  for (const key of ['ORDER_MAIL_TO', 'ENQUIRY_MAIL_TO']) {
    if (env[key] && env[key].includes(',')) problems.push(`${key}: use one test inbox on staging`);
  }
  if (env.CHECKOUT_ENABLED === 'true') {
    if (!env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) problems.push('CHECKOUT_ENABLED: staging checkout needs Razorpay TEST keys');
    if (!env.KEERI_MERCHANT_SCOPE || env.KEERI_MERCHANT_SCOPE === production.KEERI_MERCHANT_SCOPE) problems.push('KEERI_MERCHANT_SCOPE: staging checkout needs its own Keeri merchant scope (orders would otherwise reserve live stock)');
    if (!env.KEERI_COMMERCE_TOKEN) problems.push('KEERI_COMMERCE_TOKEN: staging checkout needs its own Keeri commerce credential');
    else if (!problems.some(p => p.startsWith('KEERI_COMMERCE_TOKEN:')) && env.KEERI_COMMERCE_TOKEN === production.KEERI_COMMERCE_TOKEN) problems.push('KEERI_COMMERCE_TOKEN: must not be the production value');
  }
  return problems;
}

let entryPath;
try { if (process.argv[1]) entryPath = realpathSync(process.argv[1]); } catch { /* imported */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  const [stagingPath = '/home/deploy/shopmaple-staging/shared/staging.env', productionPath = '/home/deploy/shopmaple/shared/store.env'] = process.argv.slice(2);
  try {
    const problems = checkStagingEnv(parseEnv(readFileSync(stagingPath, 'utf8')), parseEnv(readFileSync(productionPath, 'utf8')));
    if (problems.length) { console.error(`staging.env is not safe to run:\n${problems.map(p => `- ${p}`).join('\n')}`); process.exitCode = 1; }
    else console.log('staging.env looks safe: staging database, ports and media only; no live payments, leads or production secrets.');
  } catch { console.error('Could not read staging.env or store.env.'); process.exitCode = 1; }
}
