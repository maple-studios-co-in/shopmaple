import type { Product, ProductReview, ProductSpecs, Variant } from "@shopmaple/contracts";
import type { Cutout, Hotspot } from "./product-hotspots";

/**
 * Keeri's product-page data, read for the page (Keeri docs/shopmaple-product-page.md). Every helper returns nothing
 * when Keeri sent nothing, so a product nobody has filled in looks exactly as it did before.
 */

/** The white-background photo for this finish (else the product's own), with Keeri's numbered notes on it. */
export function keeriCutout(product: Product, variantId: string | undefined): { image: string; hotspots: Hotspot[] } | undefined {
  const cutouts = (product.productPage?.media ?? []).filter((m) => m.role === "cutout");
  const photo = cutouts.find((m) => m.variantId !== null && m.variantId === variantId) ?? cutouts.find((m) => m.variantId === null);
  if (!photo) return undefined;
  return { image: photo.url, hotspots: photo.hotspots.filter((h) => h.text.trim()).map((h) => ({ x: h.x, y: h.y, label: h.label, note: h.text })) };
}

/** Prefer Keeri's cut-out; a hand-placed one from presentation data stays only as the fallback for products without. */
export function cutoutOf(product: Product, variantId: string | undefined, fallback: Cutout | undefined, resolve: (c: Cutout | undefined) => Hotspot[]) {
  const keeri = keeriCutout(product, variantId);
  if (keeri) return keeri;
  return fallback ? { image: fallback.image, hotspots: resolve(fallback) } : undefined;
}

/** Staff-written alt text for a photo, when Keeri holds one. */
export function altFor(product: Product, src: string | undefined): string | undefined {
  return src ? product.productPage?.media.find((m) => m.url === src)?.altText ?? undefined : undefined;
}

/** The rating shown under the price and in the reviews band: Keeri's approved reviews first, else what staff typed. */
/** The piece's rating: the average and count of its approved reviews in Keeri, or null when it has none (owner, 4 Nov 2026). */
export function productRating(product: Product): { value: number; count: number } | null {
  const reviews = product.productPage?.reviews;
  return reviews && reviews.count > 0 && reviews.average !== null ? { value: reviews.average, count: reviews.count } : null;
}

export function productReviews(product: Product): ProductReview[] {
  return product.productPage?.reviews.items ?? [];
}

export type RealPhoto = { url: string; alt: string };
export type RealPhotoGroup = { variantId: string | null; label: string; photos: RealPhoto[] };

/**
 * "View real images": the photos staff marked as unedited photographs of the actual piece, the product's own first,
 * then each finish's in the order the finishes are listed. A photo of a finish the store does not list is left out,
 * and with none marked there is nothing to show (the button is hidden rather than filled with other pictures).
 */
export function realPhotoGroups(product: Product): RealPhotoGroup[] {
  const real = (product.productPage?.media ?? []).filter((m) => m.realPhoto);
  const photo = (m: (typeof real)[number]): RealPhoto => ({ url: m.url, alt: m.altText ?? `${product.title}, real photograph` });
  const groups: RealPhotoGroup[] = [];
  const own = real.filter((m) => m.variantId === null);
  if (own.length) groups.push({ variantId: null, label: "The piece", photos: own.map(photo) });
  for (const variant of product.variants) {
    const photos = real.filter((m) => m.variantId === variant.id);
    if (photos.length) groups.push({ variantId: variant.id, label: variant.title, photos: photos.map(photo) });
  }
  return groups;
}

const inches = (cm: number) => Math.round((cm / 2.54) * 10) / 10;
const labels: [keyof ProductSpecs, string][] = [["widthCm", "Width"], ["depthCm", "Depth"], ["heightCm", "Height"], ["seatHeightCm", "Seat height"]];

/** Measured specifications as card lines: this finish's own measurements where it has them, else the product's. */
export function specLines(product: Product, variant: Variant | undefined): string[] {
  const base = product.productPage?.specs;
  if (!base) return [];
  const own = variant?.productPage?.specs;
  const value = (key: keyof ProductSpecs) => own?.[key] ?? base[key];
  const lines = labels.flatMap(([key, label]) => {
    const cm = value(key);
    return cm === null ? [] : [`${label}: ${cm} cm (≈ ${inches(cm)}")`];
  });
  const weight = value("weightKg");
  if (weight !== null) lines.push(`Weight: ${weight} kg`);
  const assembly = product.productPage?.assembly;
  if (assembly) lines.push(assembly.required ? `Assembly: needed${assembly.minutes ? `, about ${assembly.minutes} min` : ""}` : "Assembly: arrives assembled");
  return lines;
}

export function productFaq(product: Product): [string, string][] {
  return (product.productPage?.faq ?? []).map((item) => [item.question, item.answer]);
}

export function productHighlightLines(product: Product): string[] {
  return product.productPage?.highlights ?? [];
}
