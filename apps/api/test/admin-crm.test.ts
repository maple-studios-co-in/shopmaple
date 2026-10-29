import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp, type AppConfig } from "../src/app.js";
import { loadEnquiryDeliveryConfig } from "../src/enquiry-delivery-provider.js";
import { saveEnquiry } from "../src/enquiries.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const build = (extra: Partial<AppConfig> = {}) => createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, ...extra });
const app = build();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const admins: string[] = [], enquiries: string[] = [], contacts: string[] = [];
const suffix = randomBytes(4).toString("hex");
// Phone numbers are unique per run so a previous run's rows can never be matched by phone.
const digits = String(parseInt(suffix, 16) % 100000).padStart(5, "0");
// Numbers starting with 1 cannot be Indian mobiles (which start with 6 to 9), so fixtures are clearly synthetic.
const phone = (tail: string) => `1${digits}${tail}`;
after(async () => {
  const owned = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Enquiry" WHERE "id" = ANY(${enquiries}) OR "contactId" = ANY(${contacts})`;
  const ids = owned.map(row => row.id);
  await db.$executeRaw`DELETE FROM "EnquiryActivity" WHERE "enquiryId" = ANY(${ids})`;
  await db.$executeRaw`DELETE FROM "FollowUpTask" WHERE "enquiryId" = ANY(${ids}) OR "contactId" = ANY(${contacts})`;
  await db.$executeRaw`DELETE FROM "ContactActivity" WHERE "contactId" = ANY(${contacts})`;
  await db.$executeRaw`DELETE FROM "EnquiryDelivery" WHERE "enquiryId" = ANY(${ids})`;
  await db.enquiryReviewAudit.deleteMany({ where: { enquiryId: { in: ids } } });
  await db.enquiry.deleteMany({ where: { id: { in: ids } } });
  await db.$executeRaw`DELETE FROM "Contact" WHERE "id" = ANY(${contacts})`;
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: admins } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: admins } } });
  await db.$disconnect();
});
async function staff(role: "editor" | "publisher" = "editor", capable = true) {
  const token = randomBytes(32).toString("hex");
  const row = await db.shopAdmin.create({ data: { email: `crm-${token.slice(0, 12)}@example.invalid`, role, passwordHash: "invalid-unused-login-hash", canManageEnquiries: capable } });
  admins.push(row.id);
  await db.shopAdminSession.create({ data: { adminId: row.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
  return { id: row.id, email: row.email, cookie: `shop_admin=${token}`, csrf: hash("csrf:" + token) };
}
type Staff = Awaited<ReturnType<typeof staff>>;
const get = (account: Staff, path: string) => request(app).get(`/api/admin${path}`).set("Cookie", account.cookie);
const post = (account: Staff, path: string, body: object, http = app) => request(http).post(`/api/admin${path}`).set("Cookie", account.cookie).set("Origin", origin).set("X-CSRF-Token", account.csrf).send(body);
const sample = (body: Record<string, unknown>) => ({ kind: "contact", name: "Synthetic Visitor", phone: "", message: "Synthetic", context: { product: "Aero chair", variant: "", sku: "SKU-1", pincode: "" }, ...body });
/** Same persistence path as the public route, without its per-address submission limit. */
async function submit(body: Record<string, unknown>) {
  const result = await saveEnquiry(db, sample(body), randomUUID());
  assert.equal(result.created, true);
  const id = result.receipt.reference;
  enquiries.push(id);
  const row = await db.enquiry.findUniqueOrThrow({ where: { id } });
  if (row.contactId && !contacts.includes(row.contactId)) contacts.push(row.contactId);
  return row;
}
function tracked<T extends { id: string }>(row: T, kind: "enquiry" | "contact") { (kind === "enquiry" ? enquiries : contacts).push(row.id); return row; }

test("contacts link by normalised email only: a stranger's enquiry with the victim's phone gets its own contact and placeholders are never keyed", async () => {
  const posted = await request(app).post("/api/enquiries").set("Origin", origin).set("Idempotency-Key", randomUUID()).send(sample({ name: "Asha Rao", email: `Asha-${suffix}@Example.invalid`, phone: `+91 ${phone("")} 0001` }));
  assert.equal(posted.status, 201);
  const first = await db.enquiry.findUniqueOrThrow({ where: { id: posted.body.reference } });
  enquiries.push(first.id); contacts.push(first.contactId!);
  assert.ok(first.contactId, "a new enquiry creates a contact");
  const again = await submit({ name: "A. Rao", email: `asha-${suffix}@example.invalid`, phone: "" });
  assert.equal(again.contactId, first.contactId, "email is matched case-insensitively");
  const attacker = await submit({ name: "Someone Else", email: `attacker-${suffix}@example.invalid`, phone: phone("0001") });
  assert.notEqual(attacker.contactId, first.contactId, "an unverified phone never attaches a different email to an existing contact");
  const attackerContact = await db.$queryRaw<Array<{ emailKey: string; phoneKey: string | null }>>`SELECT "emailKey","phoneKey" FROM "Contact" WHERE "id"=${attacker.contactId}`;
  assert.equal(attackerContact[0]!.emailKey, `attacker-${suffix}@example.invalid`);
  assert.equal(attackerContact[0]!.phoneKey, `91${phone("0001")}`, "the same normalised phone may be stored on two contacts; it is never a key");
  const contact = await db.$queryRaw<Array<{ name: string; email: string; phone: string; emailKey: string; phoneKey: string | null }>>`SELECT "name","email","phone","emailKey","phoneKey" FROM "Contact" WHERE "id"=${first.contactId}`;
  assert.deepEqual(contact[0], { name: "Asha Rao", email: `asha-${suffix}@example.invalid`, phone: `+91 ${phone("")} 0001`, emailKey: `asha-${suffix}@example.invalid`, phoneKey: `91${phone("0001")}` });
  for (const [index, placeholder] of ["0000000000", "1234567890", "+91 99999 99999", "12345", "+91 0123456789", ""].entries()) {
    const row = await submit({ name: "Placeholder", email: `placeholder-${index}-${suffix}@example.invalid`, phone: placeholder });
    const keyed = await db.$queryRaw<Array<{ phoneKey: string | null }>>`SELECT "phoneKey" FROM "Contact" WHERE "id"=${row.contactId}`;
    assert.equal(keyed[0]!.phoneKey, null, `placeholder phone ${JSON.stringify(placeholder)} is never keyed`);
  }
  const email = `race-${suffix}@example.invalid`;
  const raced = await Promise.all([1, 2, 3].map(() => request(app).post("/api/enquiries").set("Origin", origin).set("Idempotency-Key", randomUUID()).send({ kind: "contact", email, message: "Race" })));
  assert.deepEqual(raced.map(r => r.status), [201, 201, 201]);
  const rows = await db.enquiry.findMany({ where: { id: { in: raced.map(r => r.body.reference) } }, select: { id: true, contactId: true } });
  enquiries.push(...rows.map(r => r.id)); contacts.push(rows[0]!.contactId!);
  assert.equal(new Set(rows.map(r => r.contactId)).size, 1, "concurrent first enquiries share one contact");
});

test("pipeline stage changes log actor and stage, require a lost reason, and the legacy review route is gone", async () => {
  const actor = await staff("editor");
  const row = await submit({ email: `stage-${suffix}@example.invalid` });
  const stage = (body: object, account = actor) => post(account, `/enquiries/${row.id}/stage`, body);
  assert.equal((await post(actor, `/enquiries/${row.id}/review`, { expectedVersion: 0 })).status, 404, "two-state review is replaced by the pipeline");
  for (const body of [{}, { expectedVersion: 0, stage: "reviewed" }, { expectedVersion: 0, stage: "lost" }, { expectedVersion: 0, stage: "quoted", reason: "not allowed" }, { expectedVersion: 0, stage: "lost", reason: "x".repeat(501) }, { expectedVersion: 0, stage: "lost", reason: "bad\u0000" }])
    assert.equal((await stage(body)).status, 400);
  const contacted = await stage({ expectedVersion: 0, stage: "contacted" });
  assert.equal(contacted.status, 200); assert.equal(contacted.body.status, "contacted"); assert.equal(contacted.body.version, 1); assert.equal(contacted.body.lostReason, null);
  assert.equal((await stage({ expectedVersion: 0, stage: "quoted" })).status, 409);
  const noOp = await stage({ expectedVersion: 1, stage: "contacted" });
  assert.equal(noOp.status, 200); assert.equal(noOp.body.version, 1, "same stage is a no-op without an audit row");
  const quoted = await stage({ expectedVersion: 1, stage: "quoted" }); assert.equal(quoted.body.version, 2);
  const lost = await stage({ expectedVersion: 2, stage: "lost", reason: "  Chose another supplier  " });
  assert.equal(lost.status, 200); assert.equal(lost.body.status, "lost"); assert.equal(lost.body.lostReason, "Chose another supplier");
  const won = await stage({ expectedVersion: 3, stage: "won" }); assert.equal(won.body.lostReason, null, "leaving lost clears the reason");
  const activity = await get(actor, `/enquiries/${row.id}/activity`);
  assert.equal(activity.status, 200);
  assert.deepEqual(activity.body.items.map((item: any) => [item.action, item.version, item.actorId, item.stage, item.body]), [
    ["status_changed", 4, actor.id, "won", null], ["status_changed", 3, actor.id, "lost", "Chose another supplier"], ["status_changed", 2, actor.id, "quoted", null], ["status_changed", 1, actor.id, "contacted", null],
  ]);
  const detail = await get(actor, `/enquiries/${row.id}`);
  assert.equal(detail.body.contactId, row.contactId); assert.equal(detail.body.name, "Synthetic Visitor");
  assert.equal((await get(actor, "/enquiries?status=reviewed")).status, 400);
  assert.ok((await get(actor, "/enquiries?status=won")).body.items.some((item: any) => item.id === row.id));
});

test("list filters by stage, assignee and Kolkata date range; search runs over POST so no contact data enters a URL", async () => {
  const actor = await staff("publisher"), other = await staff();
  const a = await submit({ name: "Priya Menon", email: `priya-${suffix}@example.invalid`, phone: `+91 ${phone("")} 1111`, context: { product: "Nimbus Sofa", variant: "", sku: `NIM-3S-${suffix}`, pincode: "" } });
  const b = await submit({ name: "Rahul K", email: `rahul-${suffix}@example.invalid`, phone: `+91 ${phone("")} 2222`, context: { product: "Aero Chair", variant: "", sku: `AER-1-${suffix}`, pincode: "" } });
  const c = await submit({ name: "Late Night", email: `late-${suffix}@example.invalid` });
  // 23:30 and 00:00 Asia/Kolkata on either side of midnight, 10 and 11 March.
  await db.enquiry.update({ where: { id: b.id }, data: { createdAt: new Date("2099-03-10T18:00:00Z") } });
  await db.enquiry.update({ where: { id: c.id }, data: { createdAt: new Date("2099-03-10T18:30:00Z") } });
  assert.equal((await post(actor, `/enquiries/${a.id}/assignment`, { expectedVersion: 0, assigneeId: other.id })).status, 200);
  const mine = [a.id, b.id, c.id];
  const ids = async (query: string) => { const r = await get(actor, `/enquiries?${query}`); assert.equal(r.status, 200, query); return (r.body.items.map((item: any) => item.id) as string[]).filter(id => mine.includes(id)); };
  const search = async (body: object) => { const r = await post(actor, "/enquiries/search", body); assert.equal(r.status, 200, JSON.stringify(body)); return (r.body.items.map((item: any) => item.id) as string[]).filter(id => mine.includes(id)); };
  assert.deepEqual(await search({ q: "priya menon" }), [a.id]);
  assert.deepEqual(await search({ q: `RAHUL-${suffix}@EXAMPLE` }), [b.id]);
  assert.deepEqual(await search({ q: `${digits} 1111` }), [a.id]);
  assert.deepEqual(await search({ q: "nimbus sofa" }), [a.id]);
  assert.deepEqual(await search({ q: `aer-1-${suffix}` }), [b.id]);
  assert.deepEqual(await search({ q: `%%%-${suffix}` }), [], "wildcards are literal");
  assert.deepEqual(await search({ q: `rahul-${suffix}`, to: "2099-03-09" }), []);
  assert.deepEqual(await search({ status: "new", assigneeId: other.id }), [a.id], "search accepts every list filter");
  assert.deepEqual(await ids(`assigneeId=${other.id}`), [a.id]);
  assert.deepEqual(await ids(`from=2099-03-10&to=2099-03-10`), [b.id], "day bounds are Asia/Kolkata calendar days");
  assert.deepEqual(await ids(`from=2099-03-11&to=2099-03-11`), [c.id]);
  assert.deepEqual(await ids(`from=2099-03-12`), []);
  assert.equal((await get(actor, `/enquiries?q=priya`)).status, 400, "GET never carries search text");
  assert.equal((await request(app).post("/api/admin/enquiries/search").set("Cookie", actor.cookie).set("Origin", origin).send({ q: "priya" })).status, 403, "search needs CSRF like every POST");
  const item = (await post(actor, "/enquiries/search", { q: `priya-${suffix}` })).body.items[0];
  assert.deepEqual(Object.keys(item).sort(), ["assignedToId", "contactId", "createdAt", "id", "kind", "name", "nextDueOn", "product", "status", "version"]);
  assert.equal(item.name, "Priya Menon"); assert.equal(item.product, "Nimbus Sofa"); assert.equal(item.contactId, a.contactId); assert.equal(item.nextDueOn, null);
  assert.equal((await post(actor, "/crm/tasks", { enquiryId: a.id, title: "Quote", dueOn: "2030-01-05" })).status, 201);
  assert.equal((await post(actor, "/crm/tasks", { enquiryId: a.id, title: "Earlier", dueOn: "2030-01-02" })).status, 201);
  assert.equal((await post(actor, "/enquiries/search", { q: `priya-${suffix}` })).body.items[0].nextDueOn, "2030-01-02", "rows carry the earliest open follow-up");
  for (const query of ["from=2099-13-01", "from=2026-02-31", "to=bad", "assigneeId=nope", "q=x"]) assert.equal((await get(actor, `/enquiries?${query}`)).status, 400, query);
  for (const body of [{ q: "x".repeat(101) }, { q: "bad\u0000" }, { from: "2026-02-30" }, { email: "x" }]) assert.equal((await post(actor, "/enquiries/search", body)).status, 400, JSON.stringify(body));
});

test("contacts list, search, detail with enquiries, guarded update and a combined timeline", async () => {
  const actor = await staff();
  const first = await submit({ name: "Meera Iyer", email: `meera-${suffix}@example.invalid`, phone: `+91 ${phone("")} 3333`, context: { product: "Dining table", variant: "", sku: "", pincode: "" } });
  const second = await submit({ name: "Meera", email: `meera-${suffix}@example.invalid`, kind: "project" });
  const contactId = first.contactId!;
  const list = await post(actor, "/crm/contacts/search", { q: `meera-${suffix}` });
  assert.equal(list.status, 200); assert.equal(list.body.items.length, 1);
  assert.deepEqual(Object.keys(list.body.items[0]).sort(), ["city", "createdAt", "email", "id", "name", "notes", "phone", "tags", "updatedAt", "version"]);
  assert.equal((await post(actor, "/crm/contacts/search", { q: "x".repeat(101) })).status, 400);
  assert.equal((await get(actor, `/crm/contacts?q=meera`)).status, 400, "GET never carries search text");
  assert.equal((await get(actor, "/crm/contacts")).status, 200);
  assert.equal((await get(actor, "/crm/contacts/ct_00000000-0000-4000-8000-000000000000")).status, 404);
  const detail = await get(actor, `/crm/contacts/${contactId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.contact.id, contactId); assert.equal(detail.body.contact.name, "Meera Iyer");
  assert.deepEqual(detail.body.enquiries.map((row: any) => row.id), [second.id, first.id], "newest enquiry first");
  assert.equal(detail.body.enquiries[0].email, undefined, "enquiry rows are summaries");
  const update = (body: object) => post(actor, `/crm/contacts/${contactId}`, body);
  assert.equal((await update({ expectedVersion: 0, name: "Meera Iyer", phone: `+91 ${phone("")} 3333`, city: "Bengaluru", tags: ["trade", "repeat"], notes: "Prefers walnut", email: "x@example.invalid" })).status, 400, "email is immutable");
  const saved = await update({ expectedVersion: 0, name: "Meera Iyer", phone: `+91 ${phone("")} 3333`, city: "Bengaluru", tags: ["trade", "repeat"], notes: "Prefers walnut" });
  assert.equal(saved.status, 200); assert.equal(saved.body.version, 1); assert.equal(saved.body.city, "Bengaluru"); assert.deepEqual(saved.body.tags, ["trade", "repeat"]);
  assert.equal((await update({ expectedVersion: 0, name: "Meera", phone: "", city: "", tags: [], notes: "" })).status, 409);
  const other = await submit({ name: "Phone owner", email: `phone-owner-${suffix}@example.invalid`, phone: `+91 ${phone("")} 4444` });
  const shared = await update({ expectedVersion: 1, name: "Meera Iyer", phone: `${phone("")} 4444`, city: "Bengaluru", tags: [], notes: "" });
  assert.equal(shared.status, 200, "phones are not keys, so two contacts may share one"); assert.ok(other.contactId);
  assert.equal((await update({ expectedVersion: 2, name: "Meera\u202eIyer", phone: "", city: "", tags: [], notes: "" })).status, 400, "bidi overrides are rejected");
  for (const mark of ["\u2028", "\u2029", "\u200e", "\u200f"]) assert.equal((await update({ expectedVersion: 2, name: `Meera${mark}Iyer`, phone: "", city: "", tags: [], notes: "" })).status, 400, `U+${mark.charCodeAt(0).toString(16)} is rejected`);
  assert.equal((await update({ expectedVersion: 2, name: "Meera", phone: "", city: "", tags: ["a\nb"], notes: "" })).status, 400, "tags are single line");
  assert.equal((await update({ expectedVersion: 2, name: "Meera Iyer", phone: "", city: "", tags: [], notes: "line one\nline two" })).status, 200, "notes keep newlines");
  await post(actor, `/enquiries/${first.id}/stage`, { expectedVersion: 0, stage: "contacted" });
  await post(actor, `/enquiries/${second.id}/notes`, { expectedVersion: 0, body: "Called back" });
  const timeline = await get(actor, `/crm/contacts/${contactId}/timeline?limit=2`);
  assert.equal(timeline.status, 200); assert.equal(timeline.body.items.length, 2);
  const all = [...timeline.body.items, ...(await get(actor, `/crm/contacts/${contactId}/timeline?limit=10&cursor=${timeline.body.nextCursor}`)).body.items];
  assert.deepEqual(all.map((item: any) => [item.source, item.action, item.enquiryId]), [
    ["enquiry", "note", second.id], ["enquiry", "status_changed", first.id], ["contact", "updated", null], ["contact", "updated", null], ["contact", "updated", null], ["enquiry", "enquiry_received", second.id], ["enquiry", "enquiry_received", first.id],
  ]);
  assert.equal(all[0].body, "Called back"); assert.equal(all[1].stage, "contacted"); assert.equal(all[2].actorId, actor.id);
});

test("follow-up tasks belong to one enquiry or contact, filter by overdue/today/open/done and mine, and completion logs activity", async () => {
  const actor = await staff(), colleague = await staff();
  const row = await submit({ email: `tasks-${suffix}@example.invalid` });
  const contactId = row.contactId!;
  const create = (body: object) => post(actor, "/crm/tasks", body);
  for (const body of [{ title: "No parent", dueOn: "2030-01-01" }, { enquiryId: row.id, contactId, title: "Both", dueOn: "2030-01-01" }, { enquiryId: row.id, title: "", dueOn: "2030-01-01" }, { enquiryId: row.id, title: "Bad date", dueOn: "2030-1-1" }, { enquiryId: row.id, title: "Impossible date", dueOn: "2030-02-30" }, { enquiryId: row.id, title: "Multi\nline", dueOn: "2030-01-01" }, { enquiryId: row.id, title: "Bad assignee", dueOn: "2030-01-01", assigneeId: "nope" }, { enquiryId: "enq_00000000-0000-4000-8000-000000000000", title: "Missing", dueOn: "2030-01-01" }])
    assert.ok([400, 404].includes((await create(body)).status), JSON.stringify(body));
  const overdue = await create({ enquiryId: row.id, title: "Send quote", dueOn: "2030-01-05", assigneeId: actor.id, note: "Walnut finish" });
  assert.equal(overdue.status, 201);
  assert.deepEqual(Object.keys(overdue.body).sort(), ["assigneeId", "completedAt", "contactId", "createdAt", "done", "dueOn", "enquiryId", "id", "note", "title", "version"]);
  assert.equal(overdue.body.dueOn, "2030-01-05"); assert.equal(overdue.body.done, false);
  const today = await create({ contactId, title: "Call Meera", dueOn: "2030-01-10", assigneeId: colleague.id });
  const later = await create({ enquiryId: row.id, title: "Site visit", dueOn: "2030-02-01" });
  assert.equal(later.status, 201);
  const known = [overdue.body.id, today.body.id, later.body.id];
  const ids = async (query: string) => { const r = await get(actor, `/crm/tasks?${query}`); assert.equal(r.status, 200, query); return (r.body.items.map((item: any) => item.id) as string[]).filter(id => known.includes(id)); };
  assert.equal((await get(actor, "/crm/tasks")).status, 400, "today is required");
  assert.deepEqual(await ids("view=overdue&today=2030-01-10"), [overdue.body.id]);
  assert.deepEqual(await ids("view=today&today=2030-01-10"), [today.body.id]);
  assert.deepEqual(await ids("view=open&today=2030-01-10"), [overdue.body.id, today.body.id, later.body.id], "open tasks are ordered by due date");
  assert.deepEqual(await ids(`view=open&today=2030-01-10&assignment=mine&enquiryId=${row.id}`), [overdue.body.id]);
  assert.deepEqual(await ids(`view=open&today=2030-01-10&contactId=${contactId}`), [today.body.id]);
  const complete = (id: string, body: object, account = actor) => post(account, `/crm/tasks/${id}/complete`, body);
  assert.equal((await complete(overdue.body.id, { expectedVersion: 1, done: true })).status, 409);
  const done = await complete(overdue.body.id, { expectedVersion: 0, done: true });
  assert.equal(done.status, 200); assert.equal(done.body.done, true); assert.ok(done.body.completedAt); assert.equal(done.body.version, 1);
  assert.deepEqual(await ids("view=overdue&today=2030-01-10"), []);
  assert.deepEqual(await ids(`view=done&today=2030-01-10&enquiryId=${row.id}`), [overdue.body.id]);
  const activity = await get(actor, `/enquiries/${row.id}/activity`);
  assert.deepEqual(activity.body.items.map((item: any) => [item.action, item.actorId, item.taskId, item.body]), [
    ["task_completed", actor.id, overdue.body.id, "Send quote"], ["task_created", actor.id, later.body.id, "Site visit"], ["task_created", actor.id, overdue.body.id, "Send quote"],
  ]);
  assert.equal((await get(actor, `/enquiries/${row.id}`)).body.version, 3, "enquiry activity shares the enquiry version");
  const reopened = await complete(overdue.body.id, { expectedVersion: 1, done: false });
  assert.equal(reopened.body.done, false); assert.equal(reopened.body.completedAt, null);
  assert.equal((await complete(today.body.id, { expectedVersion: 0, done: true }, colleague)).status, 200);
  const timeline = await get(actor, `/crm/contacts/${contactId}/timeline?limit=3`);
  assert.deepEqual(timeline.body.items.map((item: any) => [item.source, item.action, item.body]), [["contact", "task_completed", "Call Meera"], ["enquiry", "task_reopened", "Send quote"], ["enquiry", "task_completed", "Send quote"]]);
});

test("dashboard summary counts stages, overdue and due-today tasks and enquiries from the last seven days", async () => {
  const actor = await staff();
  const read = async () => { const r = await get(actor, "/crm/summary?today=2030-06-15"); assert.equal(r.status, 200); return r.body; };
  assert.equal((await get(actor, "/crm/summary")).status, 400);
  const before = await read();
  const fresh = await submit({ email: `summary-fresh-${suffix}@example.invalid` });
  const old = await submit({ email: `summary-old-${suffix}@example.invalid` });
  // 00:00 and 23:59:59 Asia/Kolkata on 9 and 8 June respectively.
  await db.enquiry.update({ where: { id: fresh.id }, data: { createdAt: new Date("2030-06-08T18:30:00Z") } });
  await db.enquiry.update({ where: { id: old.id }, data: { createdAt: new Date("2030-06-08T18:29:59Z") } });
  await post(actor, `/enquiries/${old.id}/stage`, { expectedVersion: 0, stage: "quoted" });
  await post(actor, "/crm/tasks", { enquiryId: fresh.id, title: "Late", dueOn: "2030-06-14" });
  await post(actor, "/crm/tasks", { enquiryId: fresh.id, title: "Today", dueOn: "2030-06-15" });
  const doneTask = await post(actor, "/crm/tasks", { enquiryId: fresh.id, title: "Done late", dueOn: "2030-06-01" });
  await post(actor, `/crm/tasks/${doneTask.body.id}/complete`, { expectedVersion: 0, done: true });
  const after = await read();
  assert.deepEqual(Object.keys(after).sort(), ["dueTodayTasks", "newLastSevenDays", "overdueTasks", "stages"]);
  assert.equal(after.stages.new - before.stages.new, 1); assert.equal(after.stages.quoted - before.stages.quoted, 1);
  assert.equal(after.overdueTasks - before.overdueTasks, 1); assert.equal(after.dueTodayTasks - before.dueTodayTasks, 1);
  assert.equal(after.newLastSevenDays - before.newLastSevenDays, 1, "seven Kolkata calendar days: today and the six before it");
  assert.equal((await get(actor, "/crm/summary?today=2030-02-30")).status, 400, "impossible dates are rejected");
});

test("reply by email is refused without Resend, otherwise sends plain text to the customer once per version and records the full message", async () => {
  const actor = await staff();
  const row = await submit({ email: `reply-${suffix}@example.invalid`, name: "Reply Target" });
  const reply = (body: object, http = app, account = actor) => post(account, `/enquiries/${row.id}/reply`, body, http);
  const refused = await reply({ expectedVersion: 0, subject: "Hello", body: "Thanks" });
  assert.equal(refused.status, 503); assert.equal(refused.body.code, "EMAIL_NOT_CONFIGURED");
  assert.deepEqual((await get(actor, `/enquiries/${row.id}/activity`)).body.items, []);
  const config = loadEnquiryDeliveryConfig({ ENQUIRY_DELIVERY_ENABLED: "true", ENQUIRY_RESEND_API_KEY: "synthetic-test-key", ENQUIRY_MAIL_FROM: "shop@example.invalid", ENQUIRY_MAIL_TO: "staff@example.invalid", WEB_ORIGIN: origin })!;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let outcome: "ok" | "fail" = "ok";
  const outboundFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init! });
    return outcome === "ok" ? Response.json({ id: randomUUID() }) : Response.json({ name: "validation_error" }, { status: 422 });
  };
  const configured = build({ enquiryDelivery: config, outboundFetch });
  for (const body of [{}, { expectedVersion: 0, subject: "", body: "x" }, { expectedVersion: 0, subject: "s", body: " " }, { expectedVersion: 0, subject: "s", body: "x".repeat(5001) }, { expectedVersion: 0, subject: "s", body: "bad\u0007" }, { expectedVersion: 0, subject: "s", body: "x", html: "<b>" },
    { expectedVersion: 0, subject: "Hi\r\nBcc: x@evil.test", body: "x" }, { expectedVersion: 0, subject: "Hi\nthere", body: "x" }, { expectedVersion: 0, subject: "Line\u2028sep", body: "x" }, { expectedVersion: 0, subject: "Para\u2029sep", body: "x" }, { expectedVersion: 0, subject: "Mark\u200eLRM", body: "x" }, { expectedVersion: 0, subject: "Mark\u200fRLM", body: "x" }, { expectedVersion: 0, subject: "s", body: "body\u2028sep" }, { expectedVersion: 0, subject: "Hi\tthere", body: "x" }, { expectedVersion: 0, subject: "Invoice \u202eexe.pdf", body: "x" }, { expectedVersion: 0, subject: "s", body: "see \u2066this\u2069" }, { expectedVersion: 0, subject: "s", body: "line\r\nbreak" }, { expectedVersion: 0, subject: "s\u0085", body: "x" }])
    assert.equal((await reply(body, configured)).status, 400, JSON.stringify(body));
  assert.equal((await reply({ expectedVersion: 5, subject: "s", body: "x" }, configured)).status, 409);
  assert.equal(calls.length, 0, "no email leaves before validation and version checks pass");
  assert.deepEqual((await get(actor, `/enquiries/${row.id}/activity`)).body.items, [], "rejected replies leave no activity");
  const text = "Hi Reply Target,\n\nThe Aero chair is in stock. <b>not html</b>\n\tTabbed line\n\nMaple";
  const sent = await reply({ expectedVersion: 0, subject: "  Your Aero chair enquiry ", body: text }, configured);
  assert.equal(sent.status, 200, JSON.stringify(sent.body)); assert.equal(sent.body.version, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.resend.com/emails");
  const payload = JSON.parse(String(calls[0]!.init.body));
  assert.deepEqual(payload, { from: "shop@example.invalid", to: [`reply-${suffix}@example.invalid`], reply_to: "staff@example.invalid", subject: "Your Aero chair enquiry", text });
  assert.equal("html" in payload, false, "replies are plain text only");
  assert.equal(new Headers(calls[0]!.init.headers).get("Authorization"), "Bearer synthetic-test-key");
  assert.equal(new Headers(calls[0]!.init.headers).get("Idempotency-Key"), `reply/${row.id}/1`, "the provider key is derived from the enquiry and the version consumed");
  const logged = (await get(actor, `/enquiries/${row.id}/activity`)).body.items[0];
  assert.equal(logged.action, "email_sent"); assert.equal(logged.actorId, actor.id); assert.equal(logged.subject, "Your Aero chair enquiry"); assert.equal(logged.body, text); assert.equal(logged.version, 1);
  const raced = await Promise.all([reply({ expectedVersion: 1, subject: "Twice", body: "Only once" }, configured), reply({ expectedVersion: 1, subject: "Twice", body: "Only once" }, configured)]);
  assert.deepEqual(raced.map(r => r.status).sort(), [200, 409], "two replies with one expected version: one wins");
  assert.equal(calls.length, 2, "the loser never reaches the provider");
  assert.equal((await get(actor, `/enquiries/${row.id}`)).body.version, 2);
  outcome = "fail";
  const failed = await reply({ expectedVersion: 2, subject: "Again", body: "Second" }, configured);
  assert.equal(failed.status, 502); assert.equal(failed.body.code, "EMAIL_SEND_FAILED");
  const after = (await get(actor, `/enquiries/${row.id}/activity`)).body.items[0];
  assert.equal(after.action, "email_failed"); assert.equal(after.body, "Second"); assert.equal(after.version, 3);
  outcome = "ok";
  let version = 3; const statuses: number[] = [];
  for (let i = 0; i < 20; i++) { const r = await reply({ expectedVersion: version, subject: "Bulk", body: `Message ${i}` }, configured); statuses.push(r.status); if (r.status === 200) version = r.body.version; }
  const limited = await reply({ expectedVersion: version, subject: "Bulk", body: "One too many" }, configured);
  assert.equal(limited.status, 429, "per-staff rate limit"); assert.equal(limited.body.code, "REPLY_RATE_LIMITED");
  assert.equal(statuses.filter(s => s === 200).length, 18, "twenty accepted sends per staff member per hour; the failed send did not count");
  const other = await staff();
  assert.equal((await reply({ expectedVersion: version, subject: "Other", body: "Different staff member" }, configured, other)).status, 200);
});

test("the per-staff limit reserves a slot before the send, so parallel replies across enquiries cannot exceed it", async () => {
  const actor = await staff();
  const first = await submit({ email: `slot-a-${suffix}@example.invalid` }), second = await submit({ email: `slot-b-${suffix}@example.invalid` });
  const config = loadEnquiryDeliveryConfig({ ENQUIRY_DELIVERY_ENABLED: "true", ENQUIRY_RESEND_API_KEY: "synthetic-test-key", ENQUIRY_MAIL_FROM: "shop@example.invalid", ENQUIRY_MAIL_TO: "staff@example.invalid", WEB_ORIGIN: origin })!;
  let calls = 0; let fail = false;
  const outboundFetch: typeof fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 40)); return fail ? Response.json({ name: "validation_error" }, { status: 422 }) : Response.json({ id: randomUUID() }); };
  const oneSlot = build({ enquiryDelivery: config, outboundFetch, replyRateLimit: { limit: 1, windowMs: 60_000 } });
  const send = (id: string, version: number) => post(actor, `/enquiries/${id}/reply`, { expectedVersion: version, subject: "Slot", body: "One at a time" }, oneSlot);
  const raced = await Promise.all([send(first.id, 0), send(second.id, 0)]);
  assert.deepEqual(raced.map(r => r.status).sort(), [200, 429], "the second reply is refused while the first is still in flight");
  assert.equal(calls, 1, "only one send reached the provider");
  const refused = raced.find(r => r.status === 429)!; assert.equal(refused.body.code, "REPLY_RATE_LIMITED");
  const untouched = raced[0]!.status === 429 ? first : second;
  assert.equal((await get(actor, `/enquiries/${untouched.id}`)).body.version, 0, "a refused reply consumes no version and records nothing");
  assert.deepEqual((await get(actor, `/enquiries/${untouched.id}/activity`)).body.items, []);
  // A failed send releases its reservation: the slot is immediately usable again.
  const twoSlots = build({ enquiryDelivery: config, outboundFetch, replyRateLimit: { limit: 1, windowMs: 60_000 } });
  fail = true;
  assert.equal((await post(actor, `/enquiries/${untouched.id}/reply`, { expectedVersion: 0, subject: "Fails", body: "x" }, twoSlots)).status, 502);
  fail = false;
  assert.equal((await post(actor, `/enquiries/${untouched.id}/reply`, { expectedVersion: 1, subject: "Works", body: "x" }, twoSlots)).status, 200);
});

test("every CRM endpoint keeps the session, capability, Origin and CSRF rules for both roles", async () => {
  const editor = await staff("editor"), publisher = await staff("publisher"), denied = await staff("publisher", false);
  const row = await submit({ email: `perm-${suffix}@example.invalid` });
  const contactId = row.contactId!;
  const task = await post(publisher, "/crm/tasks", { enquiryId: row.id, title: "Perm", dueOn: "2030-01-01" });
  assert.equal(task.status, 201);
  const reads = ["/crm/contacts", `/crm/contacts/${contactId}`, `/crm/contacts/${contactId}/timeline`, "/crm/tasks?today=2030-01-01", "/crm/summary?today=2030-01-01", "/enquiries?status=new"];
  for (const path of reads) {
    assert.equal((await request(app).get(`/api/admin${path}`)).status, 401, path);
    assert.equal((await get(denied, path)).status, 403, path);
    for (const account of [editor, publisher]) { const r = await get(account, path); assert.equal(r.status, 200, `${account.id} ${path}`); assert.match(String(r.headers["cache-control"]), /no-store/); }
  }
  const writes: Array<[string, object]> = [["/enquiries/search", { q: "perm" }], ["/crm/contacts/search", { q: "perm" }], [`/enquiries/${row.id}/stage`, { expectedVersion: 99, stage: "contacted" }], [`/enquiries/${row.id}/reply`, { expectedVersion: 99, subject: "s", body: "b" }], [`/crm/contacts/${contactId}`, { expectedVersion: 99, name: "n", phone: "", city: "", tags: [], notes: "" }], ["/crm/tasks", { enquiryId: row.id, title: "t", dueOn: "2030-01-01" }], [`/crm/tasks/${task.body.id}/complete`, { expectedVersion: 99, done: true }]];
  for (const [path, body] of writes) {
    assert.equal((await request(app).post(`/api/admin${path}`).set("Origin", origin).send(body)).status, 401, path);
    assert.equal((await post(denied, path, body)).status, 403, path);
    for (const [source, csrf] of [[origin, ""], [origin, "0".repeat(64)], ["https://other.invalid", editor.csrf]] as const) {
      const r = await request(app).post(`/api/admin${path}`).set("Cookie", editor.cookie).set("Origin", source).set("X-CSRF-Token", csrf).send(body);
      assert.equal(r.status, 403, `${path} ${source} ${csrf}`); assert.match(String(r.headers["cache-control"]), /no-store/);
    }
  }
  assert.equal((await get(editor, `/enquiries/${row.id}`)).body.version, 1, "only the authorised task creation changed the enquiry");
});
