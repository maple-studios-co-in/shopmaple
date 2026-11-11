import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { syncCatalogueUnion } from "../src/catalogue-union-sync.js";
import { reviewSummary } from "../src/review-summary.js";

// Ratings come from Keeri's approved reviews (owner, 4 Nov 2026). The sync keeps their average and count beside each
// product, so the card reads stay as lean as they are, and every card carries them.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Dedicated loopback shopmaple_test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
  await db.catalogueSyncState.deleteMany();
});
/** Keeri's own synthetic `productPage=1` fixture: a chair with two approved reviews (4.5) and a table with none. */
const keeri = () => JSON.parse(readFileSync(new URL("./fixtures/keeri-v2-product-page.json", import.meta.url), "utf8"));
type Card = { handle: string; rating?: { value: number; count: number } };

test("the sync keeps Keeri's approved review average and count beside each product, and the cards carry them", async () => {
  await syncCatalogueUnion(db, keeri(), "tenant-demo");
  const rows = await db.product.findMany({ select: { handle: true, reviewCount: true, reviewAverage: true }, orderBy: { handle: "asc" } });
  assert.deepEqual(rows, [
    { handle: "demo-dining-chair", reviewCount: 2, reviewAverage: 4.5 },
    { handle: "demo-dining-table", reviewCount: 0, reviewAverage: null },
  ]);
  const cards = await request(app).get("/api/catalogue/cards?handles=demo-dining-chair,demo-dining-table");
  assert.equal(cards.status, 200);
  assert.deepEqual(cards.body.products.map((card: Card) => [card.handle, card.rating]), [
    ["demo-dining-chair", { value: 4.5, count: 2 }],
    ["demo-dining-table", undefined],
  ], "a piece without approved reviews has no rating at all, never a made-up one");
  const page = await request(app).get("/api/catalogue/collections/all");
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.products.find((card: Card) => card.handle === "demo-dining-chair")?.rating, { value: 4.5, count: 2 }, "listing cards too");
});

test("a product page without reviews, or without Keeri's page at all, keeps no rating", () => {
  assert.deepEqual(reviewSummary({ reviews: { average: 4.5, count: 2 } }), { reviewCount: 2, reviewAverage: 4.5 });
  assert.deepEqual(reviewSummary({ reviews: { average: null, count: 0 } }), { reviewCount: 0, reviewAverage: null });
  assert.deepEqual(reviewSummary(null), { reviewCount: 0, reviewAverage: null });
  assert.deepEqual(reviewSummary(undefined), { reviewCount: 0, reviewAverage: null });
});
