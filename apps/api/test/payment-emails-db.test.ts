import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { loadEnquiryDeliveryConfig } from "../src/enquiry-delivery-provider.js";
import { createOrderNotifications } from "../src/orders/notifications.js";

// When the buyer's payment emails are due (orders/notifications.ts), against the real queries: checkouts and Razorpay
// reports are written straight to the dedicated test database, under a merchant scope no other test uses.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
const scope = "maple:payment-emails";
const elsewhere = "maple:payment-emails-other";
const email = loadEnquiryDeliveryConfig({
  ENQUIRY_DELIVERY_ENABLED: "true",
  ENQUIRY_RESEND_API_KEY: "re_unit_test",
  ENQUIRY_MAIL_FROM: "orders@maple.example.com",
  ENQUIRY_MAIL_TO: "staff@maple.example.com",
  WEB_ORIGIN: "https://store.maple.example.com",
})!;

// The service's clock, a minute ahead of the database's so rows it writes are due at once; reports are dated from it.
let now = new Date();
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };

const address = { line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", stateCode: "29", pincode: "560001", country: "IN" };
const snapshot = (buyer: string) => ({
  version: 2, currency: "INR", policyId: "policy-v1", quoteId: "quote_unit", expiresAt: "2026-11-10T06:00:00.000Z",
  customer: { name: "Aditi Sharma", email: buyer, phone: "+919876543210" },
  billingAddress: address, shippingAddress: address, deliveryMethodId: "standard", gstMode: "included",
  items: [{
    variantId: "keeri:maple:nola-oak", productId: "keeri:maple:nola", title: "Nola Accent Chair", variantTitle: "Natural cane · Oak finish",
    sku: null, quantity: 1, unitPricePaise: 2490000, lineTotalPaise: 2490000, hsn: "9401", taxRateBps: 1800,
    fulfilment: { kind: "stocked", leadTimeDays: null },
  }],
  subtotalPaise: 2490000, shippingPaise: 150000, taxPaise: 402712, totalPaise: 2640000,
});

let serial = 0;
type Checkout = Awaited<ReturnType<typeof checkout>>;
/** A checkout whose Razorpay order exists; by default awaiting payment, opened half an hour ago by its own buyer. */
async function checkout(changes: { state?: string; cartId?: string; buyer?: string; createdAt?: Date; captured?: boolean; v1?: boolean; merchantScope?: string } = {}) {
  const n = ++serial;
  const buyer = changes.buyer ?? `buyer${n}@example.com`;
  return db.checkoutAttempt.create({
    data: {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      cartId: changes.cartId ?? `payment-emails-cart-${n}`,
      merchantScope: changes.merchantScope ?? scope,
      idempotencyKey: `key-${n}`,
      receipt: `sm_payment_emails_${n}`,
      snapshot: changes.v1 ? { version: 1, items: [] } : snapshot(buyer),
      amountPaise: 2640000,
      state: changes.state ?? (changes.captured ? "captured" : "awaiting_payment"),
      providerOrderId: `order_pe${n}`,
      paymentId: changes.captured ? `pay_captured${n}` : null,
      capturedAt: changes.captured ? ago(1) : null,
      customerEmailKey: buyer,
      createdAt: changes.createdAt ?? ago(30),
    },
  });
}
/** A Razorpay report on a checkout's order: a failure or authorization webhook (kept, ignored by the worker), a capture,
 * or the success callback from Razorpay's window (pending until the worker confirms it). */
async function report(attempt: Checkout, eventType: string, minutesAgo: number, state?: string) {
  const n = ++serial;
  return db.paymentWebhookInbox.create({
    data: {
      merchantScope: attempt.merchantScope,
      eventId: `payment-emails-${n}`,
      bodySha256: String(n).padStart(64, "0"),
      eventType,
      providerOrderId: attempt.providerOrderId,
      paymentId: `pay_report${n}`,
      state: state ?? (eventType === "checkout.callback" || eventType === "payment.captured" ? "pending" : "ignored"),
      receivedAt: ago(minutesAgo),
    },
  });
}
const sent: Array<Record<string, unknown>> = [];
const notifications = () => createOrderNotifications(db, {
  merchantScope: scope,
  email,
  now: () => new Date(now),
  fetch: async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), { status: 200, headers: { "Content-Type": "application/json" } });
  },
});
/** The buyer's payment emails recorded so far, as "kind:checkout number" (staff alerts are counted where they matter). */
async function due() {
  const rows = await db.orderNotification.findMany({
    where: { merchantScope: { in: [scope, elsewhere] }, kind: { in: ["customer_payment_failed", "customer_payment_pending"] } },
    orderBy: [{ kind: "asc" }, { subjectId: "asc" }],
  });
  return rows.map((row) => `${row.kind}:${Number(row.subjectId.slice(-12))}`);
}
const n = (attempt: Checkout) => Number(attempt.id.slice(-12));
const indiaDay = (at: Date) => at.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

async function clear() {
  const merchantScope = { in: [scope, elsewhere] };
  await db.orderNotification.deleteMany({ where: { merchantScope } });
  await db.paymentWebhookInbox.deleteMany({ where: { merchantScope } });
  await db.checkoutAttempt.deleteMany({ where: { merchantScope } });
}
before(async () => { await db.$connect(); });
beforeEach(async () => {
  await clear();
  sent.length = 0;
  now = new Date(Date.now() + 60_000);
});
after(async () => { await clear(); await db.$disconnect(); });

test("a failed payment is told once, after it has rested, quoting the payment that failed", async () => {
  const attempt = await checkout();
  await report(attempt, "payment.failed", 9);
  const emails = notifications();
  await emails.sweep();
  assert.deepEqual(await due(), [], "Razorpay's window may still be open for another try");
  later(2);
  await emails.sweep();
  await emails.sweep();
  assert.deepEqual(await due(), [`customer_payment_failed:${n(attempt)}`], "once, however many sweeps");
  const failure = await db.paymentWebhookInbox.findFirstOrThrow({ where: { merchantScope: scope, eventType: "payment.failed" } });
  assert.deepEqual(await emails.runBatch(), { claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.to, [`buyer${n(attempt)}@example.com`]);
  assert.equal(sent[0]!.subject, "Your payment didn't go through");
  const html = String(sent[0]!.html);
  assert.ok(html.includes(`>REFERENCE ${failure.paymentId}<`));
  assert.ok(html.includes(`>${indiaDay(failure.receivedAt).toUpperCase()}<`), "the day Razorpay reported it, on India's calendar");
  assert.ok(html.includes('href="https://store.maple.example.com/checkout"'));
  assert.equal((await db.orderNotification.findFirstOrThrow({ where: { merchantScope: scope } })).state, "sent");
});

test("a buyer still trying is left alone until the latest failure has rested, then quoted by it", async () => {
  const attempt = await checkout();
  await report(attempt, "payment.failed", 25);
  const latest = await report(attempt, "payment.failed", 4);
  const emails = notifications();
  await emails.sweep();
  assert.deepEqual(await due(), []);
  later(7);
  await emails.sweep();
  assert.deepEqual(await due(), [`customer_payment_failed:${n(attempt)}`]);
  await emails.runBatch();
  assert.ok(String(sent[0]!.html).includes(`>REFERENCE ${latest.paymentId}<`), "the latest failure");
});

test("no failure email once a payment worked, a new checkout began, or the case is old or not the buyer's to hear", async () => {
  // A retry in Razorpay's window that worked, an authorization still being captured, and a captured checkout.
  const retried = await checkout();
  await report(retried, "payment.failed", 20);
  await report(retried, "checkout.callback", 18);
  const authorized = await checkout();
  await report(authorized, "payment.failed", 20);
  await report(authorized, "payment.authorized", 18);
  const captured = await checkout({ captured: true });
  await report(captured, "payment.failed", 20);
  // The buyer started again from the same bag, or from another device with the same email.
  const sameBag = await checkout({ cartId: "payment-emails-shared-cart", createdAt: ago(40) });
  await report(sameBag, "payment.failed", 20);
  await checkout({ cartId: "payment-emails-shared-cart", createdAt: ago(15) });
  const sameBuyer = await checkout({ buyer: "returning@example.com", createdAt: ago(40) });
  await report(sameBuyer, "payment.failed", 20);
  await checkout({ buyer: "returning@example.com", createdAt: ago(10) });
  // An older checkout from the same bag does not quieten a newer one.
  await checkout({ cartId: "payment-emails-older-cart", createdAt: ago(90) });
  const newest = await checkout({ cartId: "payment-emails-older-cart", createdAt: ago(30) });
  await report(newest, "payment.failed", 20);
  // Too old, with staff, a legacy checkout, and another store.
  const old = await checkout({ createdAt: ago(4 * 24 * 60) });
  await report(old, "payment.failed", 3 * 24 * 60);
  const staff = await checkout({ state: "reconciliation_required" });
  await report(staff, "payment.failed", 20);
  const legacy = await checkout({ v1: true });
  await report(legacy, "payment.failed", 20);
  const other = await checkout({ merchantScope: elsewhere });
  await report(other, "payment.failed", 20);

  await notifications().sweep();
  // The retry that worked is still being confirmed, so its buyer is told it is pending, never that it failed.
  assert.deepEqual(await due(), [`customer_payment_failed:${n(newest)}`, `customer_payment_pending:${n(retried)}`]);
  assert.equal(await db.orderNotification.count({ where: { merchantScope: scope, kind: "staff_attention", subjectId: staff.id } }), 1, "the reconciliation case is staff's");
});

test("a success the worker is still confirming is told as pending after five minutes, even once its hold is let go", async () => {
  const waiting = await checkout();
  await report(waiting, "checkout.callback", 6);
  const letGo = await checkout({ state: "abandoned" });
  await report(letGo, "checkout.callback", 8);
  const fresh = await checkout();
  await report(fresh, "checkout.callback", 4);
  // Confirmed and captured, handed to staff (a mismatched payment), and too old.
  const captured = await checkout({ captured: true });
  await report(captured, "checkout.callback", 6, "processed");
  const mismatched = await checkout();
  await report(mismatched, "checkout.callback", 6, "reconciliation_required");
  const old = await checkout({ createdAt: ago(4 * 24 * 60) });
  await report(old, "checkout.callback", 3 * 24 * 60);

  const emails = notifications();
  await emails.sweep();
  assert.deepEqual(await due(), [`customer_payment_pending:${n(waiting)}`, `customer_payment_pending:${n(letGo)}`]);
  assert.equal(await db.orderNotification.count({ where: { merchantScope: scope, kind: "staff_payment" } }), 1, "the mismatched payment is staff's");
  later(2);
  await emails.sweep();
  assert.deepEqual(await due(), [`customer_payment_pending:${n(waiting)}`, `customer_payment_pending:${n(letGo)}`, `customer_payment_pending:${n(fresh)}`]);

  assert.deepEqual(await emails.runBatch(), { claimed: 4, sent: 4, retried: 0, failed: 0, skipped: 0 }, "three pending emails and the staff alert");
  assert.equal(sent.filter((payload) => (payload.to as string[])[0] === "staff@maple.example.com").length, 1);
  const callback = await db.paymentWebhookInbox.findFirstOrThrow({ where: { providerOrderId: waiting.providerOrderId } });
  const toWaiting = sent.find((payload) => (payload.to as string[])[0] === `buyer${n(waiting)}@example.com`)!;
  assert.equal(toWaiting.subject, "We're checking your payment");
  assert.ok(String(toWaiting.html).includes(`>REFERENCE ${callback.paymentId}<`));
  assert.ok(String(toWaiting.html).includes(`href="https://store.maple.example.com/orders/${waiting.id}"`));
});

test("a queued payment email that stops being true is skipped, never sent, and leaves nothing for staff", async () => {
  const failed = await checkout();
  await report(failed, "payment.failed", 15);
  const pending = await checkout();
  await report(pending, "checkout.callback", 8);
  const emails = notifications();
  await emails.sweep();
  assert.equal((await due()).length, 2);
  // Before the batch runs: the buyer's retry works, and the pending payment is captured.
  await report(failed, "checkout.callback", 1);
  await db.checkoutAttempt.update({ where: { id: pending.id }, data: { state: "captured", capturedAt: ago(1), paymentId: `pay_captured_late${n(pending)}` } });
  assert.deepEqual(await emails.runBatch(), { claimed: 2, sent: 0, retried: 0, failed: 0, skipped: 2 });
  assert.equal(sent.length, 0);
  const rows = await db.orderNotification.findMany({ where: { merchantScope: scope } });
  assert.deepEqual(rows.map((row) => [row.state, row.failureCode]), [["skipped", "SUPERSEDED"], ["skipped", "SUPERSEDED"]]);
  // The recovery checklist's "failed" query (docs/checkout-recovery.md) stays empty.
  assert.equal(await db.orderNotification.count({ where: { merchantScope: scope, state: "failed" } }), 0);
});
