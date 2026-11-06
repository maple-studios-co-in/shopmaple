import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { reviewSubmissionSchema } from "@shopmaple/contracts/reviews";
import { enquiryAdminQuerySchema, enquiryInputSchema, enquiryAdminSummarySchema } from "@shopmaple/contracts";
import sharp from "sharp";
import request from "supertest";
import { createApp } from "../src/app.js";
import { saveEnquiry } from "../src/enquiries.js";
import { loadKeeriReviewsConfig, type KeeriReviewsConfig } from "../src/reviews.js";

// No database and no Keeri: the store's catalogue and enquiries are stubs and Keeri is a recording double. The real
// Express app, its validation and sharp all run.
const origin = "http://localhost:3000";
const tenant = "keeri:tenant-1";
const linked = {
  id: `${tenant}:model-1`, title: "Nola Accent Chair",
  identities: [{ source: "shopify", externalId: "gid-1" }, { source: tenant, externalId: `${tenant}:model-1` }],
  variants: [{ id: "walnut", title: "Walnut", sku: "NOLA-W", identities: [{ source: tenant, externalId: `${tenant}:variant-9` }] }],
};
const unlinked = { id: "shopify-1", title: "Shopify Only Sofa", identities: [{ source: "shopify", externalId: "gid-2" }], variants: [{ id: "plain", title: "Plain", sku: null, identities: [] }] };

function stubDb(product: unknown = linked) {
  const enquiries: Record<string, unknown>[] = [], deliveries: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    contact: { findUnique: async () => null, create: async () => ({ id: "ct_1" }) },
    enquiry: { create: async ({ data }: { data: Record<string, unknown> }) => { enquiries.push(data); return data; }, findFirst: async () => null },
    enquiryDelivery: { create: async ({ data }: { data: unknown }) => { deliveries.push(data); return data; } },
  };
  const db = { ...tx, product: { findFirst: async ({ where }: { where: { handle: string } }) => (where.handle === "missing" ? null : product) }, $transaction: async (run: (client: typeof tx) => unknown) => run(tx) };
  return { db: db as unknown as PrismaClient, enquiries, deliveries };
}

function fakeKeeri(respond: (call: { url: string; init: RequestInit }) => Response | Promise<Response> = () => Response.json({ id: "rev_1" }, { status: 201 })) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fetchDouble = (async (url: URL | string, init: RequestInit) => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return respond({ url: String(url), init });
  }) as typeof fetch;
  const config: KeeriReviewsConfig = { origin: "https://keeri.example", token: "t".repeat(40), fetch: fetchDouble };
  return { config, calls };
}

const review = (extra: Record<string, unknown> = {}) => ({
  handle: "nola-accent-chair", variantId: "walnut", rating: 4, title: "Beautiful chair", body: "It looks wonderful by the window.",
  displayName: "Anushka", email: "Reader@Example.Invalid", photos: [], ...extra,
});
function client(db: PrismaClient, keeri: KeeriReviewsConfig | null) {
  return request(createApp(db, { webOrigin: origin, catalogMode: "preview", secureCookies: false, keeriReviews: keeri }));
}
const post = (http: ReturnType<typeof client>, body: object, key: string = randomUUID()) =>
  http.post("/api/reviews").set("Origin", origin).set("Idempotency-Key", key).send(body);

async function capture(run: () => Promise<void>) {
  const lines: string[] = [];
  const previous = { warn: console.warn, error: console.error, log: console.log };
  for (const name of ["warn", "error", "log"] as const) console[name] = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try { await run(); } finally { Object.assign(console, previous); }
  return lines;
}

test("a review of a piece Keeri knows goes to Keeri, once, with Keeri's own ids and the private credential", async () => {
  const { db, enquiries } = stubDb();
  const keeri = fakeKeeri();
  const key = randomUUID();
  const result = await post(client(db, keeri.config), review(), key);
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { status: "received" }, "nothing about the customer or Keeri comes back");
  assert.match(String(result.headers["cache-control"]), /no-store/);
  assert.equal(keeri.calls.length, 1);
  const call = keeri.calls[0]!;
  assert.equal(call.url, "https://keeri.example/api/storefront/reviews");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.redirect, "error");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${"t".repeat(40)}`);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["Idempotency-Key"], key, "a retried form cannot create a second review");
  assert.deepEqual(call.body, {
    modelId: "model-1", variantId: "variant-9", rating: 4, title: "Beautiful chair", body: "It looks wonderful by the window.",
    reviewerName: "Anushka", reviewerEmail: "reader@example.invalid", city: null, reviewedAt: new Date().toISOString().slice(0, 10), source: "other", photos: [],
  });
  assert.equal(enquiries.length, 0, "nothing is kept at the store when Keeri has it");
});

test("photos are re-made as plain WebP before they leave: size bounded, location and camera data gone", async () => {
  const { db } = stubDb();
  const keeri = fakeKeeri();
  const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#80241c" } })
    .withExif({ IFD3: { GPSLatitude: "28/1 36/1 0/1", GPSLongitude: "77/1 12/1 0/1" }, IFD0: { Make: "Secret Camera" } })
    .jpeg().toBuffer();
  assert.ok((await sharp(original).metadata()).exif, "the test photo really carries metadata");
  const result = await post(client(db, keeri.config), review({ photos: [original.toString("base64")] }));
  assert.equal(result.status, 201);
  const [photo] = keeri.calls[0]!.body.photos as { contentType: string; data: string; width: number; height: number }[];
  assert.equal(photo!.contentType, "image/webp");
  const bytes = Buffer.from(photo!.data, "base64");
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined, "no location or camera data reaches Keeri");
  assert.ok(Math.max(meta.width!, meta.height!) <= 2048, "bounded dimensions");
  assert.deepEqual([photo!.width, photo!.height], [meta.width, meta.height]);
});

test("what is not a real picture is refused in words, before anything is sent", async () => {
  const { db, enquiries } = stubDb();
  const keeri = fakeKeeri();
  const http = client(db, keeri.config);
  const notImage = await post(http, review({ photos: [Buffer.from("<svg onload=alert(1)>").toString("base64")] }));
  assert.equal(notImage.status, 400);
  assert.equal(notImage.body.code, "REVIEW_PHOTO_INVALID");
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
  const wrongType = await post(http, review({ photos: [gif.toString("base64")] }));
  assert.equal(wrongType.status, 400);
  assert.equal(keeri.calls.length, 0);
  assert.equal(enquiries.length, 0);
});

test("the contract bounds every field, as Keeri's own review schema does, and refuses anything extra", async () => {
  const { db } = stubDb();
  const keeri = fakeKeeri();
  for (const bad of [
    { rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: "5" }, { title: "" }, { title: "x".repeat(121) }, { title: "bad\u0000title" }, { body: " " }, { body: "x".repeat(2001) },
    { displayName: "" }, { displayName: "x".repeat(61) }, { email: "not-an-email" }, { handle: "" }, { verifiedBuyer: true }, { source: "online_order" },
    { photos: Array(6).fill("aGk=") }, { photos: ["not base64!"] }, { photos: ["x".repeat(2_600_001)] },
  ]) {
    // A new app each time: this test is about the contract, not the hourly limit.
    const result = await post(client(db, keeri.config), review(bad));
    assert.equal(result.status, 400, JSON.stringify(bad).slice(0, 60));
    assert.equal(result.body.code, "INVALID_INPUT");
  }
  assert.equal((await post(client(db, keeri.config), review(), "not-a-uuid")).status, 400, "the idempotency key is required and a UUID");
  assert.equal(keeri.calls.length, 0);
  assert.equal(reviewSubmissionSchema.safeParse(review({ title: "x".repeat(120), body: "y\nz", displayName: "x".repeat(60), photos: Array(5).fill("aGk=") })).success, true);
});

test("a request from another site is turned away before its body is read", async () => {
  const { db } = stubDb();
  const keeri = fakeKeeri();
  const result = await client(db, keeri.config).post("/api/reviews").set("Origin", "https://elsewhere.example").set("Idempotency-Key", randomUUID()).send(review());
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "ORIGIN_REJECTED");
  assert.equal(keeri.calls.length, 0);
});

test("a body the size of a full form with five photos fits; a larger one is refused cleanly", async () => {
  const { db } = stubDb();
  const keeri = fakeKeeri();
  const http = client(db, keeri.config);
  const tooLarge = await http.post("/api/reviews").set("Origin", origin).set("Idempotency-Key", randomUUID()).send({ ...review(), photos: Array(5).fill("A".repeat(2_400_000)) });
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.body.code, "REQUEST_TOO_LARGE");
});

test("an unknown piece is a 404, and nothing is saved or sent", async () => {
  const { db, enquiries } = stubDb();
  const keeri = fakeKeeri();
  const result = await post(client(db, keeri.config), review({ handle: "missing" }));
  assert.equal(result.status, 404);
  assert.equal(result.body.code, "PRODUCT_NOT_FOUND");
  assert.equal(keeri.calls.length, 0);
  assert.equal(enquiries.length, 0);
});

test("a choice of finish that is not this piece's is left out rather than sent on", async () => {
  const { db } = stubDb();
  const keeri = fakeKeeri();
  await post(client(db, keeri.config), review({ variantId: "someone-elses" }));
  assert.equal(keeri.calls[0]!.body.variantId, null);
});

// Keeri can refuse (a review with no order line, say) or be away, and a piece may have no Keeri model at all. The customer
// wrote it either way, so it is kept where the team already works rather than lost.
for (const [name, product, keeriFor] of [
  ["no credential on this server yet", linked, () => null],
  ["a Shopify-only listing with no Keeri model", unlinked, () => fakeKeeri().config],
  ["Keeri refusing it", linked, () => fakeKeeri(() => Response.json({ error: "order line required" }, { status: 422 })).config],
  ["Keeri unavailable", linked, () => fakeKeeri(() => new Response(null, { status: 503 })).config],
  ["Keeri unreachable", linked, () => fakeKeeri(() => { throw new Error("socket hang up reader@example.invalid"); }).config],
] as const) test(`with ${name}, the review is kept in the admin's inbox and the customer still gets their thank-you`, async () => {
  const { db, enquiries, deliveries } = stubDb(product);
  const key = randomUUID();
  let result!: request.Response;
  const lines = await capture(async () => { result = await post(client(db, keeriFor()), review({ title: "Private title", body: "Private body" }), key); });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { status: "received" });
  assert.equal(enquiries.length, 1);
  const saved = enquiries[0]!;
  assert.equal(saved.kind, "review");
  assert.equal(saved.name, "Anushka");
  assert.equal(saved.email, "reader@example.invalid");
  assert.match(String(saved.message), /Rating: 4 out of 5/);
  assert.match(String(saved.message), /Title: Private title/);
  assert.match(String(saved.message), /Private body/);
  assert.equal((saved.context as { product: string }).product, (product as typeof linked).title);
  assert.equal(deliveries.length, 0, "no email alert is configured in this test");
  const logged = lines.join("\n");
  assert.doesNotMatch(logged, /reader@example\.invalid|Private title|Private body|Anushka/i, "no customer words in the server log");
});

test("a kept review says how many photos it came with, as they cannot be kept in the inbox", async () => {
  const { db, enquiries } = stubDb(unlinked);
  const photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  await post(client(db, null), review({ photos: [photo.toString("base64"), photo.toString("base64")] }));
  assert.match(String(enquiries[0]!.message), /Photos: 2 sent with the review, not kept here/);
});

test("when neither Keeri nor the store can take it, the customer is told to try again", async () => {
  const { db } = stubDb();
  (db as unknown as { $transaction: () => Promise<never> }).$transaction = async () => { throw new Error("database away"); };
  const keeri = fakeKeeri(() => new Response(null, { status: 503 }));
  let result!: request.Response;
  await capture(async () => { result = await post(client(db, keeri.config), review()); });
  assert.equal(result.status, 500);
});

test("the form cannot be used to flood Keeri: ten reviews an hour from one connection", async () => {
  const { db } = stubDb();
  const keeri = fakeKeeri();
  const http = client(db, keeri.config);
  for (let index = 0; index < 10; index += 1) assert.equal((await post(http, review())).status, 201);
  const refused = await post(http, review());
  assert.equal(refused.status, 429);
  assert.equal(refused.body.code, "TOO_MANY_REVIEWS");
  assert.equal(keeri.calls.length, 10);
});

test("only a few reviews are worked on at once: photos and Keeri's reply take real resources", async () => {
  const { db } = stubDb();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const keeri = fakeKeeri(async () => { await held; return Response.json({}, { status: 201 }); });
  const http = client(db, keeri.config);
  const running = Array.from({ length: 4 }, () => post(http, review()).then((result) => result));
  while (keeri.calls.length < 4) await new Promise((resolve) => setTimeout(resolve, 5));
  const fifth = await post(http, review());
  assert.equal(fifth.status, 503);
  assert.equal(fifth.body.code, "REVIEWS_BUSY");
  release();
  assert.deepEqual((await Promise.all(running)).map((result) => result.status), [201, 201, 201, 201]);
  assert.equal((await post(http, review())).status, 201, "and the slots come free again");
});

test("the Keeri connection is off until its private credential is present and well formed", () => {
  assert.equal(loadKeeriReviewsConfig({}), null);
  assert.equal(loadKeeriReviewsConfig({ KEERI_ORIGIN: "https://keeri.example" }), null);
  assert.equal(loadKeeriReviewsConfig({ KEERI_REVIEWS_TOKEN: "t".repeat(40) }), null);
  assert.equal(loadKeeriReviewsConfig({ KEERI_ORIGIN: "http://keeri.example", KEERI_REVIEWS_TOKEN: "t".repeat(40) }), null, "HTTPS only");
  assert.equal(loadKeeriReviewsConfig({ KEERI_ORIGIN: "https://keeri.example", KEERI_REVIEWS_TOKEN: "short" }), null);
  assert.deepEqual(loadKeeriReviewsConfig({ KEERI_ORIGIN: "https://keeri.example", KEERI_REVIEWS_TOKEN: "t".repeat(40) }), { origin: "https://keeri.example", token: "t".repeat(40) });
});

// ---- The newsletter's signups, through the enquiry contract ----

test("a newsletter signup is an email alone, kept for the admin's inbox with no staff alert", async () => {
  const { db, enquiries, deliveries } = stubDb();
  const config = { fingerprint: "f" } as never;
  const result = await saveEnquiry(db, { kind: "newsletter", email: "Reader@Example.Invalid" }, randomUUID(), config);
  assert.equal(result.created, true);
  assert.equal(enquiries[0]!.kind, "newsletter");
  assert.equal(enquiries[0]!.email, "reader@example.invalid");
  assert.equal(deliveries.length, 0, "a signup does not email the team");
});

test("a kept review does alert the team, as it needs a person to look at it", async () => {
  const { db, deliveries } = stubDb();
  await saveEnquiry(db, { kind: "review", name: "A", email: "a@example.invalid", message: "Rating: 5 out of 5" }, randomUUID(), { fingerprint: "f" } as never);
  assert.equal(deliveries.length, 1);
});

test("signing up twice with one address is one signup, and the reply gives away nothing about who has signed up", async () => {
  const { db, enquiries } = stubDb();
  const stubbed = db as unknown as { enquiry: { findFirst: (query: { where: { kind: string; email: string } }) => Promise<unknown> } };
  stubbed.enquiry.findFirst = async ({ where }) => enquiries.find((row) => row.kind === where.kind && row.email === where.email) ?? null;
  const first = await saveEnquiry(db, { kind: "newsletter", email: "reader@example.invalid" }, randomUUID());
  const second = await saveEnquiry(db, { kind: "newsletter", email: "READER@example.invalid" }, randomUUID());
  assert.equal(second.created, true, "the same status as a first signup");
  assert.notEqual(second.receipt.reference, first.receipt.reference, "and not the first signup's reference");
  assert.match(second.receipt.reference, /^enq_[a-f0-9-]{36}$/);
  assert.equal(enquiries.length, 1);
});

test("the admin's contracts accept the two new kinds, or a signup would break the inbox", () => {
  for (const kind of ["newsletter", "review"]) {
    assert.equal(enquiryInputSchema.safeParse({ kind, email: "a@example.invalid" }).success, true, kind);
    assert.equal(enquiryAdminQuerySchema.safeParse({ kind }).success, true, kind);
    assert.deepEqual(enquiryAdminSummarySchema.shape.kind.options.includes(kind as never), true, kind);
  }
});
