import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Dedicated loopback shopmaple_test database required");
const db = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: "event", level: "query" }] });
const queries: { query: string; params: string }[] = [];
db.$on("query", event => queries.push({ query: event.query, params: event.params }));
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
before(() => db.$connect());
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
});
const product = (id: string, title = id, category = "chairs") => ({
  id, handle: id, title, category, description: "Full description ".repeat(200),
  images: ["https://example.com/first.jpg", "https://example.com/gallery.jpg"],
  published: true, source: "fixture", sourceUpdatedAt: new Date("2026-10-26"),
});
const variant = (id: string, pricePaise: number | null, compareAtPaise: number | null = null) => ({
  id, title: "Variant detail", sku: "PRIVATE-SKU", pricePaise, compareAtPaise, available: true, stockPolicy: "stocked",
});
const card = (id: string, title = id, category = "chairs") => ({
  id, handle: id, title, image: "https://example.com/first.jpg", pricePaise: null,
  compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 0,
  category, optionNames: [] as string[],
});
// Cards carry option names for colour dots, never SKUs or other variant fields.
const named = { optionNames: ["Variant detail"] };

// Catches slicing before publication/category filtering, lost DB title/ID ordering,
// full-detail transfer, and unbounded product/variant materialization.
test("related catalogue returns only the first five published exact-category cards in title and ID order", async t => {
  for (const [id, title, category] of [
    ["same-z", "Bravo", "chairs"], ["same-a", "Bravo", "chairs"],
    ["first", "Alpha", "chairs"], ["fifth", "Delta", "chairs"],
    ["fourth", "Charlie", "chairs"], ["sixth", "Echo", "chairs"],
    ["seventh", "Foxtrot", "chairs"], ["other", "Aardvark", "tables"],
  ]) await db.product.create({ data: { ...product(id!, title!, category!), variants: { create: variant(`v-${id}`, 1000) } } });
  await db.product.create({ data: { ...product("hidden", "Aardvark"), published: false } });
  queries.length = 0;
  const result = await request(app).get("/api/catalogue/related?category=chairs");
  assert.equal(result.status, 200, "compact related endpoint must serve five public category cards");
  assert.deepEqual(result.body, { category: "chairs", published: true, products: [
    ["first", "Alpha"], ["same-a", "Bravo"], ["same-z", "Bravo"], ["fourth", "Charlie"], ["fifth", "Delta"],
  ].map(([id, title]) => ({ ...card(id!, title!), pricePaise: 1000, optionCount: 1, ...named })) });
  assert.equal(result.headers["cache-control"], "public, max-age=30, s-maxage=60");
  assert.ok(Buffer.byteLength(result.text) < 2000, "five summaries must stay compact despite full source descriptions");
  const productReads = queries.filter(q => q.query.includes('FROM "public"."Product"'));
  const variantReads = queries.filter(q => q.query.includes('FROM "public"."Variant"'));
  assert.equal(productReads.length, 1);
  assert.equal(variantReads.length, 1);
  assert.match(productReads[0]!.query, /LIMIT/, "database must bound product retrieval before fetching variants");
  const variantParameters = JSON.parse(variantReads[0]!.params) as unknown[];
  assert.equal(variantParameters.includes("sixth"), false, "sixth product's variants must not be materialized");
  assert.equal(variantParameters.includes("seventh"), false);
  assert.equal(variantParameters.includes("other"), false);
  t.diagnostic(JSON.stringify({ bytes: Buffer.byteLength(result.text), productReads: productReads.length, variantReads: variantReads.length }));
});

// Catches incorrect cheapest/tie-price projection, hidden option exposure and
// conflating null/zero prices or absent options with purchasable stock.
test("related summaries preserve null, zero, tied and mixed option prices without leaking variant details", async () => {
  await db.product.create({ data: product("empty") });
  await db.product.create({ data: { ...product("mixed"), variants: { create: [
    variant("mixed-b", 2000, 3000), variant("mixed-a", 1000, 1500), variant("mixed-c", null),
    { ...variant("mixed-hidden", 1), published: false },
  ] } } });
  await db.product.create({ data: { ...product("tied"), variants: { create: [variant("tie-z", 1200, 2400), variant("tie-a", 1200, 1800)] } } });
  await db.product.create({ data: { ...product("unknown"), variants: { create: variant("unknown-v", null, 2500) } } });
  await db.product.create({ data: { ...product("zero"), variants: { create: variant("zero-v", 0, 0) } } });
  const result = await request(app).get("/api/catalogue/related?category=chairs");
  assert.equal(result.status, 200, "related cards must represent every pricing edge faithfully");
  assert.deepEqual(result.body.products, [
    card("empty"),
    { ...card("mixed"), pricePaise: 1000, compareAtPaise: 1500, priceFrom: true, otherOptionsOnRequest: true, optionCount: 3, ...named },
    { ...card("tied"), pricePaise: 1200, compareAtPaise: 1800, optionCount: 2, ...named },
    { ...card("unknown"), optionCount: 1, ...named },
    { ...card("zero"), pricePaise: 0, optionCount: 1, ...named },
  ]);
});

test("related catalogue returns empty and small categories without borrowing other categories", async () => {
  await db.product.create({ data: product("only-table", "Only table", "tables") });
  const empty = await request(app).get("/api/catalogue/related?category=outdoors");
  assert.equal(empty.status, 200, "empty published category is a successful empty result");
  assert.deepEqual(empty.body, { category: "outdoors", products: [], published: true });
  const small = await request(app).get("/api/catalogue/related?category=tables");
  assert.equal(small.status, 200);
  assert.deepEqual(small.body, { category: "tables", products: [card("only-table", "Only table", "tables")], published: true });
});

test("related catalogue rejects absent, invalid, duplicate and unexpected category queries", async () => {
  for (const query of ["", "category=", "category=all", "category=Chairs", "category=chairs&category=chairs", "category=chairs&category=tables", "category[]=chairs", "category=chairs&limit=5", "category=chairs&page=1", "category=chairs&extra=1"]) {
    const result = await request(app).get("/api/catalogue/related?" + query);
    assert.equal(result.status, 400, `invalid related query must be rejected: ${query}`);
    assert.notEqual(result.headers["cache-control"], "public, max-age=30, s-maxage=60");
  }
});

test("invalid stored related summaries return generic private no-store server errors", async () => {
  await db.product.create({ data: { ...product("broken"), images: ["https://example.com/" + "x".repeat(4096)] } });
  const result = await request(app).get("/api/catalogue/related?category=chairs");
  assert.equal(result.status, 500, "invalid stored output is a server error, not a malformed shopper query");
  assert.equal(result.headers["cache-control"], "private, no-store");
  assert.deepEqual(result.body, { code: "SERVER_ERROR", message: "We couldn't complete that request. Please try again." });
  assert.equal(result.text.includes("example.com"), false);
});
