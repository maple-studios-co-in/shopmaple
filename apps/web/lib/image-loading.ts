import type { ImageLoaderProps } from "next/image";

// Shopify hosts most catalogue photos and resizes and re-encodes them at its own edge (?width=), returning WebP to
// browsers that take it. Asking it for the size a slot needs is far faster than the server's optimizer fetching a
// multi-megabyte original and encoding it on a cold cache, which is what made photos lag or time out.
const shopifyImage = /^https:\/\/(?:cdn\.shopify\.com\/s\/files\/|shop\.maplefurnishers\.com\/cdn\/shop\/)/;

export const isShopifyImage = (src: unknown): src is string => typeof src === "string" && shopifyImage.test(src);

/** Shopify's own resizer for a srcset width; any other query (the ?v= version) is kept. */
export function shopifyLoader({ src, width }: ImageLoaderProps) {
  const url = new URL(src);
  url.searchParams.set("width", String(width));
  return url.toString();
}

/**
 * Whether an address names one particular file of Maple's Shopify store ("files/Cover_Image_Maple_1.png"), by either
 * Shopify host and with any query: published content may still name a bundled default by its Shopify address.
 */
export function isShopifyFile(src: unknown, path: string): boolean {
  if (typeof src !== "string") return false;
  const bare = src.split(/[?#]/, 1)[0]!;
  return bare === `https://shop.maplefurnishers.com/cdn/shop/${path}` || bare === `https://cdn.shopify.com/s/files/1/0691/8651/9229/${path}`;
}

/** The loader for a photo: Shopify's resizer for its own files, else the default optimizer (undefined). */
export const imageLoaderFor = (src: unknown) => (isShopifyImage(src) ? shopifyLoader : undefined);

/**
 * For server-rendered images, which cannot hand a loader to the image component: Shopify's copy at a fixed width,
 * about twice the slot for sharp screens (a filling image gets 1920px), shown as it comes.
 */
export function shopifySized(src: string, slotWidth: number | undefined) {
  return shopifyLoader({ src, width: Math.min(2400, slotWidth ? Math.ceil(slotWidth * 2) : 1920) });
}
