import type { Product, ProductBundle, ProductCard, ProductReview, ProductSpecs, Variant } from "@shopmaple/contracts";
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
export function productRating(product: Product, typed: { value: number; count: number } | null | undefined) {
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

export type BundlePiece = { handle: string; title: string; image: string | null; quantity: number; pricePaise: number | null; current: boolean };

/**
 * A bundle's pieces with the details the page can show, in Keeri's order. A piece's price counts only when it is one
 * definite figure (this finish's price, or a card with a single price); the total is shown only when every piece has
 * one, since Keeri adds no bundle discount and a guessed total would mislead. A bundle whose other pieces the
 * catalogue cannot show is left out.
 */
export function bundlePieces(bundle: ProductBundle, product: Product, variant: Variant | undefined, cards: ProductCard[]): { pieces: BundlePiece[]; totalPaise: number | null } | null {
  const pieces: BundlePiece[] = [];
  for (const item of bundle.items) {
    if (item.handle === product.handle) {
      pieces.push({ handle: product.handle, title: product.title, image: product.images[0] ?? null, quantity: item.quantity, pricePaise: variant?.pricePaise ?? null, current: true });
      continue;
    }
    const card = cards.find((c) => c.handle === item.handle);
    if (!card) return null;
    pieces.push({ handle: card.handle, title: card.title, image: card.image, quantity: item.quantity, pricePaise: card.priceFrom ? null : card.pricePaise, current: false });
  }
  const totalPaise = pieces.every((p) => p.pricePaise !== null) ? pieces.reduce((sum, p) => sum + p.pricePaise! * p.quantity, 0) : null;
  return { pieces, totalPaise };
}

/** Every other product a page's bundles name, for the server to load as cards. */
export function bundleHandles(product: Product): string[] {
  return [...new Set((product.productPage?.bundles ?? []).flatMap((b) => b.items.map((i) => i.handle)).filter((h) => h !== product.handle))];
}
