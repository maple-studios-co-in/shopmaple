import request from "supertest";
import { createApp } from "../src/app.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createOrderService, type ReservationPort } from "../src/orders/service.js";
import { createRazorpayGateway } from "../src/payments/razorpay.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Dedicated shopmaple_test required");
const db = new PrismaClient({ datasources: { db: { url } } });
const token = "e".repeat(64);
const now = new Date("2026-10-26T10:00:00Z");
const customer = {
  name: "Test Buyer",
  email: "buyer@example.test",
  phone: "+919876543210",
};
const address = {
  line1: "1 Test Street",
  line2: "",
  city: "Mumbai",
  stateCode: "27",
  pincode: "400001",
  country: "IN",
};
const input = {
  customer,
  billingAddress: address,
  shippingAddress: address,
  deliveryMethodId: "standard",
};
function canonical(x: any): string {
  return Array.isArray(x)
    ? `[${x.map(canonical).join(",")}]`
    : x !== null && typeof x === "object"
      ? `{${Object.keys(x)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
          .join(",")}}`
      : JSON.stringify(x);
}
function quotation(_request: any) {
  const snapshot = {
    version: 2,
    currency: "INR",
    policyId: "reviewed-fixture-v1",
    quoteId: "quote_fixture",
    expiresAt: "2026-10-26T10:10:00.000Z",
    ...input,
    gstMode: "excluded",
    items: [
      {
        variantId: "keeri:maple:chair-v",
        productId: "keeri:maple:chair",
        title: "Test Chair",
        variantTitle: "Cream",
        sku: "CHAIR",
        quantity: 2,
        unitPricePaise: 10000,
        lineTotalPaise: 20000,
        hsn: "9401",
        taxRateBps: 1800,
      },
    ],
    subtotalPaise: 20000,
    shippingPaise: 1000,
    taxPaise: 3600,
    totalPaise: 24600,
  };
  return {
    version: 2,
    quoteId: snapshot.quoteId,
    expiresAt: snapshot.expiresAt,
    snapshotSha256: createHash("sha256")
      .update(canonical(snapshot))
      .digest("hex"),
    snapshot,
  };
}
let providerPosts: unknown[] = [];
let reserveHook: (() => Promise<void>) | undefined;
const reservations: ReservationPort = {
  reserve: async (r) => {
    await reserveHook?.();
    return { ...r, reservationId: `reservation-${r.attemptId}`, verified: true, expiresAt: new Date("2026-10-26T10:10:00Z") };
  },
  verify: async () => true,
};
function service(
  authority: (request: any) => Promise<any> = async (request) =>
    quotation(request),
) {
  const extra = { quoteAuthority: authority, keeriTenantId: "maple" };
  return createOrderService(db, {
    merchantScope: "maple-test",
    gateway: createRazorpayGateway({
      keyId: "rzp_test_fixture",
      keySecret: "fixture",
      webhookSecret: "fixture",
    }, { fetch: async (_url, options) => {
      assert.equal(options.method, "POST");
      const body = JSON.parse(String(options.body));
      providerPosts.push(body);
      return Response.json({ entity: "order", id: "order_bound", ...body, status: "created", amount_paid: 0, amount_due: body.amount });
    } }),
    reservations,
    quote: () => ({ shippingPaise: 0, taxPaise: 0, policyId: "legacy" }),
    now: () => now,
    ...extra,
  });
}
const freeze = (
  flow: ReturnType<typeof service>,
  key = "checkout-v2-1",
  data: any = input,
) => flow.freezeCart(token, key, data);
beforeEach(async () => {
  providerPosts = []; reserveHook = undefined;
  await db.orderOutbox.deleteMany();
  await db.paymentWebhookInbox.deleteMany();
  await db.checkoutAttempt.deleteMany();
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.product.deleteMany({ where: { handle: "v2-fixture-chair" } });
  await db.product.create({
    data: {
      id: "keeri:maple:chair",
      handle: "v2-fixture-chair",
      title: "Stale title",
      description: "",
      category: "chairs",
      images: [],
      published: true,
      source: "keeri:maple",
      sourceUpdatedAt: now,
      identities: { create: { source: "keeri", externalId: "keeri:maple:chair" } },
      variants: {
        create: {
          id: "keeri:maple:chair-v",
          identities: { create: { source: "keeri", externalId: "keeri:maple:chair-v" } },
          title: "Cream",
          pricePaise: 9000,
          available: true,
          published: true,
          stockPolicy: "stocked",
        },
      },
    },
  });
  await db.cart.create({
    data: {
      id: "v2-cart",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date("2026-11-01"),
      items: { create: { variantId: "keeri:maple:chair-v", quantity: 2 } },
    },
  });
});
after(() => db.$disconnect());
test("v2 freezes authoritative quote prices and customer details rather than stale read-model totals", async () => {
  const flow = service(async (request) => {
    assert.deepEqual(request, {
      version: 2,
      items: [{ variantId: "keeri:maple:chair-v", quantity: 2 }],
      ...input,
    });
    return quotation(request);
  });
  const result = await freeze(flow);
  assert.equal((result.snapshot as any).version, 2);
  assert.equal(result.amountPaise, 24600);
  assert.deepEqual((result.snapshot as any).shippingAddress, address);
  assert.equal((result.snapshot as any).items[0].unitPricePaise, 10000);
});
test("v2 replay binds customer input and cart quantities, and never silently reuses a changed checkout", async () => {
  const flow = service();
  const original = await freeze(flow);
  assert.equal((await freeze(flow)).id, original.id);
  await assert.rejects(
    freeze(flow, "checkout-v2-1", {
      ...input,
      customer: { ...customer, email: "changed@example.test" },
    }),
    { code: "CHECKOUT_INPUT_CHANGED" },
  );
  await db.cartItem.update({
    where: {
      cartId_variantId: { cartId: "v2-cart", variantId: "keeri:maple:chair-v" },
    },
    data: { quantity: 1 },
  });
  await assert.rejects(freeze(flow), { code: "CHECKOUT_INPUT_CHANGED" });
  assert.equal(await db.checkoutAttempt.count(), 1);
});
test("malformed binding, expired quote and browser monetary fields cannot freeze an attempt", async () => {
  await assert.rejects(
    freeze(service(), "checkout-v2-1", { ...input, totalPaise: 1 }),
  );
  for (const mutate of [
    (q: any) => ({ ...q, snapshotSha256: "0".repeat(64) }),
    (q: any) => ({ ...q, quoteId: "other" }),
    (q: any) => ({ ...q, expiresAt: "2020-01-01T00:00:00.000Z" }),
    (q: any) => {
      q.snapshot.items[0].quantity = 1;
      return q;
    },
  ]) {
    await assert.rejects(freeze(service(async (r) => mutate(quotation(r)))), {
      code: "QUOTE_INVALID",
    });
  }
  assert.equal(await db.checkoutAttempt.count(), 0);
});
test("quote is fetched outside a database transaction and a cart change during it rejects freezing", async () => {
  const flow = service(async (r) => {
    await db.cartItem.update({
      where: {
        cartId_variantId: {
          cartId: "v2-cart",
          variantId: "keeri:maple:chair-v",
        },
      },
      data: { quantity: 1 },
    });
    return quotation(r);
  });
  await assert.rejects(freeze(flow), { code: "CHECKOUT_INPUT_CHANGED" });
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("India checkout normalizes local mobile numbers before sending the machine quote", async () => {
  const flow = service(async (request) => {
    assert.equal(request.customer.phone, "+919876543210");
    const q = quotation(request);
    q.snapshot.customer.phone = request.customer.phone;
    q.snapshotSha256 = createHash("sha256")
      .update(canonical(q.snapshot))
      .digest("hex");
    return q;
  });
  const result = await freeze(flow, "normalization-1", {
    ...input,
    customer: { ...customer, phone: "9876543210" },
  });
  assert.equal((result.snapshot as any).customer.phone, "+919876543210");
});

test("HTTP checkout accepts only customer address fields and returns the frozen quote for review", async () => {
  const app = createApp(
    db,
    {
      webOrigin: "http://localhost:3000",
      catalogMode: "preview",
      secureCookies: false,
    },
    service(),
  );
  const response = await request(app)
    .post("/api/checkout")
    .set("Origin", "http://localhost:3000")
    .set("Cookie", `maple_cart=${token}`)
    .set("Idempotency-Key", "http-v2-input")
    .send(input);
  assert.equal(response.status, 200);
  assert.equal(response.body.amountPaise, 24600);
  assert.equal(response.body.quote.totalPaise, 24600);
  assert.equal(
    response.body.quote.customer,
    undefined,
    "Personal details are not copied into public quote responses",
  );
});

test("customer status distinguishes paid-awaiting-Keeri, accepted, and manual review without exposing private details", async () => {
  const flow = service();
  const frozen = await freeze(flow);
  const app = createApp(
    db,
    {
      webOrigin: "http://localhost:3000",
      catalogMode: "preview",
      secureCookies: false,
    },
    flow,
  );
  const status = () =>
    request(app)
      .get(`/api/checkout/${frozen.id}`)
      .set("Cookie", `maple_cart=${token}`);
  await db.checkoutAttempt.update({
    where: { id: frozen.id },
    data: {
      state: "captured",
      paymentId: "pay_status",
      providerOrderId: "order_status",
      capturedAt: now,
    },
  });
  assert.equal((await status()).body.fulfillmentStatus, "pending");
  const outbox = await db.orderOutbox.create({
    data: {
      attemptId: frozen.id,
      kind: "keeri.order.captured.v2",
      payload: {},
      state: "delivered",
      externalOrderId: "actual-sales-order",
    },
  });
  let result = await status();
  assert.equal(result.body.fulfillmentStatus, "confirmed");
  assert.equal(result.body.orderReference, "actual-sales-order");
  assert.equal(result.body.paid, true);
  await db.orderOutbox.update({
    where: { id: outbox.id },
    data: {
      state: "failed",
      failureCode: "INTERNAL_PRIVATE_REASON",
      externalOrderId: null,
    },
  });
  result = await status();
  assert.equal(result.body.fulfillmentStatus, "review_required");
  assert.equal(result.body.paid, true);
  assert.equal(result.body.orderReference, null);
  assert.doesNotMatch(
    JSON.stringify(result.body),
    /buyer@example|400001|INTERNAL_PRIVATE_REASON/,
  );
});

test("quote binding compares variant sets consistently across database and producer sort orders", async () => {
  await db.variant.create({
    data: {
      id: "keeri:maple:Chair-V",
      identities: { create: { source: "keeri", externalId: "keeri:maple:Chair-V" } },
      productId: "keeri:maple:chair",
      title: "Oak",
      pricePaise: 10000,
      available: true,
      published: true,
      stockPolicy: "stocked",
    },
  });
  await db.cartItem.create({
    data: { cartId: "v2-cart", variantId: "keeri:maple:Chair-V", quantity: 1 },
  });
  const flow = service(async (r) => {
    const q = quotation(r);
    q.snapshot.items = [
      ...q.snapshot.items,
      {
        ...q.snapshot.items[0]!,
        variantId: "keeri:maple:Chair-V",
        quantity: 1,
        lineTotalPaise: 10000,
      },
    ].reverse();
    q.snapshot.subtotalPaise = 30000;
    q.snapshot.totalPaise = 34600;
    q.snapshotSha256 = createHash("sha256")
      .update(canonical(q.snapshot))
      .digest("hex");
    return q;
  });
  const result = await freeze(flow).catch((e) => ({
    amountPaise: 0,
    code: e.code,
  }));
  assert.equal(result.amountPaise, 34600);
});

test("changed input on a captured checkout never tells the buyer that payment is unconfirmed", async () => {
  const flow = service();
  const frozen = await freeze(flow);
  await db.checkoutAttempt.update({
    where: { id: frozen.id },
    data: { state: "captured", capturedAt: now, paymentId: "pay_paid" },
  });
  const app = createApp(
    db,
    {
      webOrigin: "http://localhost:3000",
      catalogMode: "preview",
      secureCookies: false,
    },
    flow,
  );
  const result = await request(app)
    .post("/api/checkout")
    .set("Origin", "http://localhost:3000")
    .set("Cookie", `maple_cart=${token}`)
    .set("Idempotency-Key", "checkout-v2-1")
    .send({
      ...input,
      customer: { ...customer, email: "changed@example.test" },
    });
  assert.equal(result.status, 409);
  assert.doesNotMatch(
    result.body.message,
    /No payment is confirmed|not been charged|no payment has been taken/i,
  );
  assert.equal(
    (await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } }))
      .state,
    "captured",
  );
});

async function previewIds() {
  await db.product.update({ where: { id: "keeri:maple:chair" }, data: { id: "preview-chair" } });
  await db.variant.update({ where: { id: "keeri:maple:chair-v" }, data: { id: "preview-chair-v" } });
}
const bindingSnapshot = {
  version: 1, tenantId: "maple", items: [{
    localVariantId: "preview-chair-v", localProductId: "preview-chair",
    sourceVariantId: "keeri:maple:chair-v", sourceProductId: "keeri:maple:chair",
  }],
};
test("merged preview cart quotes and reserves persisted Keeri identities while retaining local cart and immutable quote", async () => {
  await previewIds();
  const expected = quotation(null);
  const flow = service(async (r) => {
    assert.deepEqual(r.items, [{ variantId: "keeri:maple:chair-v", quantity: 2 }]);
    return expected;
  });
  const result = await freeze(flow);
  assert.deepEqual(result.snapshot, expected.snapshot);
  assert.deepEqual((result as any).catalogueBindings, bindingSnapshot);
  assert.equal((await db.cartItem.findFirstOrThrow()).variantId, "preview-chair-v");
  assert.equal((await freeze(flow)).id, result.id);
  assert.equal((await flow.createProviderOrder(token, result.id)).state, "awaiting_payment");
  assert.equal(providerPosts.length, 1);
});
test("missing and wrong-tenant persisted identities refuse quotation even when local IDs look authoritative", async () => {
  let quotes = 0;
  const flow = service(async (r) => { quotes++; return quotation(r); });
  await db.variantSourceIdentity.deleteMany({ where: { source: "keeri" } });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_REQUIRED" });
  assert.equal(quotes, 0);
  await db.variantSourceIdentity.create({ data: { source: "keeri", externalId: "keeri:other:chair-v", variantId: "keeri:maple:chair-v" } });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_REQUIRED" });
  assert.equal(quotes, 0);
});
test("quote cannot substitute the product parent associated with a persisted variant", async () => {
  await db.productSourceIdentity.update({ where: { source_productId: { source: "keeri", productId: "keeri:maple:chair" } }, data: { externalId: "keeri:maple:different-parent" } });
  await assert.rejects(freeze(service()), { code: "QUOTE_INVALID" });
  assert.equal(await db.checkoutAttempt.count(), 0);
});
test("product identity changing while quote is in flight cannot freeze stale bindings", async () => {
  const flow = service(async (r) => {
    await db.productSourceIdentity.update({ where: { source_productId: { source: "keeri", productId: "keeri:maple:chair" } }, data: { externalId: "keeri:maple:changed-parent" } });
    return quotation(r);
  });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_CHANGED" });
  assert.equal(await db.checkoutAttempt.count(), 0);
});
test("changed binding after quote refuses replay and provider creation without payment transport", async () => {
  const flow = service(); const frozen = await freeze(flow);
  await db.variantSourceIdentity.update({ where: { source_variantId: { source: "keeri", variantId: "keeri:maple:chair-v" } }, data: { externalId: "keeri:maple:replacement-v" } });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_CHANGED" });
  await assert.rejects(flow.createProviderOrder(token, frozen.id), { code: "CATALOGUE_BINDING_CHANGED" });
  assert.equal(providerPosts.length, 0);
});
test("mapping change during remote reservation blocks provider order and records reconciliation", async () => {
  const flow = service(); const frozen = await freeze(flow);
  reserveHook = async () => {
    await db.productSourceIdentity.update({ where: { source_productId: { source: "keeri", productId: "keeri:maple:chair" } }, data: { externalId: "keeri:maple:replacement-parent" } });
  };
  await assert.rejects(flow.createProviderOrder(token, frozen.id), { code: "CATALOGUE_BINDING_CHANGED" });
  assert.equal(providerPosts.length, 0);
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } })).state, "reconciliation_required");
});
test("pre-migration v2 attempts without binding snapshots fail closed before provider creation", async () => {
  const flow = service(); const frozen = await freeze(flow);
  // Simulate a legacy record through a fresh insert; never mutate a frozen mapping.
  await db.checkoutAttempt.delete({ where: { id: frozen.id } });
  const { catalogueBindings: _discard, ...legacy } = frozen as any;
  await db.checkoutAttempt.create({ data: legacy });
  await assert.rejects(flow.createProviderOrder(token, frozen.id), { code: "CATALOGUE_BINDING_REQUIRED" });
  assert.equal(providerPosts.length, 0);
});

test("persisted catalogue bindings cannot be rewritten on an existing checkout attempt", async () => {
  const frozen = await freeze(service());
  const changed = structuredClone((frozen as any).catalogueBindings);
  changed.items[0].sourceVariantId = "keeri:maple:replacement-v";
  await assert.rejects(db.checkoutAttempt.update({ where: { id: frozen.id }, data: { catalogueBindings: changed } }));
  const stored = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } });
  assert.deepEqual(stored.catalogueBindings, frozen.catalogueBindings);
  assert.deepEqual(stored.snapshot, frozen.snapshot);
});

test("missing or cross-tenant product identities never reach quote or payment transport", async () => {
  let quotes = 0;
  const flow = service(async (r) => { quotes++; return quotation(r); });
  await db.productSourceIdentity.deleteMany({ where: { source: "keeri", productId: "keeri:maple:chair" } });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_REQUIRED" });
  await db.productSourceIdentity.create({ data: { source: "keeri", externalId: "keeri:maple-other:chair", productId: "keeri:maple:chair" } });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_REQUIRED" });
  assert.equal(quotes, 0);
  assert.equal(providerPosts.length, 0);
});

test("variant remapping while a quote is in flight refuses the original quote", async () => {
  const flow = service(async (r) => {
    await db.variantSourceIdentity.update({ where: { source_variantId: { source: "keeri", variantId: "keeri:maple:chair-v" } }, data: { externalId: "keeri:maple:replacement-v" } });
    return quotation(r);
  });
  await assert.rejects(freeze(flow), { code: "CATALOGUE_BINDING_CHANGED" });
  assert.equal(await db.checkoutAttempt.count(), 0);
});

test("concurrent provider calls for translated IDs still create only one provider order", async () => {
  await previewIds();
  const flow = service(); const frozen = await freeze(flow);
  const results = await Promise.allSettled([
    flow.createProviderOrder(token, frozen.id),
    flow.createProviderOrder(token, frozen.id),
  ]);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  assert.equal(providerPosts.length, 1);
  assert.deepEqual((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } })).catalogueBindings, bindingSnapshot);
});

test("quote authority requires an explicit valid tenant configuration", () => {
  for (const keeriTenantId of [undefined, "", "maple:other", "maple/other"]) {
    assert.throws(() => createOrderService(db, {
      merchantScope: "maple-test", keeriTenantId,
      quoteAuthority: async (r) => quotation(r),
      gateway: createRazorpayGateway({ keyId: "rzp_test_fixture", keySecret: "fixture", webhookSecret: "fixture" }),
    }), { code: "INVALID_CONFIGURATION" });
  }
});
