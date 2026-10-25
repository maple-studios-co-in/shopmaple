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

test("Our Story drafts publish and restore through the existing authorized revision boundary", async () => {
    const { agent, csrf } = await login();
    const editor = await login(createApp(db, config), "editor@example.invalid");
    const initial = (await agent.get("/api/admin/content")).body;
    const oldPublic = await request(createApp(db, config)).get("/api/content/storefront");
    const storyPage = {
        title: "Our workshop story", heroHeading: ["Crafted for you"], tagline: "Made in Delhi",
        beliefEyebrow: "Our belief", beliefHeading: ["Made with care"], beliefBody: "Craft matters.",
        filmHeading: ["Our workshop"], journeyHeading: "Our journey",
        sections: ["hero", "belief-film", "journey", "cities"].map(key => ({ key, enabled: true })),
        timeline: Array.from({ length: 7 }, (_, index) => ({ key: `chapter-${index + 1}`, date: `${2010 + index}`, title: `Chapter ${index + 1}`, body: "Our story continues." })),
    };
    const next = { ...content, storyPage };
    const saved = await save(editor.agent, editor.csrf, initial.version, next);
    assert.equal(saved.status, 200, "typed Our Story content saves through the draft contract");
    assert.equal(saved.body.draft.storyPage.title, "Our workshop story");
    assert.deepEqual((await request(createApp(db, config)).get("/api/content/storefront")).body, oldPublic.body);
    const firstRevision = (await agent.get("/api/admin/content/revisions")).body.revisions[0];
    assert.equal(firstRevision.actorEmail, "editor@example.invalid");
    const publish = (version: number) => agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: version });
    assert.equal((await editor.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", editor.csrf).send({ expectedVersion: saved.body.version })).status, 403);
    assert.equal((await publish(saved.body.version)).status, 200);
    const published = (await request(createApp(db, config)).get("/api/content/storefront")).body;
    assert.equal(published.content.storyPage.title, "Our workshop story");
    assert.equal((await save(agent, csrf, saved.body.version, next)).status, 409);
    const edited = await save(agent, csrf, published.version, { ...next, storyPage: { ...storyPage, title: "Private story edit" } });
    assert.equal(edited.status, 200);
    assert.equal((await request(createApp(db, config)).get("/api/content/storefront?draft=true")).body.content.storyPage.title, "Our workshop story");
    const restored = await agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", csrf).send({ expectedVersion: edited.body.version, revisionId: firstRevision.id });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.draft.storyPage.title, "Our workshop story");
    assert.equal(restored.body.publishedVersion, published.version);
    assert.deepEqual((await request(createApp(db, config)).get("/api/content/storefront")).body, published);
    const invalid = await save(agent, csrf, restored.body.version, { ...next, storyPage: { ...storyPage, image: "/media/uploads/unreviewed.webp" } });
    assert.equal(invalid.status, 400);
    assert.equal((await agent.get("/api/admin/content")).body.version, restored.body.version);
});

test("homepage details retain draft isolation, publisher authority, stale protection and restoration", async () => {
    const publisher = await login();
    const editor = await login(createApp(db, config), "editor@example.invalid");
    const initial = (await publisher.agent.get("/api/admin/content")).body;
    const previousPublic = (await request(createApp(db, config)).get("/api/content/storefront")).body;
    const homeDetails = {
        hero: { cta: "Discover Maple", tiles: ["sofas", "chairs", "tables", "beds"].map(key => ({ key, label: `Our ${key}`, priceLabel: "Ask for a quote" })) },
        difference: { eyebrow: "Maple craft", heading: "Made for you", cta: "Plan your room", promises: ["Custom", "Comfort", "Care", "Craft"] },
        nimbus: { heading: "Nimbus furniture", tagline: "Cloud comfort", features: ["Soft", "Airy", "Modern", "Relaxed"], cta: "Discover Nimbus" },
        testimonial: { title: "A happy home", paragraphs: ["<script>plain text only</script>", "Thoughtful service."], name: "A customer", attribution: " — Homeowner" },
        newsletter: { heading: "Fresh ideas", body: "Keep in touch.", signupHeading: "Join us" },
        values: ["quiet-luxury", "real-living", "ages-beautifully", "strength"].map(key => ({ key, title: "Careful craft", body: "Made with care." })),
        cities: { eyebrow: "Delivery", heading: "Across India" },
        project: { heading: "Your project", introBefore: "Reply within ", responseTime: "two days", introAfter: " with ideas.", body: "Tell us more." },
    };
    const next = { ...content, homeDetails };
    const saved = await save(editor.agent, editor.csrf, initial.version, next);
    assert.equal(saved.status, 200, "bounded homepage details must save as a private draft");
    assert.equal(saved.body.draft.homeDetails.hero.cta, "Discover Maple");
    assert.deepEqual((await request(createApp(db, config)).get("/api/content/storefront?draft=true")).body, previousPublic);
    const revision = (await publisher.agent.get("/api/admin/content/revisions")).body.revisions[0];
    assert.equal(revision.actorEmail, "editor@example.invalid");
    assert.equal((await editor.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", editor.csrf).send({ expectedVersion: saved.body.version })).status, 403);
    const publish = await publisher.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: saved.body.version });
    assert.equal(publish.status, 200);
    const published = (await request(createApp(db, config)).get("/api/content/storefront")).body;
    assert.deepEqual(published.content.homeDetails, homeDetails);
    assert.equal((await save(editor.agent, editor.csrf, saved.body.version, next)).status, 409);
    const changed = await save(editor.agent, editor.csrf, published.version, { ...next, homeDetails: { ...homeDetails, hero: { ...homeDetails.hero, cta: "Private change" } } });
    assert.equal(changed.status, 200);
    assert.equal((await request(createApp(db, config)).get("/api/content/storefront")).body.content.homeDetails.hero.cta, "Discover Maple");
    const restored = await publisher.agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: changed.body.version, revisionId: revision.id });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.draft.homeDetails, homeDetails);
    assert.equal(restored.body.publishedVersion, published.version);
    assert.deepEqual((await request(createApp(db, config)).get("/api/content/storefront")).body, published);
    for (const invalid of [
        { ...homeDetails, image: "/media/uploads/unreviewed.webp" },
        { ...homeDetails, hero: { ...homeDetails.hero, tiles: [{ ...homeDetails.hero.tiles[0], pricePaise: 1 }, ...homeDetails.hero.tiles.slice(1)] } },
        { ...homeDetails, project: { ...homeDetails.project, checkoutEnabled: true } },
        { ...homeDetails, values: [...homeDetails.values.slice(0, 3), homeDetails.values[0]] },
        { ...homeDetails, cities: { ...homeDetails.cities, heading: " " } },
    ]) assert.equal((await save(editor.agent, editor.csrf, restored.body.version, { ...next, homeDetails: invalid })).status, 400);
    assert.equal((await publisher.agent.get("/api/admin/content")).body.version, restored.body.version);
});

test("Nimbus drafts retain public isolation, publisher authority, stale protection and draft-only restoration", async () => {
    const publisher = await login();
    const editor = await login(createApp(db, config), "editor@example.invalid");
    const initial = (await publisher.agent.get("/api/admin/content")).body;
    const publicRequest = () => request(createApp(db, config)).get("/api/content/storefront?draft=true");
    const previousPublic = await publicRequest();
    const nimbusPage = {
        title: "Nimbus for your home",
        sections: ["project", "hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "promises"].map(key => ({ key, enabled: key !== "hero" })),
        intro: { heading: "Cloud comfort", body: "Furniture for everyday living." },
        roomTiles: ["dining", "bedroom", "living"].map(key => ({ key, title: `Our ${key}` })),
        origin: { eyebrow: "Our inspiration", heading: "Designed for comfort", body: "<script>plain text only</script>\nMade for life." },
        principles: { heading: "Our principles", items: ["spaces", "comfort", "silhouettes", "luxury"].map(key => ({ key, title: `Our ${key}`, body: "Careful design." })) },
        roomSlides: ["dining", "living", "bedroom"].map(key => ({ key, label: `Explore ${key}` })),
        series: { eyebrow: "Everyday spaces", heading: "Explore Nimbus" },
        project: { heading: "Your home", body: "Tell us about your project." },
        promises: ["warranty", "custom", "delivery", "craft"].map(key => ({ key, title: `Our ${key}` })),
    };
    const next = { ...content, nimbusPage };
    const saved = await save(editor.agent, editor.csrf, initial.version, next);
    assert.equal(saved.status, 200, "typed Nimbus content must save as a private draft");
    assert.deepEqual(saved.body.draft.nimbusPage, nimbusPage);
    const afterSave = await publicRequest();
    assert.equal(afterSave.status, previousPublic.status);
    assert.deepEqual(afterSave.body, previousPublic.body);
    const revision = (await publisher.agent.get("/api/admin/content/revisions")).body.revisions[0];
    assert.equal(revision.actorEmail, "editor@example.invalid");
    assert.equal((await editor.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", editor.csrf).send({ expectedVersion: saved.body.version })).status, 403);
    const publish = await publisher.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: saved.body.version });
    assert.equal(publish.status, 200);
    const published = (await publicRequest()).body;
    assert.deepEqual(published.content.nimbusPage, nimbusPage);
    assert.equal((await save(editor.agent, editor.csrf, saved.body.version, next)).status, 409);
    const edited = await save(editor.agent, editor.csrf, published.version, { ...next, nimbusPage: { ...nimbusPage, title: "Private Nimbus edit" } });
    assert.equal(edited.status, 200);
    assert.equal((await publicRequest()).body.content.nimbusPage.title, "Nimbus for your home");
    const restored = await publisher.agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: edited.body.version, revisionId: revision.id });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.draft.nimbusPage, nimbusPage);
    assert.equal(restored.body.publishedVersion, published.version);
    assert.deepEqual((await publicRequest()).body, published);
    const historyCount = await db.shopContentRevision.count();
    for (const invalid of [
        { ...nimbusPage, html: "<script>alert(1)</script>" },
        { ...nimbusPage, image: "/media/uploads/unreviewed.webp" },
        { ...nimbusPage, roomTiles: [{ ...nimbusPage.roomTiles[0], href: "javascript:alert(1)" }, ...nimbusPage.roomTiles.slice(1)] },
        { ...nimbusPage, promises: [{ ...nimbusPage.promises[0], pricePaise: 1 }, ...nimbusPage.promises.slice(1)] },
        { ...nimbusPage, roomSlides: [{ ...nimbusPage.roomSlides[0], stock: 999 }, ...nimbusPage.roomSlides.slice(1)] },
        { ...nimbusPage, project: { ...nimbusPage.project, checkoutEnabled: true } },
        { ...nimbusPage, sections: [...nimbusPage.sections.slice(1), nimbusPage.sections[1]] },
        { ...nimbusPage, principles: { ...nimbusPage.principles, items: [...nimbusPage.principles.items.slice(1), nimbusPage.principles.items[1]] } },
        { ...nimbusPage, origin: { ...nimbusPage.origin, body: "bad\u0000text" } },
        { ...nimbusPage, series: { ...nimbusPage.series, heading: " " } },
    ]) assert.equal((await save(editor.agent, editor.csrf, restored.body.version, { ...next, nimbusPage: invalid })).status, 400);
    assert.equal((await publisher.agent.get("/api/admin/content")).body.version, restored.body.version);
    assert.equal(await db.shopContentRevision.count(), historyCount);
    assert.deepEqual((await publicRequest()).body, published);
});

const serviceFixture = () => ({
  contact: {
    title: "Contact our studio", eyebrow: "Here to help", heading: "Tell us about your space",
    helpEyebrow: "Questions answered", helpHeading: "Find some help",
    cities: { eyebrow: "Delivery", heading: "Across India" },
    sections: ["cities", "intro", "help"].map(key => ({ key, enabled: key !== "cities" })),
    categories: [["tracking", 5], ["payment", 4], ["account", 2], ["warranty", 1], ["damage", 1]].map(([key, count]) => ({
      key, title: `Help with ${key}`, subtitle: "Answers from the team",
      questions: Array.from({ length: Number(count) }, (_, index) => ({ key: `q${index + 1}`, question: `Question ${index + 1}?`, answer: "<script>Plain text</script>\nAsk our team." })),
    })),
  },
  bulk: {
    title: "Projects with Maple", eyebrow: "Your next project", heading: "Made for your space", subtitle: "Talk to a designer",
    sections: ["business", "hero", "trust", "process", "cities"].map(key => ({ key, enabled: key !== "cities" })),
    cities: { eyebrow: "Serving", heading: "Across India" },
    trust: { heading: "Care for every project", metricValue: "200+", metricLabel: "Spaces furnished", items: ["price", "quality", "materials", "custom"].map(key => ({ key, title: `Our ${key}` })) },
    process: { eyebrow: "How we help", heading: "Your design journey", steps: ["meet", "design", "deliver"].map(key => ({ key, title: `We ${key}`, body: "Thoughtful support throughout." })) },
    business: { badge: "Business enquiries", heading: "Furnish your project", body: "Talk to our project team.", features: ["Design", "Materials", "Craft", "Delivery", "Care"], cta: "Request details", trust: "Trusted support" },
  },
  returns: { title: "Order support", heading: "Return enquiries", policyLabel: "Read our policy", intro: "Ask our team about your order." },
});

test("service page drafts enforce public isolation, publisher authority, stale conflicts and draft-only restore", async () => {
    const publisher = await login();
    const editor = await login(createApp(db, config), "editor@example.invalid");
    const initial = (await publisher.agent.get("/api/admin/content")).body;
    const publicRequest = () => request(createApp(db, config)).get("/api/content/storefront?draft=true");
    const previousPublic = await publicRequest();
    const servicePages = serviceFixture();
    const next = { ...content, servicePages };
    const saved = await save(editor.agent, editor.csrf, initial.version, next);
    assert.equal(saved.status, 200, "typed service pages must save as a private draft");
    assert.deepEqual(saved.body.draft.servicePages, servicePages);
    assert.deepEqual((await publicRequest()).body, previousPublic.body);
    const revision = (await publisher.agent.get("/api/admin/content/revisions")).body.revisions[0];
    assert.equal(revision.actorEmail, "editor@example.invalid");
    assert.equal((await editor.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", editor.csrf).send({ expectedVersion: saved.body.version })).status, 403);
    const publish = await publisher.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: saved.body.version });
    assert.equal(publish.status, 200);
    const published = (await publicRequest()).body;
    assert.deepEqual(published.content.servicePages, servicePages);
    assert.equal((await save(editor.agent, editor.csrf, saved.body.version, next)).status, 409);
    const privatePages = structuredClone(servicePages);
    privatePages.contact.heading = "Private contact heading";
    privatePages.bulk.heading = "Private bulk heading";
    privatePages.returns.heading = "Private returns heading";
    const edited = await save(editor.agent, editor.csrf, published.version, { ...next, servicePages: privatePages });
    assert.equal(edited.status, 200);
    assert.deepEqual((await publicRequest()).body, published);
    const restored = await publisher.agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: edited.body.version, revisionId: revision.id });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.draft.servicePages, servicePages);
    assert.equal(restored.body.publishedVersion, published.version);
    assert.deepEqual((await publicRequest()).body, published);
    const historyCount = await db.shopContentRevision.count();
    for (const invalid of [
        { ...servicePages, html: "<script>alert(1)</script>" },
        { ...servicePages, contact: { ...servicePages.contact, phone: "+1 555" } },
        { ...servicePages, contact: { ...servicePages.contact, categories: [...servicePages.contact.categories.slice(1), servicePages.contact.categories[1]] } },
        { ...servicePages, contact: { ...servicePages.contact, categories: servicePages.contact.categories.map((category, index) => index === 0 ? { ...category, questions: category.questions.slice(1) } : category) } },
        { ...servicePages, bulk: { ...servicePages.bulk, sections: [...servicePages.bulk.sections.slice(1), servicePages.bulk.sections[1]] } },
        { ...servicePages, bulk: { ...servicePages.bulk, trust: { ...servicePages.bulk.trust, items: [{ ...servicePages.bulk.trust.items[0], key: "stock" }, ...servicePages.bulk.trust.items.slice(1)] } } },
        { ...servicePages, bulk: { ...servicePages.bulk, business: { ...servicePages.bulk.business, href: "javascript:alert(1)" } } },
        { ...servicePages, returns: { ...servicePages.returns, checkoutEnabled: true } },
        { ...servicePages, returns: { ...servicePages.returns, intro: "bad\u0000text" } },
        { ...servicePages, returns: { ...servicePages.returns, heading: " " } },
    ]) assert.equal((await save(editor.agent, editor.csrf, restored.body.version, { ...next, servicePages: invalid })).status, 400);
    assert.equal((await publisher.agent.get("/api/admin/content")).body.version, restored.body.version);
    assert.equal(await db.shopContentRevision.count(), historyCount);
    assert.deepEqual((await publicRequest()).body, published);
});

test("editorial drafts require publisher authority and retain isolated, conflict-safe revision history", async () => {
    const publisher = await login();
    const editor = await login(createApp(db, config), "editor@example.invalid");
    const initial = (await publisher.agent.get("/api/admin/content")).body;
    const publicRequest = () => request(createApp(db, config)).get("/api/content/storefront?draft=true");
    const previousPublic = await publicRequest();
    const editorialContent = {
        policies: [{ slug: "privacy-policy", title: "Your privacy", content: [{ tag: "p", children: ["Updated policy copy"] }] }],
        blogs: [{ handle: "recent-stories", title: "Studio stories" }],
        articles: [{ blog: "recent-stories", handle: "how-to-measure-furniture-before-ordering-online", title: "Measure your room", excerpt: "A measured introduction", content: [{ tag: "p", children: ["Start with your doorway."] }] }],
    };
    const next = { ...content, editorialContent };
    const saved = await save(editor.agent, editor.csrf, initial.version, next);
    assert.equal(saved.status, 200, "editorial overrides must save as a private draft");
    assert.deepEqual(saved.body.draft.editorialContent, editorialContent);
    assert.deepEqual((await publicRequest()).body, previousPublic.body);
    const revision = (await publisher.agent.get("/api/admin/content/revisions")).body.revisions[0];
    assert.equal(revision.actorEmail, "editor@example.invalid");
    assert.equal((await editor.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", editor.csrf).send({ expectedVersion: saved.body.version })).status, 403);
    assert.equal((await publisher.agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: saved.body.version })).status, 200);
    const published = (await publicRequest()).body;
    assert.deepEqual(published.content.editorialContent, editorialContent);
    assert.equal((await save(editor.agent, editor.csrf, saved.body.version, next)).status, 409);
    const privateCopy = structuredClone(editorialContent);
    privateCopy.policies[0]!.title = "Private policy title";
    privateCopy.articles[0]!.excerpt = "Private excerpt";
    const edited = await save(editor.agent, editor.csrf, published.version, { ...next, editorialContent: privateCopy });
    assert.equal(edited.status, 200);
    assert.deepEqual((await publicRequest()).body, published);
    const restored = await publisher.agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", publisher.csrf).send({ expectedVersion: edited.body.version, revisionId: revision.id });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.draft.editorialContent, editorialContent);
    assert.equal(restored.body.publishedVersion, published.version);
    assert.deepEqual((await publicRequest()).body, published);
    const historyCount = await db.shopContentRevision.count();
    const invalidNodes = [
        { tag: "script", children: ["alert(1)"] },
        { tag: "p", children: [{ tag: "a", href: "javascript:alert(1)", children: ["Unsafe"] }] },
        { tag: "p", children: [{ tag: "span", children: ["Injected"], onclick: "alert(1)" }] },
        { tag: "img", children: [], src: "/media/uploads/unreviewed.webp", alt: "Unapproved" },
    ];
    const invalid = [
        ...invalidNodes.map(node => ({ ...editorialContent, policies: [{ ...editorialContent.policies[0], content: [node] }] })),
        { ...editorialContent, policies: [...editorialContent.policies, ...editorialContent.policies] },
        { ...editorialContent, articles: [{ ...editorialContent.articles[0], publishedAt: "2030-01-01" }] },
        { ...editorialContent, articles: [{ ...editorialContent.articles[0], blog: "news" }] },
        { ...editorialContent, blogs: [{ handle: "checkout", title: "Checkout" }] },
    ];
    for (const value of invalid) assert.equal((await save(editor.agent, editor.csrf, restored.body.version, { ...next, editorialContent: value })).status, 400);
    assert.equal((await publisher.agent.get("/api/admin/content")).body.version, restored.body.version);
    assert.equal(await db.shopContentRevision.count(), historyCount);
    assert.deepEqual((await publicRequest()).body, published);
});
