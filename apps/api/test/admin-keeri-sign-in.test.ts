import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { randomBytes, scryptSync } from "node:crypto";
import { createApp, type AppConfig } from "../src/app.js";
import { loadAdminSignIn, type AdminSignIn, type KeeriSignInConfig } from "../src/admin/keeri-sign-in.js";

// Shop admin sign-in with Keeri accounts (ADMIN_SIGN_IN=keeri), against a stand-in for Keeri's two server routes.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const base: AppConfig = { webOrigin: origin, catalogMode: "preview", secureCookies: false };
const secret = randomBytes(32).toString("base64url");
const tenantId = "tenant_maple";
const callback = `${origin}/api/admin/keeri/callback`;
const password = randomBytes(24).toString("base64url");
const passwordHash = (() => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$131072$8$1$${salt}$${scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }).toString("hex")}`;
})();

type Person = { id: string; name: string; email: string; permissions: string[]; tenantId?: string };
/** Keeri as the store sees it: codes that work once, and a live answer about each person. */
function fakeKeeri() {
  const codes = new Map<string, Person>();
  const people = new Map<string, Person>();
  const calls: { url: string; authorization: string | null; body: Record<string, unknown> }[] = [];
  const state = { reachable: true, status: 200 };
  const answer = (person: Person) => ({ tenantId: person.tenantId ?? tenantId, user: { id: person.id, name: person.name, email: person.email }, permissions: person.permissions });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchKeeri: typeof fetch = async (input, init) => {
    const target = String(input);
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: target, authorization: headers.get("authorization"), body });
    if (!state.reachable) throw new TypeError(`fetch failed for ${target} with ${headers.get("authorization")}`);
    if (state.status !== 200) return json({ error: "sign_in_unavailable" }, state.status);
    if (headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
    if (target.endsWith("/api/app-sign-in/token")) {
      const person = codes.get(String(body.code));
      if (!person || body.redirect_uri !== callback) return json({ error: "invalid_grant" }, 400);
      codes.delete(String(body.code));
      const current = people.get(person.id);
      return current ? json(answer(current)) : json({ error: "access_denied" }, 403);
    }
    const current = people.get(String(body.user_id));
    return current ? json({ access: true, ...answer(current) }) : json({ access: false });
  };
  return {
    calls, state, fetch: fetchKeeri,
    /** The person exists in Keeri with this access, and has just been sent back with a code. */
    arrive(person: Person) { people.set(person.id, person); const code = randomBytes(32).toString("base64url"); codes.set(code, person); return code; },
    set(person: Person) { people.set(person.id, person); },
    remove(id: string) { people.delete(id); },
  };
}
type Keeri = ReturnType<typeof fakeKeeri>;
const ready = (keeri: Keeri): KeeriSignInConfig => ({ origin: "https://keeri.example.test", adminOrigin: "https://keeri.example.test", tenantId, clientId: "shop-admin", secret, fetch: keeri.fetch });
const keeriMode = (keeri: Keeri, emergencyEmail: string | null = null): AdminSignIn => ({ mode: "keeri", ready: ready(keeri), emergencyEmail });
const appWith = (keeri: Keeri, emergencyEmail: string | null = null) => createApp(db, { ...base, adminSignIn: keeriMode(keeri, emergencyEmail) });

const cookies = (response: request.Response) => ([] as string[]).concat(response.headers["set-cookie"] ?? []);
const cookieNamed = (response: request.Response, name: string) => cookies(response).find((value) => value.startsWith(`${name}=`));
const editor: Person = { id: "keeri_user_editor", name: "Asha Rao", email: "asha@example.invalid", permissions: ["edit"] };
const publisher: Person = { id: "keeri_user_publisher", name: "Vikram Shah", email: "vikram@example.invalid", permissions: ["edit", "publish", "enquiries"] };

/** Out to Keeri and back, as a browser does it. */
async function signIn(app: ReturnType<typeof createApp>, keeri: Keeri, person: Person) {
  const agent = request.agent(app);
  const start = await agent.get("/api/admin/keeri/start");
  const state = new URL(start.headers.location!).searchParams.get("state")!;
  const code = keeri.arrive(person);
  const back = await agent.get("/api/admin/keeri/callback").query({ code, state });
  return { agent, start, back, state, code };
}
const sessionOf = async (agent: ReturnType<typeof request.agent>) => agent.get("/api/admin/session");
const aged = (adminId: string, seconds: number) =>
  db.shopAdminSession.updateMany({ where: { adminId }, data: { keeriCheckedAt: new Date(Date.now() - seconds * 1000) } });

async function wipe() {
  await db.shopContentRevision.deleteMany();
  await db.shopContent.deleteMany();
  await db.shopAdminSession.deleteMany();
  await db.shopAdminSignIn.deleteMany();
  await db.shopAdmin.deleteMany();
}
before(wipe);
beforeEach(wipe);
after(async () => { await wipe(); await db.$disconnect(); });

test("with the flag off, the Keeri routes do not exist and password sign-in answers exactly as before", async () => {
  await db.shopAdmin.create({ data: { email: "owner@example.invalid", role: "publisher", passwordHash } });
  const app = createApp(db, base);
  const http = request(app);
  for (const path of ["/api/admin/session", "/api/admin/keeri/start", "/api/admin/keeri/callback?code=x&state=y"]) {
    const response = await http.get(path);
    assert.equal(response.status, 401, path);
    assert.deepEqual(response.body, { code: "ADMIN_AUTH_REQUIRED", message: "Sign in to manage shop content." });
    assert.equal(cookies(response).length, 0);
  }
  const login = await http.post("/api/admin/login").set("Origin", origin).send({ email: "owner@example.invalid", password });
  assert.equal(login.status, 200);
  assert.deepEqual(Object.keys(login.body).sort(), ["csrfToken", "user"]);
  assert.deepEqual(Object.keys(login.body.user).sort(), ["canManageEnquiries", "email", "id", "role"]);
  const session = await db.shopAdminSession.findFirstOrThrow();
  assert.equal(session.method, "password");
  assert.equal(session.keeriCheckedAt, null);
  assert.equal(await db.shopAdminSignIn.count(), 0);
  const read = await http.get("/api/admin/session").set("Cookie", cookieNamed(login, "shop_admin")!.split(";")[0]!);
  assert.deepEqual(read.body, login.body);
});

test("with the flag off, a session that Keeri started is refused and ended", async () => {
  const keeri = fakeKeeri();
  const { agent, back } = await signIn(appWith(keeri), keeri, editor);
  assert.equal((await sessionOf(agent)).status, 200);
  // The same browser, after the owner has switched Keeri sign-in off again.
  const cookie = cookieNamed(back, "shop_admin")!.split(";")[0]!;
  const off = createApp(db, base);
  assert.equal((await request(off).get("/api/admin/session").set("Cookie", cookie)).status, 401);
  assert.equal(await db.shopAdminSession.count(), 0);
  // The person is still there for History; with no shop password they simply cannot sign in.
  assert.equal(await db.shopAdmin.count(), 1);
  assert.equal((await request(off).post("/api/admin/login").set("Origin", origin).send({ email: editor.email, password })).status, 401);
});

test("the sign-in page is told to offer Keeri, and whether there is an emergency account", async () => {
  const keeri = fakeKeeri();
  const signedOut = await request(appWith(keeri)).get("/api/admin/session");
  assert.equal(signedOut.status, 401);
  assert.deepEqual(signedOut.body, { code: "ADMIN_AUTH_REQUIRED", message: "Sign in to manage shop content.", signIn: { method: "keeri", available: true, emergency: false } });
  assert.deepEqual((await request(appWith(keeri, "owner@example.invalid")).get("/api/admin/content")).body.signIn, { method: "keeri", available: true, emergency: true });
  // Only a staff "sign in first" says it: a customer route's 401 and other staff errors do not.
  const { agent } = await signIn(appWith(keeri), keeri, editor);
  assert.deepEqual((await sessionOf(agent)).body.signIn, { method: "keeri", available: true, emergency: false });
  assert.equal((await agent.get("/api/admin/enquiries")).body.signIn, undefined);
});

test("starting sends the browser to Keeri with the exact return address and a state it must bring back", async () => {
  const keeri = fakeKeeri();
  const response = await request(appWith(keeri)).get("/api/admin/keeri/start").query({ redirect_uri: "https://evil.example.test/", next: "https://evil.example.test/", state: "chosen-by-caller" });
  assert.equal(response.status, 303);
  const target = new URL(response.headers.location!);
  assert.equal(target.origin + target.pathname, "https://keeri.example.test/sign-in/authorize");
  assert.equal(target.searchParams.get("client_id"), "shop-admin");
  assert.equal(target.searchParams.get("redirect_uri"), callback);
  const state = target.searchParams.get("state")!;
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(state, "chosen-by-caller");
  assert.deepEqual([...target.searchParams.keys()].sort(), ["client_id", "redirect_uri", "state"]);
  assert.ok(!response.headers.location!.includes(secret));
  const cookie = cookieNamed(response, "shop_admin_signin")!;
  assert.ok(cookie.startsWith(`shop_admin_signin=${state};`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  const secure = await request(createApp(db, { ...base, secureCookies: true, adminSignIn: keeriMode(keeri) })).get("/api/admin/keeri/start");
  assert.match(cookieNamed(secure, "__Host-shop_admin_signin")!, /; Secure/);
  // Two people starting get two different states.
  const other = await request(appWith(keeri)).get("/api/admin/keeri/start");
  assert.notEqual(new URL(other.headers.location!).searchParams.get("state"), state);
});

test("coming back with Keeri's code starts a session for the Keeri person, exchanged server to server", async () => {
  const keeri = fakeKeeri();
  const { agent, back, code } = await signIn(appWith(keeri), keeri, publisher);
  assert.equal(back.status, 303);
  assert.equal(back.headers.location, "/admin");
  const cookie = cookieNamed(back, "shop_admin")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookieNamed(back, "shop_admin_signin")!, /Expires=Thu, 01 Jan 1970/);
  // The store asked Keeri once, with its secret in the Authorization header and nowhere else.
  assert.equal(keeri.calls.length, 1);
  assert.equal(keeri.calls[0]!.url, "https://keeri.example.test/api/app-sign-in/token");
  assert.equal(keeri.calls[0]!.authorization, `Bearer ${secret}`);
  assert.deepEqual(keeri.calls[0]!.body, { code, redirect_uri: callback });
  assert.ok(!JSON.stringify(keeri.calls[0]!.body).includes(secret));
  const admin = await db.shopAdmin.findUniqueOrThrow({ where: { keeriUserId: publisher.id } });
  assert.deepEqual([admin.email, admin.name, admin.role, admin.canManageEnquiries, admin.passwordHash], [publisher.email, publisher.name, "publisher", true, null]);
  const session = await db.shopAdminSession.findFirstOrThrow({ where: { adminId: admin.id } });
  assert.equal(session.method, "keeri");
  assert.ok(session.keeriCheckedAt);
  assert.ok(!cookie.includes(session.tokenHash));
  const read = await sessionOf(agent);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.user, { id: admin.id, email: publisher.email, role: "publisher", canManageEnquiries: true, name: publisher.name });
  assert.match(read.body.csrfToken, /^[a-f0-9]{64}$/);
});

for (const [permissions, expected] of [
  [["edit"], { role: "editor", canManageEnquiries: false }],
  [["publish"], { role: "publisher", canManageEnquiries: false }],
  [["edit", "publish"], { role: "publisher", canManageEnquiries: false }],
  [["edit", "enquiries"], { role: "editor", canManageEnquiries: true }],
  [["edit", "publish", "enquiries"], { role: "publisher", canManageEnquiries: true }],
  [["enquiries"], null],
  [[], null],
  [["admin", "manage", "*"], null],
] as const) {
  test(`Keeri's permissions ${JSON.stringify(permissions)} become ${expected ? `${expected.role}${expected.canManageEnquiries ? " with enquiries" : ""}` : "no access"}`, async () => {
    const keeri = fakeKeeri();
    const { agent, back } = await signIn(appWith(keeri), keeri, { ...editor, permissions: [...permissions] });
    if (!expected) {
      assert.equal(back.headers.location, "/admin?sign_in=denied");
      assert.equal(cookieNamed(back, "shop_admin"), undefined);
      assert.equal(await db.shopAdminSession.count(), 0);
      assert.equal(await db.shopAdmin.count(), 0);
      return;
    }
    const user = (await sessionOf(agent)).body.user;
    assert.deepEqual({ role: user.role, canManageEnquiries: user.canManageEnquiries }, expected);
  });
}

test("an editor from Keeri can save a draft and cannot publish it; a publisher can", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const asEditor = await signIn(app, keeri, editor);
  const csrf = (await sessionOf(asEditor.agent)).body.csrfToken;
  const publish = await asEditor.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 0 });
  assert.equal(publish.status, 403);
  assert.equal(publish.body.code, "ADMIN_ROLE_REQUIRED");
  const asPublisher = await signIn(app, keeri, publisher);
  const publisherCsrf = (await sessionOf(asPublisher.agent)).body.csrfToken;
  const allowed = await asPublisher.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", publisherCsrf).send({ expectedVersion: 0 });
  assert.notEqual(allowed.status, 403);
  assert.equal((await asEditor.agent.get("/api/admin/enquiries")).status, 403);
  assert.equal((await asPublisher.agent.get("/api/admin/enquiries")).status, 200);
});

test("a callback without this browser's own state is refused before Keeri is asked", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const code = keeri.arrive(editor);
  // No sign-in was started in this browser: an attacker's link carrying their own code.
  const cold = await request(app).get("/api/admin/keeri/callback").query({ code, state: "A".repeat(43) });
  assert.equal(cold.headers.location, "/admin?sign_in=failed");
  // Started, but the state that came back is not the one that went out.
  const agent = request.agent(app);
  const start = await agent.get("/api/admin/keeri/start");
  const state = new URL(start.headers.location!).searchParams.get("state")!;
  for (const wrong of ["B".repeat(43), state.slice(0, 42), `${state}x`, ""]) {
    const second = request.agent(app);
    await second.get("/api/admin/keeri/start");
    const response = await second.get("/api/admin/keeri/callback").query({ code, state: wrong });
    assert.equal(response.headers.location, "/admin?sign_in=failed", wrong);
    assert.equal(cookieNamed(response, "shop_admin"), undefined);
  }
  assert.equal(keeri.calls.length, 0);
  assert.equal(await db.shopAdminSession.count(), 0);
  // The right state still works afterwards, once.
  assert.equal((await agent.get("/api/admin/keeri/callback").query({ code, state })).headers.location, "/admin");
});

test("the state and the code are each good for one callback", async () => {
  const keeri = fakeKeeri();
  const { agent, state, code } = await signIn(appWith(keeri), keeri, editor);
  const sessions = await db.shopAdminSession.count();
  // The same address opened again (history, a shared link, a replay).
  const replay = await agent.get("/api/admin/keeri/callback").query({ code, state });
  assert.equal(replay.headers.location, "/admin?sign_in=failed");
  assert.equal(await db.shopAdminSession.count(), sessions);
  assert.equal(keeri.calls.length, 1);
});

test("nobody is ever sent anywhere but /admin, whatever the callback address carries", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const agent = request.agent(app);
  const state = new URL((await agent.get("/api/admin/keeri/start")).headers.location!).searchParams.get("state")!;
  const back = await agent.get("/api/admin/keeri/callback").query({ code: keeri.arrive(editor), state, next: "https://evil.example.test/", redirect: "//evil.example.test", return_to: "/\\evil.example.test", redirect_uri: "https://evil.example.test/" });
  assert.equal(back.headers.location, "/admin");
  for (const query of [{ error: "access_denied", error_uri: "https://evil.example.test/" }, { code: "bad", next: "https://evil.example.test/" }, { state: ["a", "b"], code: ["c", "d"] }]) {
    const response = await request(app).get("/api/admin/keeri/callback").query(query);
    assert.match(response.headers.location!, /^\/admin\?sign_in=(failed|denied|unavailable)$/);
  }
});

test("signing in never keeps a session token the browser arrived with", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  // Somebody else's live session, planted in the victim's browser before they sign in.
  const attacker = await signIn(app, keeri, publisher);
  const planted = cookieNamed(attacker.back, "shop_admin")!.split(";")[0]!;
  const plantedHash = (await db.shopAdminSession.findFirstOrThrow()).tokenHash;
  const start = await request(app).get("/api/admin/keeri/start").set("Cookie", planted);
  const state = new URL(start.headers.location!).searchParams.get("state")!;
  const back = await request(app).get("/api/admin/keeri/callback").set("Cookie", `${planted}; shop_admin_signin=${state}`).query({ code: keeri.arrive(editor), state });
  assert.equal(back.headers.location, "/admin");
  const fresh = cookieNamed(back, "shop_admin")!.split(";")[0]!;
  assert.notEqual(fresh, planted);
  // The planted session is gone, and the new one belongs to the person who signed in.
  assert.equal(await db.shopAdminSession.count({ where: { tokenHash: plantedHash } }), 0);
  assert.equal((await request(app).get("/api/admin/session").set("Cookie", planted)).status, 401);
  assert.equal((await request(app).get("/api/admin/session").set("Cookie", fresh)).body.user.email, editor.email);
  // A made-up token in the cookie does not become a session either.
  const invented = `shop_admin=${"a".repeat(64)}`;
  const second = await request(app).get("/api/admin/keeri/start").set("Cookie", invented);
  const secondState = new URL(second.headers.location!).searchParams.get("state")!;
  const again = await request(app).get("/api/admin/keeri/callback").set("Cookie", `${invented}; shop_admin_signin=${secondState}`).query({ code: keeri.arrive(editor), state: secondState });
  assert.notEqual(cookieNamed(again, "shop_admin")!.split(";")[0]!, invented);
  assert.equal((await request(app).get("/api/admin/session").set("Cookie", invented)).status, 401);
});

test("Keeri refusing, failing or answering for another company never starts a session", async () => {
  const cases: [string, (keeri: Keeri) => Record<string, string>, string][] = [
    ["Keeri says the person has no access", () => ({ error: "access_denied" }), "denied"],
    ["the code is not one Keeri issued", () => ({ code: randomBytes(32).toString("base64url") }), "failed"],
    ["access was removed between the two steps", (keeri) => { const code = keeri.arrive(editor); keeri.remove(editor.id); return { code }; }, "denied"],
    ["Keeri answers for a different company", (keeri) => ({ code: keeri.arrive({ ...editor, tenantId: "tenant_other" }) }), "denied"],
    ["Keeri cannot be reached", (keeri) => { const code = keeri.arrive(editor); keeri.state.reachable = false; return { code }; }, "unavailable"],
    ["Keeri is failing", (keeri) => { const code = keeri.arrive(editor); keeri.state.status = 503; return { code }; }, "unavailable"],
    ["Keeri rejects the store's secret", (keeri) => { const code = keeri.arrive(editor); keeri.state.status = 401; return { code }; }, "unavailable"],
  ];
  for (const [name, prepare, outcome] of cases) {
    const keeri = fakeKeeri();
    const agent = request.agent(appWith(keeri));
    const state = new URL((await agent.get("/api/admin/keeri/start")).headers.location!).searchParams.get("state")!;
    const back = await agent.get("/api/admin/keeri/callback").query({ ...prepare(keeri), state });
    assert.equal(back.headers.location, `/admin?sign_in=${outcome}`, name);
    assert.equal(cookieNamed(back, "shop_admin"), undefined, name);
    assert.equal((await sessionOf(agent)).status, 401, name);
  }
  assert.equal(await db.shopAdminSession.count(), 0);
  assert.equal(await db.shopAdmin.count(), 0);
});

test("a first Keeri sign-in takes over the shop account with the same address, so History keeps one name", async () => {
  const existing = await db.shopAdmin.create({ data: { email: editor.email, role: "publisher", passwordHash, canManageEnquiries: true } });
  await db.shopContent.create({ data: { id: "storefront", version: 1, draft: {} } });
  await db.shopContentRevision.create({ data: { documentId: "storefront", version: 1, action: "save", content: {}, actorId: existing.id } });
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const { agent } = await signIn(app, keeri, editor);
  const linked = await db.shopAdmin.findUniqueOrThrow({ where: { id: existing.id } });
  // Same row, now Keeri's: its role and enquiry access are what Keeri says, not what the shop account had.
  assert.deepEqual([linked.keeriUserId, linked.name, linked.role, linked.canManageEnquiries], [editor.id, editor.name, "editor", false]);
  assert.equal(await db.shopAdmin.count(), 1);
  const revisions = await agent.get("/api/admin/content/revisions");
  assert.equal(revisions.status, 200);
  assert.equal(revisions.body.revisions[0].actorEmail, editor.email);
  // Their old shop password no longer signs them in.
  const old = await request(app).post("/api/admin/login").set("Origin", origin).send({ email: editor.email, password });
  assert.equal(old.status, 401);
  // A different Keeri person arriving with that address later does not get the row.
  const impostor = await signIn(app, keeri, { ...editor, id: "keeri_user_other" });
  assert.equal(impostor.back.headers.location, "/admin?sign_in=denied");
  assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { id: existing.id } })).keeriUserId, editor.id);
});

test("a person's name and address follow Keeri at the next sign-in; a clash keeps the old address", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  await signIn(app, keeri, editor);
  await signIn(app, keeri, { ...editor, name: "Asha R. Rao", email: "asha.rao@example.invalid" });
  const renamed = await db.shopAdmin.findUniqueOrThrow({ where: { keeriUserId: editor.id } });
  assert.deepEqual([renamed.name, renamed.email], ["Asha R. Rao", "asha.rao@example.invalid"]);
  await signIn(app, keeri, publisher);
  const clash = await signIn(app, keeri, { ...editor, email: publisher.email });
  assert.equal(clash.back.headers.location, "/admin");
  assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { keeriUserId: editor.id } })).email, "asha.rao@example.invalid");
  assert.equal(await db.shopAdmin.count(), 2);
});

test("an account the store itself switched off stays off", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  await signIn(app, keeri, editor);
  await db.shopAdmin.updateMany({ data: { active: false } });
  await db.shopAdminSession.deleteMany();
  const { back, agent } = await signIn(app, keeri, editor);
  assert.equal(back.headers.location, "/admin?sign_in=denied");
  assert.equal((await sessionOf(agent)).status, 401);
});

test("removing access in Keeri ends the shop-admin session within a minute", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const first = await signIn(app, keeri, publisher);
  const second = await signIn(app, keeri, publisher);
  const admin = await db.shopAdmin.findUniqueOrThrow({ where: { keeriUserId: publisher.id } });
  keeri.calls.length = 0;
  // Inside the minute, Keeri is not asked again.
  assert.equal((await sessionOf(first.agent)).status, 200);
  assert.equal(keeri.calls.length, 0);
  // Disabled in Keeri. Still inside the minute: nothing has been asked yet.
  keeri.remove(publisher.id);
  await aged(admin.id, 30);
  assert.equal((await sessionOf(first.agent)).status, 200);
  // Past the minute: the next request asks Keeri, is refused, and every session of theirs ends.
  await aged(admin.id, 61);
  const refused = await sessionOf(first.agent);
  assert.equal(refused.status, 401);
  assert.equal(refused.body.code, "ADMIN_AUTH_REQUIRED");
  assert.deepEqual(keeri.calls.map((call) => [call.url, call.authorization, call.body]), [["https://keeri.example.test/api/app-sign-in/access", `Bearer ${secret}`, { user_id: publisher.id }]]);
  assert.equal(await db.shopAdminSession.count({ where: { adminId: admin.id } }), 0);
  assert.equal((await sessionOf(second.agent)).status, 401);
  // History still names them.
  assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { id: admin.id } })).email, publisher.email);
});

test("a role changed in Keeri is the role in the shop admin within a minute", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const { agent } = await signIn(app, keeri, publisher);
  const admin = await db.shopAdmin.findUniqueOrThrow({ where: { keeriUserId: publisher.id } });
  const csrf = (await sessionOf(agent)).body.csrfToken;
  keeri.set({ ...publisher, permissions: ["edit"], name: "V. Shah" });
  await aged(admin.id, 61);
  // The very request that would have published is the one that finds out.
  const publish = await agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 0 });
  assert.equal(publish.status, 403);
  assert.equal(publish.body.code, "ADMIN_ROLE_REQUIRED");
  const user = (await sessionOf(agent)).body.user;
  assert.deepEqual([user.role, user.canManageEnquiries, user.name], ["editor", false, "V. Shah"]);
  assert.equal((await agent.get("/api/admin/enquiries")).status, 403);
  // Left with enquiries only, which opens nothing here: the session ends.
  keeri.set({ ...publisher, permissions: ["enquiries"] });
  await aged(admin.id, 61);
  assert.equal((await sessionOf(agent)).status, 401);
});

test("the re-check also covers staff routes registered before the staff gate", async () => {
  const keeri = fakeKeeri();
  const { agent } = await signIn(appWith(keeri), keeri, editor);
  assert.equal((await agent.get("/api/admin/media")).status, 200);
  keeri.remove(editor.id);
  await aged((await db.shopAdmin.findFirstOrThrow()).id, 61);
  assert.equal((await agent.get("/api/admin/media")).status, 401);
});

test("if Keeri cannot be reached, a session carries on for ten minutes past its last confirmation, then waits", async () => {
  const keeri = fakeKeeri();
  const { agent } = await signIn(appWith(keeri), keeri, editor);
  const admin = await db.shopAdmin.findFirstOrThrow();
  for (const state of [{ reachable: false, status: 200 }, { reachable: true, status: 503 }, { reachable: true, status: 401 }]) {
    Object.assign(keeri.state, state);
    await aged(admin.id, 9 * 60);
    assert.equal((await sessionOf(agent)).status, 200);
    await aged(admin.id, 10 * 60 + 1);
    const waiting = await sessionOf(agent);
    assert.equal(waiting.status, 401);
    assert.equal(waiting.body.code, "ADMIN_ACCESS_UNCONFIRMED");
    assert.equal(waiting.body.signIn.method, "keeri");
  }
  // The session was not thrown away: when Keeri is back and still says yes, the person carries on.
  Object.assign(keeri.state, { reachable: true, status: 200 });
  assert.equal((await sessionOf(agent)).status, 200);
  const session = await db.shopAdminSession.findFirstOrThrow({ where: { adminId: admin.id } });
  assert.ok(Date.now() - session.keeriCheckedAt!.getTime() < 5_000);
  // And if Keeri is back and says no, it ends.
  keeri.remove(editor.id);
  await aged(admin.id, 20 * 60);
  assert.equal((await sessionOf(agent)).status, 401);
  assert.equal(await db.shopAdminSession.count(), 0);
});

test("a stale Keeri session opens nothing even where the re-check did not run", async () => {
  const { requireStaff } = await import("../src/admin/auth.js");
  const keeri = fakeKeeri();
  const { back } = await signIn(appWith(keeri), keeri, editor);
  const cookie = cookieNamed(back, "shop_admin")!.split(";")[0]!;
  const req = { headers: { cookie }, get: () => undefined } as never;
  assert.equal((await requireStaff(db, req, false)).user.email, editor.email);
  await aged((await db.shopAdmin.findFirstOrThrow()).id, 12 * 60);
  await assert.rejects(requireStaff(db, req, false), { code: "ADMIN_AUTH_REQUIRED" });
});

test("only the emergency account's shop password works while Keeri sign-in is on, and each use is recorded", async () => {
  const owner = await db.shopAdmin.create({ data: { email: "owner@example.invalid", role: "publisher", passwordHash } });
  await db.shopAdmin.create({ data: { email: "other@example.invalid", role: "publisher", passwordHash } });
  const keeri = fakeKeeri();
  keeri.state.reachable = false;
  const app = appWith(keeri, "owner@example.invalid");
  const send = (email: string, pass = password) => request(app).post("/api/admin/login").set("Origin", origin).send({ email, password: pass });
  const refused = await send("other@example.invalid");
  const unknown = await send("nobody@example.invalid");
  assert.equal(refused.status, 401);
  assert.deepEqual(refused.body, unknown.body);
  assert.equal(await db.shopAdminSession.count(), 0);
  assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { email: "other@example.invalid" } })).failedAttempts, 0);
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...values: unknown[]) => { warnings.push(values.join(" ")); };
  let login: request.Response;
  try { login = await send("owner@example.invalid"); } finally { console.warn = warn; }
  assert.equal(login.status, 200);
  assert.equal(login.body.user.emergency, true);
  const session = await db.shopAdminSession.findFirstOrThrow();
  assert.deepEqual([session.method, session.keeriCheckedAt], ["emergency", null]);
  const records = await db.shopAdminSignIn.findMany();
  assert.deepEqual(records.map((row) => [row.adminId, row.method]), [[owner.id, "emergency"]]);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0]!.includes("owner@example.invalid") && !warnings[0]!.includes(password));
  // Keeri being unreachable does not touch it, however long it lasts.
  const cookie = cookieNamed(login, "shop_admin")!.split(";")[0]!;
  const read = await request(app).get("/api/admin/session").set("Cookie", cookie);
  assert.equal(read.status, 200);
  assert.equal(read.body.user.emergency, true);
  assert.equal(keeri.calls.length, 0);
  // Without an emergency account named, no shop password works at all.
  assert.equal((await request(appWith(keeri)).post("/api/admin/login").set("Origin", origin).send({ email: "owner@example.invalid", password })).status, 401);
});

test("every sign-in while Keeri is on leaves a record with no secret in it", async () => {
  const keeri = fakeKeeri();
  const { state, code } = await signIn(appWith(keeri), keeri, editor);
  const rows = await db.shopAdminSignIn.findMany({ include: { admin: true } });
  assert.deepEqual(rows.map((row) => [row.method, row.admin?.keeriUserId]), [["keeri", editor.id]]);
  const stored = JSON.stringify([rows, await db.shopAdminSession.findMany(), await db.shopAdmin.findMany()]);
  for (const value of [secret, code, state]) assert.ok(!stored.includes(value));
  // Removing the person keeps the record of the sign-in.
  await db.shopAdminSession.deleteMany();
  await db.shopAdmin.deleteMany();
  assert.deepEqual((await db.shopAdminSignIn.findMany()).map((row) => [row.method, row.adminId]), [["keeri", null]]);
});

test("nothing the store logs or sends to the browser carries the secret or the code", async () => {
  const keeri = fakeKeeri();
  const app = appWith(keeri);
  const lines: string[] = [];
  const original = { error: console.error, warn: console.warn, log: console.log };
  for (const level of ["error", "warn", "log"] as const) console[level] = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
  const responses: request.Response[] = [];
  let code = "";
  try {
    const good = await signIn(app, keeri, editor);
    code = good.code;
    responses.push(good.start, good.back, await sessionOf(good.agent));
    // The stand-in's own failure message quotes the secret; it must not reach the log.
    keeri.state.reachable = false;
    const agent = request.agent(app);
    const state = new URL((await agent.get("/api/admin/keeri/start")).headers.location!).searchParams.get("state")!;
    responses.push(await agent.get("/api/admin/keeri/callback").query({ code: keeri.arrive(editor), state }));
    await aged((await db.shopAdmin.findFirstOrThrow()).id, 11 * 60);
    responses.push(await sessionOf(good.agent));
  } finally {
    Object.assign(console, original);
  }
  const seen = JSON.stringify([lines, responses.map((response) => [response.headers, response.text])]);
  assert.ok(!seen.includes(secret));
  assert.ok(!seen.includes(code));
  for (const call of keeri.calls) assert.ok(!call.url.includes(secret) && !call.url.includes("?"));
});

test("starting and coming back are each limited to thirty tries in fifteen minutes", async () => {
  const keeri = fakeKeeri();
  for (const path of ["/api/admin/keeri/start", "/api/admin/keeri/callback?code=x&state=y"]) {
    const http = request(appWith(keeri));
    for (let attempt = 0; attempt < 30; attempt += 1) assert.equal((await http.get(path)).status, 303);
    const limited = await http.get(path);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, "ADMIN_LOGIN_LIMIT");
    assert.equal(limited.headers.location, undefined);
  }
});

test("a half-set-up Keeri sign-in lets nobody in through Keeri and reopens no passwords", async () => {
  await db.shopAdmin.create({ data: { email: "other@example.invalid", role: "publisher", passwordHash } });
  const app = createApp(db, { ...base, adminSignIn: { mode: "keeri", ready: null, emergencyEmail: null } });
  assert.deepEqual((await request(app).get("/api/admin/session")).body.signIn, { method: "keeri", available: false, emergency: false });
  const start = await request(app).get("/api/admin/keeri/start");
  assert.equal(start.headers.location, "/admin?sign_in=unavailable");
  assert.equal(cookies(start).length, 0);
  assert.equal((await request(app).get("/api/admin/keeri/callback").query({ code: "c".repeat(43), state: "s".repeat(43) })).headers.location, "/admin?sign_in=failed");
  assert.equal((await request(app).post("/api/admin/login").set("Origin", origin).send({ email: "other@example.invalid", password })).status, 401);
});

test("the settings: off unless ADMIN_SIGN_IN=keeri; a bad one is named, never quoted, and never stops the store", () => {
  const warned: string[] = [];
  const warn = (message: string) => { warned.push(message); };
  const env = { KEERI_ORIGIN: "https://keeri.example.test", KEERI_TENANT_ID: tenantId, KEERI_SIGN_IN_CLIENT_ID: "shop-admin", KEERI_SIGN_IN_CLIENT_SECRET: secret };
  assert.deepEqual(loadAdminSignIn({}, warn), { mode: "password" });
  assert.deepEqual(loadAdminSignIn({ ...env }, warn), { mode: "password" });
  assert.deepEqual(loadAdminSignIn({ ...env, ADMIN_SIGN_IN: "password" }, warn), { mode: "password" });
  assert.equal(warned.length, 0);
  assert.deepEqual(loadAdminSignIn({ ...env, ADMIN_SIGN_IN: "Keeri " }, warn), { mode: "password" });
  assert.equal(warned.length, 1);
  const on = loadAdminSignIn({ ...env, ADMIN_SIGN_IN: "keeri", KEERI_ADMIN_ORIGIN: "https://staff.keeri.example.test", ADMIN_EMERGENCY_EMAIL: "Owner@Example.Invalid" }, warn);
  assert.deepEqual(on, {
    mode: "keeri", emergencyEmail: "owner@example.invalid",
    ready: { origin: "https://keeri.example.test", adminOrigin: "https://staff.keeri.example.test", tenantId, clientId: "shop-admin", secret },
  });
  const plain = loadAdminSignIn({ ...env, ADMIN_SIGN_IN: "keeri" }, warn);
  assert.equal(plain.mode === "keeri" && plain.ready?.adminOrigin, "https://keeri.example.test");
  assert.equal(plain.mode === "keeri" && plain.emergencyEmail, null);
  warned.length = 0;
  for (const broken of [
    { KEERI_SIGN_IN_CLIENT_SECRET: undefined }, { KEERI_SIGN_IN_CLIENT_SECRET: "too-short" }, { KEERI_ORIGIN: "http://keeri.example.test" },
    { KEERI_ORIGIN: "https://keeri.example.test/path" }, { KEERI_TENANT_ID: undefined }, { KEERI_SIGN_IN_CLIENT_ID: "Shop Admin" },
  ]) {
    const result = loadAdminSignIn({ ...env, ...broken, ADMIN_SIGN_IN: "keeri", ADMIN_EMERGENCY_EMAIL: "owner@example.invalid" }, warn);
    assert.deepEqual(result, { mode: "keeri", ready: null, emergencyEmail: "owner@example.invalid" });
    assert.match(warned.at(-1)!, new RegExp(Object.keys(broken)[0]!));
  }
  assert.ok(!warned.join("\n").includes(secret) && !warned.join("\n").includes("too-short"));
});
