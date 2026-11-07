import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { canAddToCart, canOrder, cartItemSchema } from "@shopmaple/contracts";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw new Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const app = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
const agent = () => request.agent(app);
const payload = (cart: any, quantity: number, id = randomUUID()) => ({
  quantity,
  mutation: { id, cartIdentity: cart.mutationContext.cartIdentity, expectedRevision: cart.mutationContext.revision },
});
const put = (client: ReturnType<typeof agent>, body: object, id = "cartable-v") =>
  client.put("/api/cart/items/" + id).set("Origin", origin).send(body);

before(() => db.$connect());
beforeEach(async () => {
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.variant.deleteMany();
  await db.product.deleteMany();
  await db.product.create({ data: {
    id: "cartable-p", handle: "cartable-chair", title: "Cartable chair", description: "", images: [],
    source: "test", sourceUpdatedAt: new Date(), published: true,
    variants: { create: { id: "cartable-v", title: "Default", pricePaise: 12500, available: false, stockPolicy: "unverified" } },
  } });
});
after(() => db.$disconnect());

for (const stockPolicy of ["unverified", "made_to_order", "stocked", "dropship"]) {
  test(`priced published ${stockPolicy} items can be saved, increased and replayed without confirming stock`, async () => {
    await db.variant.update({ where: { id: "cartable-v" }, data: { stockPolicy } });
    const client = agent();
    const initial = (await client.get("/api/cart")).body;
    const firstPayload = payload(initial, 2);
    const added = await put(client, firstPayload);
    assert.equal(added.status, 200, "a priced published item can be added despite unconfirmed stock");
    assert.equal(added.body.items[0].cartable, true);
    assert.equal(added.body.items[0].available, false);
    assert.equal(added.body.items[0].stockPolicy, stockPolicy);
    assert.equal(added.body.subtotalPaise, 25000);
    assert.equal(added.body.checkoutEnabled, false);
    const increased = await put(client, payload(added.body, 3));
    assert.equal(increased.status, 200);
    assert.equal(increased.body.subtotalPaise, 37500);
    assert.equal(increased.body.mutationContext.revision, 2);
    const replay = await put(client, firstPayload);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.itemCount, 3);
    assert.equal(replay.body.mutationResult.status, "replayed");
    assert.equal(replay.body.mutationContext.revision, 2);
    const stored = await db.variant.findUniqueOrThrow({ where: { id: "cartable-v" } });
    assert.equal(stored.available, false);
    assert.equal(stored.stockPolicy, stockPolicy);
    assert.equal(stored.pricePaise, 12500);
  });
}

test("a known zero price is cartable and remains distinct from an unknown price", async () => {
  await db.variant.update({ where: { id: "cartable-v" }, data: { pricePaise: 0 } });
  const client = agent();
  const result = await put(client, payload((await client.get("/api/cart")).body, 2));
  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].cartable, true);
  assert.equal(result.body.items[0].available, false);
  assert.equal(result.body.subtotalPaise, 0);
  assert.equal(result.body.checkoutEnabled, false);
});

for (const reason of ["unknown-price", "unpublished-product", "unpublished-variant"] as const) {
  test(`${reason} rejects new adds and quantity increases but permits existing decreases and removal`, async () => {
    const client = agent();
    await client.get("/api/cart");
    const cart = await db.cart.findFirstOrThrow();
    await db.cartItem.create({ data: { cartId: cart.id, variantId: "cartable-v", quantity: 3 } });
    if (reason === "unpublished-product") await db.product.update({ where: { id: "cartable-p" }, data: { published: false } });
    else await db.variant.update({ where: { id: "cartable-v" }, data: reason === "unknown-price" ? { pricePaise: null } : { published: false } });
    const current = (await client.get("/api/cart")).body;
    assert.equal(current.items[0].available, false);
    assert.equal(current.items[0].quantity, 3);
    const rejected = await put(client, payload(current, 4));
    assert.equal(rejected.status, reason === "unpublished-product" ? 404 : 409);
    assert.equal((await client.get("/api/cart")).body.itemCount, 3);
    const reduced = await put(client, payload(current, 2));
    assert.equal(reduced.status, 200, "unavailable existing lines can be reduced");
    assert.equal(reduced.body.itemCount, 2);
    assert.equal(reduced.body.items[0].cartable, false);
    const same = await put(client, payload(reduced.body, 2));
    assert.equal(same.status, 200, "an unchanged existing quantity does not grow an ineligible line");
    const removed = await put(client, payload(same.body, 0));
    assert.equal(removed.status, 200);
    assert.equal(removed.body.itemCount, 0);
    const addAgain = await put(client, payload(removed.body, 1));
    assert.equal(addAgain.status, reason === "unpublished-product" ? 404 : 409);
    assert.equal(await db.cartItem.count(), 0);
  });
}

test("concurrent duplicate saves of unverified stock apply once and preserve revision fencing", async () => {
  const client = agent();
  const initial = (await client.get("/api/cart")).body;
  const body = payload(initial, 2);
  const results = await Promise.all([put(client, body), put(client, body)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.ok(results.every(result => result.body.mutationContext.revision === 1));
  assert.equal((await client.get("/api/cart")).body.itemCount, 2);
  const stale = await put(client, payload(initial, 3));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "CART_REVISION_CONFLICT");
  const conflict = await put(client, { ...body, quantity: 4 });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "CART_OPERATION_CONFLICT");
});

test("legacy cart responses without an explicit cartability signal default safely to false", () => {
  const parsed = cartItemSchema.parse({ variantId: "legacy-v", handle: "legacy-chair", title: "Chair", variantTitle: "Default", image: "", pricePaise: 1000, quantity: 1, lineTotalPaise: 1000, available: true, stockPolicy: "stocked" });
  assert.equal(parsed.cartable, false);
});

test("cart eligibility uses bounded known prices and publication without widening order eligibility", () => {
  assert.equal(canAddToCart(undefined), false);
  for (const pricePaise of [null, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_001]) {
    assert.equal(canAddToCart({ pricePaise }), false);
  }
  for (const pricePaise of [0, 1000, 1_000_000_000]) {
    assert.equal(canAddToCart({ pricePaise }), true);
    assert.equal(canAddToCart({ pricePaise, published: true }), true);
    assert.equal(canAddToCart({ pricePaise, published: false }), false);
  }
  for (const stockPolicy of ["unverified", "dropship"]) {
    const variant = { pricePaise: 1000, available: false, stockPolicy };
    assert.equal(canAddToCart(variant), true);
    assert.equal(canOrder(variant), false);
    assert.equal(canOrder({ ...variant, available: true }), false);
  }
  // Owner decision 2026-11-01: approved made-to-order pieces are sold online, like stocked ones.
  assert.equal(canOrder({ pricePaise: 1000, available: false, stockPolicy: "made_to_order" }), false);
  assert.equal(canOrder({ pricePaise: 1000, available: true, stockPolicy: "made_to_order" }), true);
  assert.equal(canOrder({ pricePaise: 1000, available: true, stockPolicy: "stocked" }), true);
  assert.equal(canOrder({ pricePaise: 0, available: true, stockPolicy: "stocked" }), false);
});

test("with checkout on, the cart takes only purchasable variants and shows a made-to-order lead time", async () => {
  const commerce = { freezeCart: async () => { throw new Error("unused"); } } as never;
  const live = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false }, commerce);
  const client = request.agent(live);
  const initial = (await client.get("/api/cart")).body;
  assert.equal(initial.checkoutEnabled, true);
  const refused = await client.put("/api/cart/items/cartable-v").set("Origin", origin).send(payload(initial, 1));
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "ENQUIRY_REQUIRED");
  await db.variant.update({ where: { id: "cartable-v" }, data: { available: true, stockPolicy: "made_to_order", leadTimeDays: 28 } });
  const fresh = (await client.get("/api/cart")).body;
  const added = await client.put("/api/cart/items/cartable-v").set("Origin", origin).send(payload(fresh, 1));
  assert.equal(added.status, 200);
  assert.equal(added.body.items[0].available, true);
  assert.equal(added.body.items[0].cartable, true);
  assert.equal(added.body.items[0].leadTimeDays, 28);
  // Keeri withdrawing the piece leaves it in the cart, flagged, rather than silently payable.
  await db.variant.update({ where: { id: "cartable-v" }, data: { available: false } });
  const after = (await client.get("/api/cart")).body;
  assert.equal(after.items[0].cartable, false);
});
