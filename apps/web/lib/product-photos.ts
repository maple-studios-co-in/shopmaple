import "server-only";
import { getProductCards } from "@/lib/catalog";
import { isProductHandle } from "@/lib/recent-products";
import type { ProductPhotos } from "@/lib/template-media-defaults";

/**
 * Each listed product's first photo, for page artwork that stands in from Keeri until staff upload their own. Only what
 * the catalogue lists now: an unlisted product, or one without a photo, is absent, and a failed read is empty, so the
 * artwork is left out rather than drawn broken.
 */
export async function getProductPhotos(handles: readonly string[]): Promise<ProductPhotos> {
  const wanted = [...new Set(handles)].filter(isProductHandle);
  if (!wanted.length) return new Map();
  try {
    const cards = await getProductCards(wanted);
    return new Map(cards.flatMap((card) => (card.image ? [[card.handle, card.image] as const] : [])));
  } catch {
    return new Map();
  }
}
