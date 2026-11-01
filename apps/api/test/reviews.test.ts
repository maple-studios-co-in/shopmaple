import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { adminReviewListSchema, productReviewsSchema, reviewOrderListSchema } from "@shopmaple/contracts";
import { createApp } from "../src/app.js";
import { loadEnquiryDeliveryConfig } from "../src/enquiry-delivery-provider.js";
import { runReviewInvitationEmails } from "../src/reviews/invitations.js";
import { loadReviewsConfig, type ReviewsConfig } from "../src/reviews/routes.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const linkSecret = "l".repeat(48);
const keeriSecret = "k".repeat(48);
const email = loadEnquiryDeliveryConfig({
  ENQUIRY_DELIVERY_ENABLED: "true", ENQUIRY_RESEND_API_KEY: "re_synthetic_unused",
  ENQUIRY_MAIL_FROM: "orders@example.com", ENQUIRY_MAIL_TO: "staff@example.com", WEB_ORIGIN: origin,
})!;
const reviews: ReviewsConfig = { linkSecret, keeriDeliverySecret: keeriSecret };
const app = (settings: ReviewsConfig | null = reviews) =>
  request(createApp(db, { webOrigin: origin, secureCookies: false, catalogMode: "preview", enquiryDelivery: email, reviews: settings }));
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const made = { admins: [] as string[], attempts: [] as string[], products: [] as string[] };
afterEach(async () => {
  const attemptId = { in: made.attempts };
  await db.productReviewAudit.deleteMany({ where: { review: { attemptId } } });
  await db.productReview.deleteMany({ where: { attemptId } });
  await db.productReviewInvitation.deleteMany({ where: { attemptId } });
  await db.orderDelivery.deleteMany({ where: { attemptId } });
  await db.orderOutbox.deleteMany({ where: { attemptId } });
  await db.checkoutAttempt.deleteMany({ where: { id: attemptId } });
  await db.product.deleteMany({ where: { id: { in: made.products } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: made.admins } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: made.admins } } });
  made.admins.length = made.attempts.length = made.products.length = 0;
});
after(async () => db.$disconnect());

async function staff(canManageEnquiries = true) {
  const token = randomBytes(32).toString("hex");
  const row = await db.shopAdmin.create({ data: { email: `reviews-${randomUUID()}@example.invalid`, passwordHash: "synthetic-unused", role: "editor", canManageEnquiries } });
  made.admins.push(row.id);
  await db.shopAdminSession.create({ data: { adminId: row.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600_000) } });
  return { id: row.id, email: row.email, cookie: `shop_admin=${token}`, csrf: hash(`csrf:${token}`) };
}
type Staff = Awaited<ReturnType<typeof staff>>;
const staffGet = (actor: Staff, path: string) => app().get(path).set("Cookie", actor.cookie);
const staffPost = (actor: Staff, path: string, body: object = {}) =>
  app().post(path).set("Cookie", actor.cookie).set("Origin", origin).set("X-CSRF-Token", actor.csrf).send(body);

/** A published product with variants, as the catalogue union stores it. */
async function product(variants = ["Nordic Ivory", "Desert Taupe"]) {
  const id = `review-test-${randomUUID()}`;
  await db.product.create({
    data: {
      id, handle: id, title: "Aero Dining Chair", description: "", images: [], published: true, source: "keeri:maple",
      sourceUpdatedAt: new Date(), variants: { create: variants.map((title, i) => ({ id: `${id}-v${i}`, title, available: true, stockPolicy: "stocked" })) },
    },
  });
  made.products.push(id);
  return { id, handle: id, variants: variants.map((title, i) => ({ id: `${id}-v${i}`, title })) };
}
type Item = Awaited<ReturnType<typeof product>>;

/** A paid checkout. `confirmed` adds the Keeri order the store recorded for it. */
async function order(item: Item, { state = "captured", confirmed = true, lines = item.variants.length, buyer = "Asha Rao" } = {}) {
  const id = `chk_${randomUUID()}`;
  const chosen = item.variants.slice(0, lines);
  const address = { line1: "1 Test Street", line2: "", city: "Pune", stateCode: "27", pincode: "411001", country: "IN" };
  const snapshot = {
    version: 2, currency: "INR", policyId: "fixture", quoteId: `q_${id}`, expiresAt: "2026-11-01T10:00:00.000Z",
    customer: { name: buyer, email: "buyer@example.com", phone: "+919876543210" },
    billingAddress: address, shippingAddress: address, deliveryMethodId: "standard", gstMode: "included",
    items: chosen.map((v) => ({
      variantId: `keeri:maple:${v.id}`, productId: `keeri:maple:${item.id}`, title: "Aero Dining Chair", variantTitle: v.title,
      sku: null, quantity: 1, unitPricePaise: 1_000_000, lineTotalPaise: 1_000_000, hsn: "9401", taxRateBps: 1800,
    })),
    subtotalPaise: chosen.length * 1_000_000, shippingPaise: 0, taxPaise: 0, totalPaise: chosen.length * 1_000_000,
  };
  const catalogueBindings = {
    version: 1, tenantId: "maple",
    items: chosen.map((v) => ({ localVariantId: v.id, localProductId: item.id, sourceVariantId: `keeri:maple:${v.id}`, sourceProductId: `keeri:maple:${item.id}` })),
  };
  await db.checkoutAttempt.create({
    data: { id, cartId: randomUUID(), merchantScope: "test", idempotencyKey: randomUUID(), receipt: id, snapshot, catalogueBindings,
      amountPaise: snapshot.totalPaise, state, capturedAt: state === "captured" ? new Date() : null },
  });
  made.attempts.push(id);
  const reference = `SO-${randomUUID().slice(0, 8)}`;
  if (confirmed)
    await db.orderOutbox.create({ data: { attemptId: id, kind: "keeri.order.captured.v2", payload: {}, state: "delivered", deliveredAt: new Date(), externalOrderId: reference } });
  return { id, reference };
}

/** A local stand-in for Resend: records each request and accepts it. */
function resend() {
  const sent: Array<{ key: string; body: { to: string[]; subject: string; text: string; reply_to?: string } }> = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    sent.push({ key: String((init.headers as Record<string, string>)["Idempotency-Key"]), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: randomUUID() }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { sent, fetch };
}
const links = (text: string) => [...text.matchAll(/http:\/\/localhost:3000\/reviews\/new\?token=([A-Za-z0-9_.-]+)/g)].map((m) => m[1]!);

/** Deliver, send the invitation email and return each line's token in order. */
async function invite(actor: Staff, attemptId: string) {
  assert.equal((await staffPost(actor, `/api/admin/review-orders/${attemptId}/delivered`)).status, 200);
  const mail = resend();
  await runReviewInvitationEmails(db, { email, linkSecret, fetch: mail.fetch });
  return links(mail.sent.at(-1)?.body.text ?? "");
}
const review = (token: string, extra: object = {}) =>
  app().post("/api/reviews").set("Origin", origin).send({ token, rating: 5, title: "Sturdy and lovely", body: "Comfortable for long dinners and easy to clean.", displayName: "Asha", city: "Pune", ...extra });

test("marking a confirmed order delivered invites one review per line in one email, sent once", async () => {
  const actor = await staff(), item = await product(), placed = await order(item);
  const marked = await staffPost(actor, `/api/admin/review-orders/${placed.id}/delivered`);
  assert.equal(marked.status, 200);
  assert.equal(marked.body.delivery.source, "staff");
  assert.equal(await db.productReviewInvitation.count({ where: { attemptId: placed.id } }), 2);
  const mail = resend();
  assert.deepEqual(await runReviewInvitationEmails(db, { email, linkSecret, fetch: mail.fetch }), { claimed: 1, sent: 1, retried: 0, failed: 0 });
  assert.equal(mail.sent.length, 1);
  const message = mail.sent[0]!.body;
  assert.deepEqual(message.to, ["buyer@example.com"]);
  assert.match(message.text, /Dear Asha Rao/);
  assert.match(message.text, new RegExp(placed.reference));
  assert.equal(links(message.text).length, 2);
  assert.equal(new Set(links(message.text)).size, 2);
  // Neither a second batch nor marking it delivered again sends or invites anything more.
  await runReviewInvitationEmails(db, { email, linkSecret, fetch: mail.fetch });
  assert.equal((await staffPost(actor, `/api/admin/review-orders/${placed.id}/delivered`)).status, 200);
  await runReviewInvitationEmails(db, { email, linkSecret, fetch: mail.fetch });
  assert.equal(mail.sent.length, 1);
  assert.equal(await db.productReviewInvitation.count({ where: { attemptId: placed.id } }), 2);
});

test("a provider outage retries the same email under the same idempotency key", async () => {
  const actor = await staff(), item = await product(["Slate Modern"]), placed = await order(item);
  await staffPost(actor, `/api/admin/review-orders/${placed.id}/delivered`);
  const keys: string[] = [];
  const down = (async (_u: string, init: RequestInit) => {
    keys.push(String((init.headers as Record<string, string>)["Idempotency-Key"]));
    return new Response("", { status: 503 });
  }) as unknown as typeof fetch;
  let clock = new Date();
  assert.equal((await runReviewInvitationEmails(db, { email, linkSecret, fetch: down, now: () => clock })).retried, 1);
  clock = new Date(clock.getTime() + 3_600_000);
  const mail = resend();
  assert.equal((await runReviewInvitationEmails(db, { email, linkSecret, fetch: mail.fetch, now: () => clock })).sent, 1);
  assert.equal(mail.sent[0]!.key, keys[0]);
});

test("only a confirmed, paid order can be marked delivered", async () => {
  const actor = await staff(), item = await product();
  const unpaid = await order(item, { state: "awaiting_payment", confirmed: false });
  const unconfirmed = await order(item, { confirmed: false });
  assert.equal((await staffPost(actor, `/api/admin/review-orders/${unpaid.id}/delivered`)).status, 409);
  assert.equal((await staffPost(actor, `/api/admin/review-orders/${unconfirmed.id}/delivered`)).status, 409);
  assert.equal((await staffPost(actor, `/api/admin/review-orders/chk_${randomUUID()}/delivered`)).status, 404);
  assert.equal(await db.productReviewInvitation.count({ where: { attemptId: { in: [unpaid.id, unconfirmed.id] } } }), 0);
  const listed = await staffGet(actor, "/api/admin/review-orders");
  assert.equal(listed.status, 200);
  const ids = reviewOrderListSchema.parse(listed.body).items.map((o) => o.attemptId);
  assert.equal(ids.includes(unpaid.id) || ids.includes(unconfirmed.id), false);
});

test("staff routes need a session with customer access, the store origin and the CSRF token", async () => {
  const actor = await staff(), outsider = await staff(false), item = await product(), placed = await order(item);
  const path = `/api/admin/review-orders/${placed.id}/delivered`;
  assert.equal((await app().get("/api/admin/reviews")).status, 401);
  assert.equal((await staffGet(outsider, "/api/admin/reviews")).status, 403);
  assert.equal((await staffGet(outsider, "/api/admin/review-orders")).status, 403);
  assert.equal((await staffPost(outsider, path)).status, 403);
  assert.equal((await app().post(path).set("Cookie", actor.cookie).set("Origin", origin).send({})).status, 403);
  assert.equal((await app().post(path).set("Cookie", actor.cookie).set("Origin", "https://evil.example").set("X-CSRF-Token", actor.csrf).send({})).status, 403);
  assert.equal(await db.orderDelivery.count({ where: { attemptId: placed.id } }), 0);
});

test("a review link works once, only as issued, and only until it expires", async () => {
  const actor = await staff(), item = await product(), placed = await order(item);
  const [first, second] = await invite(actor, placed.id);
  const shown = await app().get(`/api/reviews/invitation?token=${encodeURIComponent(first!)}`);
  assert.equal(shown.status, 200);
  assert.deepEqual(shown.body, { productTitle: "Aero Dining Chair", variantTitle: "Nordic Ivory", productHandle: item.handle });
  assert.match(String(shown.headers["cache-control"]), /no-store/);
  assert.deepEqual((await review(first!)).body, { status: "pending" });
  assert.equal((await review(first!)).status, 410);
  assert.equal((await app().get(`/api/reviews/invitation?token=${encodeURIComponent(first!)}`)).status, 410);
  // A forged signature, or a real invitation id with another's signature, names nothing.
  const [id] = second!.split(".");
  assert.equal((await review(`${id}.${"A".repeat(43)}`)).status, 404);
  assert.equal((await review(`${id}.${first!.split(".")[1]}`)).status, 404);
  await db.productReviewInvitation.updateMany({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await review(second!)).status, 410);
  assert.equal(await db.productReview.count({ where: { attemptId: placed.id } }), 1);
  const saved = await db.productReview.findFirstOrThrow({ where: { attemptId: placed.id } });
  assert.equal(saved.status, "pending");
  assert.equal(saved.variantId, item.variants[0]!.id);
  assert.equal(saved.productId, item.id);
});

test("two submissions racing on one link store exactly one review", async () => {
  const actor = await staff(), item = await product(["Deep Atlantic"]), placed = await order(item);
  const [token] = await invite(actor, placed.id);
  const statuses = (await Promise.all([review(token!), review(token!), review(token!)])).map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 410, 410]);
  assert.equal(await db.productReview.count({ where: { attemptId: placed.id } }), 1);
});

test("the review form rejects malformed input without using the link", async () => {
  const actor = await staff(), item = await product(["Nordic Ivory"]), placed = await order(item);
  const [token] = await invite(actor, placed.id);
  for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { body: "short" }, { title: "" }, { displayName: "A\u0007sha" }, { title: "two\nlines" }, { extra: true }])
    assert.equal((await review(token!, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await review(token!)).status, 201);
});

test("the store shows only approved reviews, with their average and count", async () => {
  const actor = await staff(), item = await product(["Nordic Ivory", "Desert Taupe", "Slate Modern"]), placed = await order(item);
  const tokens = await invite(actor, placed.id);
  await review(tokens[0]!, { rating: 5, displayName: "Asha" });
  await review(tokens[1]!, { rating: 4, displayName: "Vikram", city: "" });
  await review(tokens[2]!, { rating: 1, displayName: "Meera" });
  const empty = productReviewsSchema.parse((await app().get(`/api/products/${item.handle}/reviews`)).body);
  assert.deepEqual(empty, { average: null, count: 0, reviews: [] });
  const pending = adminReviewListSchema.parse((await staffGet(actor, "/api/admin/reviews?status=pending")).body).items.filter((r) => r.productHandle === item.handle);
  assert.equal(pending.length, 3);
  const by = (name: string) => pending.find((r) => r.displayName === name)!;
  for (const [name, decision] of [["Asha", "approved"], ["Vikram", "approved"], ["Meera", "rejected"]] as const)
    assert.equal((await staffPost(actor, `/api/admin/reviews/${by(name).id}/moderation`, { decision, expectedVersion: 0 })).status, 200);
  const shown = await app().get(`/api/products/${item.handle}/reviews`);
  assert.equal(shown.status, 200);
  const body = productReviewsSchema.parse(shown.body);
  assert.equal(body.count, 2);
  assert.equal(body.average, 4.5);
  assert.deepEqual(body.reviews.map((r) => r.displayName).sort(), ["Asha", "Vikram"]);
  assert.equal(body.reviews.find((r) => r.displayName === "Vikram")!.city, null);
  // Nothing about the buyer or the order reaches the public response.
  const raw = JSON.stringify(shown.body);
  for (const secret of ["buyer@example.com", placed.reference, placed.id, "Asha Rao"]) assert.equal(raw.includes(secret), false, secret);
});

test("moderation records who decided, refuses stale versions and keeps the full trail", async () => {
  const actor = await staff(), second = await staff(), item = await product(["Nordic Ivory"]), placed = await order(item);
  const [token] = await invite(actor, placed.id);
  await review(token!);
  const id = (await db.productReview.findFirstOrThrow({ where: { attemptId: placed.id } })).id;
  const path = `/api/admin/reviews/${id}/moderation`;
  const racing = await Promise.all([
    staffPost(actor, path, { decision: "approved", expectedVersion: 0 }),
    staffPost(second, path, { decision: "rejected", expectedVersion: 0 }),
  ]);
  assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409]);
  const winner = racing.find((r) => r.status === 200)!.body;
  const decided = await db.productReview.findUniqueOrThrow({ where: { id } });
  assert.equal(decided.version, 1);
  assert.equal(decided.status, winner.status);
  const next = decided.status === "approved" ? "rejected" : "approved";
  assert.equal((await staffPost(actor, path, { decision: next, expectedVersion: 1, note: "Changed after a call with the buyer" })).status, 200);
  const listed = adminReviewListSchema.parse((await staffGet(actor, `/api/admin/reviews?status=${next}`)).body).items.find((r) => r.id === id)!;
  assert.equal(listed.status, next);
  assert.equal(listed.orderReference, placed.reference);
  assert.deepEqual(listed.audit.map((a) => a.action), [decided.status, next]);
  assert.equal(listed.audit[1]!.actorEmail, actor.email);
  assert.equal(listed.audit[1]!.note, "Changed after a call with the buyer");
  assert.equal(await db.productReviewAudit.count({ where: { reviewId: id } }), 2);
  assert.equal((await staffPost(actor, `/api/admin/reviews/rev_${randomUUID()}/moderation`, { decision: "approved", expectedVersion: 0 })).status, 404);
});

function signed(body: object, secret = keeriSecret, at = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  return { raw, signature: `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${raw}`).digest("hex")}` };
}
const keeri = (raw: string, signature: string, settings: ReviewsConfig | null = reviews) =>
  app(settings).post("/api/integrations/keeri/order-delivered").set("Content-Type", "application/json").set("X-Keeri-Signature", signature).send(raw);

test("Keeri reports a delivery with a signed event; the store invites reviews once", async () => {
  const item = await product(), placed = await order(item);
  const event = { event: "order.delivered", externalOrderId: placed.reference, deliveredAt: "2026-11-01T09:30:00.000Z" };
  const { raw, signature } = signed(event);
  assert.equal((await keeri(raw, signature)).status, 200);
  assert.equal((await keeri(raw, signature)).status, 200);
  const delivery = await db.orderDelivery.findUniqueOrThrow({ where: { attemptId: placed.id } });
  assert.equal(delivery.source, "keeri");
  assert.equal(delivery.deliveredAt.toISOString(), event.deliveredAt);
  assert.equal(await db.productReviewInvitation.count({ where: { attemptId: placed.id } }), 2);
});

test("Keeri events fail closed on a bad or stale signature, an unknown order, or no configured secret", async () => {
  const item = await product(), placed = await order(item);
  const event = { event: "order.delivered", externalOrderId: placed.reference, deliveredAt: "2026-11-01T09:30:00.000Z" };
  const forged = signed(event, "x".repeat(48));
  assert.equal((await keeri(forged.raw, forged.signature)).status, 401);
  const stale = signed(event, keeriSecret, Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await keeri(stale.raw, stale.signature)).status, 401);
  const good = signed(event);
  assert.equal((await keeri(good.raw.replace("09:30", "09:31"), good.signature)).status, 401);
  const unknown = signed({ ...event, externalOrderId: "SO-unknown" });
  assert.equal((await keeri(unknown.raw, unknown.signature)).status, 404);
  assert.equal((await keeri(good.raw, good.signature, { linkSecret })).status, 404);
  assert.equal(await db.orderDelivery.count({ where: { attemptId: placed.id } }), 0);
});

test("without a link secret, delivery can't be recorded and no link is accepted", async () => {
  const actor = await staff(), item = await product(), placed = await order(item);
  assert.equal((await app(null).post(`/api/admin/review-orders/${placed.id}/delivered`).set("Cookie", actor.cookie).set("Origin", origin).set("X-CSRF-Token", actor.csrf).send({})).status, 503);
  assert.equal((await app(null).post("/api/reviews").set("Origin", origin).send({ token: `rvi_${randomUUID()}.${"A".repeat(43)}`, rating: 5, title: "Fine", body: "Long enough body text.", displayName: "Asha" })).status, 503);
  // Public reads still work, so the product page can say there are no reviews yet.
  assert.equal((await app(null).get(`/api/products/${item.handle}/reviews`)).status, 200);
});

test("reviews turn on only with a strong link secret; Keeri's secret is separate and optional", () => {
  assert.equal(loadReviewsConfig({}), null);
  assert.throws(() => loadReviewsConfig({ REVIEW_LINK_SECRET: "too-short" }));
  assert.deepEqual(loadReviewsConfig({ REVIEW_LINK_SECRET: linkSecret }), { linkSecret });
  assert.deepEqual(loadReviewsConfig({ REVIEW_LINK_SECRET: linkSecret, KEERI_DELIVERY_WEBHOOK_SECRET: keeriSecret }), { linkSecret, keeriDeliverySecret: keeriSecret });
  assert.throws(() => loadReviewsConfig({ REVIEW_LINK_SECRET: linkSecret, KEERI_DELIVERY_WEBHOOK_SECRET: "short" }));
  assert.throws(() => loadReviewsConfig({ REVIEW_LINK_SECRET: linkSecret, KEERI_DELIVERY_WEBHOOK_SECRET: linkSecret }));
  assert.throws(() => loadReviewsConfig({ KEERI_DELIVERY_WEBHOOK_SECRET: keeriSecret }));
});
