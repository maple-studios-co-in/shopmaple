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

/** The loader for a photo: Shopify's resizer for its own files, else the default optimizer (undefined). */
export const imageLoaderFor = (src: unknown) => (isShopifyImage(src) ? shopifyLoader : undefined);

/**
 * For server-rendered images, which cannot hand a loader to the image component: Shopify's copy at a fixed width,
 * about twice the slot for sharp screens (a filling image gets 1920px), shown as it comes.
 */
export function shopifySized(src: string, slotWidth: number | undefined) {
  return shopifyLoader({ src, width: Math.min(2400, slotWidth ? Math.ceil(slotWidth * 2) : 1920) });
}
