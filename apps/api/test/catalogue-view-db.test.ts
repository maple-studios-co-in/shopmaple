import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Dedicated loopback shopmaple_test database required");
const db = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: "event", level: "query" }] });
const queries: string[] = [];
db.$on("query", event => queries.push(event.query));
const app = createApp(db, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
before(() => db.$connect());
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
});
const product = (id: string) => ({ id, handle: id, title: id, description: "", category: "chairs", images: [] as string[], published: true, source: "fixture", sourceUpdatedAt: new Date("2026-10-26") });
const variant = (id: string, pricePaise: number | null, available = true) => ({ id, title: id, pricePaise, available, stockPolicy: "stocked" });
const handles = (response: request.Response) => response.body.products.map((p: { handle: string }) => p.handle);

// Catches missing pagination, applying pagination before facets, and leaking full catalogue records.
test("539-product collection returns one bounded page with complete counts and clamps the last page", async (t) => {
  await db.product.createMany({ data: Array.from({ length: 539 }, (_, i) => product(`item-${String(i).padStart(3, "0")}`)) });
  await db.variant.createMany({ data: Array.from({ length: 539 }, (_, i) => ({ ...variant(`v-${i}`, (i + 1) * 100), productId: `item-${String(i).padStart(3, "0")}` })) });
  await db.product.create({ data: { ...product("hidden"), published: false } });
  queries.length = 0;
  const first = await request(app).get("/api/catalogue/collections/all");
  assert.equal(first.status, 200, "compact collection endpoint must serve a published page");
  const productReads = queries.filter(query => query.includes('FROM "public"."Product"')).length;
  const variantReads = queries.filter(query => query.includes('FROM "public"."Variant"')).length;
  assert.equal(productReads, 1, "one product read rather than a product read per catalogue page");
  assert.equal(variantReads, 1, "one published-variant read rather than repeating it per page");
  assert.equal(first.body.products.length, 24);
  assert.equal(first.body.products[0].handle, "item-000");
  assert.equal(first.body.products[23].handle, "item-023");
  assert.equal(first.body.total, 539);
  assert.equal(first.body.collectionTotal, 539);
  assert.equal(first.body.inStock, 539);
  assert.equal(first.body.outOfStock, 0);
  assert.equal(first.body.highestPrice, 53900);
  assert.equal(first.body.query.page, 1);
  assert.equal(first.body.limit, 24);
  assert.equal(first.body.published, true);
  assert.equal(first.body.checkoutEnabled, false);
  assert.equal(first.headers["cache-control"], "public, max-age=30, s-maxage=60");
  assert.ok(Buffer.byteLength(first.text) < 12000, "24 cards must remain a bounded HTTP payload");
  t.diagnostic(JSON.stringify({ fixtureProducts: 539, compactPageBytes: Buffer.byteLength(first.text), productReads, variantReads }));
  // Characterize the former web route's 11-page transport against the same real fixture.
  queries.length = 0;
  let formerBytes = 0;
  for (let page = 1; page <= 11; page++) {
    const former = await request(app).get(`/api/products?limit=50&sort=featured&page=${page}`);
    assert.equal(former.status, 200);
    formerBytes += Buffer.byteLength(former.text);
  }
  t.diagnostic(JSON.stringify({ formerRequests: 11, formerBytes, formerProductReads: queries.filter(query => query.includes('FROM "public"."Product"')).length, formerVariantReads: queries.filter(query => query.includes('FROM "public"."Variant"')).length }));
  const last = await request(app).get("/api/catalogue/collections/all?page=999");
  assert.equal(last.status, 200);
  assert.equal(last.body.query.page, 23);
  assert.equal(last.body.products.length, 11);
  assert.equal(last.body.products[0].handle, "item-528");
  assert.equal(last.body.products[10].handle, "item-538");
});

// Catches independent-variant filtering, hidden variant leaks, and changed null/zero-price rules.
test("facets and filters preserve same-variant matching, enquiry options, zero prices and stable ties", async () => {
  for (const [id, options] of [
    ["mixed", [variant("mixed-a", 10000, false), variant("mixed-b", 30000)]],
    ["matching", [variant("match-a", 15000)]],
    ["unknown", [variant("unknown-a", null)]],
    ["zero", [variant("zero-a", 0)]],
    ["model", []],
    ["tie-a", [variant("tie-a-v", 15000)]],
    ["tie-b", [variant("tie-b-v", 15000)]],
  ] as const) await db.product.create({ data: { ...product(id), variants: { create: [...options] } } });
  await db.variant.create({ data: { ...variant("hidden-v", 999999), productId: "matching", published: false } });
  const filtered = await request(app).get("/api/catalogue/collections/chairs?availability=in&max=200");
  assert.equal(filtered.status, 200);
  assert.deepEqual(handles(filtered), ["matching", "tie-a", "tie-b"]);
  assert.equal(filtered.body.collectionTotal, 7);
  assert.equal(filtered.body.inStock, 4);
  assert.equal(filtered.body.outOfStock, 4);
  assert.equal(filtered.body.highestPrice, 30000);
  const asc = await request(app).get("/api/catalogue/collections/all?sort=price-asc");
  assert.deepEqual(handles(asc), ["zero", "mixed", "matching", "tie-a", "tie-b", "model", "unknown"]);
  const desc = await request(app).get("/api/catalogue/collections/all?sort=price-desc");
  assert.deepEqual(handles(desc), ["matching", "tie-a", "tie-b", "mixed", "zero", "model", "unknown"]);
});

test("collection suggestions match across title and description and preserve source membership", async () => {
  await db.product.create({ data: { ...product("caro"), title: "Oak chair", description: "Walnut finish" } });
  await db.product.create({ data: { ...product("other"), title: "Other", description: "Oak chair Walnut finish" } });
  await db.product.create({ data: { ...product("ario"), title: "Alpha chair" } });
  const suggestions = await request(app).get("/api/catalogue/collections/all?q=CHAIR%20walnut&limit=4");
  assert.equal(suggestions.status, 200);
  assert.deepEqual(handles(suggestions), ["caro", "other"]);
  assert.equal(suggestions.body.limit, 4);
  const source = await request(app).get("/api/catalogue/collections/accent-chair?sort=featured");
  assert.equal(source.status, 200);
  assert.deepEqual(handles(source), ["caro", "ario"], "featured preserves source membership order, not title order");
  const alphabetical = await request(app).get("/api/catalogue/collections/accent-chair");
  assert.deepEqual(handles(alphabetical), ["ario", "caro"]);
  const reversed = await request(app).get("/api/catalogue/collections/accent-chair?sort=title-desc");
  assert.deepEqual(handles(reversed), ["caro", "ario"]);
  const empty = await request(app).get("/api/catalogue/collections/all?q=unmatched&page=999");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.query.page, 1);
  assert.equal(empty.body.total, 0);
  assert.equal(empty.body.collectionTotal, 3);
});

// Catches shipping PDP/gallery/variant payload and changing equal-price compare-at selection.
test("single and ordered batch cards omit full records while preserving display prices", async () => {
  await db.product.create({ data: {
    ...product("full"), description: "Private detail ".repeat(3000), sourceStatus: "internal-status",
    images: Array.from({ length: 30 }, (_, i) => `https://example.com/${i}.jpg`),
    pdpContent: { arbitrary: "full detail" },
    variants: { create: [
      { ...variant("a", 1000), compareAtPaise: 1500 },
      { ...variant("b", 1000), compareAtPaise: 2000 },
      ...Array.from({ length: 498 }, (_, i) => variant(`unknown-${i}`, null)),
      { ...variant("unpublished", 1), published: false },
    ] },
  } });
  await db.product.create({ data: product("model") });
  await db.product.create({ data: { ...product("hidden"), published: false } });
  const one = await request(app).get("/api/catalogue/cards/full");
  assert.equal(one.status, 200, "compact card endpoint must serve the public summary");
  const { optionNames, optionThumbs, ...summary } = one.body.product;
  assert.deepEqual(optionThumbs, [], "variants without their own photo or slug add no thumbnails");
  assert.deepEqual({ ...one.body, product: summary }, { published: true, product: { id: "full", handle: "full", title: "full", image: "https://example.com/0.jpg", pricePaise: 1000, compareAtPaise: 1500, priceFrom: true, otherOptionsOnRequest: true, optionCount: 500, category: "chairs" } });
  // Option names only (for colour dots), capped at eight even with 500 variants.
  assert.equal(optionNames.length, 8);
  assert.deepEqual(optionNames.slice(0, 2), ["a", "b"]);
  assert.ok(Buffer.byteLength(one.text) < 500);
  const batch = await request(app).get("/api/catalogue/cards?handles=model,hidden,missing,full");
  assert.equal(batch.status, 200);
  assert.deepEqual(handles(batch), ["model", "full"]);
  assert.deepEqual(batch.body.products[0], { id: "model", handle: "model", title: "model", image: null, pricePaise: null, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 0, category: "chairs", optionNames: [], optionThumbs: [] });
  assert.equal(batch.body.published, true);
  assert.equal((await request(app).get("/api/catalogue/cards/hidden")).status, 404);
  assert.equal((await request(app).get("/api/catalogue/cards/missing")).status, 404);
});

test("invalid, duplicate, oversized or unsupported catalogue queries fail closed", async () => {
  for (const query of ["limit=50", "limit=0", "page=0", "page=1000", "page=1.5", "sort=no", "availability=yes", "min=-1", "min=1.001", "max=NaN", "category=no", "q=" + "a".repeat(81), "q=a&q=b", "page=1&page=2", "unknown=value", "sort_by=manual"]) {
    assert.equal((await request(app).get("/api/catalogue/collections/all?" + query)).status, 400, query);
  }
  for (const query of ["", "handles=", "handles=a,a", "handles=A", "handles=a,,b", "handles=a&handles=b", "handles=a&extra=1", "handles=" + "a".repeat(201), "handles=" + Array.from({ length: 51 }, (_, i) => `p-${i}`).join(",")]) {
    assert.equal((await request(app).get("/api/catalogue/cards?" + query)).status, 400, query);
  }
  assert.equal((await request(app).get("/api/catalogue/collections/missing")).status, 404);
  assert.equal((await request(app).get("/api/catalogue/cards/UPPER")).status, 400);
  assert.equal((await request(app).get("/api/catalogue/cards/valid?extra=1")).status, 400);
});

// Valid requests must not blame shoppers or publicly cache malformed stored summaries.
test("invalid stored catalogue output returns a generic non-cacheable server error", async () => {
  await db.product.create({ data: { ...product("oversized-image"), images: ["https://example.com/" + "x".repeat(4096)] } });
  for (const path of [
    "/api/catalogue/cards/oversized-image",
    "/api/catalogue/cards?handles=oversized-image",
    "/api/catalogue/collections/all",
  ]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 500, `${path}: invalid stored output is not invalid shopper input`);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.deepEqual(response.body, { code: "SERVER_ERROR", message: "We couldn't complete that request. Please try again." });
    assert.equal(response.text.includes("example.com"), false, "stored data and schema details stay private");
  }
  assert.equal((await request(app).get("/api/catalogue/collections/all?limit=50")).status, 400, "malformed shopper input remains a client error");
});
