import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { renderOrderEmail, renderPaymentEmail, type PaymentEmailInput } from "../src/orders/order-email.js";

// The owner's sample order in the payment frames (Figma 488:1339 "Payment Failure", 488:1390 "Payment Pending").
const origin = "https://store.maple.example.com";
const attemptId = "6f1c2d3e-4b5a-4c6d-8e7f-001122334455";
const paymentId = "pay_Nx10482AdQwRtY";
const address = { line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", stateCode: "29", pincode: "560001", country: "IN" as const };
type Item = QuoteSnapshot["items"][number];
const nola: Item = {
  variantId: "keeri:maple:nola-cane-oak", productId: "keeri:maple:nola", title: "Nola Accent Chair", variantTitle: "Natural cane · Oak finish",
  sku: null, quantity: 1, unitPricePaise: 2490000, lineTotalPaise: 2490000, hsn: "9401", taxRateBps: 1800,
  fulfilment: { kind: "stocked", leadTimeDays: null },
};
function quoteWith(changes: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
  return {
    version: 2, currency: "INR", policyId: "policy-v1", quoteId: "quote_unit", expiresAt: "2026-11-10T06:00:00.000Z",
    customer: { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" },
    billingAddress: address, shippingAddress: address, deliveryMethodId: "standard", gstMode: "included",
    items: [nola], subtotalPaise: 2490000, shippingPaise: 150000, taxPaise: 402712, totalPaise: 2640000,
    delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
      carrier: { provider: "shiprocket", courierId: 1, courierName: "Delhivery Surface", estimatedDays: 14, chargeWeightGrams: 12000 } },
    ...changes,
  };
}
const photos = new Map([[nola.variantId, "https://store.maplefurnishers.com/media/keeri/nola_01.webp"]]);
function render(changes: Partial<PaymentEmailInput> = {}) {
  return renderPaymentEmail({
    kind: "failed",
    attempt: { id: attemptId, amountPaise: 2640000 },
    quote: quoteWith(),
    paymentId,
    at: new Date("2026-11-10T05:30:00.000Z"),
    photos,
    origin,
    ...changes,
  });
}
function assertInOrder(html: string, words: string[]) {
  let from = 0;
  for (const piece of words) {
    const at = html.indexOf(piece, from);
    assert.ok(at >= 0, `missing or out of order: ${piece}`);
    from = at + piece.length;
  }
}
const footer = [
  "With care,<br>The Maple team", "MAPLE FURNISHERS", "Thoughtful furniture. Made for your everyday.",
  `href="${origin}/contact"`, ">Contact us<", `href="${origin}/policies/privacy-policy"`, ">Privacy policy<",
];

test("payment unsuccessful carries the frame's words, in its order (Figma 488:1339)", () => {
  const { subject, html } = render();
  assert.equal(subject, "Your payment didn't go through");
  assert.ok(html.includes("<title>Your payment didn&#39;t go through</title>"));
  assertInOrder(html, [
    `src="${origin}/media/email/maple-logo.png" width="132" height="61"`,
    ">PAYMENT UNSUCCESSFUL<",
    "Your payment<br>didn’t go through.",
    ">Hi Aditi, we couldn’t complete your payment. Your chosen piece and checkout details are saved, so you can try again.<",
    `>REFERENCE ${paymentId}<`, ">10 NOVEMBER 2026<",
    "YOUR PIECE", ">Nola Accent Chair<", "Natural cane · Oak finish<br>Quantity 1", ">₹24,900<",
    ">Subtotal<", ">₹24,900<", ">Delivery<", ">₹1,500<", ">Amount to pay<", ">₹26,400<",
    ">Payment not completed · Inclusive of applicable taxes<",
    ">Let’s get you back on track.<",
    ">NEXT STEP<", ">Return to checkout.<", ">Try again or choose a different payment method.<",
    ">IF MONEY WAS DEBITED<", `>Check your payment status before retrying. Reply with reference ${paymentId} if you need help.<`,
    `href="${origin}/checkout"`, ">Return to checkout<",
    ">Need help completing your order? Reply to this email.<",
    ...footer,
  ]);
  assert.doesNotMatch(html, />GST</, "GST inside the price has no row of its own");
  assert.match(html, /<div style="display:none;[^"]*">We couldn’t complete your payment of ₹26,400\. Your piece is saved, so you can try again\.&#847;/);
});

test("payment pending carries the frame's words, in its order (Figma 488:1390)", () => {
  const { subject, html } = render({ kind: "pending" });
  assert.equal(subject, "We're checking your payment");
  assertInOrder(html, [
    `src="${origin}/media/email/maple-logo.png" width="132" height="61"`,
    ">PAYMENT PENDING<",
    "A moment while we<br>check your payment.",
    ">Hi Aditi, we’re waiting for confirmation from your bank. Your order details are saved while we verify your payment.<",
    `>REFERENCE ${paymentId}<`, ">10 NOVEMBER 2026<",
    "YOUR PIECE", ">Nola Accent Chair<", "Natural cane · Oak finish<br>Quantity 1", ">₹24,900<",
    ">Subtotal<", ">₹24,900<", ">Delivery<", ">₹1,500<", ">Payment pending<", ">₹26,400<",
    ">Payment confirmation pending · Inclusive of applicable taxes<",
    ">What happens next?<",
    ">PLEASE WAIT<", ">No need to pay again.<", ">We’ll email you once your bank confirms the result.<",
    ">YOUR ORDER<", ">Your order is not yet confirmed. Delivery details will follow after successful payment.<",
    `href="${origin}/orders/${attemptId}"`, ">Check payment status<",
    `>Still pending? Reply to this email with reference ${paymentId}.<`,
    ...footer,
  ]);
  assert.match(html, /<div style="display:none;[^"]*">We’re waiting for your bank to confirm your payment of ₹26,400\. No need to pay again\.&#847;/);
});

test("each email has the frame's chip, shaded total and tinted block, and no tick", () => {
  const chip = (width: number, background: string, colour: string, words: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="width:${width}px;"><tr><td align="center" bgcolor="${background}" style="padding:10px;border-radius:20px;background-color:${background};font-family:'Red Hat Display', 'Helvetica Neue', Arial, sans-serif;font-size:11px;line-height:15px;color:${colour};text-align:center;white-space:nowrap;">${words}</td></tr></table>`;
  const failed = render().html;
  assert.ok(failed.includes(chip(172, "#ffd7d7", "#80241c", "PAYMENT UNSUCCESSFUL")));
  assert.ok(failed.includes('<td class="m-next" bgcolor="#f4f1ec" style="padding:40px 40px 20px 40px;background-color:#f4f1ec;">'));
  const pending = render({ kind: "pending" }).html;
  assert.ok(pending.includes(chip(131, "#f2d284", "#4a3401", "PAYMENT PENDING")));
  assert.ok(pending.includes('<td class="m-next" bgcolor="#f5f1e7" style="padding:40px 40px 20px 40px;background-color:#f5f1e7;">'));
  for (const html of [failed, pending]) {
    assert.ok(html.includes('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f5f4f0" style="width:100%;background-color:#f5f4f0;">'));
    assert.doesNotMatch(html, /✓/);
    // The guidance titles are DM Sans 20px and the right-hand line Red Hat 14px in ink, as the frame sets them.
    assert.match(html, /font-family:'DM Sans', 'Helvetica Neue', Arial, sans-serif;font-size:20px;line-height:28px;color:#1c1c1c;font-weight:500;">(?:Return to checkout\.|No need to pay again\.)</);
  }
});

test("the plain-text parts say the same things", () => {
  const close = (action: string, help: string) => [
    action, "", help, "", "With care,", "The Maple team", "",
    "Maple Furnishers · Thoughtful furniture. Made for your everyday.",
    `Contact us: ${origin}/contact`, `Privacy policy: ${origin}/policies/privacy-policy`,
  ];
  const receipt = ["Your piece", "Nola Accent Chair", "Natural cane · Oak finish", "Quantity 1 · ₹24,900", "", "Subtotal: ₹24,900", "Delivery: ₹1,500"];
  assert.equal(render().text, [
    "Your payment didn’t go through.", "",
    "Hi Aditi, we couldn’t complete your payment. Your chosen piece and checkout details are saved, so you can try again.", "",
    `Reference: ${paymentId}`, "Date: 10 November 2026", "",
    ...receipt, "Amount to pay: ₹26,400", "Payment not completed · Inclusive of applicable taxes", "",
    "Let’s get you back on track.",
    "Next step: Return to checkout. Try again or choose a different payment method.",
    `If money was debited: Check your payment status before retrying. Reply with reference ${paymentId} if you need help.`, "",
    ...close(`Return to checkout: ${origin}/checkout`, "Need help completing your order? Reply to this email."),
  ].join("\n"));
  assert.equal(render({ kind: "pending" }).text, [
    "A moment while we check your payment.", "",
    "Hi Aditi, we’re waiting for confirmation from your bank. Your order details are saved while we verify your payment.", "",
    `Reference: ${paymentId}`, "Date: 10 November 2026", "",
    ...receipt, "Payment pending: ₹26,400", "Payment confirmation pending · Inclusive of applicable taxes", "",
    "What happens next?",
    "Please wait: No need to pay again. We’ll email you once your bank confirms the result.",
    "Your order: Your order is not yet confirmed. Delivery details will follow after successful payment.", "",
    ...close(`Check payment status: ${origin}/orders/${attemptId}`, `Still pending? Reply to this email with reference ${paymentId}.`),
  ].join("\n"));
});

test("neither email claims an order, a delivery or money taken", () => {
  for (const kind of ["failed", "pending"] as const) {
    const { html, text } = render({ kind });
    assert.doesNotMatch(html + text, /ORDER CONFIRMED|PAYMENT RECEIVED|Total paid|Paid online|ORDER #|MF-\d|Estimated delivery|ESTIMATED DELIVERY|Delivering to|DELIVERING TO|Good things|is confirmed\b|account\/orders/, kind);
    // The shipping address belongs to an order; before one exists the email never repeats it.
    assert.doesNotMatch(html + text, /14 Palm Avenue|Karnataka 560001/, kind);
  }
});

test("without a payment id the reference is the checkout's own; the day is India's", () => {
  const { html, text } = render({ paymentId: null, at: new Date("2026-11-10T20:00:00.000Z") });
  assert.ok(html.includes(`>REFERENCE ${attemptId}<`));
  assert.ok(html.includes(`Reply with reference ${attemptId} if you need help.`));
  // 20:00 UTC is 01:30 the next morning in India.
  assert.ok(html.includes(">11 NOVEMBER 2026<"));
  assert.ok(text.includes(`Reference: ${attemptId}\nDate: 11 November 2026`));
  const pending = render({ kind: "pending", paymentId: null });
  assert.ok(pending.html.includes(`Still pending? Reply to this email with reference ${attemptId}.`));
});

test("a discount, GST on top and several pieces read as the order emails read them", () => {
  const second: Item = { ...nola, variantId: "keeri:maple:side-table", title: "Ora Side Table", variantTitle: "Walnut", quantity: 2,
    unitPricePaise: 1200000, lineTotalPaise: 2300000, discountPaise: 100000 };
  const quote = quoteWith({
    items: [nola, second], gstMode: "excluded", subtotalPaise: 4790000, shippingPaise: 0, taxPaise: 862200, totalPaise: 5652200,
    promotion: { code: "DIWALI10", label: "Diwali 10% off", discountPaise: 100000 },
  });
  const { html, text } = render({ quote, attempt: { id: attemptId, amountPaise: 5652200 } });
  assertInOrder(html, [">Nola Accent Chair<", ">Ora Side Table<", "Walnut<br>Quantity 2", ">₹24,000<",
    ">Subtotal<", ">₹48,900<", ">Discount (DIWALI10)<", ">−₹1,000<", ">Delivery<", ">Free<", ">GST<", ">₹8,622<",
    ">Amount to pay<", ">₹56,522<", ">Payment not completed · GST is added as shown<"]);
  assert.equal(html.split("YOUR PIECE").length - 1, 2);
  // The side table has no photo: a plain tile, never a broken image.
  assert.match(html, /<td class="m-photo" width="120" height="150" valign="top" bgcolor="#f1f0e9" style="width:120px;height:150px;background-color:#f1f0e9;font-size:0;line-height:0;">&nbsp;<\/td>/);
  assert.ok(text.includes("Your pieces\nNola Accent Chair"));
  assert.ok(text.includes("Discount (DIWALI10): −₹1,000\nDelivery: Free\nGST: ₹8,622\nAmount to pay: ₹56,522"));
});

test("every string from the customer or the catalogue is escaped", () => {
  const hostile = `<script>alert("x")</script>`;
  const { html, text } = render({
    quote: quoteWith({
      customer: { name: `${hostile} Sharma`, email: "a@example.com", phone: "+919876543210" },
      items: [{ ...nola, title: `Chair <b>bold</b> & "quoted"`, variantTitle: `Oak's <i>finish</i>` }],
    }),
    photos: new Map([[nola.variantId, `https://store.maplefurnishers.com/media/keeri/a"b'c.webp?x=<y>`]]),
  });
  for (const raw of ["<script", "<b>", "<i>", `"quoted"`, `a"b'c`, "<y>"]) assert.ok(!html.includes(raw), `unescaped: ${raw}`);
  for (const escaped of ["Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;,", "Chair &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;", "Oak&#39;s &lt;i&gt;finish&lt;/i&gt;"])
    assert.ok(html.includes(escaped), `not escaped as expected: ${escaped}`);
  assert.ok(text.includes(`Hi ${hostile}, we couldn’t complete your payment.`), "the plain-text part keeps the words as typed");
});

test("the payment emails are the order emails' layout: the same head, phone rules, button and footer", () => {
  const order = renderOrderEmail({
    kind: "confirmed", attempt: { id: attemptId, amountPaise: 2640000, capturedAt: new Date("2026-11-10T05:30:00.000Z") },
    quote: quoteWith(), orderNumber: "MF-10482", photos, origin,
  }).html;
  const head = (html: string) => html.slice(0, html.indexOf("<title>")) + html.slice(html.indexOf("</title>"), html.indexOf("<body"));
  const foot = (html: string) => html.slice(html.indexOf('<tr><td class="m-foot"'));
  for (const kind of ["failed", "pending"] as const) {
    const { html } = render({ kind });
    assert.equal(head(html), head(order), `${kind}: head and phone rules`);
    assert.equal(foot(html), foot(order), `${kind}: footer`);
    assert.doesNotMatch(html, /display:\s*(?:flex|grid)|<script|(?<![\w-])position:/i);
    assert.match(html, /<v:roundrect [^>]*style="height:52px;v-text-anchor:middle;width:600px;" arcsize="12%" stroke="f" fillcolor="#80241c">/);
    assert.match(html, /<div class="m-column" style="display:inline-block;width:100%;max-width:282px;[^"]*">[\s\S]*<div class="m-column" style="display:inline-block;width:100%;max-width:318px;/);
  }
});

test("the most pieces a quote allows stay under Gmail's clipping size", () => {
  const items = Array.from({ length: 50 }, (_, n) => ({ ...nola, variantId: `keeri:maple:piece-${n}`, title: `A rather long piece name, number ${n}` }));
  const many = new Map(items.map((item) => [item.variantId, `https://store.maplefurnishers.com/media/keeri/${item.variantId.slice(12)}.webp`]));
  for (const kind of ["failed", "pending"] as const) {
    const { html, text } = render({ kind, quote: quoteWith({ items }), photos: many });
    assert.equal(html.split("YOUR PIECE").length - 1, 50);
    assert.ok(html.length < 102_000, `${kind}: ${html.length} characters`);
    assert.ok(text.length < 20_000, `${kind}: ${text.length} characters`);
  }
});
