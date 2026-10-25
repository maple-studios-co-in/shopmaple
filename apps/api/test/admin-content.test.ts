import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { randomBytes, scryptSync, createHash } from "node:crypto";
import { createApp } from "../src/app.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
    throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const config = { webOrigin: origin, catalogMode: "preview" as const, secureCookies: false };
const password = randomBytes(24).toString("base64url");
let publisherId: string, editorId: string;
before(async () => {
    await db.shopContentRevision.deleteMany();
    await db.shopContent.deleteMany();
    await db.shopAdminSession.deleteMany();
    await db.shopAdmin.deleteMany();
    const salt = randomBytes(16).toString("hex");
    const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }).toString("hex");
    for (const role of ["publisher", "editor"] as const) {
        const row = await db.shopAdmin.create({ data: { email: `${role}@example.invalid`, role, passwordHash: `scrypt$131072$8$1$${salt}$${digest}` } });
        if (role === "publisher")
            publisherId = row.id;
        else
            editorId = row.id;
    }
});
after(async () => db.$disconnect());
function staffCookie(response: request.Response) { const value = response.headers["set-cookie"]; const first = Array.isArray(value) ? value[0] : value; assert.ok(first); return first; }
async function login(app = createApp(db, config), email = "publisher@example.invalid") {
    const agent = request.agent(app);
    const response = await agent.post("/api/admin/login").set("Origin", origin).send({ email, password });
    assert.equal(response.status, 200);
    return { agent, response, csrf: response.body.csrfToken as string };
}
test("staff endpoints reject anonymous access and mark all admin responses private", async () => {
    const http = request(createApp(db, config));
    const response = await http.get("/api/admin/session");
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "ADMIN_AUTH_REQUIRED");
    assert.match(String(response.headers["cache-control"]), /no-store/);
    for (const path of ["/api/admin/content", "/api/admin/content/revisions"]) {
        assert.equal((await http.get(path)).status, 401);
    }
    const rejected = await http.post("/api/admin/login").send({ email: "invalid", password: "test" });
    assert.equal(rejected.status, 403);
    assert.match(String(rejected.headers["cache-control"]), /no-store/);
});
test("staff login creates opaque durable sessions with CSRF and logout invalidates them", async () => {
    const { agent, response, csrf } = await login();
    assert.equal(response.body.user.role, "publisher");
    assert.equal(response.body.user.canManageEnquiries, false);
    assert.equal(response.body.user.passwordHash, undefined);
    assert.match(csrf, /^[a-f0-9]{64}$/);
    const cookie = staffCookie(response);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const session = await db.shopAdminSession.findFirstOrThrow({ where: { adminId: publisherId } });
    assert.equal(session.tokenHash.length, 64);
    assert.ok(!cookie.includes(session.tokenHash));
    const restarted = request(createApp(db, config));
    assert.equal((await restarted.get("/api/admin/session").set("Cookie", cookie.split(";")[0]!)).body.csrfToken, csrf);
    assert.equal((await agent.post("/api/admin/logout").set("Origin", origin).send({})).status, 403);
    assert.equal((await agent.post("/api/admin/logout").set("Origin", origin).set("X-CSRF-Token", csrf).send({})).status, 204);
    assert.equal((await restarted.get("/api/admin/session").set("Cookie", cookie.split(";")[0]!)).status, 401);
});
test("login errors are generic, bounded and never create a session", async () => {
    const http = request(createApp(db, config));
    const send = (email: string) => http.post("/api/admin/login").set("Origin", origin).send({ email, password: randomBytes(24).toString("hex") });
    const unknown = await send("unknown@example.invalid"), wrong = await send("editor@example.invalid");
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
    for (let i = 0; i < 3; i++)
        assert.equal((await send("unknown@example.invalid")).status, 401);
    assert.equal((await send("unknown@example.invalid")).status, 429);
    assert.equal(await db.shopAdminSession.count({ where: { adminId: editorId } }), 0);
});
test("expired, inactive and ambiguous sessions fail closed; login rotates supplied credentials", async () => {
    const { agent, response } = await login();
    const cookie = staffCookie(response).split(";")[0]!;
    assert.equal((await request(createApp(db, config)).get("/api/admin/session").set("Cookie", `${cookie}; ${cookie}`)).status, 401);
    await db.shopAdmin.update({ where: { id: publisherId }, data: { active: false } });
    assert.equal((await agent.get("/api/admin/session")).status, 401);
    await db.shopAdmin.update({ where: { id: publisherId }, data: { active: true } });
    await db.shopAdminSession.updateMany({ where: { adminId: publisherId }, data: { expiresAt: new Date(0) } });
    assert.equal((await agent.get("/api/admin/session")).status, 401);
    const rotated = await agent.post("/api/admin/login").set("Origin", origin).send({ email: "publisher@example.invalid", password });
    assert.equal(rotated.status, 200);
    assert.notEqual(staffCookie(rotated).split(";")[0]!, cookie);
    const production = await request(createApp(db, { ...config, secureCookies: true })).post("/api/admin/login").set("Origin", origin).send({ email: "publisher@example.invalid", password });
    assert.match(staffCookie(production), /^__Host-shop_admin=/);
    assert.match(staffCookie(production), /; Secure/);
    assert.match(staffCookie(production), /Path=\//);
});
test("local staff bootstrap reads a private stdin password, hashes it and refuses replacement", async () => {
    const { spawn } = await import("node:child_process");
    const { resolve } = await import("node:path");
    const email = `bootstrap-${randomBytes(6).toString("hex")}@example.invalid`;
    const run = (args: string[], input: string) => new Promise<{
        code: number | null;
        output: string;
    }>((resolveResult, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", resolve("src/admin/bootstrap-cli.ts"), ...args], { env: { ...process.env, DATABASE_URL: url }, stdio: ["pipe", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", v => output += v);
        child.stderr.on("data", v => output += v);
        child.on("error", reject);
        child.on("close", code => resolveResult({ code, output }));
        child.stdin.end(input);
    });
    const first = await run([email, "publisher"], password + "\n");
    assert.equal(first.code, 0);
    const row = await db.shopAdmin.findUnique({ where: { email } });
    assert.ok(row, "bootstrap must persist a staff account");
    assert.equal(row.role, "publisher");
    assert.ok(!row.passwordHash.includes(password));
    assert.ok(!first.output.includes(password));
    assert.equal((await login(createApp(db, config), email)).response.status, 200);
    assert.notEqual((await run([email, "editor"], password + "\n")).code, 0);
    assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { email } })).role, "publisher");
    assert.notEqual((await run(["short@example.invalid", "publisher"], "short\n")).code, 0);
    assert.notEqual((await run(["invalid-role@example.invalid", "owner"], password)).code, 0);
    assert.equal(await db.shopAdmin.count({ where: { email: { in: ["short@example.invalid", "invalid-role@example.invalid"] } } }), 0);
});
const content = { schemaVersion: 1, landingPages: [], homeSections: [{ key: "hero", enabled: true }], homeCopy: { categoryHeading: "Pick a room", bestsellersHeading: "Customer favourites", socialHeading: "At home", ticker: "Furniture made thoughtfully", testimonialHeading: "Our customers", testimonialSubheading: "Stories from home" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/test.webp", alt: "Test scene" }], pages: [{ slug: "care-guide", title: "Care guide", description: "Caring for furniture", body: "Keep dry.", banner: null }], motion: { autoplaySocial: false, autoplayCities: false, revealSections: true } };
async function save(agent: ReturnType<typeof request.agent>, csrf: string, expectedVersion: number, body: object = content) { return agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion, content: body }); }
test("drafts remain private, explicit publication persists and rollback creates a new unpublished draft", async () => {
    const { agent, csrf } = await login();
    assert.deepEqual((await agent.get("/api/admin/content")).body, { version: 0, draft: null, publishedVersion: null, updatedAt: null });
    assert.equal((await request(createApp(db, config)).get("/api/content/storefront")).status, 404);
    const first = await save(agent, csrf, 0);
    assert.equal(first.status, 200);
    assert.equal(first.body.version, 1);
    assert.equal(first.body.draft.pages[0].body, "Keep dry.");
    assert.equal((await request(createApp(db, config)).get("/api/content/storefront?draft=true")).status, 404);
    const history = (await agent.get("/api/admin/content/revisions")).body.revisions;
    assert.equal(history.length, 1);
    assert.equal(history[0].actorEmail, "publisher@example.invalid");
    const publish = await agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 1 });
    assert.equal(publish.status, 200);
    assert.equal(publish.body.version, 2);
    assert.equal(publish.body.publishedVersion, 2);
    const live = await request(createApp(db, config)).get("/api/content/storefront");
    assert.deepEqual(live.body, { version: 2, content });
    assert.match(String(live.headers["cache-control"]), /no-store/);
    const edited = { ...content, homeCopy: { ...content.homeCopy, categoryHeading: "Unpublished private copy" } };
    assert.equal((await save(agent, csrf, 2, edited)).body.version, 3);
    assert.equal((await request(createApp(db, config)).get("/api/content/storefront")).body.content.homeCopy.categoryHeading, "Pick a room");
    const rollback = await agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 3, revisionId: history[0].id });
    assert.equal(rollback.status, 200);
    assert.equal(rollback.body.version, 4);
    assert.equal(rollback.body.publishedVersion, 2);
    assert.deepEqual(rollback.body.draft, content);
    assert.equal((await agent.get("/api/admin/content/revisions")).body.revisions.length, 4);
});
test("editor roles, cross-session CSRF and stale versions cannot publish or overwrite content", async () => {
    const { agent, csrf } = await login(createApp(db, config), "editor@example.invalid");
    assert.equal((await save(agent, csrf, 4)).status, 200);
    assert.equal((await agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 5 })).status, 403);
    assert.equal((await save(agent, csrf, 4)).status, 409);
    assert.equal((await save(agent, "0".repeat(64), 5)).status, 403);
    const other = await login();
    assert.equal((await save(agent, other.csrf, 5)).status, 403);
    assert.equal((await agent.put("/api/admin/content").set("Origin", "https://other.invalid").set("X-CSRF-Token", csrf).send({ expectedVersion: 5, content })).status, 403);
    await db.shopAdmin.update({ where: { id: publisherId }, data: { role: "editor" } });
    assert.equal((await other.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", other.csrf).send({ expectedVersion: 5 })).status, 403);
    await db.shopAdmin.update({ where: { id: publisherId }, data: { role: "publisher" } });
    assert.equal((await agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 5, revisionId: "missing" })).status, 404);
    assert.equal((await agent.get("/api/admin/content")).body.version, 5);
});
test("concurrent saves and publication have one winner and one conflict with an atomic revision", async () => {
    const { agent, csrf } = await login();
    const initial = await db.shopContentRevision.count();
    const results = await Promise.all([save(agent, csrf, 5, { ...content, homeCopy: { ...content.homeCopy, categoryHeading: "Version six A" } }), save(agent, csrf, 5, { ...content, homeCopy: { ...content.homeCopy, categoryHeading: "Version six B" } })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(await db.shopContentRevision.count(), initial + 1);
    const raced = await Promise.all([save(agent, csrf, 6), agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: 6 })]);
    assert.deepEqual(raced.map(r => r.status).sort(), [200, 409]);
    const stored = await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } });
    assert.equal(stored.version, 7);
    assert.equal(await db.shopContentRevision.count(), initial + 2);
    if (raced[1]!.status === 200)
        assert.equal(stored.publishedVersion, 7);
    else
        assert.equal(stored.publishedVersion, 2);
});
test("strict content validation rejects malicious links, oversized bodies and injected commerce data", async () => {
    const { agent, csrf } = await login();
    for (const invalid of [
        { ...content, products: [] },
        { ...content, pages: [{ ...content.pages[0], slug: "contact" }] },
        { ...content, instagramPosts: [{ ...content.instagramPosts[0], src: "https://evil.invalid/image.svg" }] },
        { ...content, campaigns: [{ key: "landing-announcement", label: "test", headline: ["test"], supporting: "", offer: [], eligibility: "", cta: "Click", href: "javascript:alert(1)" }] },
    ])
        assert.equal((await save(agent, csrf, 7, invalid)).status, 400);
    assert.equal((await save(agent, csrf, 7, { ...content, pages: [{ ...content.pages[0], body: "x".repeat(140000) }] })).status, 413);
    const large = { ...content, pages: Array.from({ length: 4 }, (_, i) => ({ ...content.pages[0], slug: `guide-${i}`, body: "x".repeat(7000) })) };
    assert.equal((await save(agent, csrf, 7, large)).status, 200, "admin content accepts its scoped body size above the commerce 16 KiB cap");
    assert.equal((await request(createApp(db, config)).post("/api/enquiries").set("Origin", origin).send({ message: "x".repeat(20000) })).status, 413);
});
