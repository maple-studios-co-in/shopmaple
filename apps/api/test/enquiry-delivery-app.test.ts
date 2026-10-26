import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
// These anonymous/Origin requests must be rejected before any database access.
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://unused:unused@127.0.0.1:1/unreachable' } } });
const app = createApp(db, { webOrigin: 'http://localhost:3000', catalogMode: 'preview', secureCookies: false });
const id = 'enq_00000000-0000-4000-8000-000000000001';
test('delivery status is mounted behind private admin authentication even when disabled', async () => {
  const result = await request(app).get(`/api/admin/enquiries/${id}/delivery`);
  assert.equal(result.status, 401);
  assert.match(String(result.headers['cache-control']), /private.*no-store/);
});
test('delivery retry is mounted behind authentication and same-origin write protection', async () => {
  const anonymous = await request(app).post(`/api/admin/enquiries/${id}/delivery/retry`).set('Origin', 'http://localhost:3000').send({ expectedVersion: 0 });
  assert.equal(anonymous.status, 401);
  const foreign = await request(app).post(`/api/admin/enquiries/${id}/delivery/retry`).set('Origin', 'https://other.invalid').send({ expectedVersion: 0 });
  assert.equal(foreign.status, 403);
  assert.match(String(foreign.headers['cache-control']), /private.*no-store/);
});
