import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { storefrontContentSchema, templateMediaSchema } from "@shopmaple/contracts";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000", token = randomBytes(32).toString("hex"), digest = (v: string) => createHash("sha256").update(v).digest("hex");
let root: string, staffId: string;
const fixture = () => ({ schemaVersion: 1, homeSections: [{ key: "hero", enabled: false }, { key: "nimbus", enabled: false }], homeCopy: { categoryHeading: "Rooms", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Furniture", testimonialHeading: "Customers", testimonialSubheading: "Stories" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/existing.webp", alt: "Room" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } });
let http: ReturnType<typeof request>;
const auth = { Origin: origin, Cookie: `shop_admin=${token}`, "X-CSRF-Token": digest("csrf:" + token) };
before(async () => {
  root = await mkdtemp(join(tmpdir(), "template-media-test-"));
  const staff = await db.shopAdmin.create({ data: { email: `artwork-${randomBytes(6).toString("hex")}@example.invalid`, passwordHash: "unused-test-password-hash", role: "publisher" } });
  staffId = staff.id;
  await db.shopAdminSession.create({ data: { adminId: staffId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 600000) } });
  http = request(createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, mediaRoot: root }));
});
after(async () => {
  if (staffId) {
    await db.shopContentRevision.deleteMany({ where: { actorId: staffId } });
    await db.shopMediaAsset.deleteMany({ where: { createdById: staffId } });
    await db.shopAdminSession.deleteMany({ where: { adminId: staffId } });
    await db.shopAdmin.deleteMany({ where: { id: staffId } });
  }
  await db.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
});
async function upload(background: string) {
  const image = await sharp({ create: { width: 16, height: 12, channels: 3, background } }).png().toBuffer();
  const response = await http.post("/api/admin/media").set(auth).set("Content-Type", "image/png").send(image);
  assert.equal(response.status, 201);
  return response.body.asset as { id: string; url: string; sha256: string; previewUrl: string };
}
async function save(templateMedia: unknown[]) {
  const version = (await db.shopContent.findUnique({ where: { id: "storefront" } }))?.version ?? 0;
  const response = await http.put("/api/admin/content").set(auth).send({ expectedVersion: version, content: { ...fixture(), templateMedia } });
  assert.equal(response.status, 200);
  return response.body.version as number;
}
const publish = (expectedVersion: number) => http.post("/api/admin/content/publish").set(auth).send({ expectedVersion });

test("draft template images stay private and publishing hidden artwork exposes both responsive files", async () => {
  const desktop = await upload("#102030"), mobile = await upload("#203040");
  const templateMedia = [{ key: "home-nimbus", image: desktop.url, mobileImage: mobile.url, alt: "Nimbus room" }];
  const version = await save(templateMedia);
  const draft = await http.get("/api/admin/content").set(auth);
  assert.deepEqual(draft.body.draft.templateMedia, templateMedia);
  for (const asset of [desktop, mobile]) {
    assert.equal((await http.get(asset.url)).status, 404);
    assert.equal((await http.get(asset.previewUrl)).status, 401);
    assert.equal((await http.get(asset.previewUrl).set(auth)).status, 200);
  }
  assert.equal((await publish(version)).status, 200);
  const publicContent = await http.get("/api/content/storefront");
  assert.deepEqual(publicContent.body.content.templateMedia, templateMedia);
  for (const asset of [desktop, mobile]) {
    const response = await http.get(asset.url);
    assert.equal(response.status, 200, "Every referenced template image must become public even when its section is hidden");
    const cacheControl = response.headers["cache-control"];
    assert.equal(typeof cacheControl, "string");
    assert.match(cacheControl!, /immutable/);
  }
});

test("missing template upload references reject publication atomically", async () => {
  const asset = await upload("#304050");
  const version = await save([{ key: "home-nimbus", image: asset.url, mobileImage: `/media/uploads/${"f".repeat(64)}.webp`, alt: "Nimbus" }]);
  const previous = await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } });
  const revisionCount = await db.shopContentRevision.count();
  const response = await publish(version);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "MEDIA_REFERENCE_MISSING");
  const current = await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } });
  assert.equal(current.version, version);
  assert.deepEqual(current.published, previous.published);
  assert.equal(await db.shopContentRevision.count(), revisionCount);
  assert.equal((await http.get(asset.url)).status, 404);
  assert.equal((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicAt, null);
});

test("missing template files and malformed managed paths cannot publish or expose other valid images", async () => {
  const desktop = await upload("#405060"), mobile = await upload("#506070");
  const version = await save([{ key: "nimbus-hero-poster", image: desktop.url, mobileImage: mobile.url, alt: "Collection film" }]);
  const path = join(root, `${mobile.sha256}.webp`);
  await rename(path, `${path}.missing`);
  try {
    const response = await publish(version);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "MEDIA_REFERENCE_MISSING");
    assert.equal((await http.get(desktop.url)).status, 404);
    assert.equal((await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } })).version, version);
  } finally { await rename(`${path}.missing`, path); }
  const malformedVersion = await save([{ key: "home-newsletter", image: "/media/uploads/not-a-hash.webp", alt: "Room" }]);
  const malformed = await publish(malformedVersion);
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, "MEDIA_REFERENCE_INVALID");
});

const cityKeys = ["delhi", "kolkata", "hyderabad", "varanasi", "mumbai", "jaipur", "bengaluru", "chennai", "gujarat", "artwork-1", "artwork-2", "artwork-3", "artwork-4", "artwork-5", "artwork-6", "artwork-7", "artwork-8", "agra"];
const newDecorativeKeys = ["home-difference-1", "home-difference-2", "home-difference-3", "home-difference-4", "home-value-quiet-luxury", "home-value-real-living", "home-value-ages-beautifully", "home-value-strength", ...Array.from({ length: 8 }, (_, i) => `home-city-artwork-${i + 1}`)];

test("legacy content retains absent artwork and city overrides and existing accessibility rules", () => {
  const parsed = storefrontContentSchema.parse(fixture());
  assert.equal(Object.hasOwn(parsed, "templateMedia"), false);
  assert.equal(Object.hasOwn(parsed, "homeCitiesLayout"), false);
  assert.equal(templateMediaSchema.safeParse([{ key: "home-hero-sofas", image: "/media/sofa.webp", alt: "" }]).success, true);
  assert.equal(templateMediaSchema.safeParse([{ key: "home-newsletter", image: "/media/room.webp", alt: " " }]).success, false);
});

test("homepage decorative icons accept empty descriptions while every named city needs a description", () => {
  for (const key of newDecorativeKeys)
    assert.equal(templateMediaSchema.safeParse([{ key, image: "/media/icon.webp", alt: "" }]).success, true, `${key} permits decorative artwork`);
  for (const city of cityKeys.filter(key => !key.startsWith("artwork-"))) {
    const item = { key: `home-city-${city}`, image: "/media/city.webp", alt: "City landmark" };
    assert.equal(templateMediaSchema.safeParse([item]).success, true, `${city} accepts named city artwork`);
    assert.equal(templateMediaSchema.safeParse([{ ...item, alt: " " }]).success, false, `${city} requires meaningful alt text`);
  }
});

test("all 47 artwork placements coexist without weakening URL, responsive, identity or field validation", () => {
  const legacy = ["home-workshop-poster", "home-hero-sofas", "home-hero-chairs", "home-hero-tables", "home-hero-beds", "home-nimbus", "home-newsletter", "home-testimonial-poster", "nimbus-room-bedroom", "nimbus-room-living", "nimbus-room-dining", "nimbus-room-collection", "nimbus-origin", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining", "nimbus-project", "nimbus-hero-poster", "nimbus-craft-poster", "story-hero", "story-film-poster"];
  const responsive = ["home-nimbus", "nimbus-room-collection", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining", "nimbus-hero-poster"];
  const items = [...legacy, ...newDecorativeKeys, ...cityKeys.filter(key => !key.startsWith("artwork-")).map(key => `home-city-${key}`)].map(key => ({ key, image: "/media/art.webp", alt: "Artwork", ...(responsive.includes(key) ? { mobileImage: "/media/mobile.webp" } : {}) }));
  const result = templateMediaSchema.safeParse(items);
  assert.equal(result.success, true, "All 47 independently identified placements must validate together");
  if (result.success) assert.equal(result.data.length, 47);
  const icon = { key: "home-difference-1", image: "/media/icon.webp", alt: "" };
  for (const invalid of [
    [...items, icon], [icon, icon], [{ ...icon, key: "home-difference-5" }],
    [{ ...icon, image: "javascript:alert(1)" }], [{ ...icon, image: "https://attacker.invalid/image.webp" }],
    [{ ...icon, image: "/media/../private.webp" }], [{ ...icon, image: "/media/icon%2ewebp" }],
    [{ ...icon, mobileImage: "/media/mobile.webp" }], [{ ...icon, alt: "bad\u0000text" }], [{ ...icon, html: "<script>bad</script>" }],
    [{ key: "home-nimbus", image: "/media/room.webp", alt: "Nimbus" }],
  ]) assert.equal(templateMediaSchema.safeParse(invalid).success, false);
});

test("city layout accepts any order and all hidden but rejects omitted, duplicate, unknown and unsafe entries", () => {
  const layout = [...cityKeys].reverse().map(key => ({ key, enabled: false }));
  const result = storefrontContentSchema.safeParse({ ...fixture(), homeCitiesLayout: layout });
  assert.equal(result.success, true, "A complete reordered, hidden rail must be a valid draft");
  if (result.success) assert.deepEqual(result.data.homeCitiesLayout, layout);
  for (const invalid of [
    [], layout.slice(1), [...layout, layout[0]], [...layout.slice(1), layout[1]],
    [{ ...layout[0], key: "unknown" }, ...layout.slice(1)], [{ ...layout[0], enabled: "false" }, ...layout.slice(1)],
    [{ ...layout[0], href: "javascript:alert(1)" }, ...layout.slice(1)],
    [{ ...layout[0], image: "/media/private.webp" }, ...layout.slice(1)],
    [{ ...layout[0], checkoutEnabled: true }, ...layout.slice(1)],
  ]) assert.equal(storefrontContentSchema.safeParse({ ...fixture(), homeCitiesLayout: invalid }).success, false);
});

test("new homepage artwork stays private until publication and missing city uploads fail atomically", async () => {
  const icon = await upload("#613245"), city = await upload("#725346");
  const templateMedia = [{ key: "home-difference-1", image: icon.url, alt: "" }, { key: "home-city-delhi", image: city.url, alt: "Delhi landmark" }, { key: "home-city-artwork-8", image: icon.url, alt: "" }];
  const version = await save(templateMedia);
  assert.equal((await http.get(icon.url)).status, 404);
  assert.equal((await http.get(city.url)).status, 404);
  assert.equal((await publish(version)).status, 200);
  assert.deepEqual((await http.get("/api/content/storefront")).body.content.templateMedia, templateMedia);
  assert.equal((await http.get(icon.url)).status, 200);
  assert.equal((await http.get(city.url)).status, 200);
  const privateIcon = await upload("#835447");
  const missingVersion = await save([{ key: "home-value-strength", image: privateIcon.url, alt: "" }, { key: "home-city-agra", image: `/media/uploads/${"e".repeat(64)}.webp`, alt: "Agra landmark" }]);
  const previous = (await http.get("/api/content/storefront")).body;
  const revisionCount = await db.shopContentRevision.count();
  const rejected = await publish(missingVersion);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, "MEDIA_REFERENCE_MISSING");
  assert.equal((await http.get(privateIcon.url)).status, 404);
  assert.equal((await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } })).version, missingVersion);
  assert.equal(await db.shopContentRevision.count(), revisionCount);
  assert.deepEqual((await http.get("/api/content/storefront")).body, previous);
});
