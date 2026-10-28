import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signPreviewToken, verifyPreviewToken } from "../src/admin/preview.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const config = { webOrigin: origin, catalogMode: "preview" as const, secureCookies: false };
const password = randomBytes(24).toString("base64url");
const suffix = randomBytes(5).toString("hex");
const emails = { publisher: `preview-publisher-${suffix}@example.invalid`, editor: `preview-editor-${suffix}@example.invalid` };
const ids: Record<string, string> = {};
const content = { schemaVersion: 1, landingPages: [], homeSections: [{ key: "hero", enabled: true }], homeCopy: { categoryHeading: "Draft rooms", bestsellersHeading: "Draft favourites", socialHeading: "Draft social", ticker: "Draft ticker", testimonialHeading: "Draft voices", testimonialSubheading: "Draft stories" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/preview-test/", src: "/media/test.webp", alt: "Draft scene" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: true } };
before(async () => {
  await db.shopContentRevision.deleteMany(); await db.shopContent.deleteMany();
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }).toString("hex");
  for (const role of ["publisher", "editor"] as const) {
    const row = await db.shopAdmin.create({ data: { email: emails[role], role, passwordHash: `scrypt$131072$8$1$${salt}$${digest}` } });
    ids[role] = row.id;
  }
});
after(async () => {
  await db.shopContentRevision.deleteMany({ where: { actorId: { in: Object.values(ids) } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: Object.values(ids) } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await db.$disconnect();
});
async function login(role: "publisher" | "editor" = "publisher") {
  const agent = request.agent(createApp(db, config));
  const response = await agent.post("/api/admin/login").set("Origin", origin).send({ email: emails[role], password });
  assert.equal(response.status, 200);
  const cookie = String(([] as string[]).concat(response.headers["set-cookie"] ?? [])[0]).split(";")[0]!;
  // The API stores only a hash of the session cookie; preview keys derive from it.
  const tokenHash = createHash("sha256").update(cookie.slice(cookie.indexOf("=") + 1)).digest("hex");
  return { agent, csrf: response.body.csrfToken as string, id: ids[role]!, tokenHash };
}
const mint = (session: Awaited<ReturnType<typeof login>>, expectedVersion: number, csrf = session.csrf) =>
  session.agent.post("/api/admin/content/preview").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion });
const read = (session: Awaited<ReturnType<typeof login>>, token: string) =>
  session.agent.get("/api/admin/content/preview").query({ token });

test("anonymous callers cannot mint or read preview tokens and responses are never cacheable", async () => {
  const http = request(createApp(db, config));
  const minted = await http.post("/api/admin/content/preview").set("Origin", origin).send({ expectedVersion: 0 });
  assert.equal(minted.status, 401);
  assert.match(String(minted.headers["cache-control"]), /private, no-store/);
  const fetched = await http.get("/api/admin/content/preview").query({ token: "anything" });
  assert.equal(fetched.status, 401);
  assert.match(String(fetched.headers["cache-control"]), /private, no-store/);
});

test("minting requires CSRF, a saved draft and the current version; the token reads only the current draft", async () => {
  const publisher = await login();
  assert.equal((await mint(publisher, 0, "0".repeat(64))).status, 403, "CSRF rules match the other admin writes");
  const empty = await mint(publisher, 0);
  assert.equal(empty.status, 409, "No draft exists yet");
  assert.equal(empty.body.code, "CONTENT_DRAFT_REQUIRED");
  const saved = await publisher.agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: 0, content });
  assert.equal(saved.status, 200);
  const version = saved.body.version as number;
  assert.equal((await mint(publisher, version - 1)).status, 409, "Stale expectedVersion is refused");
  const minted = await mint(publisher, version);
  assert.equal(minted.status, 200);
  assert.match(String(minted.headers["cache-control"]), /private, no-store/);
  assert.match(minted.body.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(minted.body.version, version);
  const expiresIn = Date.parse(minted.body.expiresAt) - Date.now();
  assert.ok(expiresIn > 13 * 60_000 && expiresIn <= 15 * 60_000, `Preview links last at most fifteen minutes (${expiresIn}ms)`);
  const draft = await read(publisher, minted.body.token);
  assert.equal(draft.status, 200);
  assert.deepEqual(draft.body, { version, content });
  assert.match(String(draft.headers["cache-control"]), /private, no-store/);
  assert.match(String(draft.headers["x-robots-tag"]), /noindex/);
  assert.equal((await request(createApp(db, config)).get("/api/content/storefront")).status, 404, "Previewing never publishes");
});

test("tokens are bound to the staff session, the content version and their expiry", async () => {
  const publisher = await login();
  const editor = await login("editor");
  const current = (await publisher.agent.get("/api/admin/content")).body.version as number;
  const minted = await mint(publisher, current);
  assert.equal(minted.status, 200);
  const other = await read(editor, minted.body.token);
  assert.equal(other.status, 403, "Another staff member's session cannot use the token");
  assert.equal(other.body.code, "PREVIEW_TOKEN_INVALID");
  const second = await login();
  assert.equal((await read(second, minted.body.token)).status, 403, "A different session of the same staff member cannot use it either");
  const [payload, signature] = minted.body.token.split(".") as [string, string];
  for (const tampered of [`${payload}.${signature.slice(0, -2)}xx`, `${payload}x.${signature}`, payload, "", "a".repeat(5000), `${Buffer.from(JSON.stringify({ v: 1, staffId: publisher.id, version: current, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url")}.${signature}`]) {
    const response = await read(publisher, tampered);
    assert.equal(response.status, tampered === "" || tampered.length > 4000 ? 400 : 403, `Rejected: ${tampered.slice(0, 24)}`);
  }
  assert.ok(await db.shopAdminSession.findUnique({ where: { tokenHash: publisher.tokenHash } }), "The derived hash matches the stored session");
  const expired = signPreviewToken({ staffId: publisher.id, version: current, sessionTokenHash: publisher.tokenHash, now: Date.now() - 16 * 60_000 });
  const late = await read(publisher, expired);
  assert.equal(late.status, 403);
  assert.equal(late.body.code, "PREVIEW_TOKEN_EXPIRED");
  const edited = await publisher.agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: current, content: { ...content, homeCopy: { ...content.homeCopy, categoryHeading: "Newer draft" } } });
  assert.equal(edited.status, 200);
  const stale = await read(publisher, minted.body.token);
  assert.equal(stale.status, 409, "A token for an older draft version cannot read the newer draft");
  assert.equal(stale.body.code, "PREVIEW_STALE");
  const fresh = await mint(publisher, edited.body.version);
  assert.equal((await read(publisher, fresh.body.token)).body.content.homeCopy.categoryHeading, "Newer draft");
});

test("token signing and verification are pure, time-bounded and session-keyed", () => {
  const base = { staffId: "staff-a", version: 3, sessionTokenHash: "a".repeat(64) };
  const issued = 1_800_000_000_000;
  const token = signPreviewToken({ ...base, now: issued });
  assert.deepEqual(verifyPreviewToken(token, { sessionTokenHash: base.sessionTokenHash, now: issued + 14 * 60_000 }), { ok: true, staffId: "staff-a", version: 3, expiresAt: issued + 15 * 60_000 });
  assert.deepEqual(verifyPreviewToken(token, { sessionTokenHash: base.sessionTokenHash, now: issued + 15 * 60_000 + 1 }), { ok: false, reason: "expired" });
  assert.deepEqual(verifyPreviewToken(token, { sessionTokenHash: "b".repeat(64), now: issued }), { ok: false, reason: "invalid" });
  assert.notEqual(signPreviewToken({ ...base, now: issued }), signPreviewToken({ ...base, version: 4, now: issued }));
});
