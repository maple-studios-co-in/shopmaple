import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { KeeriLeadsConfig } from "../src/keeri-leads.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
    throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const keeri: KeeriLeadsConfig = { origin: "https://keeri.example.invalid", token: "k".repeat(40), adminOrigin: "https://admin.keeri.example.invalid", fingerprint: "c".repeat(64) };
const app = (keeriLeads: KeeriLeadsConfig | null = null) => createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, keeriLeads });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const ownedAdmins: string[] = [], ownedEnquiries: string[] = [];
after(async () => {
    await db.enquiryDeliveryRetryAudit.deleteMany({ where: { delivery: { enquiryId: { in: ownedEnquiries } } } });
    await db.enquiryDelivery.deleteMany({ where: { enquiryId: { in: ownedEnquiries } } });
    await db.enquiryActivity.deleteMany({ where: { enquiryId: { in: ownedEnquiries } } });
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
async function manager() {
    const account = await staff();
    await db.shopAdmin.update({ where: { id: account.id }, data: { canManageEnquiries: true } });
    return account;
}
async function enquiry(kind = "contact", createdAt = new Date()) {
    const row = await db.enquiry.create({ data: { id: `enq_${randomUUID()}`, idempotencyHash: hash(randomUUID()), payloadHash: hash(randomUUID()), kind, name: "Synthetic Visitor", email: "synthetic@example.invalid", phone: "+91 90000 00000", message: "<script>synthetic text</script>", context: { product: "Chair", variant: "Blue", sku: "TEST", pincode: "110015" }, createdAt } });
    ownedEnquiries.push(row.id);
    return row;
}
const lead = (enquiryId: string, data: Record<string, unknown> = {}) => db.enquiryDelivery.create({ data: { enquiryId, target: "keeri", configurationHash: keeri.fingerprint, nextAttemptAt: new Date(), ...data } });

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

test("the read-only list shows reference, kind, time and the Keeri lead state, and links Keeri's leads", async () => {
    const account = await manager();
    // Future synthetic timestamps isolate this page from fixtures in other tests.
    const at = (minute: number) => new Date(Date.UTC(2099, 0, 1, 0, minute));
    const pending = await enquiry("contact", at(5)), created = await enquiry("project", at(4)), matched = await enquiry("bulk", at(3));
    const failed = await enquiry("contact", at(2)), signup = await enquiry("newsletter", at(1)), unsent = await enquiry("contact", at(0));
    await lead(pending.id);
    await lead(created.id, { status: "accepted", attempts: 1, acceptedAt: new Date(), keeriLeadId: "lead_1", keeriOutcome: "created", keeriLeadPath: "/leads/lead_1" });
    await lead(matched.id, { status: "accepted", attempts: 1, acceptedAt: new Date(), keeriLeadId: "lead_2", keeriOutcome: "matched", keeriLeadPath: "/leads/lead_2" });
    await lead(failed.id, { status: "failed", attempts: 1, errorCode: "provider_rejected" });
    const read = (query: string, keeriLeads: KeeriLeadsConfig | null = keeri) => request(app(keeriLeads)).get(`/api/admin/enquiries?${query}`).set("Cookie", account.cookie);
    const first = await read("limit=6");
    assert.equal(first.status, 200);
    assert.match(String(first.headers["cache-control"]), /no-store/);
    assert.equal(first.body.keeriLeadsUrl, "https://admin.keeri.example.invalid/leads");
    assert.deepEqual(first.body.items.map((row: any) => row.id), [pending.id, created.id, matched.id, failed.id, signup.id, unsent.id]);
    for (const row of first.body.items) {
        assert.deepEqual(Object.keys(row).sort(), ["createdAt", "id", "keeri", "kind"], "rows carry no name, email, phone, message, stage or assignee");
    }
    assert.deepEqual(first.body.items.map((row: any) => row.kind), ["contact", "project", "bulk", "contact", "newsletter", "contact"]);
    assert.equal(first.body.items[0].createdAt, at(5).toISOString());
    assert.deepEqual(first.body.items.map((row: any) => row.keeri), [
        { state: "pending", leadUrl: null },
        { state: "created", leadUrl: "https://admin.keeri.example.invalid/leads/lead_1" },
        { state: "matched", leadUrl: "https://admin.keeri.example.invalid/leads/lead_2" },
        { state: "failed", leadUrl: null },
        null,
        null,
    ]);
    // Newsletter signups (and kept reviews) stay viewable by kind.
    const signups = await read("kind=newsletter&limit=50");
    assert.equal(signups.status, 200);
    assert.ok(signups.body.items.some((row: any) => row.id === signup.id));
    assert.ok(signups.body.items.every((row: any) => row.kind === "newsletter"));
    const page = await read("limit=2");
    const cursor = JSON.parse(Buffer.from(page.body.nextCursor, "base64url").toString("utf8"));
    assert.deepEqual(Object.keys(cursor).sort(), ["createdAt", "id"]);
    const next = await read(`limit=2&cursor=${page.body.nextCursor}`);
    assert.deepEqual(next.body.items.map((row: any) => row.id), [matched.id, failed.id]);
    // Without Keeri leads there is no leads link and no lead URL, but a lead row still reports its state.
    const off = await read("limit=2", null);
    assert.equal(off.body.keeriLeadsUrl, null);
    assert.deepEqual(off.body.items.map((row: any) => row.keeri), [{ state: "pending", leadUrl: null }, { state: "created", leadUrl: null }]);
    // Pipeline filters and free-text search went with the CRM.
    for (const query of ["limit=0", "limit=51", "kind=unknown", "cursor=bad", "status=new", "assignment=mine", "from=2099-01-01", "q=synthetic", "kind=contact&kind=bulk"]) {
        const invalid = await read(query);
        assert.equal(invalid.status, 400, query);
        assert.match(String(invalid.headers["cache-control"]), /no-store/);
    }
});

test("the detail is read-only: the enquiry as submitted, without hashes or CRM fields", async () => {
    const account = await manager(), row = await enquiry("project");
    const full = await request(app(keeri)).get(`/api/admin/enquiries/${row.id}`).set("Cookie", account.cookie);
    assert.equal(full.status, 200);
    assert.match(String(full.headers["cache-control"]), /no-store/);
    assert.deepEqual(full.body, {
        id: row.id, kind: "project", name: "Synthetic Visitor", email: "synthetic@example.invalid", phone: "+91 90000 00000",
        message: "<script>synthetic text</script>", context: { product: "Chair", variant: "Blue", sku: "TEST", pincode: "110015" }, createdAt: row.createdAt.toISOString(),
    });
    assert.equal((await request(app()).get("/api/admin/enquiries/enq_00000000-0000-4000-8000-000000000000").set("Cookie", account.cookie)).status, 404);
});

test("the retired CRM routes answer 404 and change nothing, even for authorised staff with Origin and CSRF", async () => {
    const account = await manager(), row = await enquiry();
    const id = row.id, task = "c000000000000000000000001", contact = "ct_00000000-0000-4000-8000-000000000001";
    const retired: Array<["get" | "post", string, object?]> = [
        ["post", "/api/admin/enquiries/search", { q: "synthetic" }],
        ["get", "/api/admin/enquiries/assignees"],
        ["get", `/api/admin/enquiries/${id}/activity`],
        ["post", `/api/admin/enquiries/${id}/stage`, { expectedVersion: 0, stage: "contacted" }],
        ["post", `/api/admin/enquiries/${id}/assignment`, { expectedVersion: 0, assigneeId: account.id }],
        ["post", `/api/admin/enquiries/${id}/notes`, { expectedVersion: 0, body: "Called back" }],
        ["post", `/api/admin/enquiries/${id}/reply`, { expectedVersion: 0, subject: "Hello", body: "Thanks" }],
        ["post", `/api/admin/enquiries/${id}/review`, { expectedVersion: 0 }],
        ["get", "/api/admin/crm/contacts"],
        ["post", "/api/admin/crm/contacts/search", { q: "synthetic" }],
        ["get", `/api/admin/crm/contacts/${contact}`],
        ["get", `/api/admin/crm/contacts/${contact}/timeline`],
        ["post", `/api/admin/crm/contacts/${contact}`, { expectedVersion: 0, name: "", phone: "", city: "", tags: [], notes: "" }],
        ["get", "/api/admin/crm/tasks?today=2099-01-01"],
        ["post", "/api/admin/crm/tasks", { enquiryId: id, title: "Call", dueOn: "2099-01-01" }],
        ["post", `/api/admin/crm/tasks/${task}/complete`, { expectedVersion: 0, done: true }],
        ["get", "/api/admin/crm/summary?today=2099-01-01"],
    ];
    for (const [method, path, body] of retired) {
        const call = method === "get" ? request(app(keeri)).get(path) : request(app(keeri)).post(path).set("Origin", origin).set("X-CSRF-Token", account.csrf).send(body);
        const response = await call.set("Cookie", account.cookie);
        assert.equal(response.status, 404, `${method.toUpperCase()} ${path}`);
    }
    const stored = await db.enquiry.findUniqueOrThrow({ where: { id } });
    assert.equal(stored.version, 0);
    assert.equal(stored.status, "new");
    assert.equal(stored.assignedToId, null);
    assert.equal(await db.enquiryActivity.count({ where: { enquiryId: id } }), 0);
    assert.equal(await db.followUpTask.count({ where: { enquiryId: id } }), 0);
});

test("the retained routes still work: list, detail, delivery status and the audited Keeri retry", async () => {
    const account = await manager(), row = await enquiry();
    await lead(row.id, { status: "retry_wait", attempts: 1, version: 2, firstAttemptAt: new Date(), nextAttemptAt: new Date(Date.now() + 600000), errorCode: "provider_unavailable" });
    const http = () => request(app(keeri));
    assert.equal((await http().get("/api/admin/enquiries?limit=1").set("Cookie", account.cookie)).status, 200);
    assert.equal((await http().get(`/api/admin/enquiries/${row.id}`).set("Cookie", account.cookie)).status, 200);
    const status = await http().get(`/api/admin/enquiries/${row.id}/delivery`).set("Cookie", account.cookie);
    assert.equal(status.status, 200);
    assert.equal(status.body.keeri.delivery.canRetry, true);
    const retried = await http().post(`/api/admin/enquiries/${row.id}/delivery/retry`).set("Cookie", account.cookie).set("Origin", origin).set("X-CSRF-Token", account.csrf).send({ expectedVersion: 2, target: "keeri" });
    assert.equal(retried.status, 200);
    assert.equal(retried.body.keeri.delivery.version, 3);
    const job = await db.enquiryDelivery.findUniqueOrThrow({ where: { enquiryId_target: { enquiryId: row.id, target: "keeri" } } });
    assert.equal(await db.enquiryDeliveryRetryAudit.count({ where: { deliveryId: job.id, actorId: account.id } }), 1);
});
