import { shopifyMediaPath } from "@shopmaple/contracts/shopify-media";

/**
 * Server-only (node:crypto). The store's data names Shopify's files by the store's own copies (/media/shopify/<name>),
 * while a product from the API may still name a file by its Shopify address until the server has copied it
 * (docs/shopify-media-migration.md). This finds the product's own address for a picture the data names, so a match by
 * address keeps working either way.
 */
export function productImageFor(images: readonly string[], image: string): string {
  if (images.includes(image)) return image;
  return images.find((candidate) => shopifyMediaPath(candidate) === image) ?? image;
}

/** A presentation's variant pictures, each as the product itself names it. */
export function withProductImages<T extends { variantImages: Record<string, string> }>(presentation: T, images: readonly string[]): T {
  return { ...presentation, variantImages: Object.fromEntries(Object.entries(presentation.variantImages).map(([id, image]) => [id, productImageFor(images, image)])) };
}
