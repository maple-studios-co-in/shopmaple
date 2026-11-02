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
  root = await mkdtemp(join(tmpdir(), "home-details-media-test-"));
  const staff = await db.shopAdmin.create({ data: { email: `homedetails-${randomBytes(6).toString("hex")}@example.invalid`, passwordHash: "unused-test-password-hash", role: "publisher" } });
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
const details = (slideSrc: string, poster: string, nimbus: string, left: string, right: string) => ({
  hero: { cta: "Explore", tiles: ["sofas", "chairs", "tables", "beds"].map(key => ({ key, label: key, priceLabel: "From" })), slides: [{ kind: "video", src: "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/x/x.mp4?v=0", poster, alt: "Film", headline: "Hello", intro: "World" }, { kind: "image", src: slideSrc, alt: "Room", headline: "Two", intro: "Slide" }] },
  difference: { eyebrow: "A", heading: "B", cta: "C", promises: ["a", "b", "c", "d"] },
  nimbus: { heading: "Nimbus", tagline: "Soft", features: ["a", "b", "c", "d"], cta: "Go", slides: [{ heading: "Terra", tagline: "Earthy", features: ["a", "b", "c", "d"], cta: "Go", href: "/collections/all", image: nimbus, alt: "Terra" }] },
  testimonial: { title: "T", paragraphs: ["p"], name: "N", attribution: "A" },
  newsletter: { heading: "H", body: "B", signupHeading: "S" },
  values: ["quiet-luxury", "real-living", "ages-beautifully", "strength"].map(key => ({ key, title: key, body: "b" })),
  cities: { eyebrow: "E", heading: "H" },
  project: { heading: "H", introBefore: "a", responseTime: "b", introAfter: "c", body: "d" },
  editorial: { title: "Pull up a chair", text: "Stay", cta: "Shop", href: "/collections/all", leftImage: left, leftAlt: "Left", rightImage: right, rightAlt: "Right" },
});
test("library pictures chosen in hero slides, extra Nimbus cards and the editorial block become public when published", async () => {
  const [slide, poster, nimbus, left, right] = [await upload("#aa0000"), await upload("#00aa00"), await upload("#0000aa"), await upload("#aaaa00"), await upload("#00aaaa")];
  const version = (await db.shopContent.findUnique({ where: { id: "storefront" } }))?.version ?? 0;
  const saved = await http.put("/api/admin/content").set(auth).send({ expectedVersion: version, content: { ...fixture(), homeDetails: details(slide.url, poster.url, nimbus.url, left.url, right.url) } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  for (const asset of [slide, poster, nimbus, left, right]) assert.equal((await http.get(asset.url)).status, 404, "private until publication");
  const published = await http.post("/api/admin/content/publish").set(auth).send({ expectedVersion: saved.body.version });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  for (const asset of [slide, poster, nimbus, left, right]) assert.equal((await http.get(asset.url)).status, 200, `${asset.url} is public after publishing`);
});
