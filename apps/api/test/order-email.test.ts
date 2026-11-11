import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { renderOrderEmail, type OrderEmailInput } from "../src/orders/order-email.js";

// The owner's sample order (Figma 394:1418) and variations of it.
const origin = "https://store.maple.example.com";
const attemptId = "6f1c2d3e-4b5a-4c6d-8e7f-001122334455";
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
function render(changes: Partial<OrderEmailInput> = {}) {
  return renderOrderEmail({
    kind: "confirmed",
    attempt: { id: attemptId, amountPaise: 2640000, capturedAt: new Date("2026-11-10T05:30:00.000Z") },
    quote: quoteWith(),
    orderNumber: "MF-10482",
    photos: new Map([[nola.variantId, "https://store.maplefurnishers.com/media/keeri/nola_01.webp"]]),
    origin,
    ...changes,
  });
}
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const withCapture = (iso: string) => ({ id: attemptId, amountPaise: 2640000, capturedAt: new Date(iso) });

test("the confirmation carries the frame's words, in its order, under the existing subject", () => {
  const { subject, html } = render();
  assert.equal(subject, "Your Maple Furnishers order MF-10482 is confirmed");
  const inOrder = [
    `src="${origin}/media/email/maple-logo.png" width="132" height="61"`,
    "✓&nbsp; ORDER CONFIRMED",
    "Good things are<br>coming home.",
    "Hi Aditi, your Maple order is confirmed. Here’s everything you need to know.",
    ">ORDER #MF-10482<", ">10 NOVEMBER 2026<",
    "YOUR PIECE", ">Nola Accent Chair<", "Natural cane · Oak finish<br>Quantity 1", ">₹24,900<",
    ">Subtotal<", ">₹24,900<", ">Delivery<", ">₹1,500<", ">Total paid<", ">₹26,400<",
    "Paid online · Inclusive of applicable taxes",
    "Next stop: your home.", "ESTIMATED DELIVERY", ">24–28 Nov 2026<", "Tracking will follow when<br>your order is dispatched.",
    "DELIVERING TO", "Aditi Sharma<br>14 Palm Avenue, Apartment 402<br>Bengaluru, Karnataka 560001",
    ">View your order<", "Need a hand? Reply to this email. We’re here to help.", "With care,<br>The Maple team",
    "MAPLE FURNISHERS", "Thoughtful furniture. Made for your everyday.", ">Contact us<", ">Privacy policy<",
  ];
  let from = 0;
  for (const words of inOrder) {
    const at = html.indexOf(words, from);
    assert.ok(at >= 0, `missing or out of order: ${words}`);
    from = at + words.length;
  }
  assert.doesNotMatch(html, />GST</, "GST inside the price has no row of its own");
  assert.match(html, /<div style="display:none;[^"]*">Order MF-10482 is confirmed\. Estimated delivery 24–28 Nov 2026\.&#847;/, "the hidden preheader");
});

test("the plain-text part says the same things", () => {
  assert.equal(render().text, [
    "Good things are coming home.",
    "",
    "Hi Aditi, your Maple order is confirmed. Here’s everything you need to know.",
    "",
    "Order number: MF-10482",
    "Order date: 10 November 2026",
    "",
    "Your piece",
    "Nola Accent Chair",
    "Natural cane · Oak finish",
    "Quantity 1 · ₹24,900",
    "",
    "Subtotal: ₹24,900",
    "Delivery: ₹1,500",
    "Total paid: ₹26,400",
    "Paid online · Inclusive of applicable taxes",
    "",
    "Next stop: your home.",
    "Estimated delivery: 24–28 Nov 2026",
    "Tracking will follow when your order is dispatched.",
    "",
    "Delivering to:",
    "Aditi Sharma",
    "14 Palm Avenue, Apartment 402",
    "Bengaluru, Karnataka 560001",
    "",
    `View your order: ${origin}/orders/${attemptId}`,
    "",
    "Need a hand? Reply to this email. We’re here to help.",
    "",
    "With care,",
    "The Maple team",
    "",
    "Maple Furnishers · Thoughtful furniture. Made for your everyday.",
    `Contact us: ${origin}/contact`,
    `Privacy policy: ${origin}/policies/privacy-policy`,
  ].join("\n"));
});

test("every string from the customer or the catalogue is escaped", () => {
  const hostile = `<script>alert("x")</script>`;
  const { html, text } = render({
    quote: quoteWith({
      customer: { name: `${hostile} Sharma`, email: "a@example.com", phone: "+919876543210" },
      shippingAddress: { ...address, line1: `<img src=x onerror=alert(1)>`, line2: `Flat 'B' & "C"`, city: "Pune <b>" },
      items: [{ ...nola, title: `Chair <b>bold</b> & "quoted"`, variantTitle: `Oak's <i>finish</i>` }],
    }),
    photos: new Map([[nola.variantId, `https://store.maplefurnishers.com/media/keeri/a"b'c.webp?x=<y>`]]),
  });
  for (const raw of ["<script", "<img src=x", "<b>", "<i>", `"quoted"`, "Flat 'B'", `a"b'c`, "<y>"])
    assert.ok(!html.includes(raw), `unescaped: ${raw}`);
  for (const escaped of [
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;", "&lt;img src=x onerror=alert(1)&gt;", "Flat &#39;B&#39; &amp; &quot;C&quot;",
    "Pune &lt;b&gt;", "Chair &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;", "Oak&#39;s &lt;i&gt;finish&lt;/i&gt;",
    'aria-label="Chair &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;"',
  ])
    assert.ok(html.includes(escaped), `not escaped as expected: ${escaped}`);
  // The plain-text part is not HTML and keeps the words as typed.
  assert.ok(text.includes(`Hi ${`<script>alert("x")</script>`}, your Maple order is confirmed.`));
});

test("several pieces repeat the piece row; a missing photo leaves a plain tile, never a broken image", () => {
  const pieces: Item[] = [
    { ...nola },
    { ...nola, variantId: "keeri:maple:side-table", title: "Ari Side Table", variantTitle: "Walnut", quantity: 2, lineTotalPaise: 1500000 },
    { ...nola, variantId: "keeri:maple:lamp", title: "Lumen Lamp", variantTitle: "Brass", lineTotalPaise: 350050 },
  ];
  const { html, text } = render({
    quote: quoteWith({ items: pieces, subtotalPaise: 4340050 }),
    photos: new Map([
      [pieces[0]!.variantId, "https://store.maplefurnishers.com/media/keeri/nola_09.webp"],
      [pieces[2]!.variantId, "https://store.maplefurnishers.com/media/keeri/lamp_01.webp"],
    ]),
  });
  assert.equal(count(html, "YOUR PIECE"), 3);
  for (const words of [">Nola Accent Chair<", ">Ari Side Table<", "Walnut<br>Quantity 2", ">₹15,000<", ">Lumen Lamp<", ">₹3,500.50<"])
    assert.ok(html.includes(words), words);
  // Keeri's WebP photos as filled backgrounds Outlook skips; the second piece a tile.
  assert.equal(count(html, '<img class="m-photo"'), 0);
  assert.equal(count(html, "background-image:url("), 2);
  assert.ok(html.includes("background-image:url(https://store.maplefurnishers.com/media/keeri/nola_09.webp);background-size:cover;"));
  assert.ok(html.includes("background-image:url(https://store.maplefurnishers.com/media/keeri/lamp_01.webp);background-size:cover;"));
  assert.ok(html.includes('role="img" aria-label="Lumen Lamp"'));
  assert.match(html, /<td class="m-photo" width="120" height="150" valign="top" bgcolor="#f1f0e9" style="width:120px;height:150px;background-color:#f1f0e9;font-size:0;line-height:0;">&nbsp;<\/td><td class="m-gap"[^>]*>\n<p[^>]*>YOUR PIECE<\/p>\n<p class="m-title"[^>]*>Ari Side Table</);
  assert.ok(text.includes("Your pieces\nNola Accent Chair\nNatural cane · Oak finish\nQuantity 1 · ₹24,900\n\nAri Side Table\nWalnut\nQuantity 2 · ₹15,000\n\nLumen Lamp\nBrass\nQuantity 1 · ₹3,500.50\n"));
  // Anything that is not a web address is no photo at all.
  const odd = render({ photos: new Map([[nola.variantId, "javascript:alert(1)"]]) }).html;
  assert.doesNotMatch(odd, /javascript:|<img class="m-photo"|background-image/);
});

test("GST is worded as the quote charged it", () => {
  const included = render();
  assert.ok(included.html.includes("Paid online · Inclusive of applicable taxes"));
  assert.doesNotMatch(included.html + included.text, /GST/);
  const excluded = render({
    attempt: { id: attemptId, amountPaise: 2398200, capturedAt: new Date("2026-11-10T05:30:00.000Z") },
    quote: quoteWith({ gstMode: "excluded", subtotalPaise: 1900000, shippingPaise: 0, taxPaise: 498200, totalPaise: 2398200 }),
  });
  assert.match(excluded.html, />GST<\/td><td class="m-amount"[^>]*>₹4,982</);
  assert.match(excluded.html, />Delivery<\/td><td class="m-amount"[^>]*>Free</);
  assert.ok(excluded.html.includes("Paid online · GST is added as shown"));
  assert.doesNotMatch(excluded.html + excluded.text, /Inclusive of applicable taxes|Paid via/);
  assert.ok(excluded.text.includes("Subtotal: ₹19,000\nDelivery: Free\nGST: ₹4,982\nTotal paid: ₹23,982\nPaid online · GST is added as shown"));
});

test("the order date and the delivery window are days on India's calendar", () => {
  // 19:00 UTC on 9 November is already 10 November in India.
  const late = render({ attempt: withCapture("2026-11-09T19:00:00.000Z") });
  assert.ok(late.html.includes(">10 NOVEMBER 2026<"));
  assert.ok(late.html.includes(">24–28 Nov 2026<"));
  const windowFor = (iso: string, changes: Partial<QuoteSnapshot> = {}) =>
    render({ attempt: withCapture(iso), quote: quoteWith(changes) }).text.match(/^Estimated delivery: (.+)$/m)?.[1];
  assert.equal(windowFor("2026-11-15T05:30:00.000Z"), "29 Nov – 3 Dec 2026");
  assert.equal(windowFor("2026-12-16T05:30:00.000Z"), "30 Dec 2026 – 3 Jan 2027");
  // Made-to-order time comes first: seven days' making and seven in transit is the same 24–28 Nov.
  const madeToOrder = quoteWith({ items: [{ ...nola, fulfilment: { kind: "made_to_order", leadTimeDays: 7 } }] });
  assert.equal(windowFor("2026-11-10T05:30:00.000Z", { ...madeToOrder, delivery: { ...madeToOrder.delivery!, carrier: { ...madeToOrder.delivery!.carrier!, estimatedDays: 7 } } }), "24–28 Nov 2026");
  // No courier estimate: no date is promised.
  const unknown = render({ quote: quoteWith({ delivery: { ...quoteWith().delivery!, carrier: { ...quoteWith().delivery!.carrier!, estimatedDays: null } } }) });
  assert.ok(unknown.html.includes(">To be confirmed<"));
  assert.ok(unknown.html.includes("We’ll confirm your delivery date with you. Tracking will follow when your order is dispatched."));
  assert.ok(unknown.text.includes("Estimated delivery: to be confirmed"));
  assert.match(unknown.html, /<div style="display:none;[^"]*">A beautiful choice\. Here are your order details\.&#847;/);
});

test("links go to the storefront: the order page, contact and the privacy policy", () => {
  const { html, text } = render({ origin: `${origin}/`, attempt: { id: "odd id/?#", amountPaise: 2640000, capturedAt: new Date("2026-11-10T05:30:00.000Z") } });
  const order = `${origin}/orders/odd%20id%2F%3F%23`;
  assert.equal(count(html, `href="${order}"`), 2, "the button, and Outlook's VML copy of it");
  assert.ok(html.includes(`<a href="${origin}/contact" target="_blank" style="color:#756d68;text-decoration:none;">Contact us</a>`));
  assert.ok(html.includes(`<a href="${origin}/policies/privacy-policy" target="_blank" style="color:#756d68;text-decoration:none;">Privacy policy</a>`));
  assert.ok(html.includes(`src="${origin}/media/email/maple-logo.png"`));
  assert.equal(html.match(/href="[^"]*"/g)?.filter((link) => !link.includes("fonts.googleapis.com")).length, 4, "no other links");
  assert.ok(text.includes(`View your order: ${order}\n`));
});

test("with accounts on, the order opens in the buyer's account on any device; without a Maple number it keeps the status page", () => {
  const account = render({ accountLinks: true });
  assert.equal(count(account.html, `href="${origin}/account/orders/MF-10482"`), 2, "the button, and Outlook's VML copy of it");
  assert.ok(account.text.includes(`View your order: ${origin}/account/orders/MF-10482\n`));
  assert.equal(account.html.includes(`/orders/${attemptId}`), false);
  for (const orderNumber of ["SO-2026-0042", null]) {
    const legacy = render({ accountLinks: true, orderNumber });
    assert.equal(count(legacy.html, `href="${origin}/orders/${attemptId}"`), 2, String(orderNumber));
    assert.equal(legacy.html.includes("/account/orders/"), false, String(orderNumber));
  }
  assert.equal(count(render({ accountLinks: false }).html, `href="${origin}/orders/${attemptId}"`), 2, "accounts off: the status page");
});

test("the payment-received email keeps its own wording in the same shell and never claims the order is confirmed", () => {
  const { subject, html, text } = render({ kind: "received" });
  assert.equal(subject, "We've received your payment for order MF-10482");
  for (const words of ["✓&nbsp; PAYMENT RECEIVED", "We’ve received<br>your payment.",
    "Hi Aditi, we’ve received your payment of ₹26,400. Our team is confirming your order by hand and will contact you within one business day.",
    ">ORDER #MF-10482<", ">10 NOVEMBER 2026<", ">Nola Accent Chair<", ">Total paid<", "What happens next.", "IF WE CAN’T CONFIRM IT",
    "We’ll refund in full to your original payment method. You don’t need to pay again.", "DELIVERY ADDRESS", ">View your order<"])
    assert.ok(html.includes(words), words);
  assert.doesNotMatch(html + text, /ORDER CONFIRMED|is confirmed|Good things are|Next stop|ESTIMATED DELIVERY|Estimated delivery|24–28 Nov|DELIVERING TO|Delivering to/);
  assert.ok(text.includes("Delivery address:\nAditi Sharma\n14 Palm Avenue, Apartment 402\nBengaluru, Karnataka 560001"));
  assert.ok(text.includes("If we can’t confirm it, we’ll refund in full to your original payment method. You don’t need to pay again."));
  // Without Maple's number the buyer gets the checkout reference, as before.
  const unnumbered = render({ kind: "received", orderNumber: null });
  assert.equal(unnumbered.subject, "We've received your payment");
  assert.ok(unnumbered.html.includes(`>REFERENCE ${attemptId}<`));
  assert.ok(unnumbered.text.includes(`Checkout reference: ${attemptId}`));
});

test("the HTML is built for mail apps: tables, a fluid 680px column, Outlook's fixed one, and phone rules", () => {
  const { html } = render();
  assert.doesNotMatch(html, /display:\s*(?:flex|grid)|<script|(?<![\w-])position:/i);
  assert.ok(html.includes('style="width:100%;max-width:680px;margin:0 auto;"'));
  assert.ok(html.includes('<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" align="center"><tr><td><![endif]-->'));
  assert.ok(html.includes("@media screen and (max-width:600px){"));
  for (const rule of [".m-h1{font-size:28px!important", ".m-photo{width:96px!important;height:120px!important}",
    ".m-column{display:block!important;width:100%!important;max-width:100%!important}", ".m-intro{padding:28px 20px 20px 20px!important}"])
    assert.ok(html.includes(rule), rule);
  // The delivery columns sit side by side at 600px and wrap below it, even where the media query is ignored. Each
  // column keeps 20px below itself (the gap once stacked), so the block keeps only 20 of its 40: the frame's spacing.
  assert.match(html, /<div class="m-column" style="display:inline-block;width:100%;max-width:282px;[^"]*">[\s\S]*<div class="m-column" style="display:inline-block;width:100%;max-width:318px;/);
  assert.ok(html.includes('<td class="m-next" bgcolor="#f1f0e9" style="padding:40px 40px 20px 40px;'));
  assert.ok(html.includes('<td class="m-column-gap" valign="top" style="padding:0 32px 20px 0;">'));
  assert.ok(html.includes('<td valign="top" style="padding:0 0 20px 0;">\n<p style="margin:0;font-family:\'Red Hat Display\', \'Helvetica Neue\', Arial, sans-serif;font-size:11px;line-height:15px;color:#756d68;">DELIVERING TO</p>'));
  assert.ok(html.includes("font-family:'DM Sans', 'Helvetica Neue', Arial, sans-serif;font-size:38px;"));
  assert.ok(html.includes("font-family:'Red Hat Display', 'Helvetica Neue', Arial, sans-serif;"));
  assert.ok(html.includes("https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500&amp;family=Red+Hat+Display:wght@400&amp;display=swap"));
  // Outlook gets a VML button 600×52 with the frame's 6px corners; the rest an ordinary link.
  assert.match(html, /<v:roundrect [^>]*style="height:52px;v-text-anchor:middle;width:600px;" arcsize="12%" stroke="f" fillcolor="#80241c">/);
});

test("an order with the most pieces a quote allows stays under Gmail's clipping size and the send limit", () => {
  const items = Array.from({ length: 50 }, (_, n) => ({ ...nola, variantId: `keeri:maple:piece-${n}`, title: `A rather long piece name, number ${n}` }));
  const photos = new Map(items.map((item) => [item.variantId, `https://store.maplefurnishers.com/media/keeri/${item.variantId.slice(12)}.webp`]));
  const { html, text } = render({ quote: quoteWith({ items }), photos });
  assert.equal(count(html, "YOUR PIECE"), 50);
  assert.ok(html.length < 102_000, `${html.length} characters`);
  assert.ok(text.length < 20_000, `${text.length} characters`);
});
