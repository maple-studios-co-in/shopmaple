import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
function cookie(res: request.Response): string {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  assert.ok(first);
  return first;
}
const origin = "http://localhost:3000";
const app = createApp(db, {
  webOrigin: origin,
  catalogMode: "preview",
  secureCookies: false,
});
const fixture = {
  id: "chair",
  handle: "walnut-chair",
  title: "Walnut Chair",
  description: "Test furniture",
  category: "chairs",
  images: ["https://cdn.shopify.com/test.jpg"],
  published: true,
  source: "test",
  sourceUpdatedAt: new Date("2026-10-25"),
  variants: {
    create: [
      {
        id: "chair-cream",
        title: "Cream",
        pricePaise: 12345,
        available: true,
        stockPolicy: "stocked",
      },
      {
        id: "chair-blue",
        title: "Blue",
        pricePaise: 20000,
        available: false,
        stockPolicy: "stocked",
      },
      {
        id: "chair-custom",
        title: "Custom",
        pricePaise: 25000,
        available: true,
        stockPolicy: "made_to_order",
      },
    ],
  },
};
before(async () => {
  await db.$connect();
});
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
  await db.product.create({ data: fixture });
  await db.product.create({
    data: {
      ...fixture,
      id: "hidden",
      handle: "hidden-chair",
      published: false,
      variants: {
        create: {
          id: "hidden-v",
          title: "Default",
          pricePaise: 1,
          available: true,
        },
      },
    },
  });
});
after(async () => {
  await db.$disconnect();
});

test("catalogue excludes unpublished products and filters by query/category", async () => {
  const r = await request(app).get("/api/products?category=chairs&q=walnut");
  assert.equal(r.status, 200);
  assert.equal(r.body.products.length, 1);
  assert.equal(r.body.products[0].handle, "walnut-chair");
  assert.equal(
    r.body.products[0].variants.find(
      (v: { id: string }) => v.id === "chair-cream",
    ).pricePaise,
    12345,
  );
  assert.equal(
    (await request(app).get("/api/products?category=beds")).body.products
      .length,
    0,
  );
  assert.equal(
    (await request(app).get("/api/products/hidden-chair")).status,
    404,
  );
});
test("invalid query and quantities fail rather than silently changing behavior", async () => {
  assert.equal(
    (await request(app).get("/api/products?limit=5000")).status,
    400,
  );
  for (const quantity of [-1, 0.5, 21, "2"]) {
    assert.equal(
      (
        await request(app)
          .put("/api/cart/items/chair-cream")
          .set("Origin", origin)
          .send({ quantity })
      ).status,
      400,
    );
  }
});
test("cart totals use database prices and reject injected price fields", async () => {
  const agent = request.agent(app);
  assert.equal(
    (
      await agent
        .put("/api/cart/items/chair-cream")
        .set("Origin", origin)
        .send({ quantity: 2, pricePaise: 1 })
    ).status,
    400,
  );
  const added = await agent
    .put("/api/cart/items/chair-cream")
    .set("Origin", origin)
    .send({ quantity: 2 });
  assert.equal(added.status, 200);
  assert.equal(added.body.subtotalPaise, 24690);
  assert.equal(added.body.itemCount, 2);
  assert.match(cookie(added), /HttpOnly/);
  assert.match(String(added.headers["cache-control"]), /no-store/);
  await db.variant.update({
    where: { id: "chair-cream" },
    data: { pricePaise: 15000 },
  });
  assert.equal((await agent.get("/api/cart")).body.subtotalPaise, 30000);
});
test("guest cart credentials isolate shoppers and survive a new API instance", async () => {
  const a = request.agent(app),
    b = request.agent(app);
  const result = await a
    .put("/api/cart/items/chair-cream")
    .set("Origin", origin)
    .send({ quantity: 1 });
  assert.equal((await b.get("/api/cart")).body.itemCount, 0);
  const restarted = createApp(db, {
    webOrigin: origin,
    catalogMode: "preview",
    secureCookies: false,
  });
  assert.equal(
    (
      await request(restarted)
        .get("/api/cart")
        .set("Cookie", cookie(result).split(";")[0]!)
    ).body.itemCount,
    1,
  );
  const stored = await db.cart.findFirstOrThrow();
  assert.equal(stored.tokenHash.length, 64);
  assert.ok(!cookie(result).includes(stored.tokenHash));
});
test("cross-origin and missing-origin cart writes are refused", async () => {
  assert.equal(
    (
      await request(app)
        .put("/api/cart/items/chair-cream")
        .send({ quantity: 1 })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .put("/api/cart/items/chair-cream")
        .set("Origin", "https://other.example")
        .send({ quantity: 1 })
    ).status,
    403,
  );
  assert.equal(await db.cart.count(), 0);
});
test("unavailable, unpublished and made-to-order variants cannot be added", async () => {
  for (const id of ["chair-blue", "chair-custom", "hidden-v", "missing"]) {
    const r = await request(app)
      .put("/api/cart/items/" + id)
      .set("Origin", origin)
      .send({ quantity: 1 });
    assert.ok([404, 409].includes(r.status), id + " status " + r.status);
  }
});
test("absolute quantity updates are idempotent and zero removes a line", async () => {
  const agent = request.agent(app);
  await agent
    .put("/api/cart/items/chair-cream")
    .set("Origin", origin)
    .send({ quantity: 1 });
  const results = await Promise.all(
    [2, 2].map((quantity) =>
      agent
        .put("/api/cart/items/chair-cream")
        .set("Origin", origin)
        .send({ quantity }),
    ),
  );
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await agent.get("/api/cart")).body.itemCount, 2);
  assert.equal(await db.cartItem.count(), 1);
  await db.variant.update({
    where: { id: "chair-cream" },
    data: { available: false },
  });
  const changed = await agent.get("/api/cart");
  assert.equal(changed.body.items[0].available, false);
  assert.equal(
    (
      await agent
        .put("/api/cart/items/chair-cream")
        .set("Origin", origin)
        .send({ quantity: 0 })
    ).body.itemCount,
    0,
  );
});
test("expired carts do not expose previous items", async () => {
  const agent = request.agent(app);
  await agent
    .put("/api/cart/items/chair-cream")
    .set("Origin", origin)
    .send({ quantity: 1 });
  await db.cart.updateMany({ data: { expiresAt: new Date("2020-01-01") } });
  assert.equal((await agent.get("/api/cart")).body.itemCount, 0);
});
test("checkout cannot imply payment completion before gateway integration", async () => {
  const r = await request(app)
    .post("/api/checkout")
    .set("Origin", origin)
    .send({});
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "CHECKOUT_NOT_AVAILABLE");
  assert.equal(r.body.paid, undefined);
});
