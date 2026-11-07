import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

test("search engines never index the API, and the store's photos stay out of search until launch", async () => {
  assert.equal((await request(app).get("/api/products")).headers["x-robots-tag"], "noindex, nofollow");
  assert.equal((await request(app).get("/media/keeri/missing.webp")).headers["x-robots-tag"], "noindex, nofollow");
  const launched = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, seoIndexing: true });
  assert.equal((await request(launched).get("/api/products")).headers["x-robots-tag"], "noindex, nofollow");
  assert.equal((await request(launched).get("/media/keeri/missing.webp")).headers["x-robots-tag"], undefined, "after launch product photos may appear in image search");
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
  const client = request.agent(app);
  const current = (await client.get("/api/cart")).body;
  for (const quantity of [-1, 0.5, 21, "2"]) {
    assert.equal(
      (
        await client
          .put("/api/cart/items/chair-cream")
          .set("Origin", origin)
          .send({ quantity, mutation: { id: randomUUID(), cartIdentity: current.mutationContext.cartIdentity, expectedRevision: current.mutationContext.revision } })
      ).status,
      400,
    );
  }
});
async function cartWrite(agent: ReturnType<typeof request.agent>, id: string, quantity: number, extra = {}) {
  const current = await agent.get("/api/cart");
  return agent.put("/api/cart/items/" + id).set("Origin", origin).send({
    quantity,
    mutation: { id: randomUUID(), cartIdentity: current.body.mutationContext.cartIdentity, expectedRevision: current.body.mutationContext.revision },
    ...extra,
  });
}
test("cart totals use database prices and reject injected price fields", async () => {
  const agent = request.agent(app);
  const boot = await agent.get("/api/cart");
  assert.equal((await cartWrite(agent, "chair-cream", 2, { pricePaise: 1 })).status, 400);
  const added = await cartWrite(agent, "chair-cream", 2);
  assert.equal(added.status, 200); assert.equal(added.body.subtotalPaise, 24690); assert.equal(added.body.itemCount, 2);
  assert.match(cookie(boot), /HttpOnly/); assert.match(String(added.headers["cache-control"]), /no-store/);
  await db.variant.update({ where: { id: "chair-cream" }, data: { pricePaise: 15000 } });
  assert.equal((await agent.get("/api/cart")).body.subtotalPaise, 30000);
});
test("guest cart credentials isolate shoppers and survive a new API instance", async () => {
  const a = request.agent(app), b = request.agent(app);
  const boot = await a.get("/api/cart");
  await cartWrite(a, "chair-cream", 1);
  assert.equal((await b.get("/api/cart")).body.itemCount, 0);
  const restarted = createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false });
  assert.equal((await request(restarted).get("/api/cart").set("Cookie", cookie(boot).split(";")[0]!)).body.itemCount, 1);
  const stored = await db.cart.findFirstOrThrow();
  assert.equal(stored.tokenHash.length, 64); assert.ok(!cookie(boot).includes(stored.tokenHash));
});
test("cross-origin and missing-origin cart writes are refused", async () => {
  assert.equal((await request(app).put("/api/cart/items/chair-cream").send({ quantity: 1 })).status, 403);
  assert.equal((await request(app).put("/api/cart/items/chair-cream").set("Origin", "https://other.example").send({ quantity: 1 })).status, 403);
  assert.equal(await db.cart.count(), 0);
});
test("priced unavailable and made-to-order items can be saved while unpublished or missing products are rejected", async () => {
  // A made-to-order piece Keeri sells is as purchasable as a stocked one (owner decision 2026-11-01).
  for (const [id, available] of [["chair-blue", false], ["chair-custom", true]] as const) {
    const result = await cartWrite(request.agent(app), id, 1);
    assert.equal(result.status, 200);
    assert.equal(result.body.items[0].cartable, true);
    assert.equal(result.body.items[0].available, available);
    assert.equal(result.body.checkoutEnabled, false);
  }
  for (const id of ["hidden-v", "missing"]) {
    const result = await cartWrite(request.agent(app), id, 1);
    assert.ok([404, 409].includes(result.status), id + " status " + result.status);
  }
});
test("absolute quantity updates are idempotent and zero removes a line", async () => {
  const agent = request.agent(app);
  await cartWrite(agent, "chair-cream", 1);
  const current = (await agent.get("/api/cart")).body;
  const payload = { quantity: 2, mutation: { id: randomUUID(), cartIdentity: current.mutationContext.cartIdentity, expectedRevision: current.mutationContext.revision } };
  const results = await Promise.all([1, 2].map(() => agent.put("/api/cart/items/chair-cream").set("Origin", origin).send(payload)));
  assert.ok(results.every(result => result.status === 200));
  assert.equal((await agent.get("/api/cart")).body.itemCount, 2); assert.equal(await db.cartItem.count(), 1);
  await db.variant.update({ where: { id: "chair-cream" }, data: { available: false } });
  assert.equal((await agent.get("/api/cart")).body.items[0].available, false);
  assert.equal((await cartWrite(agent, "chair-cream", 0)).body.itemCount, 0);
});
test("expired carts do not expose previous items", async () => {
  const agent = request.agent(app); await cartWrite(agent, "chair-cream", 1);
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

test("preview imports cannot overwrite variants owned by another source", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "shopmaple-import-test-"));
  const input = join(directory, "preview.json");
  const payload = {
    schemaVersion: 1,
    source: "shopify-preview",
    capturedAt: "2026-10-25T00:00:00Z",
    products: [
      {
        id: "preview-new",
        handle: "preview-new",
        title: "Preview",
        description: "",
        category: "chairs",
        images: ["https://cdn.shopify.com/example.jpg"],
        published: true,
        source: "shopify-preview",
        sourceUpdatedAt: "2026-10-25T00:00:00Z",
        variants: [
          {
            id: "chair-cream",
            title: "Default",
            sku: null,
            pricePaise: 1,
            compareAtPaise: null,
            available: true,
            stockPolicy: "unverified",
          },
        ],
      },
    ],
  };
  try {
    await writeFile(input, JSON.stringify(payload));
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", resolve("../../scripts/import-preview.ts"), input],
        { env: { ...process.env, DATABASE_URL: url } },
      ),
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: "chair-cream" } }))
        .productId,
      "chair",
    );
    assert.equal(await db.product.count({ where: { id: "preview-new" } }), 0);
    // A preview-shaped ID alone must not authorize taking over a different source.
    await db.variant.update({
      where: { id: "chair-cream" },
      data: { id: "preview-collision" },
    });
    payload.products[0]!.variants[0]!.id = "preview-collision";
    await writeFile(input, JSON.stringify(payload));
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", resolve("../../scripts/import-preview.ts"), input],
        { env: { ...process.env, DATABASE_URL: url } },
      ),
    );
    assert.equal(
      (
        await db.variant.findUniqueOrThrow({
          where: { id: "preview-collision" },
        })
      ).productId,
      "chair",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Keeri full snapshots atomically import, replay, retire variants and reject stale publications", async () => {
  const { syncKeeriExport } = await import("../src/keeri-sync.js");
  const { keeriFixture } = await import("./fixtures/keeri.js");
  await db.catalogueSyncState.deleteMany();
  const input = keeriFixture();
  await syncKeeriExport(db, input, "maple");
  const product = await db.product.findUniqueOrThrow({ where: { id: "keeri:maple:model1" }, include: { variants: true } });
  assert.equal(product.variants[0]?.pricePaise, 1234567);
  assert.equal(product.variants[0]?.available, false);
  assert.equal((await syncKeeriExport(db, input, "maple")).replayed, true);
  const next = keeriFixture(); next.capturedAt = "2026-10-25T11:00:00Z";
  const second = structuredClone(next.models[0]!.variants[0]!);
  second.id = "variant2"; second.sku = "CH-ZYRO-BLUE";
  next.models[0]!.variants = [second];
  await syncKeeriExport(db, next, "maple");
  const response = await request(app).get("/api/products/zyro-chair");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.variants.map((v: { id: string }) => v.id), ["keeri:maple:variant2"]);
  await assert.rejects(syncKeeriExport(db, input, "maple"), /older/);
  const conflict = structuredClone(next); conflict.models[0]!.name = "Changed";
  await assert.rejects(syncKeeriExport(db, conflict, "maple"), /timestamp/);
  const empty = { ...next, capturedAt: "2026-10-25T12:00:00Z", models: [], publication: [], publicMedia: [] };
  await syncKeeriExport(db, empty, "maple");
  assert.equal((await request(app).get("/api/products/zyro-chair")).status, 404);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: "chair" } })).published, true);
});

test("Keeri identity and handle collisions roll back the complete import and watermark", async () => {
  const { syncKeeriExport } = await import("../src/keeri-sync.js");
  const { keeriFixture } = await import("./fixtures/keeri.js");
  await db.catalogueSyncState.deleteMany();
  const input = keeriFixture(); input.publication[0]!.handle = "walnut-chair";
  await assert.rejects(syncKeeriExport(db, input, "maple"));
  assert.equal(await db.product.count({ where: { source: "keeri:maple" } }), 0);
  assert.equal(await db.catalogueSyncState.count(), 0);
  await db.variant.update({ where: { id: "chair-cream" }, data: { id: "keeri:maple:variant1" } });
  await assert.rejects(syncKeeriExport(db, keeriFixture(), "maple"), /identity/);
  assert.equal(await db.product.count({ where: { source: "keeri:maple" } }), 0);
  assert.equal(await db.catalogueSyncState.count(), 0);
});

test("concurrent Keeri snapshots cannot restore older catalogue data", async () => {
  const { syncKeeriExport } = await import("../src/keeri-sync.js");
  const { keeriFixture } = await import("./fixtures/keeri.js");
  await db.catalogueSyncState.deleteMany();
  const older = keeriFixture();
  const newer = keeriFixture(); newer.capturedAt = "2026-10-25T11:00:00Z";
  newer.models[0]!.variants[0]!.prices[0]!.amount = 222222;
  const results = await Promise.allSettled([
    syncKeeriExport(db, newer, "maple"), syncKeeriExport(db, older, "maple"),
  ]);
  assert.equal(results[0]?.status, "fulfilled");
  assert.equal((await db.variant.findUniqueOrThrow({ where: { id: "keeri:maple:variant1" } })).pricePaise, 222222);
  assert.equal((await db.catalogueSyncState.findUniqueOrThrow({ where: { source: "keeri:maple" } })).capturedAt.toISOString(), "2026-10-25T11:00:00.000Z");
});
