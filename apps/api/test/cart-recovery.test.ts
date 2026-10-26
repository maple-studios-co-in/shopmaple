import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw new Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const app = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
const agent = () => request.agent(app);
const body = (cart: any, quantity: number, id = randomUUID()) => ({ quantity, mutation: { id, cartIdentity: cart.mutationContext.cartIdentity, expectedRevision: cart.mutationContext.revision } });
const put = (client: ReturnType<typeof agent>, payload: object, variant = "recovery-v") => client.put("/api/cart/items/" + variant).set("Origin", origin).send(payload);
before(() => db.$connect());
beforeEach(async () => {
  await db.cartItem.deleteMany(); await db.cart.deleteMany(); await db.variant.deleteMany(); await db.product.deleteMany();
  await db.product.create({ data: { id: "recovery-p", handle: "recovery-chair", title: "Recovery chair", description: "", images: [], source: "test", sourceUpdatedAt: new Date(), published: true, variants: { create: { id: "recovery-v", title: "Default", pricePaise: 1000, available: true, stockPolicy: "stocked" } } } });
});
after(() => db.$disconnect());
test("bootstrap establishes a secure identity and a durable empty cart", async () => {
  const client = agent(); const first = await client.get("/api/cart");
  assert.equal(first.status, 200); assert.match(first.body.mutationContext?.cartIdentity ?? "", /^[a-f0-9]{64}$/);
  assert.equal(first.body.mutationContext.revision, 0); assert.equal(await db.cart.count(), 1);
  assert.match(String(first.headers["set-cookie"]), /HttpOnly/);
  assert.equal((await client.get("/api/cart")).body.mutationContext.cartIdentity, first.body.mutationContext.cartIdentity);
  assert.equal(first.body.checkoutEnabled, false);
});
test("replay after a later update returns current cart without reapplying quantity", async () => {
  const client = agent(); const original = body((await client.get("/api/cart")).body, 2);
  const first = await put(client, original); assert.equal(first.status, 200);
  assert.deepEqual(first.body.mutationResult, { id: original.mutation.id, status: "applied" }); assert.equal(first.body.mutationContext.revision, 1);
  assert.equal((await put(client, body(first.body, 4))).status, 200);
  const replay = await put(client, original); assert.equal(replay.status, 200);
  assert.equal(replay.body.itemCount, 4); assert.equal(replay.body.mutationContext.revision, 2);
  assert.deepEqual(replay.body.mutationResult, { id: original.mutation.id, status: "replayed" });
});
test("concurrent duplicates commit once and changed payload is refused", async () => {
  const client = agent(); const payload = body((await client.get("/api/cart")).body, 2);
  const results = await Promise.all([put(client, payload), put(client, payload)]);
  assert.ok(results.every(r => r.status === 200)); assert.ok(results.every(r => r.body.mutationContext.revision === 1));
  const conflict = await put(client, { ...payload, quantity: 3 });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, "CART_OPERATION_CONFLICT");
  assert.equal((await client.get("/api/cart")).body.itemCount, 2);
});
test("two tabs on one revision cannot silently overwrite each other", async () => {
  const client = agent(); const start = (await client.get("/api/cart")).body;
  const results = await Promise.all([put(client, body(start, 2)), put(client, body(start, 5))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const rejected = results.find(r => r.status === 409)!;
  assert.equal(rejected.body.code, "CART_REVISION_CONFLICT"); assert.equal(rejected.body.mutationResult.status, "rejected");
  assert.equal((await client.get("/api/cart")).body.itemCount, results.find(r => r.status === 200)!.body.itemCount);
});
test("business rejection is durable when the product later becomes available", async () => {
  const client = agent(); const payload = body((await client.get("/api/cart")).body, 2);
  await db.variant.update({ where: { id: "recovery-v" }, data: { available: false } });
  const first = await put(client, payload); assert.equal(first.status, 409); assert.equal(first.body.code, "ENQUIRY_REQUIRED");
  assert.deepEqual(first.body.mutationResult, { id: payload.mutation.id, status: "rejected" });
  await db.variant.update({ where: { id: "recovery-v" }, data: { available: true } });
  const replay = await put(client, payload); assert.equal(replay.status, 409); assert.equal(replay.body.code, "ENQUIRY_REQUIRED");
  assert.equal((await client.get("/api/cart")).body.itemCount, 0);
});
test("identity mismatch cannot apply an operation to another shopper", async () => {
  const a = agent(), b = agent(); const payload = body((await a.get("/api/cart")).body, 3);
  await b.get("/api/cart"); const rejected = await put(b, payload);
  assert.equal(rejected.status, 409); assert.equal(rejected.body.code, "CART_SESSION_CHANGED");
  assert.equal((await b.get("/api/cart")).body.itemCount, 0); assert.equal(await db.cart.count(), 2);
});
test("expired carts reject pending writes and rotate bootstrap identity", async () => {
  const client = agent(); const start = (await client.get("/api/cart")).body;
  const first = await put(client, body(start, 1)); const pending = body(first.body, 2);
  await db.cart.updateMany({ data: { expiresAt: new Date("2020-01-01") } });
  const result = await put(client, pending); assert.equal(result.status, 409); assert.equal(result.body.code, "CART_SESSION_CHANGED");
  const fresh = (await client.get("/api/cart")).body;
  assert.notEqual(fresh.mutationContext.cartIdentity, start.mutationContext.cartIdentity); assert.equal(fresh.itemCount, 0);
  assert.equal((await put(client, pending)).status, 409);
});
test("unguarded writes cannot bypass fencing and malformed responses expose no receipt", async () => {
  const client = agent(); await client.get("/api/cart"); const response = await put(client, { quantity: 1 });
  assert.equal(response.status, 400); assert.equal(response.body.mutationResult, undefined); assert.equal(await db.cartItem.count(), 0);
});

test("unknown chosen cookies are rotated and cannot establish attacker-owned carts", async () => {
  const chosen = "a".repeat(64);
  const response = await request(app).get("/api/cart").set("Cookie", "maple_cart=" + chosen);
  assert.equal(response.status, 200);
  assert.ok(response.headers["set-cookie"], "Unknown cookie must be replaced");
  assert.ok(!String(response.headers["set-cookie"]).includes(chosen));
  const rejected = await request(app).put("/api/cart/items/recovery-v").set("Origin", origin).set("Cookie", "maple_cart=" + chosen).send(body(response.body, 2));
  assert.equal(rejected.status, 409); assert.equal(await db.cartItem.count(), 0);
});
test("duplicate cookies cannot select a shopper or mutate either cart", async () => {
  const a = await request(app).get("/api/cart"), b = await request(app).get("/api/cart");
  const cookie = (r: request.Response) => String(r.headers["set-cookie"]?.[0]).split(";")[0];
  const response = await request(app).put("/api/cart/items/recovery-v").set("Origin", origin).set("Cookie", cookie(a) + "; " + cookie(b)).send(body(a.body, 2));
  assert.equal(response.status, 409); assert.equal(response.body.code, "CART_SESSION_CHANGED");
  assert.equal(await db.cartItem.count(), 0);
});

test("a chosen cookie with its matching public identity cannot create a cart through PUT", async () => {
  const chosen = "b".repeat(64);
  const operationId = randomUUID();
  const cartIdentity = createHash("sha256").update("shopmaple-cart-context-v1:" + chosen).digest("hex");
  const response = await request(app)
    .put("/api/cart/items/recovery-v")
    .set("Origin", origin)
    .set("Cookie", "maple_cart=" + chosen)
    .send({ quantity: 2, mutation: { id: operationId, cartIdentity, expectedRevision: 0 } });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "CART_SESSION_CHANGED");
  assert.deepEqual(response.body.mutationResult, { id: operationId, status: "rejected" });
  assert.equal(await db.cart.count(), 0);
  assert.equal(await db.cartItem.count(), 0);
  assert.equal(await db.cartMutationReceipt.count(), 0);
});

test("a pending operation cannot recreate a cart after its durable session was deleted", async () => {
  const client = agent();
  const bootstrapped = (await client.get("/api/cart")).body;
  const pending = body(bootstrapped, 2);
  await db.cart.deleteMany();
  const response = await put(client, pending);
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "CART_SESSION_CHANGED");
  assert.deepEqual(response.body.mutationResult, { id: pending.mutation.id, status: "rejected" });
  assert.equal(await db.cart.count(), 0);
  assert.equal(await db.cartItem.count(), 0);
  assert.equal(await db.cartMutationReceipt.count(), 0);
  const replacement = (await client.get("/api/cart")).body;
  assert.notEqual(replacement.mutationContext.cartIdentity, bootstrapped.mutationContext.cartIdentity);
  assert.equal(replacement.itemCount, 0);
  assert.equal((await put(client, pending)).status, 409);
  assert.equal(await db.cart.count(), 1);
  assert.equal(await db.cartItem.count(), 0);
});

const secureApp = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: true });
const responseCookie = (response: request.Response) => String(response.headers["set-cookie"]?.[0]).split(";")[0]!;
function securePut(cookie: string, cart: any, quantity = 2) {
  return request(secureApp).put("/api/cart/items/recovery-v").set("Origin", origin).set("Cookie", cookie).send(body(cart, quantity));
}

test("secure cart bootstrap emits a host-only credential and reuses it for reads and writes", async () => {
  const initial = await request(secureApp).get("/api/cart");
  const setCookie = String(initial.headers["set-cookie"]?.[0]);
  assert.match(setCookie, /^__Host-maple_cart=[a-f0-9]{64};/);
  assert.match(setCookie, /; Secure(?:;|$)/);
  assert.match(setCookie, /; HttpOnly(?:;|$)/);
  assert.match(setCookie, /; SameSite=Lax(?:;|$)/);
  assert.match(setCookie, /; Path=\/(?:;|$)/);
  assert.doesNotMatch(setCookie, /; Domain=/i);
  const cookie = responseCookie(initial);
  const updated = await securePut(cookie, initial.body);
  assert.equal(updated.status, 200);
  const reread = await request(secureApp).get("/api/cart").set("Cookie", cookie);
  assert.equal(reread.body.itemCount, 2);
  assert.equal(reread.body.mutationContext.cartIdentity, initial.body.mutationContext.cartIdentity);
  assert.equal(reread.headers["set-cookie"], undefined);
  assert.equal(await db.cart.count(), 1);
});

test("secure cart ignores a valid legacy credential rather than migrating a known session", async () => {
  const legacy = await request(app).get("/api/cart");
  const cookie = responseCookie(legacy);
  const added = await request(app).put("/api/cart/items/recovery-v").set("Origin", origin).set("Cookie", cookie).send(body(legacy.body, 4));
  assert.equal(added.status, 200);
  const rejected = await securePut(cookie, added.body);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.code, "CART_SESSION_CHANGED");
  const fresh = await request(secureApp).get("/api/cart").set("Cookie", cookie);
  assert.equal(fresh.body.itemCount, 0);
  assert.notEqual(fresh.body.mutationContext.cartIdentity, legacy.body.mutationContext.cartIdentity);
  assert.match(responseCookie(fresh), /^__Host-maple_cart=/);
  assert.equal((await request(app).get("/api/cart").set("Cookie", cookie)).body.itemCount, 4);
  assert.equal(await db.cart.count(), 2);
});

test("duplicate secure credentials cannot read or mutate either cart even if identical", async () => {
  const first = await request(secureApp).get("/api/cart");
  const second = await request(secureApp).get("/api/cart");
  for (const duplicate of [responseCookie(first), responseCookie(second)]) {
    const cookie = responseCookie(first) + "; " + duplicate;
    const result = await securePut(cookie, first.body);
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "CART_SESSION_CHANGED");
    const read = await request(secureApp).get("/api/cart").set("Cookie", cookie);
    assert.notEqual(read.body.mutationContext.cartIdentity, first.body.mutationContext.cartIdentity);
    assert.notEqual(read.body.mutationContext.cartIdentity, second.body.mutationContext.cartIdentity);
    assert.equal(read.body.itemCount, 0);
  }
  assert.equal(await db.cartItem.count(), 0);
  assert.equal(await db.cartMutationReceipt.count(), 0);
});

test("mixed environment cookies cannot shadow the configured cart in either header order", async () => {
  const local = await request(app).get("/api/cart");
  const secure = await request(secureApp).get("/api/cart");
  assert.notEqual(secure.body.mutationContext.cartIdentity, local.body.mutationContext.cartIdentity);
  for (const cookie of [responseCookie(local) + "; " + responseCookie(secure), responseCookie(secure) + "; " + responseCookie(local)]) {
    assert.equal((await request(secureApp).get("/api/cart").set("Cookie", cookie)).body.mutationContext.cartIdentity, secure.body.mutationContext.cartIdentity);
    assert.equal((await request(app).get("/api/cart").set("Cookie", cookie)).body.mutationContext.cartIdentity, local.body.mutationContext.cartIdentity);
    assert.equal((await securePut(cookie, local.body)).status, 409);
  }
  const mixed = responseCookie(local) + "; " + responseCookie(secure) + "; " + responseCookie(local);
  assert.equal((await securePut(mixed, secure.body)).status, 200);
  assert.equal((await request(app).get("/api/cart").set("Cookie", responseCookie(local))).body.itemCount, 0);
  assert.equal((await request(secureApp).get("/api/cart").set("Cookie", responseCookie(secure))).body.itemCount, 2);
});

test("local carts retain their localhost cookie and ignore secure-only credentials", async () => {
  const local = await request(app).get("/api/cart");
  assert.match(responseCookie(local), /^maple_cart=[a-f0-9]{64}$/);
  assert.doesNotMatch(String(local.headers["set-cookie"]), /; Secure(?:;|$)/);
  const secret = responseCookie(local).split("=")[1];
  const reset = await request(app).get("/api/cart").set("Cookie", `__Host-maple_cart=${secret}`);
  assert.notEqual(reset.body.mutationContext.cartIdentity, local.body.mutationContext.cartIdentity);
  assert.equal(reset.body.itemCount, 0);
});
