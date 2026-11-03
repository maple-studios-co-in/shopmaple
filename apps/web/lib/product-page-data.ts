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
export function productRating(product: Product, typed: { value: number; count?: number } | null | undefined): { value: number; count?: number } | null {
  const reviews = product.productPage?.reviews;
  if (reviews && reviews.count > 0 && reviews.average !== null) return { value: reviews.average, count: reviews.count };
  return typed ?? null;
}

export function productReviews(product: Product): ProductReview[] {
  return product.productPage?.reviews.items ?? [];
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
