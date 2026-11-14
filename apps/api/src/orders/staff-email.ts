import type { CheckoutAttempt } from "@prisma/client";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import {
  amountRow, button, dmSans, emailShell, esc, ink, inr, label, muted, page, pieceRow, receiptLines, redHat, ruleCell, sand,
  stateNames, storeLinks, table, type as font, white, type OrderPhotos, type OrderPieceDetails, type StoreLinks,
} from "./order-email.js";

/**
 * The emails to the Maple team, in the buyer emails' document (order-email.ts: the same shell, 680px column, tables,
 * inline styles and escaping), each with a plain-text part. "New order" leads with the order number, the total and a
 * button into Keeri, then the pieces, delivery, the customer (one tap to call, WhatsApp or email) and the payment's
 * references. The "needs attention" emails keep their words, every id and the refund warning, under a warning heading.
 * Every string from the customer or the catalogue is escaped.
 */

/** "Rs. 1,18,000.00": how staff emails have always written money, kept for subjects and the plain-text part. */
export const rupees = (paise: number) =>
  "Rs. " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100);

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Nov 2026, 3:42 pm IST": when the payment was captured, on India's clock. */
export function indiaTime(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${shortMonths[Number(parts.month) - 1] ?? ""} ${parts.year}, ${parts.hour}:${parts.minute} ${(parts.dayPeriod ?? "").toLowerCase()} IST`;
}

/** Razorpay's dashboard page for one payment; it opens in whichever mode (test or live) the dashboard is in. */
export const razorpayPaymentUrl = (paymentId: string) => `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(paymentId)}`;
/** The order's page in Keeri. */
export const keeriOrderUrl = (adminOrigin: string, keeriOrderId: string) => `${new URL(adminOrigin).origin}/orders/${encodeURIComponent(keeriOrderId)}`;
/** wa.me wants the number in international form, digits only; a bare ten-digit Indian number gets its 91. */
function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

const makingNote = (item: QuoteSnapshot["items"][number]) =>
  item.fulfilment?.kind === "made_to_order" ? `Made to order: allow ${item.fulfilment.leadTimeDays} days for making` : null;

/** The pieces and the charges as staff alerts have always listed them, for the plain-text part. */
export function staffLines(quote: QuoteSnapshot) {
  // With a code, each line reads at its price before the discount and the discount follows as one line, so the email
  // adds up to what was charged.
  return [
    ...quote.items.map((i) => {
      const making = i.fulfilment?.kind === "made_to_order" ? ` (made to order: allow ${i.fulfilment.leadTimeDays} days for making)` : "";
      return `- ${i.title}, ${i.variantTitle} × ${i.quantity}: ${rupees(i.lineTotalPaise + (i.discountPaise ?? 0))}${making}`;
    }),
    ...(quote.promotion ? [`Discount (${quote.promotion.code}): -${rupees(quote.promotion.discountPaise)}`] : []),
  ];
}
/** "Delivery: free (free-delivery products), ships by Delhivery Surface, about 5 days in transit". */
export function deliveryLine(quote: QuoteSnapshot) {
  const courier = quote.delivery?.carrier;
  // Free delivery is the owner's rule, not a missed charge: say so, and that the courier is still booked.
  const charge = quote.delivery?.source === "free" ? "free (free-delivery products), ships" : rupees(quote.shippingPaise);
  return courier
    ? `Delivery: ${charge} by ${courier.courierName}${courier.estimatedDays ? `, about ${courier.estimatedDays} days in transit` : ""}`
    : `Delivery: ${rupees(quote.shippingPaise)}`;
}
function addressLines(quote: QuoteSnapshot) {
  const a = quote.shippingAddress;
  return [a.line1, a.line2, `${a.city}, ${stateNames[a.stateCode] ?? a.stateCode} ${a.pincode}`].filter(Boolean);
}

// ---------------------------------------------------------------------------------------------------------------------
// HTML parts
// ---------------------------------------------------------------------------------------------------------------------

type Chip = { words: string; background: string; colour: string };
const chips = {
  order: { words: "NEW ORDER", background: "#edf2e9", colour: "#49634d" },
  test: { words: "TEST PAYMENT", background: "#f2d284", colour: "#4a3401" },
  attention: { words: "NEEDS ATTENTION", background: "#ffd7d7", colour: "#80241c" },
} satisfies Record<string, Chip>;

function chipRow(list: Chip[]) {
  const cells = list.map((chip) =>
    `<td bgcolor="${chip.background}" style="padding:8px 12px;border-radius:20px;background-color:${chip.background};${font(redHat, 11, 15, chip.colour)}white-space:nowrap;">${esc(chip.words)}</td>`);
  return `<table ${table}><tr>${cells.join(`<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`)}</tr></table>`;
}
const link = (href: string, words: string, colour = "#80241c") =>
  `<a href="${esc(href)}" target="_blank" style="color:${colour};text-decoration:underline;">${esc(words)}</a>`;
const section = (cls: string, background: string, inner: string, padding = "32px 40px") =>
  `<tr><td class="${cls}" bgcolor="${background}" style="padding:${padding};background-color:${background};">\n${inner}\n</td></tr>\n`;

/** The pieces, the charges and the total: the buyer's receipt, for staff, with each piece's making time. */
function piecesBlock(quote: QuoteSnapshot, total: number, photos: OrderPhotos, details?: OrderPieceDetails) {
  const pieces = quote.items.map((item, index) =>
    `<tr><td style="padding-top:${index ? 20 : 16}px;">${pieceRow(item, photos.get(item.variantId), details?.get(item.variantId), false, "", makingNote(item))}</td></tr>`).join("\n");
  const amounts = receiptLines(quote).map(([name, amount]): [string, string] =>
    name === "Delivery" && quote.delivery?.source === "free" ? [name, "Free (free-delivery products)"] : [name, amount]);
  return `<table ${table} width="100%" style="width:100%;">
<tr><td>${label(quote.items.length === 1 ? "PIECE ORDERED" : `${quote.items.length} PIECES ORDERED`)}</td></tr>
${pieces}
<tr><td style="padding-top:20px;"><table ${table} width="100%" style="width:100%;"><tr>${ruleCell}</tr></table></td></tr>
<tr><td style="padding-top:20px;"><table ${table} width="100%" style="width:100%;">
${amounts.map(([name, amount], index) => amountRow(name, amount, index === 0)).join("\n")}
<tr><td class="m-label" valign="top" style="width:62.667%;padding-top:20px;${font(dmSans, 18, 25, ink, 500)}">Total paid</td><td class="m-amount" valign="top" style="padding-top:20px;${font(dmSans, 18, 25, ink, 500)}white-space:nowrap;">${esc(inr(total))}</td></tr>
</table></td></tr>
</table>`;
}

/** Delivery, then the customer with a tap to call, WhatsApp or email them. */
function customerBlock(quote: QuoteSnapshot, whatsappOptIn: boolean | null) {
  const courier = quote.delivery?.carrier;
  const charge = quote.delivery?.source === "free" ? "Free (free-delivery products)" : quote.shippingPaise ? inr(quote.shippingPaise) : "Free";
  const delivery = [
    charge,
    ...(courier ? [`${courier.courierName}${courier.estimatedDays ? ` · about ${courier.estimatedDays} days in transit` : ""}`] : []),
  ];
  const { name, phone, email } = quote.customer;
  const p = (inner: string, top = 10) => `<p style="margin:${top}px 0 0 0;${font(redHat, 14, 20, ink)}word-break:break-word;">${inner}</p>`;
  return `${label("DELIVERY")}
${p(delivery.map(esc).join("<br>"))}
<p style="margin:24px 0 0 0;">&nbsp;</p>
${label("CUSTOMER")}
<p style="margin:10px 0 0 0;${font(dmSans, 18, 25, ink, 500)}word-break:break-word;">${esc(name)}</p>
${p(`${link(`tel:${phone.replace(/[^\d+]/g, "")}`, phone)}&nbsp;&nbsp;·&nbsp;&nbsp;${link(whatsappUrl(phone), "WhatsApp")}`)}
${p(link(`mailto:${email}`, email), 6)}
${p(addressLines(quote).map(esc).join("<br>"))}
${whatsappOptIn === null ? "" : p(esc(whatsappOptIn ? "Asked for order updates on WhatsApp" : "Did not ask for WhatsApp updates"), 10)}`;
}

/** The small print at the bottom: each reference on its own line, a payment id linked to Razorpay. */
function referenceBlock(facts: Array<{ name: string | null; value: string; href?: string }>, closing: string | null) {
  const rows = facts.map(({ name, value, href }) => name === null
    ? `<tr><td colspan="2" style="padding-top:8px;${font(redHat, 12, 17, ink)}">${esc(value)}</td></tr>`
    : `<tr><td valign="top" style="width:38%;padding-top:8px;${font(redHat, 12, 17, muted)}">${esc(name)}</td><td valign="top" style="padding-top:8px;${font(redHat, 12, 17, ink)}word-break:break-all;">${href ? link(href, value, ink) : esc(value)}</td></tr>`);
  return `${label("REFERENCES")}
<table ${table} width="100%" style="width:100%;margin-top:4px;">
${rows.join("\n")}
</table>${closing ? `\n<p style="margin:16px 0 0 0;${font(redHat, 12, 17, "#80241c")}">${esc(closing)}</p>` : ""}`;
}

const staffFoot = (links: StoreLinks) =>
  `<tr><td class="m-foot" align="center" bgcolor="${page}" style="padding:24px 28px;background-color:${page};text-align:center;">
<p style="margin:0;${font(redHat, 12, 17, muted)}">Sent to the Maple team by the store at ${esc(new URL(links.base).host)}. Not for customers.</p>
</td></tr>
`;

type StaffLayout = {
  subject: string;
  preheader: string;
  chips: Chip[];
  heading: string;
  /** Warning-toned heading, for the "needs attention" emails. */
  warn: boolean;
  intro: string | null;
  /** The large total and when it was paid, under the heading. */
  headline: { amount: string; when: string | null } | null;
  keeri: string | null;
  quote: QuoteSnapshot | null;
  total: number;
  photos: OrderPhotos;
  details?: OrderPieceDetails;
  whatsappOptIn: boolean | null;
  facts: Array<{ name: string | null; value: string; href?: string }>;
  closing: string | null;
  links: StoreLinks;
};

function staffLayout(l: StaffLayout) {
  const top = `<table ${table} width="100%" style="width:100%;">
<tr><td>${chipRow(l.chips)}</td></tr>
<tr><td style="padding-top:16px;"><h1 class="m-h1" style="margin:0;${font(dmSans, l.warn ? 30 : 38, l.warn ? 40 : 53, l.warn ? "#80241c" : "#272822", 500)}">${esc(l.heading)}</h1></td></tr>
${l.headline ? `<tr><td style="padding-top:8px;"><p style="margin:0;${font(dmSans, 24, 34, ink, 500)}">${esc(l.headline.amount)}</p>${l.headline.when ? `<p style="margin:4px 0 0 0;${font(redHat, 14, 20, muted)}">Paid ${esc(l.headline.when)}</p>` : ""}</td></tr>\n` : ""}${l.intro ? `<tr><td style="padding-top:16px;"><p style="margin:0;${font(redHat, 16, 23, ink)}">${esc(l.intro)}</p></td></tr>\n` : ""}${l.keeri ? `<tr><td style="padding-top:24px;">${button(esc(l.keeri), "Open in Keeri")}</td></tr>\n` : ""}</table>`;
  const rows = [
    section("m-intro", white, top, "36px 40px 32px 40px"),
    `<tr>${ruleCell}</tr>\n`,
    ...(l.quote ? [section("m-block", white, piecesBlock(l.quote, l.total, l.photos, l.details)), section("m-block", sand, customerBlock(l.quote, l.whatsappOptIn))] : []),
    section("m-block", white, referenceBlock(l.facts, l.closing), "28px 40px"),
  ].join("");
  return emailShell({ subject: l.subject, preheader: l.preheader, links: l.links, rows, foot: staffFoot(l.links) });
}

// ---------------------------------------------------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------------------------------------------------

export type StaffOrderInput = {
  attempt: Pick<CheckoutAttempt, "id" | "amountPaise" | "capturedAt" | "paymentId" | "providerOrderId" | "whatsappOptInAt">;
  quote: QuoteSnapshot | null;
  /** "MF-10006"; null before order numbers existed. */
  orderNumber: string | null;
  /** Keeri's id for the order it accepted. */
  keeriOrderId: string;
  photos: OrderPhotos;
  details?: OrderPieceDetails;
  /** The storefront's origin, for the logo. */
  origin: string;
  /** Keeri's admin origin, for "Open in Keeri"; null leaves the button out. */
  keeriAdminOrigin: string | null;
  /** From the Razorpay key: a test payment is tagged so nobody packs it. */
  paymentMode: "test" | "live" | null;
};

/** "New order": a confirmed, paid order Keeri accepted. */
export function renderStaffOrderEmail(input: StaffOrderInput) {
  const { attempt, quote, orderNumber, keeriOrderId, photos, details, paymentMode } = input;
  const links = storeLinks(input.origin);
  const name = orderNumber ?? attempt.id;
  const total = rupees(attempt.amountPaise);
  const first = quote?.items[0];
  const more = quote && quote.items.length > 1 ? ` +${quote.items.length - 1} more` : "";
  const subject = `New order ${name} · ${total}${first ? ` · ${first.title}, ${first.variantTitle}${more}` : ""}`;
  const when = attempt.capturedAt ? indiaTime(attempt.capturedAt) : null;
  const keeri = input.keeriAdminOrigin ? keeriOrderUrl(input.keeriAdminOrigin, keeriOrderId) : null;
  const test = paymentMode === "test";
  const facts = [
    ...(attempt.paymentId ? [{ name: "Razorpay payment", value: attempt.paymentId, href: razorpayPaymentUrl(attempt.paymentId) }] : []),
    { name: "Razorpay order", value: attempt.providerOrderId ?? "none" },
    { name: "Checkout", value: attempt.id },
    { name: "Keeri order", value: keeriOrderId },
  ];
  const html = staffLayout({
    subject,
    preheader: `${quote ? `${quote.customer.name} · ` : ""}${first ? `${first.title}${more}` : "Paid online"}${when ? ` · paid ${when}` : ""}`,
    chips: test ? [chips.order, chips.test] : [chips.order],
    heading: name,
    warn: false,
    intro: test ? "Paid with a Razorpay test key: no money was taken. Do not make or ship it." : null,
    headline: { amount: inr(attempt.amountPaise), when },
    keeri,
    quote,
    total: attempt.amountPaise,
    photos,
    details,
    whatsappOptIn: quote ? Boolean(attempt.whatsappOptInAt) : null,
    facts,
    closing: null,
    links,
  });
  const text = [
    `New order ${name}: ${total}`,
    ...(test ? ["TEST PAYMENT: paid with a Razorpay test key; no money was taken. Do not make or ship it."] : []),
    ...(when ? [`Paid: ${when}`] : []),
    ...(keeri ? [`Open in Keeri: ${keeri}`] : []),
    ...(quote
      ? [
          "",
          ...staffLines(quote),
          ...quote.items.flatMap((item) => {
            const dimensions = details?.get(item.variantId)?.dimensions;
            return dimensions ? [`  ${item.title} dimensions: ${dimensions}`] : [];
          }),
          deliveryLine(quote),
          `Total: ${total}`,
          "",
          `Customer: ${quote.customer.name}`,
          `Phone: ${quote.customer.phone} (WhatsApp: ${whatsappUrl(quote.customer.phone)})`,
          `Email: ${quote.customer.email}`,
          `Deliver to: ${addressLines(quote).join(", ")}`,
          `WhatsApp updates: ${attempt.whatsappOptInAt ? "yes" : "no"}`,
        ]
      : []),
    "",
    ...facts.map((fact) => `${fact.name}: ${fact.value}${fact.href ? ` (${fact.href})` : ""}`),
  ].join("\n");
  return { subject, html, text };
}

export type StaffAttentionInput = {
  subject: string;
  /** The plain-text email exactly as staff have always had it. */
  text: string;
  /** Its opening sentence, kept word for word. */
  intro: string;
  heading: string;
  /** The reference lines ("Payment: pay_…", "Checkout: …"), each as the text has it. */
  facts: string[];
  /** The refund warning, word for word. */
  closing: string;
  quote: QuoteSnapshot | null;
  attempt: Pick<CheckoutAttempt, "amountPaise" | "whatsappOptInAt"> | null;
  photos: OrderPhotos;
  origin: string;
  /** "Open in Keeri", only where Keeri holds an order. */
  keeri: string | null;
};

/** A "needs attention" email: the same layout under a warning heading, with every word and id of the plain text. */
export function renderStaffAttentionEmail(input: StaffAttentionInput) {
  const links = storeLinks(input.origin);
  const facts = input.facts.filter((line) => line.trim()).map((line) => {
    const at = line.indexOf(": ");
    if (at < 0) return { name: null, value: line };
    const value = line.slice(at + 2);
    // A Razorpay payment id opens its page in the dashboard, where staff check it before anything else.
    const payment = /^pay_[A-Za-z0-9]+/.exec(value)?.[0];
    return { name: line.slice(0, at), value, ...(payment ? { href: razorpayPaymentUrl(payment) } : {}) };
  });
  const html = staffLayout({
    subject: input.subject,
    preheader: input.intro,
    chips: [chips.attention],
    heading: input.heading,
    warn: true,
    intro: input.intro,
    headline: null,
    keeri: input.keeri,
    quote: input.quote,
    total: input.attempt?.amountPaise ?? input.quote?.totalPaise ?? 0,
    photos: input.photos,
    whatsappOptIn: input.quote && input.attempt ? Boolean(input.attempt.whatsappOptInAt) : null,
    facts,
    closing: input.closing,
    links,
  });
  // The plain text is staff's own, unchanged but for the link into Keeri after its opening sentence.
  const [opening = "", ...rest] = input.text.split("\n");
  const text = input.keeri ? [opening, `Open in Keeri: ${input.keeri}`, ...rest].join("\n") : input.text;
  return { subject: input.subject, html, text };
}
