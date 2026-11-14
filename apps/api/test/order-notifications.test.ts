import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { loadEnquiryDeliveryConfig } from "../src/enquiry-delivery-provider.js";
import { createOrderNotifications } from "../src/orders/notifications.js";

// The send path end to end (sweep's rows → render → Resend payload) over an in-memory stand-in for the few Prisma calls
// it makes: no database.
const email = loadEnquiryDeliveryConfig({
  ENQUIRY_DELIVERY_ENABLED: "true",
  ENQUIRY_RESEND_API_KEY: "re_unit_test",
  ENQUIRY_MAIL_FROM: "orders@maple.example.com",
  ENQUIRY_MAIL_TO: "staff@maple.example.com",
  WEB_ORIGIN: "https://store.maple.example.com",
})!;
const capturedAt = new Date("2026-11-10T05:30:00.000Z");
const address = { line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", stateCode: "29", pincode: "560001", country: "IN" as const };
const quote: QuoteSnapshot = {
  version: 2, currency: "INR", policyId: "policy-v1", quoteId: "quote_unit", expiresAt: "2026-11-10T06:00:00.000Z",
  customer: { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" },
  billingAddress: address, shippingAddress: address, deliveryMethodId: "standard", gstMode: "included",
  items: [{
    variantId: "keeri:maple:nola-oak", productId: "keeri:maple:nola", title: "Nola Accent Chair", variantTitle: "Natural cane · Oak finish",
    sku: "NOLA-OAK", quantity: 1, unitPricePaise: 2490000, lineTotalPaise: 2490000, hsn: "9401", taxRateBps: 1800,
    fulfilment: { kind: "stocked", leadTimeDays: null },
  }],
  subtotalPaise: 2490000, shippingPaise: 150000, taxPaise: 402712, totalPaise: 2640000,
  delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
    carrier: { provider: "shiprocket", courierId: 51, courierName: "Delhivery Surface", estimatedDays: 14, chargeWeightGrams: 12000 } },
};
const photo = "https://store.maplefurnishers.com/media/keeri/nola-oak_17.webp";
const attemptId = "11111111-2222-4333-8444-555555555555";
const captured = {
  id: attemptId, cartId: "cart-1", merchantScope: "maple-store", idempotencyKey: "key-1", receipt: "receipt-1", snapshot: quote,
  catalogueBindings: { version: 1, tenantId: "maple", items: [{ localVariantId: "local-nola-oak", localProductId: "local-nola", sourceVariantId: "keeri:maple:nola-oak", sourceProductId: "keeri:maple:nola" }] },
  amountPaise: 2640000, currency: "INR", state: "captured", reservationId: "hold-1", reservationExpiresAt: null,
  providerOrderId: "order_unit1", paymentId: "pay_unit1", capturedAt, failureCode: null as string | null,
  customerEmailKey: "aditi.sharma@example.com", orderNumber: 10482 as number | null, createdAt: capturedAt, updatedAt: capturedAt,
};
type Attempt = typeof captured;
type World = {
  attempts: Attempt[];
  outbox?: { state: string; externalOrderId: string | null; failureCode: string | null };
  inbox?: { id: string; paymentId: string | null; providerOrderId: string | null; failureCode: string | null; workerState: string };
  variants?: () => Array<{ id: string; images: string[]; product: { published: boolean; images: string[] } }>;
  /** The Razorpay report a payment email quotes: the latest failure, or the success callback. */
  payment?: { eventType: string; paymentId: string | null; receivedAt: Date };
  /** The answer to a payment email's last check that it is still true (default yes). */
  stillTrue?: boolean;
};

function fakeDb(world: World, rows: object[], finished: object[]) {
  return {
    // The claim first; a later raw query is a payment email's check that it is still true.
    $queryRaw: async () => (rows.length ? rows.splice(0, 1) : world.stillTrue === false ? [] : [{ id: attemptId }]),
    checkoutAttempt: {
      findFirst: async ({ where }: { where: { id?: string; providerOrderId?: string } }) =>
        world.attempts.find((a) => (where.id ? a.id === where.id : a.providerOrderId === where.providerOrderId)) ?? null,
    },
    paymentWebhookInbox: {
      findFirst: async ({ where }: { where: { id?: string; eventType?: string } }) =>
        where.eventType ? (world.payment?.eventType === where.eventType ? world.payment : null) : world.inbox?.id === where.id ? world.inbox : null,
    },
    orderOutbox: { findUnique: async () => world.outbox ?? null },
    orderNotification: { updateMany: async (update: object) => { finished.push(update); return { count: 1 }; } },
    variantSourceIdentity: { findMany: async () => [] },
    variant: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        (world.variants?.() ?? [{ id: "local-nola-oak", images: [photo], product: { published: true, images: [photo] } }])
          .filter((v) => where.id.in.includes(v.id)),
    },
  } as unknown as PrismaClient;
}

/** Runs one notification of `kind` through a batch: what it counted, sent and recorded. */
type Extra = { keeriAdminOrigin?: string | null; paymentMode?: "test" | "live" | null };
async function runOne(kind: string, subjectId: string, world: World, extra: Extra = {}) {
  const payloads: Array<Record<string, unknown>> = [];
  const finished: object[] = [];
  const transport: typeof fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const row = { id: `notification-${kind}`, merchantScope: "maple-store", subjectId, kind, state: "processing", deliveryAttempts: 1,
    nextAttemptAt: capturedAt, leaseToken: "lease-1", leaseExpiresAt: capturedAt, providerId: null, failureCode: null, sentAt: null, createdAt: capturedAt };
  const notifications = createOrderNotifications(fakeDb(world, [row], finished), {
    merchantScope: "maple-store", email, fetch: transport, now: () => new Date("2026-11-10T06:00:00.000Z"), ...extra,
  });
  const stats = await notifications.runBatch(1);
  return { stats, payloads, finished };
}
/** Sends one notification of `kind` and returns the Resend payload it produced. */
async function sendOne(kind: string, subjectId: string, world: World, extra: Extra = {}) {
  const { stats, payloads } = await runOne(kind, subjectId, world, extra);
  assert.deepEqual(stats, { claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
  assert.equal(payloads.length, 1);
  return payloads[0]!;
}

const footer = "Follow the refund and reconciliation procedure in docs/checkout-recovery.md. Never refund from this email alone: check the payment in the Razorpay dashboard first.";
const staffKeys = ["from", "html", "reply_to", "subject", "text", "to"];
const keeriAdmin = "https://admin.keeri.example.com";
const delivered = { state: "delivered", externalOrderId: "cmwg8km4k00cd7bo35whb36zh", failureCode: null };
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("staff: a new order leads with its MF number, total and pieces, as HTML with a plain-text part", async () => {
  const payload = await sendOne("staff_order", attemptId, { attempts: [{ ...captured, whatsappOptInAt: capturedAt } as Attempt], outbox: delivered },
    { keeriAdminOrigin: keeriAdmin, paymentMode: "live" });
  assert.deepEqual(Object.keys(payload).sort(), staffKeys);
  assert.deepEqual(payload.to, ["staff@maple.example.com"]);
  // Keeri's id is no longer the headline: the number the customer quotes is.
  assert.equal(payload.subject, "New order MF-10482 · Rs. 26,400.00 · Nola Accent Chair, Natural cane · Oak finish");
  assert.equal(payload.text, [
    "New order MF-10482: Rs. 26,400.00",
    "Paid: 10 Nov 2026, 11:00 am IST",
    "Open in Keeri: https://admin.keeri.example.com/orders/cmwg8km4k00cd7bo35whb36zh",
    "",
    "- Nola Accent Chair, Natural cane · Oak finish × 1: Rs. 24,900.00",
    "Delivery: Rs. 1,500.00 by Delhivery Surface, about 14 days in transit",
    "Total: Rs. 26,400.00",
    "",
    "Customer: Aditi Sharma",
    "Phone: +919876543210 (WhatsApp: https://wa.me/919876543210)",
    "Email: aditi.sharma@example.com",
    "Deliver to: 14 Palm Avenue, Apartment 402, Bengaluru, Karnataka 560001",
    "WhatsApp updates: yes",
    "",
    "Razorpay payment: pay_unit1 (https://dashboard.razorpay.com/app/payments/pay_unit1)",
    "Razorpay order: order_unit1",
    `Checkout: ${attemptId}`,
    "Keeri order: cmwg8km4k00cd7bo35whb36zh",
  ].join("\n"));
  const html = String(payload.html);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /max-width:680px/);
  assert.ok(html.includes(">MF-10482</h1>"));
  assert.ok(html.includes("₹26,400"));
  assert.ok(html.includes("Paid 10 Nov 2026, 11:00 am IST"));
  assert.equal(count(html, 'href="https://admin.keeri.example.com/orders/cmwg8km4k00cd7bo35whb36zh"'), 2, "the button, and its Outlook twin");
  assert.ok(html.includes("Open in Keeri"));
  assert.ok(html.includes(photo), "the piece's photo");
  assert.ok(html.includes("PIECE ORDERED") && !html.includes(">YOUR PIECE<"));
  assert.ok(html.includes('href="tel:+919876543210"'));
  assert.ok(html.includes('href="https://wa.me/919876543210"'));
  assert.ok(html.includes('href="mailto:aditi.sharma@example.com"'));
  assert.ok(html.includes("Bengaluru, Karnataka 560001"));
  assert.ok(html.includes("Asked for order updates on WhatsApp"));
  assert.ok(html.includes('href="https://dashboard.razorpay.com/app/payments/pay_unit1"'));
  assert.ok(html.includes("order_unit1") && html.includes(attemptId));
  assert.ok(html.includes("Delhivery Surface · about 14 days in transit"));
  assert.ok(!html.includes("TEST PAYMENT"));
  assert.ok(html.includes("Not for customers."));
  assert.ok(Buffer.byteLength(html) < 60_000, "well under Gmail's clipping size");
});

test("staff: a test payment is tagged, and without Keeri's admin origin there is no button", async () => {
  const payload = await sendOne("staff_order", attemptId, { attempts: [captured], outbox: delivered }, { paymentMode: "test" });
  assert.ok(String(payload.html).includes("TEST PAYMENT"));
  assert.match(String(payload.text), /^TEST PAYMENT: paid with a Razorpay test key; no money was taken\. Do not make or ship it\.$/m);
  assert.ok(!String(payload.html).includes("Open in Keeri"));
  assert.ok(!String(payload.text).includes("Open in Keeri"));
  assert.ok(String(payload.html).includes("Did not ask for WhatsApp updates"));
});

test("staff: several pieces name the first and how many more; an order without an MF number falls back to the checkout", async () => {
  const second = { ...quote.items[0]!, variantId: "keeri:maple:nola-walnut", variantTitle: "Walnut", fulfilment: { kind: "made_to_order" as const, leadTimeDays: 21 } };
  const two = { ...captured, orderNumber: null, snapshot: { ...quote, items: [quote.items[0]!, second] } };
  const payload = await sendOne("staff_order", attemptId, { attempts: [two], outbox: delivered });
  assert.equal(payload.subject, `New order ${attemptId} · Rs. 26,400.00 · Nola Accent Chair, Natural cane · Oak finish +1 more`);
  assert.ok(String(payload.html).includes("2 PIECES ORDERED"));
  assert.ok(String(payload.html).includes("Made to order: allow 21 days for making"));
  assert.match(String(payload.text), /Walnut × 1: Rs\. 24,900\.00 \(made to order: allow 21 days for making\)/);
});

test("staff: a free-delivery order's alert says the delivery was free and which courier still ships it", async () => {
  const snapshot = captured.snapshot as any;
  const free = { ...captured, amountPaise: snapshot.totalPaise - snapshot.shippingPaise, snapshot: { ...snapshot, shippingPaise: 0, totalPaise: snapshot.totalPaise - snapshot.shippingPaise,
    delivery: { ...snapshot.delivery, source: "free", freeDeliveryVariantIds: snapshot.items.map((i: any) => i.variantId) } } };
  const payload = await sendOne("staff_order", attemptId, { attempts: [free], outbox: delivered });
  assert.match(String(payload.text), /^Delivery: free \(free-delivery products\), ships by Delhivery Surface, about 14 days in transit$/m);
  assert.doesNotMatch(String(payload.text), /Delivery: Rs\./);
  assert.equal(count(String(payload.html), "Free (free-delivery products)"), 2, "in the charges and under Delivery");
});

test("staff: what a customer or the catalogue typed is escaped in the HTML", async () => {
  const hostile = { ...quote, customer: { name: `Aditi <script>alert("x")</script>`, email: "o'neil@example.com", phone: "9876543210" },
    items: [{ ...quote.items[0]!, title: `Nola "Accent" <b>Chair</b>`, variantTitle: "Oak & Cane" }],
    shippingAddress: { ...address, line1: "<img src=x onerror=alert(1)>" } };
  const payload = await sendOne("staff_order", attemptId, { attempts: [{ ...captured, snapshot: hostile }], outbox: delivered });
  const html = String(payload.html);
  assert.ok(!html.includes("<script>") && !html.includes("<b>Chair") && !html.includes("<img src=x"));
  assert.ok(html.includes("Aditi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(html.includes("Nola &quot;Accent&quot; &lt;b&gt;Chair&lt;/b&gt;"));
  assert.ok(html.includes("Oak &amp; Cane"));
  assert.ok(html.includes('href="mailto:o&#39;neil@example.com"'));
  assert.ok(html.includes('href="https://wa.me/919876543210"'));
});

test("staff: paid-but-unplaced and leftover-hold alerts keep their words and ids, now with HTML", async () => {
  const lapsed = { ...captured, state: "paid_hold_lapsed", failureCode: "PAID_HOLD_LAPSED" };
  const paid = await sendOne("staff_payment", attemptId, { attempts: [lapsed] }, { keeriAdminOrigin: keeriAdmin });
  assert.deepEqual(Object.keys(paid).sort(), staffKeys);
  assert.equal(paid.subject, `Online order needs attention: ${attemptId}`);
  const paidText = [
    "The customer PAID (pay_unit1), but the Keeri stock hold had lapsed or been released, so no Keeri order was placed. Confirm stock and raise the order by hand, or refund in full.",
    "",
    "Maple order (the customer's number): MF-10482",
    `Checkout: ${attemptId}`,
    "State: paid_hold_lapsed (PAID_HOLD_LAPSED)",
    "Amount: Rs. 26,400.00",
    "Payment recorded on the checkout: pay_unit1",
    "Razorpay order: order_unit1",
    "",
    "- Nola Accent Chair, Natural cane · Oak finish × 1: Rs. 24,900.00",
    "",
    "Customer: Aditi Sharma, +919876543210, aditi.sharma@example.com",
    "",
    footer,
  ];
  assert.equal(paid.text, paidText.join("\n"));
  const paidHtml = String(paid.html);
  assert.ok(paidHtml.includes("NEEDS ATTENTION"));
  assert.ok(paidHtml.includes(">Paid, but no Keeri order</h1>"));
  assert.ok(paidHtml.includes(paidText[0]!.replace("Keeri stock", "Keeri stock")));
  for (const id of ["MF-10482", attemptId, "paid_hold_lapsed (PAID_HOLD_LAPSED)", "Rs. 26,400.00", "order_unit1"]) assert.ok(paidHtml.includes(id), id);
  assert.ok(paidHtml.includes('href="https://dashboard.razorpay.com/app/payments/pay_unit1"'));
  assert.ok(paidHtml.includes(footer));
  assert.ok(!paidHtml.includes("Open in Keeri"), "Keeri holds no order");

  const leftover = { ...captured, state: "reconciliation_required", failureCode: "RELEASE_UNCERTAIN", paymentId: null as unknown as string, capturedAt: null as unknown as Date, orderNumber: null };
  const attention = await sendOne("staff_attention", attemptId, { attempts: [leftover] });
  assert.deepEqual(Object.keys(attention).sort(), staffKeys);
  assert.equal(attention.subject, `Online order needs attention: ${attemptId}`);
  assert.equal(attention.text, [
    "No payment is recorded for this checkout, but a Keeri stock hold or a Razorpay order may be left over and needs a manual check.",
    "",
    `Checkout: ${attemptId}`,
    "State: reconciliation_required (RELEASE_UNCERTAIN)",
    "Amount: Rs. 26,400.00",
    "Payment recorded on the checkout: none",
    "Razorpay order: order_unit1",
    "",
    "- Nola Accent Chair, Natural cane · Oak finish × 1: Rs. 24,900.00",
    "",
    "Customer: Aditi Sharma, +919876543210, aditi.sharma@example.com",
    "",
    footer,
  ].join("\n"));
  assert.ok(String(attention.html).includes(">Check for a leftover hold</h1>"));
  assert.ok(String(attention.html).includes("reconciliation_required (RELEASE_UNCERTAIN)"));
});

test("staff: a second payment's alert keeps its words and ids, and opens the order Keeri already holds", async () => {
  const inbox = { id: "inbox-1", paymentId: "pay_unit2", providerOrderId: "order_unit1", failureCode: "PAYMENT_ID_CONFLICT", workerState: "done" };
  const payload = await sendOne("staff_payment", "inbox:inbox-1", { attempts: [captured], inbox, outbox: delivered }, { keeriAdminOrigin: keeriAdmin });
  assert.deepEqual(Object.keys(payload).sort(), staffKeys);
  assert.equal(payload.subject, "Online order needs attention: payment pay_unit2");
  assert.equal(payload.text, [
    "The customer PAID TWICE for one order. Keep the payment recorded on the checkout and refund payment pay_unit2 in full.",
    "Open in Keeri: https://admin.keeri.example.com/orders/cmwg8km4k00cd7bo35whb36zh",
    "",
    "Payment: pay_unit2",
    "Razorpay order: order_unit1",
    "Reason: PAYMENT_ID_CONFLICT",
    "Payment event: inbox-1",
    "",
    "Maple order (the customer's number): MF-10482",
    `Checkout: ${attemptId}`,
    "State: captured",
    "Amount: Rs. 26,400.00",
    "Payment recorded on the checkout: pay_unit1",
    "Razorpay order: order_unit1",
    "",
    footer,
  ].join("\n"));
  const html = String(payload.html);
  assert.ok(html.includes(">Paid twice for one order</h1>"));
  assert.ok(html.includes('href="https://dashboard.razorpay.com/app/payments/pay_unit2"'));
  assert.ok(html.includes('href="https://admin.keeri.example.com/orders/cmwg8km4k00cd7bo35whb36zh"'));
  for (const id of ["inbox-1", "PAYMENT_ID_CONFLICT", "MF-10482", attemptId]) assert.ok(html.includes(id), id);
  assert.ok(html.includes(footer));
});

test("staff: a payment no checkout matches says so, with no Keeri button", async () => {
  const inbox = { id: "inbox-2", paymentId: "pay_unit3", providerOrderId: "order_missing", failureCode: "UNKNOWN_ORDER", workerState: "done" };
  const payload = await sendOne("staff_payment", "inbox:inbox-2", { attempts: [], inbox }, { keeriAdminOrigin: keeriAdmin });
  assert.match(String(payload.text), /^No checkout matches this Razorpay order\.$/m);
  assert.ok(String(payload.html).includes("No checkout matches this Razorpay order."));
  assert.ok(String(payload.html).includes(">A payment needs a person</h1>"));
  assert.ok(!String(payload.html).includes("Open in Keeri"));
});

test("customer_confirmed goes out as HTML with a plain-text part, under the same subject", async () => {
  const payload = await sendOne("customer_confirmed", attemptId, { attempts: [captured], outbox: { state: "delivered", externalOrderId: "SO-1001", failureCode: null } });
  assert.deepEqual(Object.keys(payload).sort(), ["from", "html", "reply_to", "subject", "text", "to"]);
  assert.deepEqual(payload.to, ["aditi.sharma@example.com"]);
  assert.equal(payload.reply_to, "staff@maple.example.com");
  assert.equal(payload.subject, "Your Maple Furnishers order MF-10482 is confirmed");
  const html = String(payload.html);
  const text = String(payload.text);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /✓&nbsp; ORDER CONFIRMED/);
  assert.match(html, />ORDER #MF-10482</);
  assert.match(html, />10 NOVEMBER 2026</);
  assert.match(html, />24–28 Nov 2026</);
  assert.ok(html.includes(`href="https://store.maple.example.com/orders/${attemptId}"`), "the order status page");
  // The catalogue photo, Keeri's WebP as a filled background.
  assert.ok(html.includes("background-image:url(https://store.maplefurnishers.com/media/keeri/nola-oak_17.webp);background-size:cover;"));
  assert.doesNotMatch(html + text, /SO-1001|pay_unit1|Rs\./, "Keeri's number and the payment id stay internal; money is in rupees");
  for (const line of ["Order number: MF-10482", "Order date: 10 November 2026", "Nola Accent Chair", "Quantity 1 · ₹24,900",
    "Total paid: ₹26,400", "Estimated delivery: 24–28 Nov 2026", "14 Palm Avenue, Apartment 402", "Bengaluru, Karnataka 560001"])
    assert.ok(text.includes(line), line);
});

test("customer_received keeps its own wording in the same shell and never claims the order is confirmed", async () => {
  const lapsed = { ...captured, state: "paid_hold_lapsed", failureCode: "PAID_HOLD_LAPSED" };
  const payload = await sendOne("customer_received", attemptId, { attempts: [lapsed] });
  assert.equal(payload.subject, "We've received your payment for order MF-10482");
  const html = String(payload.html);
  const text = String(payload.text);
  assert.match(html, /✓&nbsp; PAYMENT RECEIVED/);
  assert.match(html, /we’ve received your payment of ₹26,400\. Our team is confirming your order by hand and will contact you within one business day\./);
  assert.match(text, /refund in full to your original payment method\. You don’t need to pay again\./);
  assert.match(text, /Order number: MF-10482/);
  assert.doesNotMatch(html + text, /ORDER CONFIRMED|is confirmed|Good things are|ESTIMATED DELIVERY|Estimated delivery/);
  assert.doesNotMatch(html + text, /pay_unit1|PAID_HOLD_LAPSED|reservation/i);
});

test("a photo lookup that fails still sends the email, with a plain tile", async () => {
  const payload = await sendOne("customer_confirmed", attemptId, {
    attempts: [captured], outbox: { state: "delivered", externalOrderId: "SO-1001", failureCode: null },
    variants: () => { throw new Error("database unavailable"); },
  });
  const html = String(payload.html);
  assert.doesNotMatch(html, /<img class="m-photo"|background-image/);
  assert.match(html, /<td class="m-photo" width="120" height="150" valign="top" bgcolor="#f1f0e9"[^>]*>&nbsp;<\/td>/);
});

// Before any order: the checkout's Razorpay order took no payment.
const unpaid = { ...captured, state: "awaiting_payment", paymentId: null as unknown as string, capturedAt: null as unknown as Date, orderNumber: null };
const reportedAt = new Date("2026-11-10T05:20:00.000Z");

test("customer_payment_failed goes to the buyer as HTML and text, quoting the failed payment", async () => {
  const payload = await sendOne("customer_payment_failed", attemptId, {
    attempts: [unpaid], payment: { eventType: "payment.failed", paymentId: "pay_failed1", receivedAt: reportedAt },
  });
  assert.deepEqual(Object.keys(payload).sort(), ["from", "html", "reply_to", "subject", "text", "to"]);
  assert.deepEqual(payload.to, ["aditi.sharma@example.com"]);
  assert.equal(payload.reply_to, "staff@maple.example.com", "a reply reaches the team");
  assert.equal(payload.subject, "Your payment didn't go through");
  const html = String(payload.html);
  const text = String(payload.text);
  for (const words of [">PAYMENT UNSUCCESSFUL<", ">REFERENCE pay_failed1<", ">10 NOVEMBER 2026<", ">Amount to pay<", ">₹26,400<",
    'href="https://store.maple.example.com/checkout"', "Reply with reference pay_failed1 if you need help."])
    assert.ok(html.includes(words), words);
  // The catalogue photo, as the order emails show it.
  assert.ok(html.includes("background-image:url(https://store.maplefurnishers.com/media/keeri/nola-oak_17.webp);"));
  assert.match(text, /^Your payment didn’t go through\.\n\nHi Aditi, we couldn’t complete your payment\./);
  assert.ok(text.includes("Reference: pay_failed1\nDate: 10 November 2026"));
  assert.doesNotMatch(html + text, /Rs\.|MF-|order_unit1/, "money in rupees; no order number or Razorpay order id");
});

test("customer_payment_pending goes to the buyer and links the order status page", async () => {
  const payload = await sendOne("customer_payment_pending", attemptId, {
    attempts: [unpaid], payment: { eventType: "checkout.callback", paymentId: "pay_waiting1", receivedAt: reportedAt },
  });
  assert.deepEqual(payload.to, ["aditi.sharma@example.com"]);
  assert.equal(payload.subject, "We're checking your payment");
  const html = String(payload.html);
  for (const words of [">PAYMENT PENDING<", ">REFERENCE pay_waiting1<", ">Payment pending<", ">No need to pay again.<",
    `href="https://store.maple.example.com/orders/${attemptId}"`, "Still pending? Reply to this email with reference pay_waiting1."])
    assert.ok(html.includes(words), words);
});

test("a payment email that is no longer true is never sent and leaves nothing for staff", async () => {
  for (const kind of ["customer_payment_failed", "customer_payment_pending"]) {
    const { stats, payloads, finished } = await runOne(kind, attemptId, {
      attempts: [unpaid], stillTrue: false,
      payment: { eventType: kind === "customer_payment_failed" ? "payment.failed" : "checkout.callback", paymentId: "pay_x1", receivedAt: reportedAt },
    });
    assert.deepEqual(stats, { claimed: 1, sent: 0, retried: 0, failed: 0, skipped: 1 }, kind);
    assert.equal(payloads.length, 0, kind);
    assert.deepEqual((finished[0] as { data: object }).data, { state: "skipped", failureCode: "SUPERSEDED", leaseToken: null, leaseExpiresAt: null }, kind);
  }
});

test("a payment email without its Razorpay report is not sent", async () => {
  const { stats, payloads, finished } = await runOne("customer_payment_failed", attemptId, { attempts: [unpaid] });
  assert.deepEqual(stats, { claimed: 1, sent: 0, retried: 0, failed: 1, skipped: 0 });
  assert.equal(payloads.length, 0);
  assert.equal((finished[0] as { data: { failureCode: string } }).data.failureCode, "NOTHING_TO_SEND");
});
