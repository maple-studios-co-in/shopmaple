/**
 * Readable product addresses: /products/<chair-name>?variant=<variant-name>. Old keeri-<id>
 * addresses reach the API's alias redirect and move here to the readable address.
 */
type AddressVariant = { id: string; slug?: string | null };

export function productPath(handle: string, variant?: AddressVariant) {
  const base = `/products/${encodeURIComponent(handle)}`;
  return variant ? `${base}?variant=${encodeURIComponent(variant.slug ?? variant.id)}` : base;
}

/** The variant an address names, by its readable slug or (for older links) its id. */
export function selectedVariant<V extends AddressVariant>(product: { variants: V[] }, value: string | undefined): V | undefined {
  if (!value) return undefined;
  return product.variants.find((v) => v.slug === value) ?? product.variants.find((v) => v.id === value);
}

/** Where a request should move permanently, or null when its address is already the readable one. */
export function productRedirect(requested: string, product: { handle: string; variants: AddressVariant[] }, variant: string | undefined): string | null {
  const chosen = selectedVariant(product, variant);
  const readable = chosen ? chosen.slug ?? chosen.id : variant;
  if (requested === product.handle && readable === variant) return null;
  const base = `/products/${encodeURIComponent(product.handle)}`;
  return readable ? `${base}?variant=${encodeURIComponent(readable)}` : base;
}

/**
 * The photos the product page shows for one variant: its own photos first, then the photos no
 * variant claims (room shots, details). A product without per-variant photos shows every photo.
 */
export function variantGallery(product: { images: string[]; variants: { images?: string[] }[] }, variant: { images?: string[] } | undefined) {
  const claimed = new Set(product.variants.flatMap((v) => v.images ?? []));
  if (!claimed.size) return product.images;
  const gallery = [...(variant?.images ?? []), ...product.images.filter((image) => !claimed.has(image))];
  return gallery.length ? gallery : product.images;
}
