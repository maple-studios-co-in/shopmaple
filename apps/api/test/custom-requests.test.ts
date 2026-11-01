import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadEnquiryDeliveryConfig, sendEnquiryAlert } from "../src/enquiry-delivery-provider.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const app = () => createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const run = randomBytes(6).toString("hex");
const ownedAdmins: string[] = [], ownedEnquiries: string[] = [], ownedEmails: string[] = [];
after(async () => {
  await db.enquiry.deleteMany({ where: { id: { in: ownedEnquiries } } });
  await db.contact.deleteMany({ where: { emailKey: { in: ownedEmails } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: ownedAdmins } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: ownedAdmins } } });
  await db.$disconnect();
});
async function manager() {
  const token = randomBytes(32).toString("hex");
  const admin = await db.shopAdmin.create({ data: { email: `custom-${token.slice(0, 12)}@example.invalid`, role: "publisher", passwordHash: "invalid-unused-login-hash", canManageEnquiries: true } });
  ownedAdmins.push(admin.id);
  await db.shopAdminSession.create({ data: { adminId: admin.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
  return { cookie: `shop_admin=${token}` };
}
// The product page's request for Aero Dining Chair in another fabric and a longer seat.
const email = (tag: string) => { const value = `custom-${tag}-${run}@example.invalid`; ownedEmails.push(value); return value; };
const request_ = (overrides: Record<string, unknown> = {}, context: Record<string, unknown> = {}) => ({
  kind: "custom", name: "Asha Rao", email: email("visitor"), phone: "9811000000", message: "Can the arms be a little lower?",
  context: { product: "Aero Dining Chair", handle: "aero-dining-chair", variant: "Deep Atlantic", sku: "AERO-A", pincode: "110015",
    fabric: "Olive boucle", finish: "Walnut legs", size: "Seat width 60 cm", quantity: 6, ...context },
  ...overrides,
});
const submit = (body: object) => request(app()).post("/api/enquiries").set("Origin", origin).set("Idempotency-Key", randomUUID()).send(body);

test("a custom request is saved with the piece and every requested option, and linked to a CRM contact", async () => {
  const body = request_();
  const result = await submit(body);
  assert.equal(result.status, 201);
  assert.match(result.body.reference, /^enq_/);
  ownedEnquiries.push(result.body.reference);
  const row = await db.enquiry.findUniqueOrThrow({ where: { id: result.body.reference } });
  assert.equal(row.kind, "custom");
  assert.equal(row.message, "Can the arms be a little lower?");
  assert.deepEqual(row.context, body.context);
  assert.ok(row.contactId, "Custom requests reach the CRM like any other enquiry");
  const contact = await db.contact.findUniqueOrThrow({ where: { id: row.contactId! } });
  assert.equal(contact.emailKey, body.email);
});

test("a custom request needs a name, a phone, the piece and something to change; other kinds cannot carry its options", async () => {
  const invalid = [
    request_({ name: "" }), request_({ phone: "" }),
    request_({}, { product: "" }), request_({}, { handle: "" }), request_({}, { handle: "../admin" }),
    request_({ message: "" }, { fabric: "", finish: "", size: "" }),
    request_({}, { quantity: 0 }), request_({}, { quantity: 1000 }), request_({}, { quantity: 2.5 }),
    request_({}, { fabric: "x".repeat(201) }), request_({}, { size: "line\nbreak" }), request_({}, { colour: "red" }),
    { kind: "contact", email: email("contact"), message: "Hello", context: { product: "Aero", variant: "", sku: "", pincode: "", fabric: "Olive" } },
  ];
  for (const body of invalid) assert.equal((await submit(body)).status, 400, JSON.stringify(body));
  const onlyNotes = await submit(request_({}, { fabric: "", finish: "", size: "", quantity: 1 }));
  assert.equal(onlyNotes.status, 201, "Notes alone are a request staff can price");
  ownedEnquiries.push(onlyNotes.body.reference);
});

test("the inbox filters custom requests and lays out the requested options on the detail", async () => {
  const account = await manager();
  const saved = await submit(request_({ email: email("inbox") }));
  assert.equal(saved.status, 201);
  ownedEnquiries.push(saved.body.reference);
  const list = await request(app()).post("/api/admin/enquiries/search").set("Origin", origin).set("Cookie", account.cookie)
    .set("X-CSRF-Token", hash("csrf:" + account.cookie.slice("shop_admin=".length))).send({ kind: "custom", q: run });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.ok(list.body.items.length >= 1);
  assert.ok(list.body.items.every((row: { kind: string }) => row.kind === "custom"));
  assert.ok(list.body.items.some((row: { id: string }) => row.id === saved.body.reference));
  const filtered = await request(app()).get("/api/admin/enquiries?kind=custom&limit=50").set("Cookie", account.cookie);
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.items.every((row: { kind: string }) => row.kind === "custom"));
  const detail = await request(app()).get(`/api/admin/enquiries/${saved.body.reference}`).set("Cookie", account.cookie);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.kind, "custom");
  assert.equal(detail.body.product, "Aero Dining Chair");
  assert.deepEqual(detail.body.context, request_().context);
});

test("the staff alert for a custom request goes out like any other kind, without customer details", async () => {
  const config = loadEnquiryDeliveryConfig({ ENQUIRY_DELIVERY_ENABLED: "true", ENQUIRY_RESEND_API_KEY: "synthetic-transport-key", ENQUIRY_MAIL_FROM: "alerts@example.com", ENQUIRY_MAIL_TO: "team@example.com", WEB_ORIGIN: "https://shop.example.com" })!;
  const bodies: string[] = [];
  const outcome = await sendEnquiryAlert(config, { jobId: "notification_custom", enquiryId: "enq_01234567-89ab-cdef-0123-456789abcdef", kind: "custom", createdAt: new Date("2026-11-01T00:00:00Z") },
    async (_url, options) => { bodies.push(String(options?.body)); return Response.json({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }); });
  assert.equal(outcome.status, "accepted");
  assert.match(JSON.parse(bodies[0]!).text, /Kind: custom/);
});
