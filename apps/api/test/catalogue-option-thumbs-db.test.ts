import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Dedicated loopback shopmaple_test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
before(() => db.$connect());
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
});
const product = (id: string) => ({ id, handle: id, title: id, description: "", category: "chairs", images: ["https://cdn.example.com/hero.jpg"], published: true, source: "fixture", sourceUpdatedAt: new Date("2026-10-26") });
const variant = (id: string, title: string, extra: object = {}) => ({ id, title, pricePaise: 1000, available: true, stockPolicy: "stocked", sku: "PRIVATE-SKU", ...extra });
async function seed() {
  await db.product.create({ data: { ...product("sofa"), variants: { create: [
    variant("v1", "Walnut", { images: ["https://cdn.example.com/walnut-1.jpg", "https://cdn.example.com/walnut-2.jpg"], slug: "walnut" }),
    variant("v2", "Oak", { images: [], slug: "oak" }),
    variant("v3", "Plain", {}),
    variant("v4", "Hidden", { images: ["https://cdn.example.com/hidden.jpg"], slug: "hidden", published: false }),
  ] } } });
}
const expected = [
  { name: "Walnut", image: "https://cdn.example.com/walnut-1.jpg", slug: "walnut" },
  { name: "Oak", image: null, slug: "oak" },
];

test("every card endpoint fills option thumbnails from each published variant's first photo and slug", async () => {
  await seed();
  const single = await request(app).get("/api/catalogue/cards/sofa");
  assert.equal(single.status, 200);
  assert.deepEqual(single.body.product.optionThumbs, expected);
  const batch = await request(app).get("/api/catalogue/cards?handles=sofa");
  assert.deepEqual(batch.body.products[0].optionThumbs, expected);
  const collection = await request(app).get("/api/catalogue/collections/all");
  assert.deepEqual(collection.body.products[0].optionThumbs, expected);
  const related = await request(app).get("/api/catalogue/related?category=chairs");
  assert.deepEqual(related.body.products[0].optionThumbs, expected);
});
test("thumbnails never expose other variant fields, and a product without option photos or slugs gets none", async () => {
  await seed();
  const single = await request(app).get("/api/catalogue/cards/sofa");
  assert.doesNotMatch(single.text, /PRIVATE-SKU|hidden\.jpg|walnut-2/);
  await db.variant.deleteMany();
  await db.variant.createMany({ data: [{ ...variant("p1", "Walnut"), productId: "sofa" }, { ...variant("p2", "Oak"), productId: "sofa" }] });
  const plain = await request(app).get("/api/catalogue/cards/sofa");
  assert.deepEqual(plain.body.product.optionThumbs, []);
  assert.deepEqual(plain.body.product.optionNames, ["Walnut", "Oak"]);
});
