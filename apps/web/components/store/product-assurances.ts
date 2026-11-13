import type { Product, Variant } from "@shopmaple/contracts";

/**
 * The warranty the page states: the product's own when the catalogue has a short one ("One year" reads "One year warranty"),
 * "Product warranty" for a long free-text one (the text itself sits in the Specification card), else the store-wide 36 months.
 */
export function warrantyLabel(product: Pick<Product, "sourceDetails">) {
  const own = product.sourceDetails?.warranty?.trim();
  if (!own) return "36-month warranty";
  if (own.length > 30) return "Product warranty";
  return /warranty/i.test(own) ? own : `${own} warranty`;
}

/**
 * The store's promises that its published policies support (shipping policy: delivery handled with logistics partners,
 * charges quoted per location; refund policy: manufacturing defects and transit damage are assessed for repair or
 * replacement when reported within 24–48 hours). The frame's free shipping, 14/30-day returns and 24/7 support
 * are not store policy, so they are not here.
 */
export const assurances = { delivery: "Delivery across India", cover: "Defects and transit damage" } as const;

/**
 * Free delivery is per finish: Keeri staff tick it, and checkout then charges no courier rate for that finish. The page
 * says so only for a ticked finish the shopper can buy, in these words. Checkout still asks the courier about the
 * address first, so nothing here names a pincode or a place.
 */
export const freeDelivery = { label: "Free delivery", detail: "Confirmed for your address at checkout.", note: "Free delivery on this piece, confirmed for your address at checkout." } as const;
/**
 * A ticked finish the shopper can buy. The second half is the contracts' `canOrder`, repeated here: importing it puts it
 * in the script every page loads, which the homepage budget has no room for.
 */
export function shipsFree(variant?: Pick<Variant, "freeDelivery" | "available" | "pricePaise" | "stockPolicy">) {
  return variant?.freeDelivery === true && variant.available && variant.pricePaise !== null && variant.pricePaise > 0 && ["stocked", "made_to_order"].includes(variant.stockPolicy);
}

/** The showroom the contact page maps (Kirti Nagar, New Delhi), in place of the frame's pickup times, which the store has not published. */
export const showroom = { title: "Visit the Maple Furnishers showroom", address: "A-2/57, W.H.S, Kirti Nagar, New Delhi 110015", href: "/contact" } as const;

/** "13%OFF" style discount from the variant's own prices; empty when it is not a real reduction. */
export function discountPercent(pricePaise: number | null | undefined, compareAtPaise: number | null | undefined) {
  if (pricePaise == null || !compareAtPaise || compareAtPaise <= pricePaise) return 0;
  return Math.round((1 - pricePaise / compareAtPaise) * 100);
}

/** An enquiry link carrying the piece, the chosen finish and its code. */
export function enquiryLink(product: Pick<Product, "title">, variant?: { title: string; sku: string | null }) {
  return "/contact?" + new URLSearchParams({
    product: product.title,
    ...(variant ? { variant: variant.title } : {}),
    ...(variant?.sku ? { sku: variant.sku } : {}),
  });
}

/**
 * The finish the page opens on when none is chosen: the cheapest priced finish that has its own photo (the first of equals),
 * else the cheapest priced one. When the cheapest finish has no photo the page opens on a dearer one with a photo, so the
 * price can differ from the card's "From" price; a priced finish is never passed over for an unpriced one.
 */
export function cheapestPriced<T extends { id: string; pricePaise: number | null }>(variants: T[], hasPhoto: (id: string) => unknown): T | undefined {
  const cheapest = (list: T[]) => list.reduce<T | undefined>((best, v) => (v.pricePaise === null ? best : best === undefined || v.pricePaise < best.pricePaise! ? v : best), undefined);
  return cheapest(variants.filter((v) => hasPhoto(v.id))) ?? cheapest(variants);
}
