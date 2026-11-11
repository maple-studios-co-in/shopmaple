import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { saveEnquiry } from "../src/enquiries.js";
import { enquiryDeliveryResponseSchema } from "@shopmaple/contracts/enquiry-delivery";
import type { KeeriLeadsConfig } from "../src/keeri-leads.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const email = { apiKey: "synthetic-unused", from: "sender@example.invalid", to: "recipient@example.invalid", adminOrigin: origin, fingerprint: "a".repeat(64) };
const keeri: KeeriLeadsConfig = { origin: "https://keeri.example.invalid", token: "k".repeat(40), adminOrigin: "https://admin.keeri.example.invalid", fingerprint: "c".repeat(64) };
const client = (keeriLeads: KeeriLeadsConfig | null = keeri) => request(createApp(db, { webOrigin: origin, secureCookies: false, catalogMode: "preview", enquiryDelivery: email, keeriLeads }));
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
async function staff() {
  const token = randomBytes(32).toString("hex");
  const row = await db.shopAdmin.create({ data: { email: `keeri-lead-${randomUUID()}@example.invalid`, passwordHash: "synthetic-unused", role: "editor", canManageEnquiries: true, active: true } }); admins.push(row.id);
  await db.shopAdminSession.create({ data: { adminId: row.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
  return { id: row.id, cookie: `shop_admin=${token}`, csrf: hash(`csrf:${token}`) };
}
async function enquiry(kind = "contact", keeriLeads: KeeriLeadsConfig | null = keeri) {
  const result = await saveEnquiry(db, { kind, email: "synthetic@example.invalid", message: "Customer private text" }, randomUUID(), email, keeriLeads);
  ids.push(result.receipt.reference); return result.receipt.reference;
}
type Staff = Awaited<ReturnType<typeof staff>>;
const path = (id: string) => `/api/admin/enquiries/${id}/delivery`;
const get = (actor: Staff, id: string, keeriLeads: KeeriLeadsConfig | null = keeri) => client(keeriLeads).get(path(id)).set("Cookie", actor.cookie);
const post = (actor: Staff, id: string, body: object) => client().post(`${path(id)}/retry`).set("Cookie", actor.cookie).set("Origin", origin).set("X-CSRF-Token", actor.csrf).send(body);
const lead = (id: string) => db.enquiryDelivery.findUniqueOrThrow({ where: { enquiryId_target: { enquiryId: id, target: "keeri" } } });
const setLead = (id: string, data: object) => db.enquiryDelivery.update({ where: { enquiryId_target: { enquiryId: id, target: "keeri" } }, data });

test("the delivery panel reports Keeri as pending, created, matched or failed, with a link only when there is a lead", async () => {
  const actor = await staff(), id = await enquiry();
  let body = (await get(actor, id)).body;
  assert.equal(enquiryDeliveryResponseSchema.safeParse(body).success, true);
  assert.equal(body.keeri.enabled, true);
  assert.equal(body.keeri.delivery.state, "pending"); assert.equal(body.keeri.delivery.leadUrl, null);
  assert.equal(body.delivery.status, "queued", "the email state is still reported");
  await setLead(id, { status: "accepted", attempts: 1, version: 2, acceptedAt: new Date(), keeriLeadId: "lead_9", keeriOutcome: "created", keeriLeadPath: "/leads/lead_9" });
  body = (await get(actor, id)).body;
  assert.equal(body.keeri.delivery.state, "created"); assert.equal(body.keeri.delivery.leadUrl, "https://admin.keeri.example.invalid/leads/lead_9");
  await setLead(id, { keeriOutcome: "matched" });
  assert.equal((await get(actor, id)).body.keeri.delivery.state, "matched");
  for (const status of ["failed", "uncertain"]) {
    await setLead(id, { status, acceptedAt: null, keeriLeadId: null, keeriOutcome: null, keeriLeadPath: null, errorCode: "provider_rejected" });
    body = (await get(actor, id)).body;
    assert.equal(body.keeri.delivery.state, "failed"); assert.equal(body.keeri.delivery.leadUrl, null); assert.equal(body.keeri.delivery.errorCode, "provider_rejected");
  }
  assert.equal(JSON.stringify(body).includes(keeri.token), false);
  assert.equal(JSON.stringify(body).includes(keeri.fingerprint), false);
});

test("with Keeri off, an enquiry without a lead shows no Keeri section; newsletter and review have none", async () => {
  const actor = await staff(), off = await enquiry("contact", null);
  const body = (await get(actor, off, null)).body;
  assert.equal("keeri" in body, false);
  assert.deepEqual(Object.keys(body).sort(), ["delivery", "enabled", "enquiryId"]);
  for (const kind of ["newsletter", "review"]) {
    const id = await enquiry(kind);
    assert.deepEqual((await get(actor, id)).body.keeri, { enabled: true, delivery: null });
  }
});

test("staff retry covers the Keeri target, is audited and leaves the email row alone", async () => {
  const actor = await staff(), id = await enquiry();
  const waiting = await setLead(id, { status: "retry_wait", attempts: 1, version: 2, firstAttemptAt: new Date(), nextAttemptAt: new Date(Date.now() + 600000), errorCode: "provider_unavailable" });
  assert.equal((await get(actor, id)).body.keeri.delivery.canRetry, true);
  const responses = await Promise.all([post(actor, id, { expectedVersion: 2, target: "keeri" }), post(actor, id, { expectedVersion: 2, target: "keeri" })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const current = await lead(id);
  assert.equal(current.version, 3); assert.ok(current.nextAttemptAt! < waiting.nextAttemptAt!);
  const audit = await db.enquiryDeliveryRetryAudit.findMany({ where: { deliveryId: current.id } });
  assert.equal(audit.length, 1); assert.equal(audit[0]!.actorId, actor.id);
  const emailRow = await db.enquiryDelivery.findUniqueOrThrow({ where: { enquiryId_target: { enquiryId: id, target: "email" } } });
  assert.equal(emailRow.version, 0);
  assert.equal((await post(actor, id, { expectedVersion: 0 })).status, 409, "the email row is not waiting, so its retry is refused");
  assert.equal((await post(actor, id, { expectedVersion: 3, target: "other" })).status, 400);
  await setLead(id, { status: "failed", nextAttemptAt: null });
  assert.equal((await post(actor, id, { expectedVersion: 3, target: "keeri" })).status, 409, "a final refusal is not retried");
});

test("a changed Keeri configuration cannot be retried from the admin", async () => {
  const actor = await staff(), id = await enquiry();
  await setLead(id, { status: "retry_wait", attempts: 1, version: 2, firstAttemptAt: new Date(), nextAttemptAt: new Date(Date.now() + 600000) });
  assert.equal((await get(actor, id, { ...keeri, fingerprint: "d".repeat(64) })).body.keeri.delivery.canRetry, false);
  const body = (await get(actor, id, null)).body;
  assert.equal(body.keeri.enabled, false); assert.equal(body.keeri.delivery.canRetry, false);
});
