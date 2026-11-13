import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Private order links (owner, 14 Nov 2026): a buyer opens their order, its tracking and its Cancel button from the
 * confirmation email or WhatsApp without an account. The link carries the order's number and a keyed signature of it:
 * `MF-10482-<32 hex>`, the first 128 bits of HMAC-SHA256 over "maple-order-link:v1:<number>" under ORDER_LINK_SECRET.
 * Nothing is stored; the same order always has the same link; a guessed or altered link opens nothing (the same 404 as a
 * missing order). Changing the secret retires every link sent so far, so it is set once.
 */
const refPattern = /^MF-([1-9][0-9]{0,9})-([a-f0-9]{32})$/;

function signature(secret: string, orderNumber: number) {
  return createHmac("sha256", secret).update(`maple-order-link:v1:${orderNumber}`).digest().subarray(0, 16);
}

export function orderLinkRef(secret: string, orderNumber: number) {
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) throw new Error("An order number is a positive whole number");
  return `MF-${orderNumber}-${signature(secret, orderNumber).toString("hex")}`;
}

/** The order number a reference signs, or null for anything that is not exactly a reference this secret made. */
export function parseOrderLinkRef(secret: string, ref: string): number | null {
  const match = refPattern.exec(ref);
  if (!match) return null;
  const orderNumber = Number(match[1]);
  if (!Number.isSafeInteger(orderNumber)) return null;
  const given = Buffer.from(match[2]!, "hex");
  return timingSafeEqual(given, signature(secret, orderNumber)) ? orderNumber : null;
}

/**
 * The store's two pages for an order, and the ends of Keeri's WhatsApp "View order" button, whose approved URL is
 * `<store>/account/orders/{{1}}`: the web app sends `/account/orders/<ref>` to the order page and
 * `/account/orders/<ref>-tracking` to the tracking page (next.config.ts).
 */
export function orderLinkPaths(secret: string, orderNumber: number) {
  const ref = orderLinkRef(secret, orderNumber);
  return { ref, view: `/orders/${ref}`, tracking: `/orders/${ref}/tracking`, whatsapp: { view: ref, tracking: `${ref}-tracking` } };
}

export type OrderLinkConfig = { secret: string; whatsappLinks: boolean };
/**
 * ORDER_LINK_SECRET (32 to 512 characters) turns private links on: emails and the account's orders link them. Unset,
 * emails link as before. WHATSAPP_ORDER_LINKS=true also hands the links (and the header's variant) to Keeri with a paid
 * order; set it only once Keeri accepts them (Keeri's `whatsappUpdates.orderLinks`), because an older Keeri refuses the
 * order.
 *
 * Both are optional extras, so a bad value never stops the API (and with it checkout): it switches the part it governs
 * off and logs one line naming the setting, never its value. A short or overlong secret leaves private links off;
 * a flag that is not true or false, or true without a secret, leaves WhatsApp on the links it sent before.
 */
export function loadOrderLinkConfig(
  env: Record<string, string | undefined>,
  warn: (line: string) => void = (line) => console.warn(line),
): OrderLinkConfig | null {
  const secret = env.ORDER_LINK_SECRET?.trim() ?? "";
  const rawFlag = env.WHATSAPP_ORDER_LINKS?.trim() || "false";
  let whatsappLinks = rawFlag === "true";
  if (rawFlag !== "true" && rawFlag !== "false")
    warn("WHATSAPP_ORDER_LINKS must be true or false; WhatsApp order messages keep their old links until it is fixed.");
  if (!secret) {
    if (whatsappLinks) warn("WHATSAPP_ORDER_LINKS=true needs ORDER_LINK_SECRET; WhatsApp order messages keep their old links until it is set.");
    return null;
  }
  if (secret.length < 32 || secret.length > 512) {
    warn("ORDER_LINK_SECRET must be 32 to 512 characters; private order links are off until it is fixed.");
    return null;
  }
  return { secret, whatsappLinks };
}
