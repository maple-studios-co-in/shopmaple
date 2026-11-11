import type { CheckoutAttempt, PrismaClient } from "@prisma/client";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { z } from "zod";
import { deliveryEstimate, indiaDay } from "../account/orders.js";

/**
 * The buyer's order emails as HTML, with a plain-text part that says the same things: the confirmation (Figma 394:1418,
 * "Maple / Email Template / Order Confirmation") and, in the same shell, "payment received, we're confirming it by
 * hand". What changes per order follows the content guide (Figma 394:1477).
 *
 * This is email HTML, not web HTML: nested tables and inline styles only (no flex or grid), a fluid column that is at
 * most 680px wide (fixed at 680 for Outlook for Windows through conditional comments), and one embedded media query
 * for phones, which Gmail and Apple Mail keep. Every string from the customer or the catalogue is escaped.
 */

export type OrderEmailKind = "confirmed" | "received";
/** Photo URLs by the snapshot item's (Keeri) variant id; an item without one gets a plain tile. */
export type OrderPhotos = ReadonlyMap<string, string>;
export type OrderEmailInput = {
  /** `confirmed`: Keeri accepted the order. `received`: paid, and the team is confirming it by hand. */
  kind: OrderEmailKind;
  attempt: Pick<CheckoutAttempt, "id" | "amountPaise" | "capturedAt">;
  quote: QuoteSnapshot;
  /** The number the buyer knows the order by ("MF-10482"); null shows the checkout reference instead. */
  orderNumber: string | null;
  photos: OrderPhotos;
  /** The storefront's origin, for the logo and every link. */
  origin: string;
  /** Customer accounts are on: "View your order" opens the order in the buyer's account (signing in with this email),
   * which works on any device. Otherwise, or for an order without an MF number, it opens the order status page, which
   * finds the order only in the browser that paid. */
  accountLinks?: boolean;
};
export type OrderEmail = { subject: string; html: string; text: string };

// ---------------------------------------------------------------------------------------------------------------------
// Words, numbers and dates
// ---------------------------------------------------------------------------------------------------------------------

const dmSans = "'DM Sans', 'Helvetica Neue', Arial, sans-serif";
const redHat = "'Red Hat Display', 'Helvetica Neue', Arial, sans-serif";
const ink = "#1c1c1c";
const muted = "#756d68";
const sand = "#f1f0e9";
const page = "#f8f7f3";
const white = "#ffffff";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (char) => entities[char]!);

/** "₹24,900", or "₹3,835.50" when there are paise: the storefront's money format (apps/web/lib/format.ts). */
const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);

/** GST state codes as checkout takes them; the same list as apps/web/app/checkout/india-states.ts. */
const stateNames: Record<string, string> = {
  "35": "Andaman and Nicobar Islands", "37": "Andhra Pradesh", "12": "Arunachal Pradesh", "18": "Assam", "10": "Bihar",
  "04": "Chandigarh", "22": "Chhattisgarh", "26": "Dadra and Nagar Haveli and Daman and Diu", "07": "Delhi", "30": "Goa",
  "24": "Gujarat", "06": "Haryana", "02": "Himachal Pradesh", "01": "Jammu and Kashmir", "20": "Jharkhand",
  "29": "Karnataka", "32": "Kerala", "38": "Ladakh", "31": "Lakshadweep", "23": "Madhya Pradesh", "27": "Maharashtra",
  "14": "Manipur", "17": "Meghalaya", "15": "Mizoram", "13": "Nagaland", "21": "Odisha", "34": "Puducherry",
  "03": "Punjab", "08": "Rajasthan", "11": "Sikkim", "33": "Tamil Nadu", "36": "Telangana", "16": "Tripura",
  "09": "Uttar Pradesh", "05": "Uttarakhand", "19": "West Bengal",
};

// Months are spelt out rather than left to Intl, whose British short form for September is "Sept" (as the account pages
// do, apps/web/lib/account/format.ts).
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function calendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}
/** "10 November 2026": the day of the payment, on India's calendar. */
function longDate(at: Date) {
  const day = calendarDay(indiaDay(at));
  return day ? `${day.day} ${longMonths[day.month - 1] ?? ""} ${day.year}` : "";
}
/** "24–28 Nov 2026", "29 Nov – 3 Dec 2026" or "30 Dec 2026 – 3 Jan 2027", as the account pages write a window. */
function dayRange(from: string, to: string) {
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (!start || !end) return null;
  const month = (day: { month: number }) => shortMonths[day.month - 1] ?? "";
  if (start.year !== end.year) return `${start.day} ${month(start)} ${start.year} – ${end.day} ${month(end)} ${end.year}`;
  if (start.month !== end.month) return `${start.day} ${month(start)} – ${end.day} ${month(end)} ${end.year}`;
  if (start.day === end.day) return `${start.day} ${month(start)} ${end.year}`;
  return `${start.day}–${end.day} ${month(start)} ${end.year}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------------------------------------------------

function webUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
// Shopify's CDN resizes and re-encodes by URL (the storefront's convention: isShopifyImage in apps/web/lib/image-loading).
const shopifyImage = /^https:\/\/(?:cdn\.shopify\.com\/s\/files\/|shop\.maplefurnishers\.com\/cdn\/shop\/)/;
/** The slot's 120×150 at twice the size, cropped to fill it, as a baseline JPEG: Outlook for Windows shows no WebP. */
function emailSized(url: URL) {
  const sized = new URL(url.href);
  sized.searchParams.set("width", "240");
  sized.searchParams.set("height", "300");
  sized.searchParams.set("crop", "center");
  sized.searchParams.set("format", "jpg");
  return sized.href;
}
/** For an unquoted CSS url(): the characters that would end it are percent-encoded. */
const cssUrl = (href: string) => href.replace(/[\s'"()\\]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

// The catalogue identities frozen with the quote (orders/catalogue-bindings.ts): snapshot variant id → local variant.
const frozenBindings = z.object({ items: z.array(z.object({ localVariantId: z.string(), sourceVariantId: z.string() })) });

/**
 * The pieces' photos, chosen as the account pages choose them (orderImages in account/service.ts), so the email and the
 * order page show the same picture: the bought variant's first photo when its product serves it, else the product's
 * first; https only, and only while the product is published. A snapshot item reaches its catalogue row through the
 * bindings frozen with the quote, else through the variant's Keeri identity.
 */
export async function findOrderPhotos(
  db: PrismaClient,
  attempt: Pick<CheckoutAttempt, "catalogueBindings">,
  quote: QuoteSnapshot,
): Promise<Map<string, string>> {
  const bindings = frozenBindings.safeParse(attempt.catalogueBindings);
  const local = new Map<string, string>();
  const unbound: string[] = [];
  for (const item of quote.items) {
    const bound = bindings.success ? bindings.data.items.find((binding) => binding.sourceVariantId === item.variantId) : undefined;
    if (bound) local.set(item.variantId, bound.localVariantId);
    else unbound.push(item.variantId);
  }
  if (unbound.length) {
    const identities = await db.variantSourceIdentity.findMany({
      where: { OR: unbound.map((externalId) => ({ source: externalId.split(":").slice(0, 2).join(":"), externalId })) },
      select: { externalId: true, variantId: true },
    });
    for (const identity of identities) local.set(identity.externalId, identity.variantId);
  }
  if (!local.size) return new Map();
  const variants = await db.variant.findMany({
    where: { id: { in: [...new Set(local.values())] } },
    select: { id: true, images: true, product: { select: { published: true, images: true } } },
  });
  const https = (value: string | undefined) => (value?.startsWith("https://") ? value : null);
  const byVariant = new Map(
    variants.map((variant) => {
      if (!variant.product.published) return [variant.id, null] as const;
      const own = https(variant.images[0]);
      return [variant.id, own && variant.product.images.includes(own) ? own : https(variant.product.images[0])] as const;
    }),
  );
  const photos = new Map<string, string>();
  for (const [sourceVariantId, variantId] of local) {
    const photo = byVariant.get(variantId);
    if (photo) photos.set(sourceVariantId, photo);
  }
  return photos;
}

// ---------------------------------------------------------------------------------------------------------------------
// HTML parts
// ---------------------------------------------------------------------------------------------------------------------

const table = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
/**
 * Inline type; a null family inherits its cell's. Line heights are the frame's 1.4 rounded to whole pixels. Outlook reads
 * them as minimums, which changes nothing here: 1.4 is above every font's own spacing. Kept short, because a quote's
 * fifty pieces must stay under the 102 KB at which Gmail clips a message.
 */
const type = (family: string | null, size: number, lineHeight: number, colour: string, weight = 400) =>
  `${family ? `font-family:${family};` : ""}font-size:${size}px;line-height:${lineHeight}px;color:${colour};${weight === 400 ? "" : `font-weight:${weight};`}`;
const ruleCell = `<td height="1" bgcolor="#e4ded8" style="height:1px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;background-color:#e4ded8;">&nbsp;</td>`;
const label = (words: string) => `<p style="margin:0;${type(redHat, 11, 15, muted)}">${words}</p>`;

/** Phones (Gmail and Apple Mail keep this block): narrower padding, smaller headings, a smaller photo beside its words,
 * receipt amounts to the right, and the delivery columns one under the other. */
const phoneStyles = `@media screen and (max-width:600px){
.m-head{padding:20px!important}
.m-intro{padding:28px 20px 20px 20px!important}
.m-receipt{padding:8px 20px 24px 20px!important}
.m-block{padding:28px 20px!important}
.m-next{padding:28px 20px 8px 20px!important}
.m-foot{padding:24px 20px!important}
.m-h1{font-size:28px!important;line-height:36px!important}
.m-h2{font-size:21px!important;line-height:29px!important}
.m-title{font-size:20px!important;line-height:27px!important}
.m-price{font-size:17px!important;line-height:24px!important}
.m-photo{width:96px!important;height:120px!important}
.m-gap{padding-left:16px!important}
.m-label{width:auto!important}
.m-amount{text-align:right!important}
.m-band{padding:16px!important}
.m-total-label{font-size:17px!important;line-height:24px!important}
.m-total{font-size:20px!important;line-height:28px!important}
.m-column{display:block!important;width:100%!important;max-width:100%!important}
.m-column-gap{padding:0 0 20px 0!important}
}`;

function photoCell(raw: string | undefined, title: string) {
  const box = `width:120px;height:150px;background-color:${sand};`;
  const url = webUrl(raw);
  if (url && shopifyImage.test(url.href))
    return `<td class="m-photo" width="120" height="150" valign="top" bgcolor="${sand}" style="${box}"><img class="m-photo" src="${esc(emailSized(url))}" width="120" height="150" alt="${esc(title)}" style="display:block;${box}border:0;outline:none;font-family:${redHat};font-size:12px;color:${muted};"></td>`;
  // Not resizable by URL (Keeri serves WebP only), so a background cropped to fill the tile: Gmail, Apple Mail and
  // Outlook.com draw it, and Outlook for Windows, which has neither WebP nor CSS backgrounds, keeps the plain tile.
  if (url)
    return `<td class="m-photo" width="120" height="150" valign="top" bgcolor="${sand}" role="img" aria-label="${esc(title)}" style="${box}background-image:url(${esc(cssUrl(url.href))});background-size:cover;background-position:center center;background-repeat:no-repeat;font-size:0;line-height:0;">&nbsp;</td>`;
  return `<td class="m-photo" width="120" height="150" valign="top" bgcolor="${sand}" style="${box}font-size:0;line-height:0;">&nbsp;</td>`;
}

function pieceRow(item: QuoteSnapshot["items"][number], photo: string | undefined) {
  return `<table ${table} width="100%" style="width:100%;"><tr>${photoCell(photo, item.title)}<td class="m-gap" valign="top" style="padding:0 0 0 24px;font-family:${redHat};">
<p style="margin:0;${type(null, 11, 15, muted)}">YOUR PIECE</p>
<p class="m-title" style="margin:12px 0 0 0;${type(dmSans, 23, 32, ink, 500)}word-break:break-word;">${esc(item.title)}</p>
<p style="margin:12px 0 0 0;${type(null, 14, 20, muted)}">${esc(item.variantTitle)}<br>Quantity ${item.quantity}</p>
<p class="m-price" style="margin:12px 0 0 0;${type(dmSans, 19, 27, ink, 500)}white-space:nowrap;">${esc(inr(item.lineTotalPaise + (item.discountPaise ?? 0)))}</p>
</td></tr></table>`;
}

function amountRow(name: string, amount: string, first: boolean) {
  const gap = first ? "" : "padding-top:20px;";
  return `<tr><td class="m-label" valign="top" style="width:62.667%;${gap}${type(redHat, 15, 21, muted)}">${name}</td><td class="m-amount" valign="top" style="${gap}${type(redHat, 15, 21, ink)}white-space:nowrap;">${esc(amount)}</td></tr>`;
}

function button(href: string, words: string) {
  // Outlook for Windows gets a VML button (rounded, the whole of it clickable); every other client the table.
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;v-text-anchor:middle;width:600px;" arcsize="12%" stroke="f" fillcolor="#80241c"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;">${words}</center></v:roundrect><![endif]--><!--[if !mso]><!--><table ${table} width="100%" style="width:100%;"><tr><td align="center" bgcolor="#80241c" style="border-radius:6px;background-color:#80241c;"><a href="${href}" target="_blank" style="display:block;padding:15px 20px;border-radius:6px;${type(redHat, 15, 22, white)}text-align:center;text-decoration:none;">${words}</a></td></tr></table><!--<![endif]-->`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------------------------------------------------

export function renderOrderEmail({ kind, attempt, quote, orderNumber, photos, origin, accountLinks = false }: OrderEmailInput): OrderEmail {
  const base = new URL(origin).origin;
  const links = {
    order: accountLinks && orderNumber && /^MF-[1-9][0-9]{0,9}$/.test(orderNumber)
      ? `${base}/account/orders/${orderNumber}`
      : `${base}/orders/${encodeURIComponent(attempt.id)}`,
    contact: `${base}/contact`,
    privacy: `${base}/policies/privacy-policy`,
    logo: `${base}/media/email/maple-logo.png`,
  };
  const name = quote.customer.name.trim();
  const firstName = name.split(/\s+/)[0] ?? name;
  const total = inr(attempt.amountPaise);
  const confirmed = kind === "confirmed";

  const subject = confirmed
    ? `Your Maple Furnishers order${orderNumber ? ` ${orderNumber}` : ""} is confirmed`
    : orderNumber ? `We've received your payment for order ${orderNumber}` : "We've received your payment";
  const pill = confirmed ? "ORDER CONFIRMED" : "PAYMENT RECEIVED";
  const heading = confirmed ? ["Good things are", "coming home."] : ["We’ve received", "your payment."];
  const intro = confirmed
    ? `Hi ${firstName}, your Maple order is confirmed. Here’s everything you need to know.`
    : `Hi ${firstName}, we’ve received your payment of ${total}. Our team is confirming your order by hand and will contact you within one business day.`;
  const reference = orderNumber ? `ORDER #${orderNumber}` : `REFERENCE ${attempt.id}`;
  const placed = attempt.capturedAt ? longDate(attempt.capturedAt) : "";

  // The window is a promise of sorts, so only a confirmed order states one.
  const estimate = confirmed && attempt.capturedAt ? deliveryEstimate(quote, attempt.capturedAt) : null;
  const arrival = estimate ? dayRange(estimate.from, estimate.to) : null;
  const included = quote.gstMode === "included";
  const amounts: Array<[string, string]> = [
    // With a code, the lines read before its discount and the discount follows as one line, so the email adds up to
    // what was charged (main's #120, as the staff email words it).
    ["Subtotal", inr(quote.subtotalPaise + (quote.promotion?.discountPaise ?? 0))],
    ...(quote.promotion ? [[`Discount (${esc(quote.promotion.code)})`, `−${inr(quote.promotion.discountPaise)}`] as [string, string]] : []),
    ["Delivery", quote.shippingPaise ? inr(quote.shippingPaise) : "Free"],
    ...(included ? [] : [["GST", inr(quote.taxPaise)] as [string, string]]),
  ];
  // Razorpay's payment method (UPI, card) is never stored, so the frame's "Paid via UPI" can only say "online".
  const paidNote = `Paid online · ${included ? "Inclusive of applicable taxes" : "GST is added as shown"}`;
  const address = quote.shippingAddress;
  const addressLines = [
    name,
    [address.line1, address.line2].filter(Boolean).join(", "),
    `${address.city}, ${stateNames[address.stateCode] ?? address.stateCode} ${address.pincode}`,
  ];
  const nextHeading = confirmed ? "Next stop: your home." : "What happens next.";
  const nextLabel = confirmed ? "ESTIMATED DELIVERY" : "IF WE CAN’T CONFIRM IT";
  // Neutral while the order is unconfirmed: it may yet be refunded rather than delivered.
  const addressLabel = confirmed ? "Delivering to" : "Delivery address";
  const nextNote = confirmed
    ? arrival ? "Tracking will follow when your order is dispatched." : "We’ll confirm your delivery date with you. Tracking will follow when your order is dispatched."
    : "We’ll refund in full to your original payment method. You don’t need to pay again.";
  // The inbox's one-line preview. Without a delivery window it is the content guide's own line (Figma 394:1477).
  const preheader = confirmed
    ? arrival
      ? `${orderNumber ? `Order ${orderNumber}` : "Your order"} is confirmed. Estimated delivery ${arrival}.`
      : "A beautiful choice. Here are your order details."
    : `We’ve received your payment of ${total}. Our team is confirming your order by hand.`;

  const pieces = quote.items.map((item) => `<tr><td style="padding-top:20px;">${pieceRow(item, photos.get(item.variantId))}</td></tr>`).join("\n");
  const next = confirmed
    ? `${label(nextLabel)}
<p style="margin:10px 0 0 0;${type(dmSans, 20, 28, ink, 500)}">${esc(arrival ?? "To be confirmed")}</p>
<p style="margin:10px 0 0 0;${type(redHat, 14, 20, muted)}">${arrival ? "Tracking will follow when<br>your order is dispatched." : esc(nextNote)}</p>`
    : `${label(nextLabel)}
<p style="margin:10px 0 0 0;${type(redHat, 14, 20, ink)}">${esc(nextNote)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if !mso]><!--><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500&amp;family=Red+Hat+Display:wght@400&amp;display=swap"><!--<![endif]-->
<style>
:root{color-scheme:light;supported-color-schemes:light}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}
</style>
<style>
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
${phoneStyles}
</style>
<!--[if mso]><style>body,table,td,p,a,h1,h2{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:${page};" bgcolor="${page}">
<div role="article" aria-roledescription="email" aria-label="${esc(subject)}" lang="en" style="background-color:${page};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${page};">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<table ${table} width="100%" bgcolor="${page}" style="width:100%;background-color:${page};"><tr><td align="center" style="padding:0;">
<!--[if mso]><table ${table} width="680" align="center"><tr><td><![endif]-->
<table ${table} width="100%" align="center" style="width:100%;max-width:680px;margin:0 auto;">
<tr><td class="m-head" align="center" bgcolor="${white}" style="padding:28px;background-color:${white};"><img src="${esc(links.logo)}" width="132" height="61" alt="Maple Furnishers" style="display:block;margin:0 auto;width:132px;height:61px;border:0;outline:none;text-decoration:none;${type(dmSans, 20, 61, "#80241c", 500)}"></td></tr>
<tr>${ruleCell}</tr>
<tr><td class="m-intro" bgcolor="${white}" style="padding:40px 40px 28px 40px;background-color:${white};">
<table ${table} width="100%" style="width:100%;">
<tr><td><table ${table} width="174" style="width:174px;"><tr><td bgcolor="#edf2e9" style="padding:10px;border-radius:20px;background-color:#edf2e9;${type(redHat, 11, 15, "#49634d")}">✓&nbsp; ${pill}</td></tr></table></td></tr>
<tr><td style="padding-top:16px;"><h1 class="m-h1" style="margin:0;${type(dmSans, 38, 53, "#272822", 500)}">${heading.join("<br>")}</h1></td></tr>
<tr><td style="padding-top:16px;"><p style="margin:0;${type(redHat, 16, 22, muted)}">${esc(intro)}</p></td></tr>
<tr><td style="padding-top:16px;"><table ${table} width="100%" style="width:100%;"><tr><td valign="top" style="width:54%;${type(redHat, 12, 17, ink)}">${esc(reference)}</td><td valign="top" style="${type(redHat, 12, 17, muted)}">${esc(placed.toUpperCase())}</td></tr></table></td></tr>
</table>
</td></tr>
<tr><td class="m-receipt" bgcolor="${white}" style="padding:8px 40px 32px 40px;background-color:${white};">
<table ${table} width="100%" style="width:100%;">
<tr>${ruleCell}</tr>
${pieces}
<tr><td style="padding-top:20px;"><table ${table} width="100%" style="width:100%;"><tr>${ruleCell}</tr></table></td></tr>
<tr><td style="padding-top:20px;"><table ${table} width="100%" style="width:100%;">
${amounts.map(([item, amount], index) => amountRow(item, amount, index === 0)).join("\n")}
</table></td></tr>
<tr><td style="padding-top:20px;"><table ${table} width="100%" bgcolor="#f3f4ef" style="width:100%;background-color:#f3f4ef;"><tr><td class="m-band" style="padding:20px;"><table ${table} width="100%" style="width:100%;"><tr><td class="m-label m-total-label" valign="top" style="width:63.571%;${type(dmSans, 20, 28, ink, 500)}">Total paid</td><td class="m-amount m-total" valign="top" style="${type(dmSans, 24, 34, ink, 500)}white-space:nowrap;">${esc(total)}</td></tr></table></td></tr></table></td></tr>
<tr><td style="padding-top:20px;"><p style="margin:0;${type(redHat, 12, 17, muted)}">${esc(paidNote)}</p></td></tr>
</table>
</td></tr>
<tr><td class="m-next" bgcolor="${sand}" style="padding:40px 40px 20px 40px;background-color:${sand};">
<h2 class="m-h2" style="margin:0;${type(dmSans, 24, 34, ink, 500)}">${esc(nextHeading)}</h2>
<table ${table} width="100%" style="width:100%;"><tr><td style="padding-top:20px;font-size:0;line-height:0;">
<!--[if mso]><table ${table} width="600"><tr><td width="282" valign="top"><![endif]--><div class="m-column" style="display:inline-block;width:100%;max-width:282px;vertical-align:top;"><table ${table} width="100%" style="width:100%;"><tr><td class="m-column-gap" valign="top" style="padding:0 32px 20px 0;">
${next}
</td></tr></table></div><!--[if mso]></td><td width="318" valign="top"><![endif]--><div class="m-column" style="display:inline-block;width:100%;max-width:318px;vertical-align:top;"><table ${table} width="100%" style="width:100%;"><tr><td valign="top" style="padding:0 0 20px 0;">
${label(addressLabel.toUpperCase())}
<p style="margin:10px 0 0 0;${type(redHat, 14, 20, ink)}word-break:break-word;">${addressLines.map(esc).join("<br>")}</p>
</td></tr></table></div><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</td></tr>
<tr><td class="m-block" bgcolor="${white}" style="padding:40px;background-color:${white};">
<table ${table} width="100%" style="width:100%;">
<tr><td>${button(esc(links.order), "View your order")}</td></tr>
<tr><td style="padding-top:18px;"><p style="margin:0;${type(redHat, 14, 20, muted)}">Need a hand? Reply to this email. We’re here to help.</p></td></tr>
<tr><td style="padding-top:18px;"><p style="margin:0;${type(redHat, 15, 21, ink)}">With care,<br>The Maple team</p></td></tr>
</table>
</td></tr>
<tr><td class="m-foot" align="center" bgcolor="${page}" style="padding:28px;background-color:${page};text-align:center;">
<p style="margin:0;${type(redHat, 12, 17, ink)}">MAPLE FURNISHERS</p>
<p style="margin:12px 0 0 0;${type(redHat, 12, 17, muted)}">Thoughtful furniture. Made for your everyday.</p>
<p style="margin:12px 0 0 0;${type(redHat, 12, 17, muted)}"><a href="${esc(links.contact)}" target="_blank" style="color:${muted};text-decoration:none;">Contact us</a>&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;<a href="${esc(links.privacy)}" target="_blank" style="color:${muted};text-decoration:none;">Privacy policy</a></p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body>
</html>
`;

  const text = [
    heading.join(" "),
    "",
    intro,
    "",
    orderNumber ? `Order number: ${orderNumber}` : `Checkout reference: ${attempt.id}`,
    ...(placed ? [`Order date: ${placed}`] : []),
    "",
    quote.items.length === 1 ? "Your piece" : "Your pieces",
    ...quote.items.flatMap((item, index) => [
      ...(index ? [""] : []),
      item.title,
      item.variantTitle,
      `Quantity ${item.quantity} · ${inr(item.lineTotalPaise + (item.discountPaise ?? 0))}`,
    ]),
    "",
    ...amounts.map(([item, amount]) => `${item}: ${amount}`),
    `Total paid: ${total}`,
    paidNote,
    "",
    nextHeading,
    confirmed ? `Estimated delivery: ${arrival ?? "to be confirmed"}` : "If we can’t confirm it, we’ll refund in full to your original payment method. You don’t need to pay again.",
    ...(confirmed ? [nextNote] : []),
    "",
    `${addressLabel}:`,
    ...addressLines,
    "",
    `View your order: ${links.order}`,
    "",
    "Need a hand? Reply to this email. We’re here to help.",
    "",
    "With care,",
    "The Maple team",
    "",
    "Maple Furnishers · Thoughtful furniture. Made for your everyday.",
    `Contact us: ${links.contact}`,
    `Privacy policy: ${links.privacy}`,
  ].join("\n");

  return { subject, html, text };
}
