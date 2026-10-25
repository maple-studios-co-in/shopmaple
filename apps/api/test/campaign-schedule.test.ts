import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const config = { webOrigin: origin, catalogMode: "preview" as const, secureCookies: false };
const password = randomBytes(24).toString("base64url");
const schedule = { startsAt: "2026-10-26T10:00:00Z", endsAt: "2026-10-27T10:00:00Z" };
const campaign = { key: "sofas-sale", label: "Autumn", headline: ["Autumn sofas"], supporting: "", offer: [], eligibility: "", cta: "Explore", href: "/pages/sofas", artwork: null };
const content = {
  schemaVersion: 1, landingPages: [], homeSections: [{ key: "hero", enabled: true }],
  homeCopy: { categoryHeading: "Rooms", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Thoughtful furniture", testimonialHeading: "Our customers", testimonialSubheading: "Stories" },
  campaigns: [campaign], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/test.webp", alt: "Test scene" }], pages: [],
  motion: { autoplaySocial: false, autoplayCities: false, revealSections: true },
};
const scheduledContent = (window: unknown = schedule) => ({ ...content, campaigns: [{ ...campaign, schedule: window }] });

before(async () => {
  await db.shopContentRevision.deleteMany();
  await db.shopContent.deleteMany();
  await db.shopAdminSession.deleteMany();
  await db.shopAdmin.deleteMany();
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }).toString("hex");
  for (const role of ["publisher", "editor"] as const) await db.shopAdmin.create({ data: { email: `${role}@example.invalid`, role, passwordHash: `scrypt$131072$8$1$${salt}$${digest}` } });
});
beforeEach(async () => {
  await db.shopContentRevision.deleteMany();
  await db.shopContent.deleteMany();
});
after(async () => db.$disconnect());
async function login(role = "publisher") {
  const agent = request.agent(createApp(db, config));
  const response = await agent.post("/api/admin/login").set("Origin", origin).send({ email: `${role}@example.invalid`, password });
  assert.equal(response.status, 200);
  return {
    agent,
    save: (version: number, document: object) => agent.put("/api/admin/content").set("Origin", origin).set("X-CSRF-Token", response.body.csrfToken).send({ expectedVersion: version, content: document }),
    publish: (version: number) => agent.post("/api/admin/content/publish").set("Origin", origin).set("X-CSRF-Token", response.body.csrfToken).send({ expectedVersion: version }),
    restore: (version: number, revisionId: string) => agent.post("/api/admin/content/rollback").set("Origin", origin).set("X-CSRF-Token", response.body.csrfToken).send({ expectedVersion: version, revisionId }),
  };
}
const publicContent = () => request(createApp(db, config)).get("/api/content/storefront");

test("legacy campaign draft and publication retain unscheduled content", async () => {
  const staff = await login();
  assert.equal((await staff.save(0, content)).status, 200);
  assert.equal((await publicContent()).status, 404);
  assert.equal((await staff.publish(1)).status, 200);
  assert.deepEqual((await publicContent()).body.content.campaigns, [campaign]);
});

test("campaign schedules persist across save, publish and restore while drafts remain private", async () => {
  const staff = await login();
  const saved = await staff.save(0, scheduledContent());
  assert.equal(saved.status, 200, "saving a valid schedule should succeed");
  assert.deepEqual(saved.body.draft.campaigns[0].schedule, schedule);
  const revision = (await staff.agent.get("/api/admin/content/revisions")).body.revisions[0].id;
  assert.equal((await publicContent()).status, 404);
  assert.equal((await staff.publish(1)).status, 200);
  assert.deepEqual((await publicContent()).body.content.campaigns[0].schedule, schedule);
  const cleared = await staff.save(2, scheduledContent(null));
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.draft.campaigns[0].schedule, null);
  assert.deepEqual((await publicContent()).body.content.campaigns[0].schedule, schedule);
  assert.equal((await staff.publish(3)).status, 200);
  assert.equal((await publicContent()).body.content.campaigns[0].schedule, null);
  const restored = await staff.restore(4, revision);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.version, 5);
  assert.equal(restored.body.publishedVersion, 4);
  assert.deepEqual(restored.body.draft.campaigns[0].schedule, schedule);
  assert.equal((await publicContent()).body.content.campaigns[0].schedule, null);
  assert.equal((await staff.publish(5)).status, 200);
  assert.deepEqual((await publicContent()).body.content.campaigns[0].schedule, schedule);
});

test("scheduled campaign changes cannot bypass editor publication or lost-update protection", async () => {
  const publisher = await login();
  const editor = await login("editor");
  assert.equal((await publisher.save(0, scheduledContent())).status, 200);
  assert.equal((await publisher.publish(1)).status, 200);
  const openEnded = { startsAt: "2026-11-01T00:00:00Z", endsAt: null };
  assert.equal((await editor.save(2, scheduledContent(openEnded))).status, 200);
  assert.equal((await editor.publish(3)).status, 403);
  assert.equal((await publisher.save(2, scheduledContent(null))).status, 409);
  assert.equal((await publisher.publish(2)).status, 409);
  assert.deepEqual((await publicContent()).body.content.campaigns[0].schedule, schedule);
  assert.deepEqual((await publisher.agent.get("/api/admin/content")).body.draft.campaigns[0].schedule, openEnded);
  const results = await Promise.all([publisher.save(3, scheduledContent(null)), editor.save(3, scheduledContent({ startsAt: null, endsAt: "2026-12-01T00:00:00Z" }))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.find(result => result.status === 200)!;
  const stored = (await publisher.agent.get("/api/admin/content")).body;
  assert.equal(stored.version, 4);
  assert.deepEqual(stored.draft, winner.body.draft);
  assert.equal(await db.shopContentRevision.count(), 4);
});

test("invalid schedule requests leave the previous draft and publication untouched", async () => {
  const staff = await login();
  assert.equal((await staff.save(0, scheduledContent())).status, 200);
  assert.equal((await staff.publish(1)).status, 200);
  for (const window of [
    { startsAt: "2026-10-26T10:00:00", endsAt: schedule.endsAt },
    { startsAt: "2026-02-30T10:00:00Z", endsAt: schedule.endsAt },
    { startsAt: schedule.endsAt, endsAt: schedule.startsAt },
    { startsAt: schedule.startsAt, endsAt: schedule.startsAt },
    { ...schedule, bypass: true },
    { startsAt: schedule.startsAt },
  ]) assert.equal((await staff.save(2, scheduledContent(window))).status, 400);
  const stored = (await staff.agent.get("/api/admin/content")).body;
  assert.equal(stored.version, 2);
  assert.deepEqual(stored.draft.campaigns[0].schedule, schedule);
  assert.deepEqual((await publicContent()).body.content.campaigns[0].schedule, schedule);
  assert.equal(await db.shopContentRevision.count(), 2);
});
