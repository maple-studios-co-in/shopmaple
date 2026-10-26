import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { saveEnquiry } from "../src/enquiries.js";
import { enquiryDeliveryResponseSchema, enquiryDeliveryRetryInputSchema } from "@shopmaple/contracts";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const config = { apiKey: "synthetic-unused", from: "sender@example.invalid", to: "recipient@example.invalid", adminOrigin: origin, fingerprint: "a".repeat(64) };
const client = (value: typeof config | null = config) => request(createApp(db, { webOrigin: origin, secureCookies: false, catalogMode: "preview", enquiryDelivery: value }));
const ids: string[] = [], admins: string[] = [];
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
afterEach(async () => {
  await db.enquiryDeliveryRetryAudit.deleteMany({ where: { delivery: { enquiryId: { in: ids } } } });
  await db.enquiryDelivery.deleteMany({ where: { enquiryId: { in: ids } } });
  await db.enquiry.deleteMany({ where: { id: { in: ids } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: admins } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: admins } } });
  ids.length = 0; admins.length = 0;
});
after(async () => db.$disconnect());
async function staff(capable = true, active = true) {
  const token = randomBytes(32).toString("hex");
  const row = await db.shopAdmin.create({ data: { email: `delivery-${randomUUID()}@example.invalid`, passwordHash: "synthetic-unused", role: "editor", canManageEnquiries: capable, active } }); admins.push(row.id);
  await db.shopAdminSession.create({ data: { adminId: row.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
  return { id: row.id, cookie: `shop_admin=${token}`, csrf: hash(`csrf:${token}`) };
}
async function enquiry(enabled = true) {
  const result = await saveEnquiry(db, { kind: "contact", email: "synthetic@example.invalid", message: "Customer private text" }, randomUUID(), enabled ? config : null);
  ids.push(result.receipt.reference); return result.receipt.reference;
}
type Staff = Awaited<ReturnType<typeof staff>>;
const path = (id: string) => `/api/admin/enquiries/${id}/delivery`;
const get = (actor: Staff, id: string, settings: typeof config | null = config) => client(settings).get(path(id)).set("Cookie", actor.cookie);
const post = (actor: Staff, id: string, body: object, settings: typeof config | null = config) => client(settings).post(`${path(id)}/retry`).set("Cookie", actor.cookie).set("Origin", origin).set("X-CSRF-Token", actor.csrf).send(body);
const job = (id: string) => db.enquiryDelivery.findUniqueOrThrow({ where: { enquiryId: id } });
async function retryable(id: string) { return db.enquiryDelivery.update({ where: { enquiryId: id }, data: { status: "retry_wait", attempts: 1, version: 2, firstAttemptAt: new Date(), nextAttemptAt: new Date(Date.now() + 600000), errorCode: "network_error" } }); }
test("protected status exposes only delivery state and truthful disabled or absent intents", async () => {
  const actor = await staff(), id = await enquiry(), absent = await enquiry(false);
  const response = await get(actor, id); assert.equal(response.status, 200);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.equal(enquiryDeliveryResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(Object.keys(response.body.delivery).sort(), ["acceptedAt", "attempts", "canRetry", "errorCode", "nextAttemptAt", "status", "version"]);
  assert.equal(response.body.delivery?.canRetry, false);
  assert.deepEqual((await get(actor, absent)).body, { enquiryId: absent, enabled: true, delivery: null });
  assert.equal((await get(actor, id, null)).body.enabled, false);
  assert.equal(JSON.stringify(response.body).includes(config.fingerprint), false);
});
test("manual retry expedites only one version and appends attributed audit without sending", async () => {
  const actor = await staff(), id = await enquiry(); const initial = await retryable(id);
  assert.equal((await get(actor, id)).body.delivery?.canRetry, true);
  const responses = await Promise.all([post(actor, id, { expectedVersion: 2 }), post(actor, id, { expectedVersion: 2 })]);
  assert.deepEqual(responses.map(value => value.status).sort(), [200, 409]);
  const current = await job(id); assert.equal(current.version, 3); assert.equal(current.status, "retry_wait"); assert.equal(current.attempts, 1); assert.ok(current.nextAttemptAt! < initial.nextAttemptAt!);
  const audit = await db.enquiryDeliveryRetryAudit.findMany({ where: { deliveryId: current.id } });
  assert.equal(audit.length, 1); assert.equal(audit[0]!.actorId, actor.id); assert.equal(audit[0]!.version, 3);
  assert.equal(current.acceptedAt, null); assert.equal(current.providerId, null);
});
test("permission, session revocation, inactivity, Origin and CSRF fail closed without audit", async () => {
  const actor = await staff(), denied = await staff(false), inactive = await staff(true, false), expired = await staff(), revoked = await staff(), id = await enquiry(); await retryable(id);
  await db.shopAdminSession.updateMany({ where: { adminId: expired.id }, data: { expiresAt: new Date(0) } });
  await db.shopAdminSession.deleteMany({ where: { adminId: revoked.id } });
  assert.equal((await client().get(path(id))).status, 401);
  assert.equal((await client().post(`${path(id)}/retry`).set("Origin", origin).send({ expectedVersion: 2 })).status, 401);
  for (const account of [denied, inactive, expired, revoked]) {
    const expected = account === denied ? 403 : 401;
    assert.equal((await get(account, id)).status, expected); assert.equal((await post(account, id, { expectedVersion: 2 })).status, expected);
  }
  for (const [source, csrf] of [[origin, ""], [origin, "0".repeat(64)], ["https://other.invalid", actor.csrf], ["", actor.csrf]]) {
    assert.equal((await client().post(`${path(id)}/retry`).set("Cookie", actor.cookie).set("Origin", source!).set("X-CSRF-Token", csrf!).send({ expectedVersion: 2 })).status, 403);
  }
  await db.shopAdmin.update({ where: { id: actor.id }, data: { canManageEnquiries: false } });
  assert.equal((await get(actor, id)).status, 403); assert.equal((await post(actor, id, { expectedVersion: 2 })).status, 403);
  assert.equal((await job(id)).version, 2); assert.equal(await db.enquiryDeliveryRetryAudit.count({ where: { delivery: { enquiryId: id } } }), 0);
});
test("retry eligibility rejects disabled, changed config, exhausted, expired and terminal work", async () => {
  const actor = await staff(), id = await enquiry(); await retryable(id);
  for (const settings of [null, { ...config, fingerprint: "b".repeat(64) }]) {
    assert.equal((await get(actor, id, settings)).body.delivery?.canRetry, false);
    assert.equal((await post(actor, id, { expectedVersion: 2 }, settings)).status, 409);
  }
  for (const data of [{ attempts: 5 }, { attempts: 1, firstAttemptAt: new Date(Date.now() - 23 * 3600000) }, ...["queued", "sending", "accepted", "failed", "uncertain"].map(status => ({ status, firstAttemptAt: new Date() }))]) {
    await db.enquiryDelivery.update({ where: { enquiryId: id }, data });
    assert.equal((await get(actor, id)).body.delivery?.canRetry, false); assert.equal((await post(actor, id, { expectedVersion: 2 })).status, 409);
  }
  assert.equal(await db.enquiryDeliveryRetryAudit.count({ where: { delivery: { enquiryId: id } } }), 0);
});
test("strict schemas and route validation reject injected fields, bad versions and identities", async () => {
  const actor = await staff(), id = await enquiry(); await retryable(id);
  for (const body of [{}, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: 2147483647 }, { expectedVersion: 2, to: "attacker@example.invalid" }]) {
    assert.equal(enquiryDeliveryRetryInputSchema.safeParse(body).success, false);
    assert.equal((await post(actor, id, body)).status, 400);
  }
  assert.equal((await post(actor, id, { expectedVersion: 0 })).status, 409);
  for (const candidate of ["bad", `enq_${randomUUID()}`]) {
    const expected = candidate === "bad" ? 400 : 404;
    assert.equal((await get(actor, candidate)).status, expected); assert.equal((await post(actor, candidate, { expectedVersion: 0 })).status, expected);
  }
  const valid = (await get(actor, id)).body;
  assert.equal(enquiryDeliveryResponseSchema.safeParse({ ...valid, recipient: "private" }).success, false);
  assert.equal(enquiryDeliveryResponseSchema.safeParse({ ...valid, delivery: { ...valid.delivery, providerId: "private" } }).success, false);
  assert.equal(enquiryDeliveryResponseSchema.safeParse({ ...valid, delivery: { ...valid.delivery, attempts: 6 } }).success, false);
});
