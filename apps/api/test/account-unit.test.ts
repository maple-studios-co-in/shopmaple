import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { orderDetailSchema, orderSummarySchema } from "@shopmaple/contracts/account";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import {
  clearSessionCookie,
  clearSignInNonceCookie,
  generateSignInCode,
  hashPassword,
  hashNetwork,
  hashSignInCode,
  maskEmail,
  newSessionToken,
  newSignInNonce,
  readSessionToken,
  readSignInNonce,
  sameCodeHash,
  sessionCookie,
  sessionTokenHash,
  signInLimitHit,
  signInLimitWindows,
  signInNonceCookie,
  signInNonceHash,
  verifyPassword,
  verifyRefusal,
} from "../src/account/security.js";
import { isLoopbackAddress, networkKey } from "../src/network.js";
import { customerOrderStatus, deliveryEstimate, maskPhone, orderJourney, toOrderDetail, toOrderSummary } from "../src/account/orders.js";
import { createSignInCodeSender, loadAccountConfig, loadAccountEmail, signInCodeEmail } from "../src/account/config.js";
import { createApp } from "../src/app.js";

// Customer accounts (owner's spec, 10 Nov 2026). These run without PostgreSQL; the database behaviour is in account-db.

test("a sign-in code is six digits drawn from the whole range, zero-padded", () => {
  const asked: Array<[number, number]> = [];
  const fixed = (value: number) => (min: number, max: number) => { asked.push([min, max]); return value; };
  assert.equal(generateSignInCode(fixed(42)), "000042");
  assert.equal(generateSignInCode(fixed(0)), "000000");
  assert.equal(generateSignInCode(fixed(999_999)), "999999");
  assert.deepEqual(asked, [[0, 1_000_000], [0, 1_000_000], [0, 1_000_000]], "every code from 000000 to 999999 is possible");
  const real = Array.from({ length: 40 }, () => generateSignInCode());
  assert.ok(real.every((code) => /^[0-9]{6}$/.test(code)));
  assert.ok(new Set(real).size > 30, "codes are random");
});

test("a stored code is a keyed hash bound to its challenge and email, compared in constant time and failing closed", () => {
  const stored = hashSignInCode("server-key-one", "challenge-1", "asha@example.com", "123456");
  assert.match(stored, /^[a-f0-9]{64}$/);
  assert.equal(stored.includes("123456"), false);
  assert.equal(hashSignInCode("server-key-one", "challenge-1", "asha@example.com", "123456"), stored, "deterministic");
  for (const other of [
    hashSignInCode("server-key-two", "challenge-1", "asha@example.com", "123456"),
    hashSignInCode("server-key-one", "challenge-2", "asha@example.com", "123456"),
    hashSignInCode("server-key-one", "challenge-1", "ravi@example.com", "123456"),
    hashSignInCode("server-key-one", "challenge-1", "asha@example.com", "123457"),
  ])
    assert.notEqual(other, stored);
  // A plain SHA-256 of a six-digit code is a lookup table away; the server key must matter.
  assert.notEqual(stored, createHash("sha256").update("123456").digest("hex"));
  assert.equal(sameCodeHash(stored, hashSignInCode("server-key-one", "challenge-1", "asha@example.com", "123456")), true);
  assert.equal(sameCodeHash(stored, hashSignInCode("server-key-one", "challenge-1", "asha@example.com", "654321")), false);
  for (const malformed of ["", "zz", stored.slice(2), stored + "00", "g".repeat(64)])
    assert.equal(sameCodeHash(malformed, stored), false, malformed);
});

test("a network is stored as a keyed hash, never as the address", () => {
  const hashed = hashNetwork("server-key-one", "203.0.113.7");
  assert.match(hashed, /^[a-f0-9]{64}$/);
  assert.equal(hashed.includes("203.0.113.7"), false);
  assert.equal(hashNetwork("server-key-one", "203.0.113.7"), hashed);
  assert.notEqual(hashNetwork("server-key-two", "203.0.113.7"), hashed, "keyed by the server secret");
  assert.notEqual(hashNetwork("server-key-one", "203.0.113.8"), hashed);
  assert.notEqual(hashed, hashSignInCode("server-key-one", "203.0.113.7", "", ""), "network and code hashes do not share a space");
});

test("a session token is 32 random bytes, and the database keeps only its SHA-256", () => {
  const token = newSessionToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(newSessionToken(), token);
  assert.equal(sessionTokenHash(token), createHash("sha256").update(token).digest("hex"));
});

test("a network is an IPv4 address or an IPv6 /64, and an IPv4-mapped address counts as its IPv4 network", () => {
  assert.equal(networkKey("203.0.113.7"), "203.0.113.7");
  for (const mapped of ["::ffff:203.0.113.7", "::FFFF:203.0.113.7", "::ffff:cb00:7107", "[::ffff:203.0.113.7]"])
    assert.equal(networkKey(mapped), "203.0.113.7", mapped);
  const sameHousehold = ["2001:db8:abcd:12::1", "2001:0db8:abcd:0012:ffff:ffff:ffff:ffff", "2001:db8:abcd:12:1:2:3:4", "[2001:db8:abcd:12::99]", "2001:db8:abcd:12::5%eth0"];
  assert.deepEqual(new Set(sameHousehold.map(networkKey)), new Set(["2001:db8:abcd:12::/64"]));
  assert.notEqual(networkKey("2001:db8:abcd:13::1"), networkKey("2001:db8:abcd:12::1"), "the next /64 is another network");
  assert.equal(networkKey("unknown"), "unknown");
  // The stored hash follows the network, not the address: a whole /64 is one network for every limit.
  assert.equal(hashNetwork("key", "2001:db8:abcd:12::1"), hashNetwork("key", "2001:db8:abcd:12:ffff::2"));
  assert.equal(hashNetwork("key", "::ffff:198.51.100.7"), hashNetwork("key", "198.51.100.7"));
  assert.notEqual(hashNetwork("key", "198.51.100.7"), hashNetwork("key", "198.51.100.8"));
});

test("loopback means 127.0.0.0/8 and ::1, in plain or IPv4-mapped form, and nothing else", () => {
  for (const loopback of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1", "0:0:0:0:0:0:0:1"]) assert.equal(isLoopbackAddress(loopback), true, loopback);
  for (const other of [undefined, "", "10.0.0.1", "::ffff:10.0.0.1", "::2", "2001:db8::1", "128.0.0.1", "unknown"]) assert.equal(isLoopbackAddress(other), false, String(other));
});

test("sign-in codes are limited per email and network (3 in 15 minutes), per email (10 a day), per network (10 an hour) and store-wide (300 an hour)", () => {
  const room = { emailNetwork15m: 2, emailDay: 9, networkHour: 9, storeHour: 299 };
  assert.equal(signInLimitHit(room), null);
  assert.equal(signInLimitHit({ ...room, emailNetwork15m: 3 }), "email", "a fourth code for this email from this network in 15 minutes");
  assert.equal(signInLimitHit({ ...room, emailDay: 10 }), "email", "an eleventh code for this email in a day");
  assert.equal(signInLimitHit({ ...room, networkHour: 10 }), "network", "an eleventh code from one network in an hour");
  assert.equal(signInLimitHit({ ...room, storeHour: 300 }), "store", "the store-wide hourly cap");
  const windows = signInLimitWindows(new Date("2026-11-11T12:00:00.000Z"));
  assert.deepEqual(
    { email15m: windows.email15m.toISOString(), emailDay: windows.emailDay.toISOString(), networkHour: windows.networkHour.toISOString() },
    { email15m: "2026-11-11T11:45:00.000Z", emailDay: "2026-11-10T12:00:00.000Z", networkHour: "2026-11-11T11:00:00.000Z" },
  );
});

test("the session cookie is host-only and Secure in production, HttpOnly and Lax on the root path for 30 days, and clears the same way", async () => {
  const app = express();
  app.get("/set/:mode", (req, res) => {
    const { name, value, options } = sessionCookie("a".repeat(64), req.params.mode === "production");
    res.cookie(name, value, options).end();
  });
  app.get("/clear/:mode", (req, res) => {
    const { name, options } = clearSessionCookie(req.params.mode === "production");
    res.clearCookie(name, options).end();
  });
  const cookie = async (path: string) => String((await request(app).get(path)).headers["set-cookie"]);
  const production = await cookie("/set/production");
  assert.match(production, new RegExp(`^__Host-maple_account=${"a".repeat(64)}; `));
  for (const flag of ["Max-Age=2592000", "Path=/", "HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(production.includes(flag), flag);
  assert.equal(/Domain=/i.test(production), false, "a __Host- cookie names no domain");
  const development = await cookie("/set/development");
  assert.match(development, /^maple_account=a{64}; /);
  assert.equal(development.includes("Secure"), false, "plain http on localhost");
  for (const flag of ["Max-Age=2592000", "Path=/", "HttpOnly", "SameSite=Lax"]) assert.ok(development.includes(flag), flag);
  const cleared = await cookie("/clear/production");
  assert.match(cleared, /^__Host-maple_account=; /);
  for (const flag of ["Path=/", "Expires=Thu, 01 Jan 1970 00:00:00 GMT", "HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(cleared.includes(flag), flag);
});

test("failed tries are budgeted: 20 an hour per network, and once an email has 10 in a day each new code gets one try", () => {
  assert.equal(verifyRefusal({ networkFailures: 19, emailFailures: 9, codeTried: true }), null);
  assert.equal(verifyRefusal({ networkFailures: 20, emailFailures: 0, codeTried: false }), "network");
  assert.equal(verifyRefusal({ networkFailures: 0, emailFailures: 10, codeTried: true }), "email", "this code already had its try");
  assert.equal(verifyRefusal({ networkFailures: 0, emailFailures: 10, codeTried: false }), null,
    "a code nobody has tried yet still gets one try, so outsiders cannot lock a customer out");
});

test("the sign-in cookie ties a code to the browser that asked for it: random, HttpOnly, Lax, root path, ten minutes", async () => {
  const nonce = newSignInNonce();
  assert.match(nonce, /^[a-f0-9]{64}$/);
  assert.notEqual(newSignInNonce(), nonce);
  assert.match(signInNonceHash(nonce), /^[a-f0-9]{64}$/);
  assert.notEqual(signInNonceHash(nonce), nonce, "only a hash is stored");
  assert.notEqual(signInNonceHash(nonce), sessionTokenHash(nonce), "kept apart from session hashes");
  const app = express();
  app.get("/set/:mode", (req, res) => {
    const { name, value, options } = signInNonceCookie(nonce, req.params.mode === "production");
    res.cookie(name, value, options).end();
  });
  app.get("/clear/:mode", (req, res) => {
    const { name, options } = clearSignInNonceCookie(req.params.mode === "production");
    res.clearCookie(name, options).end();
  });
  const cookie = async (path: string) => String((await request(app).get(path)).headers["set-cookie"]);
  const production = await cookie("/set/production");
  assert.match(production, new RegExp(`^__Host-maple_signin=${nonce}; `));
  for (const flag of ["Max-Age=600", "Path=/", "HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(production.includes(flag), flag);
  assert.equal(/Domain=/i.test(production), false);
  const development = await cookie("/set/development");
  assert.match(development, new RegExp(`^maple_signin=${nonce}; `));
  assert.equal(development.includes("Secure"), false);
  assert.match(await cookie("/clear/development"), /^maple_signin=; .*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.equal(readSignInNonce(`maple_account=${"a".repeat(64)}; maple_signin=${nonce}`, false), nonce);
  assert.equal(readSignInNonce(`__Host-maple_signin=${nonce}`, true), nonce);
  assert.equal(readSignInNonce(`maple_signin=${nonce}`, true), null, "production never reads the unprefixed name");
  assert.equal(readSignInNonce(`maple_account=${nonce}`, false), null, "a session cookie is not a sign-in cookie");
  assert.equal(readSignInNonce(`maple_signin=${nonce}; maple_signin=${newSignInNonce()}`, false), null, "ambiguous");
});

test("a session is read from exactly one well-formed cookie of the right name, never the plain name in production", () => {
  const token = "b".repeat(64);
  assert.equal(readSessionToken(`maple_cart=${"c".repeat(64)}; maple_account=${token}; theme=dark`, false), token);
  assert.equal(readSessionToken(`__Host-maple_account=${token}`, true), token);
  assert.equal(readSessionToken(`maple_account=${token}`, true), null, "a sibling domain could plant the unprefixed name");
  assert.equal(readSessionToken(`maple_account=${token}; maple_account=${"d".repeat(64)}`, false), null, "ambiguous");
  for (const bad of [undefined, "", "maple_account=", `maple_account=${"B".repeat(64)}`, `maple_account=${token}x`, `maple_account=${"b".repeat(63)}`])
    assert.equal(readSessionToken(bad, false), null, String(bad));
});

test("an email in a log keeps only its first letter and domain", () => {
  assert.equal(maskEmail("asha.rao@example.com"), "a***@example.com");
  assert.equal(maskEmail("x@example.in"), "x***@example.in");
});

test("an order's status is confirmed only once Keeri accepted it; any other paid order is still being confirmed", () => {
  const delivered = { state: "delivered", externalOrderId: "SO-1001", deliveredAt: new Date() };
  assert.equal(customerOrderStatus("captured", delivered), "confirmed");
  assert.equal(customerOrderStatus("captured", { ...delivered, externalOrderId: null }), "confirming");
  for (const state of ["pending", "processing", "failed"]) assert.equal(customerOrderStatus("captured", { ...delivered, state }), "confirming", state);
  assert.equal(customerOrderStatus("captured", null), "confirming");
  assert.equal(customerOrderStatus("paid_hold_lapsed", delivered), "confirming", "a lapsed hold is confirmed by hand");
});

const customer = { name: "Asha Rao", email: "asha@example.com", phone: "+919876543210" };
const shipping = { line1: "12 Lake Road", line2: "Flat 4", city: "Pune", stateCode: "27", pincode: "411001", country: "IN" as const };
function snapshot(overrides: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
  return {
    version: 2, currency: "INR", policyId: "fixture-v1", quoteId: "quote_1", expiresAt: "2026-11-10T09:40:00.000Z",
    customer, billingAddress: shipping, shippingAddress: shipping, deliveryMethodId: "standard", gstMode: "included",
    items: [
      { variantId: "keeri:maple:sofa-oat", productId: "keeri:maple:sofa", title: "Arlo Sofa", variantTitle: "Oat", sku: "ARLO-OAT",
        quantity: 1, unitPricePaise: 4_200_000, lineTotalPaise: 4_200_000, hsn: "9401", taxRateBps: 1800,
        fulfilment: { kind: "made_to_order", leadTimeDays: 14 } },
      { variantId: "keeri:maple:table-walnut", productId: "keeri:maple:table", title: "Pebble Side Table", variantTitle: "Walnut", sku: null,
        quantity: 2, unitPricePaise: 150_000, lineTotalPaise: 300_000, hsn: "9403", taxRateBps: 1800,
        fulfilment: { kind: "stocked", leadTimeDays: null } },
    ],
    subtotalPaise: 4_500_000, shippingPaise: 50_000, taxPaise: 694_068, totalPaise: 4_550_000,
    delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
      carrier: { provider: "shiprocket", courierId: 51, courierName: "Delhivery Surface", estimatedDays: 6, chargeWeightGrams: 60_000 } },
    ...overrides,
  };
}

test("the delivery estimate adds the longest making time and the courier's days to the payment day in India", () => {
  // 09:30 UTC is 15:00 in India, still 10 November: making 14 days + 6 in transit.
  assert.deepEqual(deliveryEstimate(snapshot(), new Date("2026-11-10T09:30:00Z")), { from: "2026-11-30", to: "2026-12-04" });
  const stocked = snapshot({ items: [snapshot().items[1]!] });
  assert.deepEqual(deliveryEstimate(stocked, new Date("2026-11-10T09:30:00Z")), { from: "2026-11-16", to: "2026-11-20" });
  // 20:00 UTC on the 10th is 01:30 on the 11th in India.
  assert.deepEqual(deliveryEstimate(stocked, new Date("2026-11-10T20:00:00Z")), { from: "2026-11-17", to: "2026-11-21" });
  const carrier = snapshot().delivery!.carrier!;
  for (const [name, unknown] of [
    ["no courier estimate", snapshot({ delivery: { ...snapshot().delivery!, carrier: { ...carrier, estimatedDays: null } } })],
    ["no delivery line", snapshot({ delivery: undefined })],
    ["an item frozen before fulfilment was stated", snapshot({ items: [{ ...snapshot().items[0]!, fulfilment: undefined }] })],
  ] as const)
    assert.equal(deliveryEstimate(unknown, new Date("2026-11-10T09:30:00Z")), null, name);
});

test("the journey shows Confirmed when it is true and Preparing, Dispatched and Delivered as upcoming", () => {
  const confirmedAt = new Date("2026-11-10T09:31:00Z");
  assert.deepEqual(orderJourney("confirmed", confirmedAt), [
    { key: "confirmed", label: "Confirmed", state: "done", at: "2026-11-10T09:31:00.000Z" },
    { key: "preparing", label: "Preparing", state: "upcoming", at: null },
    { key: "dispatched", label: "Dispatched", state: "upcoming", at: null },
    { key: "delivered", label: "Delivered", state: "upcoming", at: null },
  ]);
  assert.deepEqual(orderJourney("confirming", null).map((step) => [step.key, step.state, step.at]), [
    ["confirmed", "current", null], ["preparing", "upcoming", null], ["dispatched", "upcoming", null], ["delivered", "upcoming", null],
  ]);
});

test("a paid attempt becomes the summary and detail the account pages show, within the contract", () => {
  const order = {
    orderNumber: 10482, state: "captured", capturedAt: new Date("2026-11-10T09:30:00Z"), paymentId: "pay_Fixture123",
    snapshot: snapshot(), outbox: { state: "delivered", externalOrderId: "SO-1001", deliveredAt: new Date("2026-11-10T09:31:00Z") },
  };
  const images = new Map([["keeri:maple:sofa-oat", "https://store.maplefurnishers.com/media/keeri/arlo.webp"]]);
  const summary = toOrderSummary(order, images);
  assert.deepEqual(orderSummarySchema.parse(summary), {
    number: "MF-10482", placedAt: "2026-11-10T09:30:00.000Z", status: "confirmed", statusLabel: "Confirmed", itemCount: 3,
    totalPaise: 4_550_000, firstItem: { title: "Arlo Sofa", variant: "Oat", imageUrl: "https://store.maplefurnishers.com/media/keeri/arlo.webp" },
  });
  const detail = orderDetailSchema.parse(toOrderDetail(order, images));
  assert.deepEqual(detail.items, [
    { title: "Arlo Sofa", variant: "Oat", quantity: 1, linePaise: 4_200_000, imageUrl: "https://store.maplefurnishers.com/media/keeri/arlo.webp" },
    { title: "Pebble Side Table", variant: "Walnut", quantity: 2, linePaise: 300_000, imageUrl: null },
  ]);
  // Masked on the server: whoever owns a mistyped checkout email must not read the buyer's whole number.
  assert.deepEqual(detail.delivery, { name: "Asha Rao", line1: "12 Lake Road", line2: "Flat 4", city: "Pune", state: "27", pin: "411001", phone: "+91 ••••• •3210" });
  assert.deepEqual(detail.totals, { subtotalPaise: 4_500_000, deliveryPaise: 50_000, taxPaise: 694_068, totalPaise: 4_550_000, taxIncluded: true });
  assert.deepEqual(detail.payment, { label: "Paid online", reference: "pay_Fixture123" });
  assert.deepEqual(detail.estimate, { from: "2026-11-30", to: "2026-12-04" });
  assert.equal(detail.journey[0]!.at, "2026-11-10T09:31:00.000Z");
  const excluded = orderDetailSchema.parse(toOrderDetail({ ...order, state: "paid_hold_lapsed", outbox: null, snapshot: snapshot({ gstMode: "excluded" }) }, new Map()));
  assert.equal(excluded.totals.taxIncluded, false);
  assert.equal(excluded.status, "confirming");
  assert.equal(excluded.statusLabel, "Confirming");
  assert.equal(excluded.journey[0]!.state, "current");
  assert.equal(excluded.firstItem.imageUrl, null);
});

test("a delivery phone shows only its last four digits, in the form the order page prints", () => {
  assert.equal(maskPhone("+919876543210"), "+91 ••••• •3210");
  assert.equal(maskPhone("+916000000001"), "+91 ••••• •0001");
  assert.equal(maskPhone("98765 43210"), "•••• 3210", "anything not in the +91 form keeps only its last four digits");
  assert.equal(maskPhone("12"), "••••");
});

const mail = { ENQUIRY_RESEND_API_KEY: "re_test_accounts", ENQUIRY_MAIL_FROM: "orders@maple.example.com", ENQUIRY_MAIL_TO: "staff@maple.example.com", WEB_ORIGIN: "https://store.maple.example.com" };
test("accounts are on by default only in development and test; anything else, unset included, is production and fails closed", () => {
  const secret = "s".repeat(40);
  const live = { NODE_ENV: "production", CUSTOMER_ACCOUNTS_ENABLED: "true", ACCOUNT_CODE_SECRET: secret, API_TRUST_PROXY_LOOPBACK: "true", ...mail };
  assert.equal(loadAccountConfig({}), null, "NODE_ENV unset counts as production: off");
  assert.equal(loadAccountConfig({ NODE_ENV: "staging" }), null);
  assert.equal(loadAccountConfig({ NODE_ENV: "production" }), null);
  assert.equal(loadAccountConfig({ NODE_ENV: "production", ACCOUNT_CODE_SECRET: secret }), null, "a secret alone does not switch accounts on");
  assert.equal(loadAccountConfig({ NODE_ENV: "development", CUSTOMER_ACCOUNTS_ENABLED: "false" }), null);
  const development = loadAccountConfig({ NODE_ENV: "development" });
  assert.ok(development?.codeSecret, "a local default key");
  assert.equal(development?.production, false);
  assert.equal(development?.email, null, "development may run without mail (codes go to the console)");
  assert.equal(loadAccountConfig({ NODE_ENV: "test" })?.production, false);
  assert.throws(() => loadAccountConfig({ CUSTOMER_ACCOUNTS_ENABLED: "true" }), /ACCOUNT_CODE_SECRET/, "unset NODE_ENV gets production's rules");
  assert.throws(() => loadAccountConfig({ ...live, ACCOUNT_CODE_SECRET: "short" }), /ACCOUNT_CODE_SECRET/);
  const { ENQUIRY_RESEND_API_KEY: _key, ENQUIRY_MAIL_FROM: _from, ENQUIRY_MAIL_TO: _to, ...withoutMail } = live;
  assert.throws(() => loadAccountConfig(withoutMail), /ORDER_RESEND_API_KEY/, "production must be able to email codes");
  assert.throws(() => loadAccountConfig({ ...live, API_TRUST_PROXY_LOOPBACK: "false" }), /API_TRUST_PROXY_LOOPBACK/,
    "without the trusted local proxy every visitor would count as one network");
  const production = loadAccountConfig(live);
  assert.equal(production?.codeSecret, secret);
  assert.equal(production?.production, true);
  assert.equal(production?.email?.from, "orders@maple.example.com");
  assert.throws(() => loadAccountConfig({ NODE_ENV: "development", CUSTOMER_ACCOUNTS_ENABLED: "yes" }), /CUSTOMER_ACCOUNTS_ENABLED/);
  assert.notEqual(development?.codeSecret, secret);
});

test("the global limit skips only loopback calls without X-Forwarded-For: the storefront's own server-side reads", async () => {
  // Never connects: the probe path is a 404 that touches no table.
  const unused = new PrismaClient({ datasources: { db: { url: "postgresql://unused:unused@127.0.0.1:1/unused" } } });
  const server = createApp(unused, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false, trustProxyLoopback: true }).listen(0);
  try {
    const probe = (forwarded?: string) => {
      const call = request(server).get("/api/limiter-probe");
      return forwarded ? call.set("X-Forwarded-For", forwarded) : call;
    };
    const local: number[] = [];
    for (let i = 0; i < 305; i++) local.push((await probe()).status);
    assert.equal(local.filter((status) => status === 429).length, 0, "Next's server-side reads from this host are not one shared bucket");
    const visitor: number[] = [];
    for (let i = 0; i < 301; i++) visitor.push((await probe("203.0.113.9")).status);
    assert.equal(visitor.at(-1), 429, "a proxied visitor keeps the 300-a-minute limit");
    assert.equal(visitor.filter((status) => status === 429).length, 1);
    assert.equal((await probe("127.0.0.1")).status, 404, "any X-Forwarded-For, even loopback's, is a proxied request with its own bucket");
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
test("sign-in mail uses the order sender, falling back to the enquiry one, and refuses a half-configured sender", () => {
  assert.equal(loadAccountEmail({}), null);
  assert.equal(loadAccountEmail(mail)?.from, "orders@maple.example.com");
  assert.equal(loadAccountEmail({ ...mail, ORDER_MAIL_FROM: "accounts@maple.example.com" })?.from, "accounts@maple.example.com");
  assert.throws(() => loadAccountEmail({ ENQUIRY_RESEND_API_KEY: "re_test_accounts", WEB_ORIGIN: mail.WEB_ORIGIN }));
});

test("without a mail service a development API logs the code with a masked email; production never logs a code", async () => {
  const lines: string[] = [];
  await createSignInCodeSender(null, { production: false, log: (line) => lines.push(line) })({ challengeId: "c1", to: "asha.rao@example.com", code: "482913" });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /482913/);
  assert.match(lines[0]!, /a\*\*\*@example\.com/);
  assert.equal(lines[0]!.includes("asha.rao"), false, "no personal data in logs");
  const productionLines: string[] = [];
  await createSignInCodeSender(null, { production: true, log: (line) => productionLines.push(line) })({ challengeId: "c2", to: "asha@example.com", code: "771204" });
  assert.equal(productionLines.some((line) => line.includes("771204")), false);
});

test("with a mail service the code goes out once through Resend, keyed to its challenge, and only in the body", async () => {
  const posts: Array<{ url: string; key: string | null; body: { to: string[]; subject: string; text: string } }> = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    posts.push({ url: String(url), key: new Headers(init?.headers).get("idempotency-key"), body: JSON.parse(String(init?.body)) });
    return Response.json({ id: "00000000-0000-4000-8000-000000000001" });
  }) as typeof globalThis.fetch;
  const logged: string[] = [];
  const send = createSignInCodeSender(loadAccountEmail(mail), { production: true, fetch, log: (line) => logged.push(line) });
  await send({ challengeId: "8d4f9b7e-1c2a-4f3e-9a6b-5c4d3e2f1a0b", to: "asha@example.com", code: "305118" });
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.url, "https://api.resend.com/emails");
  assert.equal(posts[0]!.key, "signin/8d4f9b7e-1c2a-4f3e-9a6b-5c4d3e2f1a0b");
  assert.deepEqual(posts[0]!.body.to, ["asha@example.com"]);
  assert.match(posts[0]!.body.text, /305118/);
  assert.match(posts[0]!.body.text, /10 minutes/);
  assert.equal(posts[0]!.body.subject.includes("305118"), false, "lock screens show subjects");
  assert.equal(logged.length, 0);
});

test("a password is kept as salted scrypt in a versioned form, matched exactly, and never by a missing or broken hash", async () => {
  const stored = await hashPassword("maple2026");
  assert.match(stored, /^scrypt\$15\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(await hashPassword("maple2026"), stored, "a new salt each time");
  assert.equal(stored.includes("maple2026"), false);
  assert.equal(await verifyPassword("maple2026", stored), true);
  for (const wrong of ["maple2027", "Maple2026", "maple2026 ", " maple2026", ""]) assert.equal(await verifyPassword(wrong, stored), false, JSON.stringify(wrong));
  // The same text typed on another keyboard (decomposed é) still matches.
  assert.equal(await verifyPassword("café-2026", await hashPassword("café-2026")), true);
  for (const broken of [null, "", "plain-text", stored.replace("scrypt$15", "scrypt$30"), stored.replace("scrypt$15$8$3", "scrypt$15$8$9x"), stored.slice(0, -2)])
    assert.equal(await verifyPassword("maple2026", broken), false, String(broken));
});

test("a missing account costs the same work as a wrong password, so the time taken tells nothing", async () => {
  const stored = await hashPassword("maple2026");
  await verifyPassword("warm", null); // the decoy is made once
  const time = async (run: () => Promise<boolean>) => { const at = performance.now(); await run(); return performance.now() - at; };
  const wrong = await time(() => verifyPassword("maple2027", stored));
  const missing = await time(() => verifyPassword("maple2027", null));
  assert.ok(missing > wrong / 3 && missing < wrong * 3, `wrong ${wrong.toFixed(0)}ms, missing ${missing.toFixed(0)}ms`);
});

test("the code email's words follow why it was asked for, and the code never reaches the subject", () => {
  const signIn = signInCodeEmail("305118", "https://store.example");
  assert.equal(signIn.subject, "Your Maple Furnishers sign-in code");
  const signUp = signInCodeEmail("305118", "https://store.example", "sign-up");
  assert.equal(signUp.subject, "Confirm your email for Maple Furnishers");
  assert.match(signUp.text, /finish creating your Maple account/);
  const existing = signInCodeEmail("305118", "https://store.example", "sign-up", true);
  assert.match(existing.text, /already have a Maple account/);
  const reset = signInCodeEmail("305118", "https://store.example", "reset");
  assert.equal(reset.subject, "Reset your Maple Furnishers password");
  assert.match(reset.text, /new password/);
  for (const message of [signIn, signUp, existing, reset]) {
    assert.match(message.text, /305118/);
    assert.match(message.text, /10 minutes/);
    assert.equal(message.subject.includes("305118"), false, "lock screens show subjects");
  }
});
