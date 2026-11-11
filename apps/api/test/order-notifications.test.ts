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
const photo = "https://cdn.shopify.com/s/files/1/0001/files/nola-oak.jpg?v=17";
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
};

function fakeDb(world: World, rows: object[], finished: object[]) {
  return {
    $queryRaw: async () => rows.splice(0, 1),
    checkoutAttempt: {
      findFirst: async ({ where }: { where: { id?: string; providerOrderId?: string } }) =>
        world.attempts.find((a) => (where.id ? a.id === where.id : a.providerOrderId === where.providerOrderId)) ?? null,
    },
    paymentWebhookInbox: { findFirst: async ({ where }: { where: { id: string } }) => (world.inbox?.id === where.id ? world.inbox : null) },
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

/** Sends one notification of `kind` and returns the Resend payload it produced. */
async function sendOne(kind: string, subjectId: string, world: World) {
  const payloads: Array<Record<string, unknown>> = [];
  const finished: object[] = [];
  const transport: typeof fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const row = { id: `notification-${kind}`, merchantScope: "maple-store", subjectId, kind, state: "processing", deliveryAttempts: 1,
    nextAttemptAt: capturedAt, leaseToken: "lease-1", leaseExpiresAt: capturedAt, providerId: null, failureCode: null, sentAt: null, createdAt: capturedAt };
  const notifications = createOrderNotifications(fakeDb(world, [row], finished), {
    merchantScope: "maple-store", email, fetch: transport, now: () => new Date("2026-11-10T06:00:00.000Z"),
  });
  const stats = await notifications.runBatch(1);
  assert.deepEqual(stats, { claimed: 1, sent: 1, retried: 0, failed: 0 });
  assert.equal(payloads.length, 1);
  return payloads[0]!;
}

const footer = "Follow the refund and reconciliation procedure in docs/checkout-recovery.md. Never refund from this email alone: check the payment in the Razorpay dashboard first.";
const staffKeys = ["from", "reply_to", "subject", "text", "to"];

test("staff: a new order alert stays plain text, word for word", async () => {
  const payload = await sendOne("staff_order", attemptId, { attempts: [captured], outbox: { state: "delivered", externalOrderId: "SO-1001", failureCode: null } });
  assert.deepEqual(Object.keys(payload).sort(), staffKeys, "no HTML part");
  assert.deepEqual(payload.to, ["staff@maple.example.com"]);
  assert.equal(payload.subject, "New online order SO-1001: Rs. 26,400.00");
  assert.equal(payload.text, [
    "Keeri order: SO-1001",
    "Maple order (the customer's number): MF-10482",
    `Checkout: ${attemptId}`,
    "Payment: pay_unit1 (Razorpay order order_unit1)",
    "Total: Rs. 26,400.00",
    "",
    "- Nola Accent Chair, Natural cane · Oak finish × 1: Rs. 24,900.00",
    "Delivery: Rs. 1,500.00 by Delhivery Surface, about 14 days in transit",
    "",
    "Customer: Aditi Sharma, +919876543210, aditi.sharma@example.com",
    "Deliver to: 14 Palm Avenue, Apartment 402, Bengaluru 560001",
  ].join("\n"));
});

test("staff: paid-but-unplaced and leftover-hold alerts stay plain text, word for word", async () => {
  const lapsed = { ...captured, state: "paid_hold_lapsed", failureCode: "PAID_HOLD_LAPSED" };
  const paid = await sendOne("staff_payment", attemptId, { attempts: [lapsed] });
  assert.deepEqual(Object.keys(paid).sort(), staffKeys);
  assert.equal(paid.subject, `Online order needs attention: ${attemptId}`);
  assert.equal(paid.text, [
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
  ].join("\n"));

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
});

test("staff: a second payment's alert stays plain text, word for word", async () => {
  const inbox = { id: "inbox-1", paymentId: "pay_unit2", providerOrderId: "order_unit1", failureCode: "PAYMENT_ID_CONFLICT", workerState: "done" };
  const payload = await sendOne("staff_payment", "inbox:inbox-1", { attempts: [captured], inbox });
  assert.deepEqual(Object.keys(payload).sort(), staffKeys);
  assert.equal(payload.subject, "Online order needs attention: payment pay_unit2");
  assert.equal(payload.text, [
    "The customer PAID TWICE for one order. Keep the payment recorded on the checkout and refund payment pay_unit2 in full.",
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
  // The catalogue photo, as Shopify's 240×300 JPEG crop.
  assert.ok(html.includes('src="https://cdn.shopify.com/s/files/1/0001/files/nola-oak.jpg?v=17&amp;width=240&amp;height=300&amp;crop=center&amp;format=jpg"'));
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
