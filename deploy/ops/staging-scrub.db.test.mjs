import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { psqlRunner } from './restore-drill.mjs';
import { assertStagingTarget, planScrub, scrubDatabase, TABLE_POLICY } from './staging-scrub.mjs';

const run = promisify(execFile);
const source = new URL(process.env.TEST_DATABASE_URL ?? '');
assert.equal(source.hostname, '127.0.0.1');
assert.equal(source.pathname, '/shopmaple_test');
const pgBin = process.env.PG_BIN_DIRECTORY ?? (process.platform === 'darwin' ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
const server = { host: '127.0.0.1', port: Number(source.port), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password) };
const pgEnv = { PATH: process.env.PATH, PGHOST: server.host, PGPORT: String(server.port), PGUSER: server.user, PGPASSWORD: server.password };

// A fresh database with the application schema (copied from the dedicated test database), dropped afterwards.
async function scratchDatabase(t) {
  const name = `shopmaple_scrub_test_${randomBytes(6).toString('hex')}`;
  assert.match(name, /^shopmaple_scrub_test_[a-f0-9]{12}$/);
  await run(join(pgBin, 'createdb'), [name], { env: pgEnv });
  t.after(() => run(join(pgBin, 'dropdb'), ['--if-exists', name], { env: pgEnv }));
  const { stdout: schema } = await run(join(pgBin, 'pg_dump'), ['--schema-only', '--no-owner', '--no-acl', 'shopmaple_test'], { env: pgEnv, maxBuffer: 32 * 1024 * 1024 });
  const psql = psqlRunner(pgBin, { ...server, database: name });
  await psql(schema);
  return { name, psql };
}

const PII = ['Ramesh Piiname', 'ramesh.pii@example.com', '+919812345678', '42 Pii Lane', 'Pii Nagar', 'Call Ramesh about sofa', 'pay_PiiPayment123', 'order_PiiOrder123', 'Private note about Ramesh'];

async function seed(psql) {
  await psql(`
    INSERT INTO "ShopAdmin" (id, email, "passwordHash", role) VALUES ('admin1', 'staff@maplefurnishers.com', 'scrypt-hash', 'publisher');
    INSERT INTO "ShopAdminSession" (id, "tokenHash", "adminId", "expiresAt") VALUES ('s1', 'tok', 'admin1', now() + interval '1 day');
    INSERT INTO "Contact" (id, "emailKey", email, name, phone, city, notes) VALUES ('c1', 'ramesh.pii@example.com', 'ramesh.pii@example.com', 'Ramesh Piiname', '+919812345678', 'Pii Nagar', 'Private note about Ramesh');
    INSERT INTO "Enquiry" (id, "idempotencyHash", "payloadHash", kind, name, email, phone, message, context, "contactId")
      VALUES ('e1', 'h1', 'p1', 'project', 'Ramesh Piiname', 'ramesh.pii@example.com', '+919812345678', 'Deliver to 42 Pii Lane', '{"address":"42 Pii Lane"}', 'c1');
    INSERT INTO "EnquiryActivity" (id, "enquiryId", "actorId", version, action, body, subject) VALUES ('a1', 'e1', 'admin1', 1, 'email_sent', 'Private note about Ramesh', 'Call Ramesh about sofa');
    INSERT INTO "ContactActivity" (id, "contactId", "actorId", version, action, "taskId", body) VALUES ('ca1', 'c1', 'admin1', 1, 'task_created', 'f1', 'Private note about Ramesh');
    INSERT INTO "FollowUpTask" (id, "contactId", title, "dueOn", note, "createdById") VALUES ('f1', 'c1', 'Call Ramesh about sofa', current_date, 'Private note about Ramesh', 'admin1');
    INSERT INTO "EnquiryDelivery" (id, "enquiryId", "configurationHash") VALUES ('d1', 'e1', 'cfg');
    INSERT INTO "Customer" (id, "emailKey", name, phone, "updatedAt") VALUES ('cu1', 'ramesh.pii@example.com', 'Ramesh Piiname', '+919812345678', now());
    INSERT INTO "CustomerAddress" (id, "customerId", name, line1, city, state, pin, phone, "updatedAt") VALUES ('ad1', 'cu1', 'Ramesh Piiname', '42 Pii Lane', 'Pii Nagar', '07', '110001', '+919812345678', now());
    INSERT INTO "Cart" (id, "tokenHash", "expiresAt", "updatedAt") VALUES ('cart1', 'cart-token', now() + interval '1 day', now());
    INSERT INTO "CheckoutAttempt" (id, "cartId", "merchantScope", "idempotencyKey", receipt, snapshot, "amountPaise", "updatedAt", "paymentId", "providerOrderId", "customerEmailKey")
      VALUES ('att1', 'cart1', 'maple', 'k1', 'r1', '{"customer":{"name":"Ramesh Piiname","email":"ramesh.pii@example.com","phone":"+919812345678","address":"42 Pii Lane"}}', 100000, now(), 'pay_PiiPayment123', 'order_PiiOrder123', 'ramesh.pii@example.com');
    INSERT INTO "PaymentWebhookInbox" (id, "merchantScope", "eventId", "bodySha256", "eventType", "paymentId") VALUES ('w1', 'maple', 'ev1', 'sha', 'payment.captured', 'pay_PiiPayment123');
    INSERT INTO "OrderNotification" (id, "merchantScope", "subjectId", kind) VALUES ('n1', 'maple', 'att1', 'customer_confirmed');
    INSERT INTO "KeeriOrderEvent" (id, "merchantScope", "externalOrderId", type, "bodySha256", payload, "occurredAt")
      VALUES ('ke1', 'maple', 'ord_1', 'order.cancelled', 'sha-ke1', '{"reason":"Ramesh Piiname asked to cancel","gatewayRefundId":"rfnd_PiiRefund123"}', now());
    INSERT INTO "OrderCancellationRequest" (id, "attemptId", reason, "updatedAt") VALUES ('00000000-0000-4000-8000-000000000001', 'att1', 'Ordered by mistake: Ramesh Piiname moved to 42 Pii Lane', now());
  `);
}

test('every table of the current schema has a scrub policy', async t => {
  const { psql } = await scratchDatabase(t);
  const tables = (await psql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public';`)).map(([name]) => name);
  assert.deepEqual(tables.filter(name => !(name in TABLE_POLICY)), []);
});

test('after the scrub no customer name, email, phone, address, note or payment id remains anywhere in the data', async t => {
  const { name, psql } = await scratchDatabase(t);
  await seed(psql);
  const result = await scrubDatabase(psql);
  assert.ok(result.emptied.includes('CheckoutAttempt'));
  assert.ok(result.emptied.includes('OrderCancellationRequest'));
  const { stdout: data } = await run(join(pgBin, 'pg_dump'), ['--data-only', '--inserts', name], { env: pgEnv, maxBuffer: 32 * 1024 * 1024 });
  for (const value of PII) assert.equal(data.includes(value), false, `${value} survived the scrub`);
  const [[enquiries]] = await psql(`SELECT count(*) FROM "Enquiry";`);
  assert.equal(enquiries, '1', 'enquiries keep their shape');
  const [[staff]] = await psql(`SELECT count(*) FROM "ShopAdmin";`);
  assert.equal(staff, '1', 'staff accounts are kept');
  const [[sessions]] = await psql(`SELECT count(*) FROM "ShopAdminSession";`);
  assert.equal(sessions, '0', 'staff sessions are not');
});

test('a table without a policy stops the scrub before any data changes', async t => {
  const { psql } = await scratchDatabase(t);
  await seed(psql);
  await psql(`CREATE TABLE "LoyaltyMember" (id text PRIMARY KEY, email text);`);
  await assert.rejects(scrubDatabase(psql), /Unclassified tables.*LoyaltyMember/);
  const [[email]] = await psql(`SELECT email FROM "Contact" WHERE id = 'c1';`);
  assert.equal(email, 'ramesh.pii@example.com');
});

test('the scrub command only accepts the staging database on the staging socket', () => {
  assert.doesNotThrow(() => assertStagingTarget({ host: '/home/deploy/shopmaple-staging/shared/socket', port: 55441, database: 'shopmaple_staging' }));
  assert.doesNotThrow(() => assertStagingTarget({ host: '/home/deploy/shopmaple-staging/shared/socket', port: 55441, database: 'shopmaple_staging_next' }));
  assert.throws(() => assertStagingTarget({ host: '/home/deploy/shopmaple/shared/socket', port: 55440, database: 'shopmaple_store' }), /Refusing/);
  assert.throws(() => assertStagingTarget({ host: '/home/deploy/shopmaple-staging/shared/socket', port: 55440, database: 'shopmaple_staging' }), /Refusing/);
  assert.throws(() => assertStagingTarget({ host: '/home/deploy/shopmaple-staging/shared/socket', port: 55441, database: 'shopmaple_store' }), /Refusing/);
});

test('a plan for an older schema skips tables that do not exist yet', () => {
  const plan = planScrub(['Product', 'Enquiry', '_prisma_migrations']);
  assert.deepEqual(plan.emptied, []);
  assert.deepEqual(plan.anonymised, ['Enquiry']);
  assert.doesNotMatch(plan.sql, /TRUNCATE/);
});
