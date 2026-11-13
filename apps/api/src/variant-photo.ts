/**
 * The photo of the variant a customer chose, wherever the store shows it back to them: the bag (and from it the checkout
 * and the screens after payment), the order emails and the account's orders (owner, 13 Nov 2026: "each product should
 * show the specific variant as chosen by the customer"). It is the variant's own first photo when its product serves it,
 * else the product's first; https only, and none once the product is no longer listed.
 */
export function variantPhoto(variant: { images: string[]; product: { published: boolean; images: string[] } }): string | null {
  if (!variant.product.published) return null;
  const https = (value: string | undefined) => (value?.startsWith("https://") ? value : null);
  const own = https(variant.images[0]);
  return own && variant.product.images.includes(own) ? own : https(variant.product.images[0]);
}
