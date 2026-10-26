import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const app = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const admins: string[] = [], enquiries: string[] = [];
after(async () => {
  const tables = await db.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public."EnquiryActivity"') IS NOT NULL AS exists`;
  if (tables[0]?.exists) for (const id of enquiries) await db.$executeRaw`DELETE FROM "EnquiryActivity" WHERE "enquiryId"=${id}`;
  await db.enquiryReviewAudit.deleteMany({ where: { enquiryId: { in: enquiries } } });
  await db.enquiry.deleteMany({ where: { id: { in: enquiries } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: admins } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: admins } } });
  await db.$disconnect();
});
async function staff(capable = true, active = true) {
  const token = randomBytes(32).toString("hex");
  const row = await db.shopAdmin.create({ data: { email: `workflow-${token.slice(0, 12)}@example.invalid`, role: "publisher", passwordHash: "invalid-unused-login-hash", canManageEnquiries: capable, active } });
  admins.push(row.id);
  await db.shopAdminSession.create({ data: { adminId: row.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
  return { id: row.id, email: row.email, cookie: `shop_admin=${token}`, csrf: hash("csrf:" + token) };
}
async function enquiry() {
  const row = await db.enquiry.create({ data: { id: `enq_${randomUUID()}`, idempotencyHash: hash(randomUUID()), payloadHash: hash(randomUUID()), kind: "contact", name: "Synthetic Visitor", email: "synthetic@example.invalid", phone: "", message: "Customer text", context: { product: "", variant: "", sku: "", pincode: "" } } });
  enquiries.push(row.id); return row;
}
type Staff = Awaited<ReturnType<typeof staff>>;
const get = (account: Staff, path: string) => request(app).get(`/api/admin/enquiries${path}`).set("Cookie", account.cookie);
const post = (account: Staff, id: string, action: string, body: object) => request(app).post(`/api/admin/enquiries/${id}/${action}`).set("Cookie", account.cookie).set("Origin", origin).set("X-CSRF-Token", account.csrf).send(body);
test("assignment and notes persist actor attribution; no-op stable and activity paginates", async () => {
  const actor = await staff(), target = await staff(), row = await enquiry();
  const assigned = await post(actor, row.id, "assignment", { expectedVersion: 0, assigneeId: target.id });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.assignedToId, target.id); assert.equal(assigned.body.version, 1);
  const noOp = await post(actor, row.id, "assignment", { expectedVersion: 1, assigneeId: target.id });
  assert.equal(noOp.status, 200); assert.equal(noOp.body.version, 1);
  assert.equal((await post(actor, row.id, "assignment", { expectedVersion: 0, assigneeId: target.id })).status, 409);
  const note = await post(actor, row.id, "notes", { expectedVersion: 1, body: "  Call tomorrow\n<script>plain text</script>  " });
  assert.equal(note.status, 200); assert.equal(note.body.version, 2);
  assert.equal((await post(actor, row.id, "assignment", { expectedVersion: 2, assigneeId: null })).status, 200);
  const activity = await get(actor, `/${row.id}/activity?limit=2`);
  assert.equal(activity.status, 200); assert.equal(activity.body.items.length, 2);
  assert.deepEqual(activity.body.items.map((item: any) => ({ action: item.action, version: item.version, actorId: item.actorId, assigneeId: item.assigneeId, body: item.body })), [
    { action: "unassigned", version: 3, actorId: actor.id, assigneeId: null, body: null },
    { action: "note", version: 2, actorId: actor.id, assigneeId: null, body: "Call tomorrow\n<script>plain text</script>" },
  ]);
  const second = await get(actor, `/${row.id}/activity?limit=2&cursor=${activity.body.nextCursor}`);
  assert.equal(second.status, 200); assert.equal(second.body.items.length, 1); assert.equal(second.body.items[0].action, "assigned"); assert.equal(second.body.items[0].assigneeId, target.id); assert.equal(second.body.nextCursor, null);
  assert.ok(activity.body.items.every((item: any) => item.id && !Number.isNaN(Date.parse(item.createdAt))));
  const detail = await get(actor, `/${row.id}`); assert.equal(detail.body.assignedToId, null); assert.equal(detail.body.version, 3); assert.equal(detail.body.body, undefined);
  const metadata = await get(actor, "?assignment=unassigned"); assert.equal(metadata.status, 200);
  const item = metadata.body.items.find((item: any) => item.id === row.id); assert.ok(item);
  assert.deepEqual(Object.keys(item).sort(), ["assignedToId", "createdAt", "id", "kind", "status", "version"]);
});
test("directory paginates only active capable staff and assignment filters match actor", async () => {
  const actor = await staff(), target = await staff(), incapable = await staff(false), inactive = await staff(true, false), row = await enquiry();
  const found: any[] = []; let cursor: string | null = null;
  do {
    const page = await get(actor, `/assignees?limit=2${cursor ? `&cursor=${cursor}` : ""}`); assert.equal(page.status, 200);
    assert.ok(page.body.items.length <= 2); found.push(...page.body.items); cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(new Set(found.map(item => item.id)).size, found.length);
  assert.deepEqual(found.find(item => item.id === target.id), { id: target.id, email: target.email });
  assert.ok(!found.some(item => item.id === incapable.id || item.id === inactive.id));
  assert.equal((await post(actor, row.id, "assignment", { expectedVersion: 0, assigneeId: actor.id })).status, 200);
  assert.ok((await get(actor, "?assignment=mine")).body.items.some((item: any) => item.id === row.id));
  assert.ok(!(await get(target, "?assignment=mine")).body.items.some((item: any) => item.id === row.id));
  assert.ok(!(await get(actor, "?assignment=unassigned")).body.items.some((item: any) => item.id === row.id));
});
test("new endpoints enforce capability, session validity, Origin and CSRF without writes", async () => {
  const actor = await staff(), denied = await staff(false), inactive = await staff(true, false), expired = await staff(), revoked = await staff(), row = await enquiry();
  await db.shopAdminSession.updateMany({ where: { adminId: expired.id }, data: { expiresAt: new Date(0) } });
  await db.shopAdminSession.deleteMany({ where: { adminId: revoked.id } });
  for (const path of ["/assignees", `/${row.id}/activity`]) {
    assert.equal((await request(app).get(`/api/admin/enquiries${path}`)).status, 401);
    for (const account of [denied, inactive, expired, revoked]) assert.equal((await get(account, path)).status, account === denied ? 403 : 401);
  }
  for (const [action, body] of [["assignment", { expectedVersion: 0, assigneeId: actor.id }], ["notes", { expectedVersion: 0, body: "Private" }]] as const) {
    assert.equal((await request(app).post(`/api/admin/enquiries/${row.id}/${action}`).set("Origin", origin).send(body)).status, 401);
    for (const account of [denied, inactive, expired, revoked]) assert.equal((await post(account, row.id, action, body)).status, account === denied ? 403 : 401);
    for (const [source, csrf] of [[origin, ""], [origin, "0".repeat(64)], ["https://other.invalid", actor.csrf], ["", actor.csrf]]) {
      const response = await request(app).post(`/api/admin/enquiries/${row.id}/${action}`).set("Cookie", actor.cookie).set("Origin", source!).set("X-CSRF-Token", csrf!).send(body);
      assert.equal(response.status, 403); assert.match(String(response.headers["cache-control"]), /no-store/);
    }
  }
  assert.equal((await get(actor, `/${row.id}`)).body.version, 0);
  assert.deepEqual((await get(actor, `/${row.id}/activity`)).body.items, []);
});
test("strict validation rejects injection, controls, pagination and unavailable targets atomically", async () => {
  const actor = await staff(), denied = await staff(false), inactive = await staff(true, false), row = await enquiry();
  for (const body of [{}, { expectedVersion: -1, assigneeId: actor.id }, { expectedVersion: 0, assigneeId: "bad/id" }, { expectedVersion: 0, assigneeId: actor.id, actorId: denied.id }, { expectedVersion: 0, assigneeId: denied.id }, { expectedVersion: 0, assigneeId: inactive.id }, { expectedVersion: 0, assigneeId: "c0000000000000000000000000" }]) assert.equal((await post(actor, row.id, "assignment", body)).status, 400);
  for (const body of [{}, { expectedVersion: 0, body: "   \n" }, { expectedVersion: 0, body: "x".repeat(2001) }, { expectedVersion: 0, body: "bad\u0000value" }, { expectedVersion: 0, body: "bad\u001bvalue" }, { expectedVersion: 0, body: "okay", actorId: actor.id }, { expectedVersion: 1.5, body: "okay" }]) assert.equal((await post(actor, row.id, "notes", body)).status, 400);
  for (const path of ["/assignees", `/${row.id}/activity`]) for (const query of ["limit=0", "limit=51", "cursor=bad", "limit=2&extra=1", "limit=1&limit=2"]) assert.equal((await get(actor, `${path}?${query}`)).status, 400);
  for (const id of ["bad", "enq_00000000-0000-4000-8000-000000000000"]) {
    const expected = id === "bad" ? 400 : 404;
    assert.equal((await get(actor, `/${id}/activity`)).status, expected);
    assert.equal((await post(actor, id, "notes", { expectedVersion: 0, body: "note" })).status, expected);
    assert.equal((await post(actor, id, "assignment", { expectedVersion: 0, assigneeId: null })).status, expected);
  }
  assert.equal((await get(actor, "?assignment=unknown")).status, 400);
  assert.equal((await get(actor, `/${row.id}`)).body.version, 0); assert.deepEqual((await get(actor, `/${row.id}/activity`)).body.items, []);
});
test("concurrent notes, assignments and reviews share one CAS version with no duplicate audit", async () => {
  const actor = await staff();
  for (const actions of [["notes", "notes"], ["assignment", "assignment"], ["assignment", "notes"], ["review", "notes"], ["review", "assignment"]]) {
    const row = await enquiry();
    const responses = await Promise.all(actions.map(action => post(actor, row.id, action, action === "notes" ? { expectedVersion: 0, body: "Call tomorrow" } : action === "assignment" ? { expectedVersion: 0, assigneeId: actor.id } : { expectedVersion: 0 })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const detail = await get(actor, `/${row.id}`), activity = await get(actor, `/${row.id}/activity`);
    assert.equal(detail.body.version, 1); assert.equal(activity.body.items.length + detail.body.reviews.length, 1);
  }
});
test("assignment waits for a concurrent target capability revocation and rejects the revoked target", async () => {
  const actor = await staff(), target = await staff(), row = await enquiry();
  let unblock!: () => void, started!: (pid: number) => void;
  const locked = new Promise<number>(resolve => { started = resolve; });
  const release = new Promise<void>(resolve => { unblock = resolve; });
  const revoke = db.$transaction(async tx => {
    const processes = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    const pid = processes[0]!.pid;
    await tx.shopAdmin.update({ where: { id: target.id }, data: { canManageEnquiries: false } });
    started(pid!); await release;
  }, { timeout: 10000 });
  const pid = await locked;
  const assignment = post(actor, row.id, "assignment", { expectedVersion: 0, assigneeId: target.id }).then(value => value);
  try {
    const waiting = (async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
        if (Number(rows[0]!.count) > 0) return "blocked";
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return "timeout";
    })();
    assert.equal(await Promise.race([assignment.then(() => "completed"), waiting]), "blocked");
  } finally { unblock(); await revoke; }
  const response = await assignment;
  assert.equal(response.status, 400); assert.equal(response.body.code, "ENQUIRY_ASSIGNEE_UNAVAILABLE");
  assert.equal((await get(actor, `/${row.id}`)).body.version, 0);
  assert.deepEqual((await get(actor, `/${row.id}/activity`)).body.items, []);
});
