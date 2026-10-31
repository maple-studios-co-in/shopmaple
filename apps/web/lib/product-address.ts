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

/**
 * Where a request should move permanently, or null when its address is already the readable one.
 * The chosen variant is carried over exactly as given: the current product page picks variants by
 * id, and switches to slugs when the redesigned page is connected.
 */
export function productRedirect(requested: string, product: { handle: string }, variant: string | undefined): string | null {
  if (requested === product.handle) return null;
  const base = `/products/${encodeURIComponent(product.handle)}`;
  return variant ? `${base}?variant=${encodeURIComponent(variant)}` : base;
}
