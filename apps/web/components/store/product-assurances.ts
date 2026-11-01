import type { Product } from "@shopmaple/contracts";

/** The warranty the page states: the product's own when the catalogue has one, else the store-wide 36 months. */
export function warrantyLabel(product: Pick<Product, "sourceDetails">) {
  const own = product.sourceDetails?.warranty?.trim();
  return own ? `${own} warranty` : "36-month warranty";
}

/**
 * The store's promises that its published policies support (shipping policy: delivery handled with logistics partners,
 * charges quoted per location; refund policy: manufacturing defects and transit damage are assessed for repair or
 * replacement when reported within 24–48 hours). The frame's free shipping, 14/30-day returns and 24/7 support
 * are not store policy, so they are not here.
 */
export const assurances = { delivery: "Delivery across India", cover: "Defect and damage cover" } as const;

/** "13%OFF" style discount from the variant's own prices; empty when it is not a real reduction. */
export function discountPercent(pricePaise: number | null | undefined, compareAtPaise: number | null | undefined) {
  if (pricePaise == null || !compareAtPaise || compareAtPaise <= pricePaise) return 0;
  return Math.round((1 - pricePaise / compareAtPaise) * 100);
}

/** An enquiry link carrying the piece, the chosen finish and its code. */
export function enquiryLink(product: Pick<Product, "title">, variant?: { title: string; sku: string | null }, pincode = "") {
  return "/pages/contact?" + new URLSearchParams({
    product: product.title,
    ...(variant ? { variant: variant.title } : {}),
    ...(variant?.sku ? { sku: variant.sku } : {}),
    ...(pincode ? { pincode } : {}),
  });
}
