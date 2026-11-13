/**
 * Development only: the handle that makes the WhatsApp header-image route (app/whatsapp/order-media) draw the Figma frames'
 * own Nola photograph, so the preview page (app/previews/whatsapp) shows the designed image even when the local catalogue
 * lacks or cannot reach the chair. In production it is an ordinary handle that no product has: a 404.
 */
export const previewSampleHandle = "preview-sample";

/** A store variant's slug as it rides in the header link's `?variant=`: the same shape Keeri accepts for it. */
export const variantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PictureSource = { images: string[]; variants: { slug?: string | null; images?: string[] }[] };
/**
 * The photo the WhatsApp confirmation's header draws: the bought variant's own first photo when its product serves it,
 * as the bag and the order emails choose it (apps/api/src/variant-photo.ts), else the product's first photo. The API
 * already puts photographs before dimension drawings in both lists. An unknown or malformed slug falls back to the
 * product's photo rather than failing the message.
 */
export function headerPhoto(product: PictureSource, variantSlug: string | null | undefined): string | undefined {
  const slug = variantSlug && variantSlug.length <= 64 && variantSlugPattern.test(variantSlug) ? variantSlug : null;
  const own = slug ? product.variants.find((variant) => variant.slug === slug)?.images?.[0] : undefined;
  return own && product.images.includes(own) ? own : product.images[0];
}
