#!/usr/bin/env node
// Removes customer personal data and payment data from the staging database after it is restored from a production
// backup (deploy/ops/staging-refresh-db.sh). Every table must be classified below: a table this file does not know
// (a new migration) stops the scrub before anything changes, so new personal data is never copied to staging unseen.
import { realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { psqlRunner } from './restore-drill.mjs';

export const TABLE_POLICY = {
  // Catalogue, storefront content and schema history: no customer data.
  _prisma_migrations: 'keep', Product: 'keep', Variant: 'keep', ProductHandleAlias: 'keep', ProductSourceIdentity: 'keep',
  VariantSourceIdentity: 'keep', CatalogueSyncState: 'keep', ShopContent: 'keep', ShopContentRevision: 'keep',
  ShopMediaAsset: 'keep', ShopArticlePublication: 'keep', InstagramFeedPost: 'keep', EnquiryReviewAudit: 'keep',
  // Staff accounts stay so staff can sign in to staging admin (behind Cloudflare Access); their sessions do not.
  ShopAdmin: 'keep',
  // Orders, payments, Keeri's order updates (they carry staff cancellation reasons and refund ids), carts, customer
  // accounts, sign-in traces, delivery queues and the stored Instagram token: emptied.
  Cart: 'empty', CartItem: 'empty', CartMutationReceipt: 'empty', CheckoutAttempt: 'empty', PaymentWebhookInbox: 'empty',
  OrderOutbox: 'empty', OrderNotification: 'empty', KeeriOrderEvent: 'empty', Customer: 'empty', CustomerAddress: 'empty', CustomerSession: 'empty',
  CustomerLoginChallenge: 'empty', CustomerSignInFailure: 'empty', ShopAdminSession: 'empty', ShopAdminSignIn: 'empty', EnquiryDelivery: 'empty',
  EnquiryDeliveryRetryAudit: 'empty', InstagramFeedState: 'empty',
  // Enquiries and the CRM keep their shape (so the admin is realistic) with every personal field replaced.
  Enquiry: 'anonymise', Contact: 'anonymise', ContactActivity: 'anonymise', EnquiryActivity: 'anonymise', FollowUpTask: 'anonymise',
};

const ANONYMISE = {
  Enquiry: `UPDATE "Enquiry" SET name = 'Customer ' || substr(md5(id), 1, 8), email = 'enquiry-' || md5(id) || '@example.invalid',
    phone = '+910000000000', message = '[message removed on staging]', context = '{}'::jsonb, "lostReason" = NULL,
    "idempotencyHash" = md5('staging-idem-' || id), "payloadHash" = md5('staging-payload-' || id);`,
  Contact: `UPDATE "Contact" SET name = 'Contact ' || substr(md5(id), 1, 8), email = 'contact-' || md5(id) || '@example.invalid',
    "emailKey" = 'contact-' || md5(id) || '@example.invalid', phone = '+910000000000', "phoneKey" = NULL, city = '', notes = '', tags = '{}';`,
  ContactActivity: `UPDATE "ContactActivity" SET body = CASE WHEN body IS NULL THEN NULL ELSE '[note removed on staging]' END;`,
  EnquiryActivity: `UPDATE "EnquiryActivity" SET body = CASE WHEN body IS NULL THEN NULL ELSE '[note removed on staging]' END,
    subject = CASE WHEN subject IS NULL THEN NULL ELSE '[subject removed on staging]' END;`,
  FollowUpTask: `UPDATE "FollowUpTask" SET title = 'Follow-up', note = '';`,
};
const VERIFY = {
  Enquiry: `SELECT 'Enquiry', count(*) FROM "Enquiry" WHERE email NOT LIKE '%@example.invalid' OR phone <> '+910000000000' OR context <> '{}'::jsonb`,
  Contact: `SELECT 'Contact', count(*) FROM "Contact" WHERE email NOT LIKE '%@example.invalid' OR "emailKey" NOT LIKE '%@example.invalid' OR notes <> '' OR city <> ''`,
  ContactActivity: `SELECT 'ContactActivity', count(*) FROM "ContactActivity" WHERE body IS NOT NULL AND body <> '[note removed on staging]'`,
  EnquiryActivity: `SELECT 'EnquiryActivity', count(*) FROM "EnquiryActivity" WHERE (body IS NOT NULL AND body <> '[note removed on staging]') OR (subject IS NOT NULL AND subject <> '[subject removed on staging]')`,
  FollowUpTask: `SELECT 'FollowUpTask', count(*) FROM "FollowUpTask" WHERE title <> 'Follow-up' OR note <> ''`,
};

/** The scrub SQL for exactly these tables, or an error naming every table without a policy. */
export function planScrub(tables) {
  const unknown = tables.filter(name => !(name in TABLE_POLICY));
  if (unknown.length) throw new Error(`Unclassified tables (add them to TABLE_POLICY in deploy/ops/staging-scrub.mjs first): ${unknown.join(', ')}`);
  const present = new Set(tables);
  const emptied = Object.keys(TABLE_POLICY).filter(name => TABLE_POLICY[name] === 'empty' && present.has(name));
  const anonymised = Object.keys(ANONYMISE).filter(name => present.has(name));
  const statements = ['BEGIN;'];
  // One TRUNCATE without CASCADE: PostgreSQL refuses it if a kept table still references an emptied one.
  if (emptied.length) statements.push(`TRUNCATE ${emptied.map(name => `"${name}"`).join(', ')};`);
  statements.push(...anonymised.map(name => ANONYMISE[name]), 'COMMIT;');
  const checks = [...emptied.map(name => `SELECT '${name}', count(*) FROM "${name}"`), ...anonymised.map(name => VERIFY[name])];
  return { sql: statements.join('\n'), verifySql: checks.length ? `${checks.join('\nUNION ALL\n')};` : '', emptied, anonymised };
}

export async function scrubDatabase(psql) {
  const tables = (await psql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;`)).map(([name]) => name);
  const plan = planScrub(tables);
  await psql(plan.sql);
  const leftovers = plan.verifySql ? (await psql(plan.verifySql)).filter(([, count]) => count !== '0').map(([name, count]) => `${name}: ${count}`) : [];
  if (leftovers.length) throw new Error(`Scrub verification failed; rows still holding data: ${leftovers.join(', ')}`);
  return { emptied: plan.emptied, anonymised: plan.anonymised };
}

/** The staging cluster only: its own socket and port, and the staging database name. Never the live store. */
export function assertStagingTarget({ host, port, database }) {
  if (port === 55440 || !['shopmaple_staging', 'shopmaple_staging_next'].includes(database) || !String(host).startsWith('/home/deploy/shopmaple-staging/')) {
    throw new Error('Refusing to scrub anything but a staging database (shopmaple_staging or shopmaple_staging_next on the staging socket).');
  }
}

let entryPath;
try { if (process.argv[1]) entryPath = realpathSync(process.argv[1]); } catch { /* imported */ }
if (entryPath === fileURLToPath(import.meta.url)) {
  // staging-refresh-db.sh restores into shopmaple_staging_next and scrubs it before it replaces shopmaple_staging.
  const database = process.argv[2] ?? 'shopmaple_staging_next';
  const target = { host: '/home/deploy/shopmaple-staging/shared/socket', port: 55441, database, user: userInfo().username };
  try {
    assertStagingTarget(target);
    const result = await scrubDatabase(psqlRunner('/usr/lib/postgresql/16/bin', target));
    console.log(`Staging scrub complete: emptied ${result.emptied.length} tables, anonymised ${result.anonymised.length}.`);
  } catch (error) {
    console.error(`Staging scrub failed: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}
