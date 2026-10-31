/**
 * Readable product addresses: /products/<chair-name>?variant=<variant-name>. Old keeri-<id>
 * addresses reach the API's alias redirect, and old links that carried a variant id still work.
 */
type AddressVariant = { id: string; slug?: string | null };
type Addressable = { handle: string; variants: AddressVariant[] };

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
export function productRedirect(requested: string, product: Addressable, variant: string | undefined): string | null {
  const chosen = selectedVariant(product, variant);
  if (requested === product.handle && (!chosen || variant === (chosen.slug ?? chosen.id))) return null;
  return productPath(product.handle, chosen);
}
