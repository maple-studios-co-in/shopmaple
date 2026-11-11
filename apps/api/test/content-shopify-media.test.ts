import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = () => createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
const clear = async () => { await db.shopContentRevision.deleteMany(); await db.shopContent.deleteMany(); };
beforeEach(clear);
after(async () => { await clear(); await db.$disconnect(); });

const film = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e92/f9239e92.HD-1080p-2.5Mbps-98879340.mp4?v=0";
const poster = "https://shop.maplefurnishers.com/cdn/shop/files/preview_images/f9239e92.thumbnail.0000000000.jpg?v=1792990295&width=1600";
const homeDetails = (slides: object[]) => ({
  hero: { cta: "Explore", tiles: ["sofas", "chairs", "tables", "beds"].map((key) => ({ key, label: key, priceLabel: "From" })), slides },
  difference: { eyebrow: "A", heading: "B", cta: "C", promises: ["a", "b", "c", "d"] },
  nimbus: { heading: "Nimbus", tagline: "Soft", features: ["a", "b", "c", "d"], cta: "Go" },
  testimonial: { title: "T", paragraphs: ["p"], name: "N", attribution: "A" },
  newsletter: { heading: "H", body: "B", signupHeading: "S" },
  values: ["quiet-luxury", "real-living", "ages-beautifully", "strength"].map((key) => ({ key, title: key, body: "b" })),
  cities: { eyebrow: "E", heading: "H" },
  project: { heading: "H", introBefore: "a", responseTime: "b", introAfter: "c", body: "d" },
});
/** A published document as production holds it: the hero's only slide is the shop film on Shopify, next to an upload. */
const document = (slides: object[]) => ({
  schemaVersion: 1, landingPages: [], homeSections: [{ key: "hero", enabled: true }],
  homeCopy: { categoryHeading: "Pick a room", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Made thoughtfully", testimonialHeading: "Customers", testimonialSubheading: "Stories" },
  campaigns: [], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: true },
  instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/instagram/test.jpg", alt: "Test scene" }],
  templateMedia: [{ key: "home-hero-sofas", image: "/media/uploads/" + "a".repeat(64) + ".webp", alt: "" }],
  homeDetails: homeDetails(slides),
});
async function publish(content: object) {
  await db.shopContent.create({ data: { id: "storefront", version: 3, draft: content, published: content, publishedVersion: 3 } });
}

test("published content that still names Shopify's film is served without it, and the store falls back to its own hero", async () => {
  const stored = document([{ kind: "video", src: film, poster, alt: "Workshop", headline: "Timeless", intro: "Handcrafted." }]);
  assert.equal(storefrontContentSchema.safeParse(stored).success, false, "Shopify's files are no longer valid store media");
  await publish(stored);
  const response = await request(app()).get("/api/content/storefront");
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.text, /shopify|\/cdn\/shop\//i);
  assert.equal(response.body.version, 3);
  assert.equal(response.body.content.homeDetails.hero.slides, undefined, "the emptied slide list is left out");
  assert.equal(response.body.content.homeDetails.hero.cta, "Explore");
  assert.deepEqual(response.body.content.templateMedia, stored.templateMedia, "staff uploads are untouched");
  assert.deepEqual(response.body.content.instagramPosts, stored.instagramPosts);
  // The stored document itself is unchanged until staff save or publish again.
  assert.deepEqual((await db.shopContent.findUniqueOrThrow({ where: { id: "storefront" } })).published, stored);
});

test("only the slide that named Shopify goes; a staff slide beside it stays, and a Shopify poster alone is dropped", async () => {
  const upload = "/media/uploads/" + "b".repeat(64) + ".webp";
  const staff = { kind: "image", src: upload, alt: "A room", headline: "Rooms", intro: "Made to order." };
  await publish(document([{ kind: "video", src: film, poster, alt: "Workshop", headline: "Timeless", intro: "Handcrafted." }, staff,
    { kind: "image", src: upload, poster, alt: "Second", headline: "Two", intro: "Slide" }]));
  const response = await request(app()).get("/api/content/storefront");
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.text, /shopify|\/cdn\/shop\//i);
  assert.deepEqual(response.body.content.homeDetails.hero.slides, [staff, { kind: "image", src: upload, alt: "Second", headline: "Two", intro: "Slide" }]);
});

test("content that names no Shopify media is served exactly as stored", async () => {
  const stored = document([{ kind: "image", src: "/media/uploads/" + "c".repeat(64) + ".webp", alt: "Room", headline: "One", intro: "Slide" }]);
  await publish(stored);
  const response = await request(app()).get("/api/content/storefront");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.content, storefrontContentSchema.parse(stored));
});
