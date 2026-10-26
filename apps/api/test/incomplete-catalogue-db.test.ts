import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { listProducts } from "../src/catalog.js";
import { readCart } from "../src/cart.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(db, {
  webOrigin: "http://localhost:3000",
  catalogMode: "preview",
  secureCookies: false,
});
before(() => db.$connect());
after(() => db.$disconnect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
  for (const [id, price] of [
    ["unknown", null],
    ["priced", 25000],
  ] as const) {
    await db.product.create({
      data: {
        id,
        handle: id,
        title: id,
        description: "",
        category: null,
        images: [],
        published: true,
        source: "test",
        sourceUpdatedAt: new Date(),
        variants: {
          create: {
            id,
            title: id,
            pricePaise: price,
            available: true,
            stockPolicy: "stocked",
          },
        },
      },
    });
  }
  await db.product.create({
    data: {
      id: "model-only",
      handle: "model-only",
      title: "Model only",
      description: "",
      category: null,
      images: [],
      published: true,
      source: "test",
      sourceUpdatedAt: new Date(),
    },
  });
});

test("price sorting puts unknown prices and model-only enquiries after priced listings in both directions", async () => {
  for (const sort of ["price-asc", "price-desc"]) {
    const result = await listProducts(db, { sort });
    assert.equal(result.products[0]!.id, "priced");
    assert.equal(result.products.length, 3);
    assert.equal(
      result.products.find((p) => p.id === "unknown")!.variants[0]!.pricePaise,
      null,
    );
    assert.deepEqual(
      result.products.find((p) => p.id === "model-only")!.variants,
      [],
    );
  }
});

test("unpriced legacy cart items remain unavailable and do not become zero-priced lines or totals", async () => {
  const cart = await db.cart.create({
    data: {
      tokenHash: "synthetic-incomplete",
      expiresAt: new Date(Date.now() + 60000),
      items: {
        create: [
          { variantId: "unknown", quantity: 2 },
          { variantId: "priced", quantity: 1 },
        ],
      },
    },
  });
  const result = await readCart(db, cart.id);
  const item = result.items.find((row) => row.variantId === "unknown")!;
  assert.equal(item.pricePaise, null);
  assert.equal(item.lineTotalPaise, null);
  assert.equal(item.available, false);
  assert.equal(result.subtotalPaise, null);
});

test("an unpriced variant cannot be added to a purchasing cart even if its old stock flag is true", async () => {
  const client = request.agent(app);
  const current = (await client.get("/api/cart")).body;
  const result = await client
    .put("/api/cart/items/unknown")
    .set("Origin", "http://localhost:3000")
    .send({ quantity: 1, mutation: { id: randomUUID(), cartIdentity: current.mutationContext.cartIdentity, expectedRevision: current.mutationContext.revision } });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "ENQUIRY_REQUIRED");
  assert.equal(await db.cartItem.count(), 0);
});

test("equal product titles have stable identity order across page boundaries", async () => {
  await db.product.updateMany({ data: { published: false } });
  for (const id of ["same-z", "same-a"])
    await db.product.create({
      data: {
        id,
        handle: id,
        title: "Same title",
        description: "",
        category: null,
        images: [],
        published: true,
        source: "test",
        sourceUpdatedAt: new Date(),
      },
    });
  assert.equal(
    (await listProducts(db, { page: 1, limit: 1 })).products[0]!.id,
    "same-a",
  );
  assert.equal(
    (await listProducts(db, { page: 2, limit: 1 })).products[0]!.id,
    "same-z",
  );
});
