/**
 * The WhatsApp order confirmation (owner, 11 Nov 2026; Figma GJsFInfhys0crdNpQsbUUU): 394:1456 is the message on a phone,
 * 404:1410 its 1200 × 630 header image and 394:1477 what changes per order.
 *
 * A WhatsApp business message is a template Meta approves beforehand: here an IMAGE header, a BODY with numbered
 * variables and two URL buttons. This module holds the template exactly as it is submitted and a pure builder that fills
 * it for one order, giving the Cloud API `template` object to send and a preview model the development preview page
 * (apps/web/app/previews/whatsapp) draws. Sending lives in the API (apps/api/src/orders/whatsapp.ts) and stays off until
 * the owner's WhatsApp Business account, the approved template and the customer's opt-in exist
 * (docs/whatsapp-order-confirmation.md).
 *
 * Import this module by its subpath, `@shopmaple/contracts/whatsapp`. Like `/account`, it is not re-exported from the
 * package index, which ships in the homepage's JavaScript.
 */

export const orderConfirmationTemplateName = "order_confirmation";
export const orderConfirmationLanguage = "en";
export const orderConfirmationCategory = "UTILITY";
/** The message's title. WhatsApp shows it as the bold first line (`*…*`); the phone frame sets it larger (404:1400). */
export const orderConfirmationTitle = "Order confirmed";

/**
 * The BODY after its title, paragraph by paragraph as Figma 394:1456 lays the message out. `muted` marks what the frame
 * sets smaller and grey; WhatsApp itself shows every line alike.
 */
const bodyParagraphs: readonly { lines: readonly string[]; muted?: true }[] = [
  { lines: ["Hi {{1}}, thank you for choosing Maple."] },
  { lines: ["#{{2}}", "{{3}}", "Amount paid: {{4}}"] },
  { lines: ["Estimated delivery: {{5}}", "{{6}}"], muted: true },
  { lines: ["We’ll send tracking once dispatched."], muted: true },
];

/** The BODY exactly as it is submitted to Meta. */
export const orderConfirmationBody = [`*${orderConfirmationTitle}*`, ...bodyParagraphs.map((paragraph) => paragraph.lines.join("\n"))].join(
  "\n\n",
);

/**
 * The BODY's variables in order, with the longest value each may carry (in characters, an ellipsis included) and the
 * sample values submitted with the template (the Figma order). Every value is one trimmed line: WhatsApp refuses a
 * parameter holding a line break, a tab or more than four spaces in a row.
 */
export const orderConfirmationVariables = [
  { placeholder: "{{1}}", label: "Customer's first name", maxLength: 40, sample: "Aditi" },
  { placeholder: "{{2}}", label: "Order number (the template writes the #)", maxLength: 20, sample: "MF-10482" },
  { placeholder: "{{3}}", label: "Pieces and quantities, on one line", maxLength: 120, sample: "Nola Accent Chair × 1" },
  { placeholder: "{{4}}", label: "Amount paid", maxLength: 24, sample: "₹26,400" },
  { placeholder: "{{5}}", label: "Estimated delivery window", maxLength: 32, sample: "24–28 Nov 2026" },
  { placeholder: "{{6}}", label: "Delivery city and PIN code", maxLength: 60, sample: "Bengaluru · 560001" },
] as const;

/** The two buttons. "View order" is a URL button whose variable is the end of its URL: the Maple order number. It opens the
 * order in the customer's account (after signing in with the order's email), which works on any phone or computer; the
 * guest order page would find it only in the browser that paid. */
export const orderConfirmationButtons = [
  { type: "URL", text: "View order", path: "/account/orders/{{1}}" },
  { type: "URL", text: "Contact Maple", path: "/contact" },
] as const;

/** The Figma sample order (394:1456), which the preview page and the submitted examples use. */
export const orderConfirmationSample = {
  firstName: "Aditi",
  orderNumber: "MF-10482",
  pieces: [{ title: "Nola Accent Chair", quantity: 1 }],
  amountPaidPaise: 2_640_000,
  delivery: { from: "2026-11-24", to: "2026-11-28" },
  city: "Bengaluru",
  pincode: "560001",
} as const;

export interface OrderConfirmationInput {
  /** The customer's first name ("Aditi"). An empty one reads "Hi there". */
  firstName: string;
  /** Maple's order number, "MF-10482" (`formatOrderNumber` in ./account); the template writes the "#". "View order" opens
   * `/account/orders/<orderNumber>`. */
  orderNumber: string;
  /** The order's pieces in order: product title and quantity. */
  pieces: readonly { title: string; quantity: number }[];
  amountPaidPaise: number;
  /** The delivery estimate as calendar days in India, "2026-11-24" to "2026-11-28". */
  delivery: { from: string; to: string };
  city: string;
  /** The six-digit PIN code. */
  pincode: string;
  /** The store's public origin, "https://store.maplefurnishers.com". */
  origin: string;
  /** The header image: the origin plus `orderConfirmationMediaPath(handle of the first piece)`. */
  mediaUrl: string;
}

/** The Cloud API's `template` object for one message (POST /{phone-number-id}/messages, `type: "template"`). */
export interface OrderConfirmationTemplatePayload {
  name: typeof orderConfirmationTemplateName;
  language: { code: string };
  components: [
    { type: "header"; parameters: [{ type: "image"; image: { link: string } }] },
    { type: "body"; parameters: { type: "text"; text: string }[] },
    { type: "button"; sub_type: "url"; index: "0"; parameters: [{ type: "text"; text: string }] },
  ];
}

/** What the preview page draws: the same words WhatsApp shows, grouped as the Figma frame groups them. */
export interface OrderConfirmationPreview {
  mediaUrl: string;
  title: string;
  paragraphs: { lines: string[]; muted: boolean }[];
  buttons: { text: string; url: string }[];
  /** The BODY as the customer receives it, its `*…*` included. */
  text: string;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const orderNumberPattern = /^MF-[1-9][0-9]{0,9}$/;
const handlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const length = (text: string) => Array.from(text).length;
const loopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

/**
 * `value` as one trimmed line of at most `max` characters: line breaks, tabs and runs of spaces become one space,
 * control and bidirectional-override characters go, and a longer value ends in "…".
 */
export function singleLine(value: string, max: number) {
  const text = value
    .replace(/[\s\x85]+/g, " ")
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
  if (length(text) <= max) return text;
  return Array.from(text).slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";
}

/** "₹26,400", "₹1,23,456.50": Indian digit grouping, and no paise when the amount is whole rupees. */
export function formatRupees(paise: number) {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError("The amount must be a whole number of paise");
  const digits = paise % 100 ? 2 : 0;
  return "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(paise / 100);
}

function calendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [year, month, day]: [number, number, number] = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!match || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    throw new RangeError("Delivery days must be calendar days such as 2026-11-24");
  return { year, month: months[month - 1]!, day, time: date.getTime() };
}

/** "24–28 Nov 2026", "28 Nov – 2 Dec 2026", "30 Dec 2026 – 2 Jan 2027", or "24 Nov 2026" for a single day. */
export function formatDeliveryWindow(from: string, to: string) {
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (end.time < start.time) throw new RangeError("The delivery window ends before it starts");
  if (start.year !== end.year) return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
  if (start.month !== end.month) return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`;
  if (start.day === end.day) return `${start.day} ${start.month} ${start.year}`;
  return `${start.day}–${end.day} ${start.month} ${start.year}`;
}

/**
 * The pieces on one line: "Nola Accent Chair × 1, Oak Side Table × 2". When that is longer than `max`, the last pieces
 * become a count of what is left: "Nola Accent Chair × 1 and 3 more pieces".
 */
export function piecesLine(pieces: OrderConfirmationInput["pieces"], max: number = orderConfirmationVariables[2].maxLength) {
  if (!pieces.length) throw new RangeError("An order has at least one piece");
  const items = pieces.map(({ title, quantity }) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("Each piece needs a whole quantity of at least 1");
    return { title: singleLine(title, 80) || "Piece", quantity };
  });
  const item = ({ title, quantity }: (typeof items)[number]) => `${title} × ${quantity}`;
  const rest = (from: number) => {
    const count = items.slice(from).reduce((sum, piece) => sum + piece.quantity, 0);
    return ` and ${count} more ${count === 1 ? "piece" : "pieces"}`;
  };
  const whole = items.map(item).join(", ");
  if (length(whole) <= max) return whole;
  for (let shown = items.length - 1; shown >= 1; shown--) {
    const line = items.slice(0, shown).map(item).join(", ") + rest(shown);
    if (length(line) <= max) return line;
  }
  const tail = ` × ${items[0]!.quantity}${items.length > 1 ? rest(1) : ""}`;
  return singleLine(items[0]!.title, max - length(tail)) + tail;
}

/** Where the web app draws a product's header image (apps/web/app/whatsapp/order-media/[handle]/route.tsx). */
export function orderConfirmationMediaPath(handle: string) {
  if (!handlePattern.test(handle) || handle.length > 200) throw new RangeError("Not a product handle");
  return `/whatsapp/order-media/${handle}`;
}

/** The store's origin, https (or http on this computer, for previews). */
function storeOrigin(value: string) {
  const url = URL.canParse(value) ? new URL(value) : null;
  const secure = url && (url.protocol === "https:" || (url.protocol === "http:" && loopback(url.hostname)));
  if (!url || !secure || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new RangeError("origin must be the store's https origin");
  return url.origin;
}

function mediaLink(value: string) {
  const url = URL.canParse(value) ? new URL(value) : null;
  const secure = url && (url.protocol === "https:" || (url.protocol === "http:" && loopback(url.hostname)));
  if (!url || !secure || url.username || url.password || url.href.length > 1000) throw new RangeError("mediaUrl must be an https URL");
  return url.href;
}

function place(city: string, pincode: string) {
  const pin = singleLine(pincode, 6);
  if (!/^[1-9][0-9]{5}$/.test(pin)) throw new RangeError("pincode must be a six-digit PIN code");
  const town = singleLine(city, orderConfirmationVariables[5].maxLength - length(` · ${pin}`));
  return town ? `${town} · ${pin}` : pin;
}

/**
 * The confirmation for one order: the Cloud API `template` object to send and the preview the development page draws.
 * Throws a RangeError when the order lacks what the message needs (a Maple order number, a piece, a valid amount,
 * delivery window or PIN code, or a usable origin or image URL).
 */
export function orderConfirmationWhatsApp(input: OrderConfirmationInput): {
  template: OrderConfirmationTemplatePayload;
  preview: OrderConfirmationPreview;
} {
  const origin = storeOrigin(input.origin);
  const mediaUrl = mediaLink(input.mediaUrl);
  const orderNumber = singleLine(input.orderNumber, orderConfirmationVariables[1].maxLength).toUpperCase();
  if (!orderNumberPattern.test(orderNumber)) throw new RangeError("orderNumber must be a Maple order number, MF-…");
  const values = [
    singleLine(input.firstName, orderConfirmationVariables[0].maxLength) || "there",
    orderNumber,
    piecesLine(input.pieces),
    formatRupees(input.amountPaidPaise),
    formatDeliveryWindow(input.delivery.from, input.delivery.to),
    place(input.city, input.pincode),
  ];
  const fill = (text: string) => text.replace(/\{\{(\d)\}\}/g, (_, index: string) => values[Number(index) - 1]!);
  return {
    template: {
      name: orderConfirmationTemplateName,
      language: { code: orderConfirmationLanguage },
      components: [
        { type: "header", parameters: [{ type: "image", image: { link: mediaUrl } }] },
        { type: "body", parameters: values.map((text) => ({ type: "text" as const, text })) },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: orderNumber }] },
      ],
    },
    preview: {
      mediaUrl,
      title: orderConfirmationTitle,
      paragraphs: bodyParagraphs.map((paragraph) => ({ lines: paragraph.lines.map(fill), muted: paragraph.muted === true })),
      buttons: [
        { text: orderConfirmationButtons[0].text, url: `${origin}/account/orders/${orderNumber}` },
        { text: orderConfirmationButtons[1].text, url: `${origin}/contact` },
      ],
      text: fill(orderConfirmationBody),
    },
  };
}

/**
 * The template as the Graph API's create call takes it (POST /{business-account-id}/message_templates), with the sample
 * values Meta's review reads. The IMAGE header's sample is uploaded in WhatsApp Manager (or as an upload handle), so it
 * has no example here.
 */
export function orderConfirmationTemplate(origin: string) {
  const base = storeOrigin(origin);
  return {
    name: orderConfirmationTemplateName,
    language: orderConfirmationLanguage,
    category: orderConfirmationCategory,
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: orderConfirmationBody, example: { body_text: [orderConfirmationVariables.map((variable) => variable.sample)] } },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: orderConfirmationButtons[0].text,
            url: base + orderConfirmationButtons[0].path,
            example: [`${base}/account/orders/${orderConfirmationSample.orderNumber}`],
          },
          { type: "URL", text: orderConfirmationButtons[1].text, url: base + orderConfirmationButtons[1].path },
        ],
      },
    ],
  } as const;
}
