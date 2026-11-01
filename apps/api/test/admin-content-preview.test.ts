import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { randomBytes, scryptSync } from "node:crypto";
import { createApp } from "../src/app.js";
import { signPreviewToken } from "../src/admin/content.js";

// Staff preview tokens: short-lived, HMAC-signed, bound to the staff member and the
// draft version. The draft is only readable by the staff session that minted the token.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const previewSecret = randomBytes(32).toString("hex");
const config = { webOrigin: origin, catalogMode: "preview" as const, secureCookies: false, previewSecret };
const password = randomBytes(24).toString("base64url");
const content = { schemaVersion: 1, landingPages: [], homeSections: [{ key: "hero", enabled: true }], homeCopy: { categoryHeading: "Pick a room", bestsellersHeading: "Customer favourites", socialHeading: "At home", ticker: "Furniture made thoughtfully", testimonialHeading: "Our customers", testimonialSubheading: "Stories from home" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/test.webp", alt: "Test scene" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: true } };
const draft = { ...content, homeCopy: { ...content.homeCopy, categoryHeading: "Unpublished draft heading" } };
let publisherId: string;
before(async () => {
  await db.shopContentRevision.deleteMany();
  await db.shopContent.deleteMany();
  await db.shopAdminSession.deleteMany();
  await db.shopAdmin.deleteMany();
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }).toString("hex");
  for (const role of ["publisher", "editor"] as const) {
    const row = await db.shopAdmin.create({ data: { email: `${role}@example.invalid`, role, passwordHash: `scrypt$131072$8$1$${salt}$${digest}` } });
    if (role === "publisher") publisherId = row.id;
  }
});
after(async () => db.$disconnect());
async function login(app = createApp(db, config), email = "publisher@example.invalid") {
  const agent = request.agent(app);
  const response = await agent.post("/api/admin/login").set("Origin", origin).send({ email, password });
  assert.equal(response.status, 200);
  const header = response.headers["set-cookie"];
  const cookie = String(Array.isArray(header) ? header[0] : header).split(";")[0]!;
  return { agent, csrf: response.body.csrfToken as string, cookie };
}
const mint = (agent: ReturnType<typeof request.agent>, csrf: string, expectedVersion: number) =>
  agent.post("/api/admin/content/preview").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion });
const read = (agent: ReturnType<typeof request.agent>, token: string) => agent.get(`/api/admin/content/preview?token=${encodeURIComponent(token)}`);

test("anonymous callers cannot mint or read previews and admin responses stay private", async () => {
  const http = request(createApp(db, config));
  const minted = await http.post("/api/admin/content/preview").set("Origin", origin).send({ expectedVersion: 0 });
  assert.equal(minted.status, 401);
  assert.match(String(minted.headers["cache-control"]), /no-store/);
  const malformed = await http.post("/api/admin/content/preview").set("Origin", origin).send({ expectedVersion: "later", extra: true });
  assert.equal(malformed.status, 401, "Anonymous callers learn nothing about the body shape");
  const { agent } = await login();
  const unsigned = await agent.post("/api/admin/content/preview").set("Origin", origin).send({ expectedVersion: "later", extra: true });
  assert.equal(unsigned.status, 403, "The CSRF check runs before the body is validated");
  const fetched = await http.get("/api/admin/content/preview?token=anything");
  assert.equal(fetched.status, 401);
  assert.match(String(fetched.headers["cache-control"]), /no-store/);
});

test("a preview token needs CSRF, a current version and an existing draft; it returns the draft, not the published snapshot", async () => {
  const { agent, csrf } = await login();
  assert.equal((await mint(agent, csrf, 0)).status, 409, "No draft to preview yet");
  assert.equal((await agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 0, content })).status, 200);
  assert.equal((await agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 1 })).status, 200);
  assert.equal((await agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 2, content: draft })).status, 200);
  assert.equal((await agent.post("/api/admin/content/preview").set("Origin", origin).send({ expectedVersion: 3 })).status, 403, "CSRF token required");
  assert.equal((await agent.post("/api/admin/content/preview").set("Origin", "https://other.invalid").set("X-CSRF-Token", csrf).send({ expectedVersion: 3 })).status, 403, "Origin check applies");
  assert.equal((await mint(agent, csrf, 2)).status, 409, "Stale version is a conflict, like saving");
    const before = Date.now();
  const minted = await mint(agent, csrf, 3);
  assert.equal(minted.status, 200);
  assert.match(String(minted.headers["cache-control"]), /private, no-store/);
  assert.equal(minted.body.version, 3);
  assert.match(minted.body.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const expiresAt = Date.parse(minted.body.expiresAt);
  assert.ok(expiresAt > before + 5 * 60_000 && expiresAt <= Date.now() + 15 * 60_000, "Tokens live at most fifteen minutes");
  const fetched = await read(agent, minted.body.token);
  assert.equal(fetched.status, 200);
  assert.match(String(fetched.headers["cache-control"]), /private, no-store/);
  assert.equal(fetched.body.version, 3);
  assert.equal(fetched.body.content.homeCopy.categoryHeading, "Unpublished draft heading");
  assert.equal(fetched.body.publishedVersion, 2);
  const live = await request(createApp(db, config)).get("/api/content/storefront");
  assert.equal(live.body.content.homeCopy.categoryHeading, "Pick a room", "Previewing never publishes");
  assert.equal(await db.shopContentRevision.count(), 3, "Previewing writes no revision");
});

test("tokens are bound to the staff member, the version and the signing secret, and they expire", async () => {
  const publisher = await login();
  const minted = await mint(publisher.agent, publisher.csrf, 3);
  assert.equal(minted.status, 200);
  const token = minted.body.token as string;
  const editor = await login(createApp(db, config), "editor@example.invalid");
  const other = await read(editor.agent, token);
  assert.equal(other.status, 403);
  assert.equal(other.body.code, "PREVIEW_TOKEN_INVALID");
  const [payload, signature] = token.split(".") as [string, string];
  // Tamper with the signature's first character: all six of its bits count. The last of its 43 characters carries two
  // padding bits, so changing only those decodes to the same MAC and the token stays valid (about 1 run in 16).
  const tampered = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  assert.equal((await read(publisher.agent, `${payload}.${tampered}`)).status, 403);
  assert.equal((await read(publisher.agent, `${Buffer.from(JSON.stringify({ s: publisherId, v: 3, e: Math.floor(Date.now() / 1000) + 600 })).toString("base64url")}.${signature}`)).status, 403, "Payload is covered by the signature");
  assert.equal((await read(publisher.agent, "")).status, 400);
  assert.equal((await read(publisher.agent, "a".repeat(600))).status, 400);
  const expired = signPreviewToken(previewSecret, { staffId: publisherId, version: 3, expiresAt: new Date(Date.now() - 1000) });
  const stale = await read(publisher.agent, expired);
  assert.equal(stale.status, 403);
  assert.equal(stale.body.code, "PREVIEW_TOKEN_EXPIRED");
  const otherSecret = createApp(db, { ...config, previewSecret: randomBytes(32).toString("hex") });
  const foreign = await request(otherSecret).get(`/api/admin/content/preview?token=${encodeURIComponent(token)}`).set("Cookie", publisher.cookie);
  assert.equal(foreign.status, 403, "A different signing secret rejects the token");
  assert.equal((await publisher.agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: 3, content: { ...draft, homeCopy: { ...draft.homeCopy, categoryHeading: "Newer draft" } } })).status, 200);
  const changed = await read(publisher.agent, token);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.code, "PREVIEW_VERSION_STALE");
  const fresh = await mint(publisher.agent, publisher.csrf, 4);
  assert.equal((await read(publisher.agent, fresh.body.token)).body.content.homeCopy.categoryHeading, "Newer draft");
});

test("without a configured secret each API process signs with its own random key", async () => {
  const first = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
  const second = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
  const { agent, csrf, cookie } = await login(first);
  const minted = await mint(agent, csrf, 4);
  assert.equal(minted.status, 200);
  assert.equal((await read(agent, minted.body.token)).status, 200);
  assert.equal((await request(second).get(`/api/admin/content/preview?token=${encodeURIComponent(minted.body.token)}`).set("Cookie", cookie)).status, 403);
});
