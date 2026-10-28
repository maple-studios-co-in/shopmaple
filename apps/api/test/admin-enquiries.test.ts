import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
    throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const app = () => createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const ownedAdmins: string[] = [], ownedEnquiries: string[] = [];
after(async () => {
    await db.enquiryActivity.deleteMany({ where: { enquiryId: { in: ownedEnquiries } } });
    await db.enquiryReviewAudit.deleteMany({ where: { enquiryId: { in: ownedEnquiries } } });
    await db.enquiry.deleteMany({ where: { id: { in: ownedEnquiries } } });
    await db.shopAdminSession.deleteMany({ where: { adminId: { in: ownedAdmins } } });
    await db.shopAdmin.deleteMany({ where: { id: { in: ownedAdmins } } });
    await db.$disconnect();
});
async function staff() {
    const token = randomBytes(32).toString("hex");
    const admin = await db.shopAdmin.create({ data: { email: `enquiry-${token.slice(0, 12)}@example.invalid`, role: "publisher", passwordHash: "invalid-unused-login-hash" } });
    ownedAdmins.push(admin.id);
    await db.shopAdminSession.create({ data: { adminId: admin.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
    return { id: admin.id, cookie: `shop_admin=${token}`, csrf: hash("csrf:" + token) };
}
test("customer inbox denies anonymous and content-only staff, including guessed references, without caching", async () => {
    const account = await staff();
    for (const path of ["/api/admin/enquiries", "/api/admin/enquiries/enq_00000000-0000-4000-8000-000000000000"]) {
        const anonymous = await request(app()).get(path);
        assert.equal(anonymous.status, 401);
        assert.match(String(anonymous.headers["cache-control"]), /no-store/);
        const denied = await request(app()).get(path).set("Cookie", account.cookie);
        assert.equal(denied.status, 403, "Publishing content must not grant customer-data access");
        assert.equal(denied.body.code, "ENQUIRY_ACCESS_REQUIRED");
        assert.match(String(denied.headers["cache-control"]), /no-store/);
    }
});
async function manager() {
    const account = await staff();
    await db.shopAdmin.update({ where: { id: account.id }, data: { canManageEnquiries: true } });
    return account;
}
async function enquiry(kind = "contact", createdAt = new Date()) {
    const { randomUUID } = await import("node:crypto");
    const row = await db.enquiry.create({ data: { id: `enq_${randomUUID()}`, idempotencyHash: hash(randomUUID()), payloadHash: hash(randomUUID()), kind, name: "Synthetic Visitor", email: "synthetic@example.invalid", phone: "", message: "<script>synthetic text</script>", context: { product: "Chair", variant: "Blue", sku: "TEST", pincode: "110015" }, createdAt } });
    ownedEnquiries.push(row.id);
    return row;
}
test("authorized inbox rows carry name and reference, never email, phone or message; filters never carry contact data in URLs", async () => {
    const account = await manager();
    // Future synthetic timestamps isolate this page from fixtures in other tests.
    const rows = await Promise.all(Array.from({ length: 3 }, () => enquiry("project", new Date("2099-01-01T00:00:00Z"))));
    const expected = rows.map(row => row.id).sort().reverse();
    const read = (query: string) => request(app()).get(`/api/admin/enquiries?${query}`).set("Cookie", account.cookie);
    const first = await read("kind=project&status=new&limit=2");
    assert.equal(first.status, 200);
    assert.match(String(first.headers["cache-control"]), /no-store/);
    assert.deepEqual(first.body.items.map((row: any) => row.id), expected.slice(0, 2));
    for (const row of first.body.items)
        assert.deepEqual(Object.keys(row).sort(), ["assignedToId", "contactId", "createdAt", "id", "kind", "name", "nextDueOn", "product", "status", "version"]);
    for (const row of first.body.items) { assert.equal(row.email, undefined); assert.equal(row.phone, undefined); assert.equal(row.message, undefined); }
    const cursor = JSON.parse(Buffer.from(first.body.nextCursor, "base64url").toString("utf8"));
    assert.deepEqual(Object.keys(cursor).sort(), ["createdAt", "id"]);
    const second = await read(`kind=project&status=new&limit=1&cursor=${first.body.nextCursor}`);
    assert.equal(second.status, 200);
    assert.equal(second.body.items[0].id, expected[2]);
    const full = await request(app()).get(`/api/admin/enquiries/${rows[0]!.id}`).set("Cookie", account.cookie);
    assert.equal(full.status, 200);
    assert.equal(full.body.message, "<script>synthetic text</script>");
    assert.equal(full.body.idempotencyHash, undefined);
    assert.equal(full.body.payloadHash, undefined);
    assert.equal(full.body.email, "synthetic@example.invalid");
    for (const query of ["limit=0", "limit=51", "kind=unknown", "status=sent", "cursor=bad", "email=synthetic@example.invalid", "q=synthetic", "kind=contact&kind=bulk"]) {
        const invalid = await read(query);
        assert.equal(invalid.status, 400);
        assert.match(String(invalid.headers["cache-control"]), /no-store/);
    }
    assert.equal((await request(app()).get('/api/admin/enquiries/enq_00000000-0000-4000-8000-000000000000').set("Cookie", account.cookie)).status, 404);
});
test("stage changes require current capability, Origin, CSRF and expected version; concurrent changes have one audit winner", async () => {
    const account = await manager(), row = await enquiry();
    const stage = (body: object = { expectedVersion: 0, stage: "contacted" }, csrf = account.csrf, source = origin) => request(app()).post(`/api/admin/enquiries/${row.id}/stage`).set("Cookie", account.cookie).set("Origin", source).set("X-CSRF-Token", csrf).send(body);
    assert.equal((await stage({}, account.csrf)).status, 400);
    assert.equal((await stage({ expectedVersion: 0, stage: "contacted", actorId: account.id })).status, 400);
    assert.equal((await stage({ expectedVersion: 0, stage: "reviewed" })).status, 400, "the legacy two-state value is not a stage");
    assert.equal((await stage({ expectedVersion: 0, stage: "contacted" }, "0".repeat(64))).status, 403);
    assert.equal((await stage({ expectedVersion: 0, stage: "contacted" }, account.csrf, "https://other.invalid")).status, 403);
    const raced = await Promise.all([stage(), stage()]);
    assert.deepEqual(raced.map(r => r.status).sort(), [200, 409]);
    assert.ok(raced.every(r => String(r.headers["cache-control"]).includes("no-store")));
    const stored = await db.enquiry.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.status, "contacted");
    assert.equal(stored.version, 1);
    const audits = await db.enquiryActivity.findMany({ where: { enquiryId: row.id } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0]!.actorId, account.id);
    assert.equal(audits[0]!.version, 1);
    assert.equal(audits[0]!.action, "status_changed");
    assert.equal(audits[0]!.stage, "contacted");
    assert.ok(audits[0]!.createdAt instanceof Date);
    assert.equal((await stage({ expectedVersion: 0, stage: "quoted" })).status, 409);
    assert.equal(await db.enquiryActivity.count({ where: { enquiryId: row.id } }), 1);
    const next = await enquiry();
    await db.shopAdmin.update({ where: { id: account.id }, data: { canManageEnquiries: false } });
    for (const path of ["/api/admin/enquiries", `/api/admin/enquiries/${next.id}`])
        assert.equal((await request(app()).get(path).set("Cookie", account.cookie)).status, 403);
    const denied = await request(app()).post(`/api/admin/enquiries/${next.id}/stage`).set("Cookie", account.cookie).set("Origin", origin).set("X-CSRF-Token", account.csrf).send({ expectedVersion: 0, stage: "contacted" });
    assert.equal(denied.status, 403);
    assert.equal((await db.enquiry.findUniqueOrThrow({ where: { id: next.id } })).status, "new");
});
