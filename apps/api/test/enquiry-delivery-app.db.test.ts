import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp, type AppConfig } from '../src/app.js';
import { loadEnquiryDeliveryConfig } from '../src/enquiry-delivery-provider.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '55439' || new URL(url).pathname !== '/shopmaple_test') throw Error('Dedicated loopback test database required');
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = 'http://localhost:3000';
const config = loadEnquiryDeliveryConfig({ ENQUIRY_DELIVERY_ENABLED: 'true', ENQUIRY_RESEND_API_KEY: 'synthetic-no-network', ENQUIRY_MAIL_FROM: 'sender@example.invalid', ENQUIRY_MAIL_TO: 'team@example.invalid', WEB_ORIGIN: origin })!;
const enabled = createApp(db, { webOrigin: origin, catalogMode: 'preview', secureCookies: false, enquiryDelivery: config } as AppConfig);
const disabled = createApp(db, { webOrigin: origin, catalogMode: 'preview', secureCookies: false });
const enquiries: string[] = [];
after(async () => {
  await db.enquiryDelivery.deleteMany({ where: { enquiryId: { in: enquiries } } });
  await db.enquiry.deleteMany({ where: { id: { in: enquiries } } });
  await db.$disconnect();
});
const payload = { kind: 'contact', name: 'Synthetic Visitor', email: 'synthetic@example.invalid', phone: '', message: 'Synthetic enquiry for integration verification.', context: { product: '', variant: '', sku: '', pincode: '' } };
async function submit(app: ReturnType<typeof createApp>, key = randomUUID()) {
  const response = await request(app).post('/api/enquiries').set('Origin', origin).set('Idempotency-Key', key).send(payload);
  assert.ok([200,201].includes(response.status), `enquiry returned ${response.status}`);
  enquiries.push(response.body.reference);
  return response;
}
test('real public route queues only when configured and preserves duplicate receipt', async () => {
  const key = randomUUID();
  const first = await submit(enabled, key), duplicate = await submit(enabled, key);
  assert.equal(first.status, 201); assert.equal(duplicate.status, 200);
  assert.deepEqual(first.body, duplicate.body); assert.equal(first.body.notificationSent, false);
  assert.equal(await db.enquiryDelivery.count({ where: { enquiryId: first.body.reference } }), 1);
  const ordinary = await submit(disabled);
  assert.equal(await db.enquiryDelivery.count({ where: { enquiryId: ordinary.body.reference } }), 0);
});
