import { z } from "zod";

export const categories = ["sofas", "chairs", "tables", "beds", "storage", "outdoors"] as const;
export const catalogueHandleSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200);
const priceSchema = z.number().int().min(0).max(1_000_000_000).nullable();
const isHttps = (value: string) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
const httpsImage = z.url().max(4096).refine(isHttps);
// One option's thumbnail: its own first photo (null when it has none) and its readable ?variant= address.
export const optionThumbSchema = z.object({
  name: z.string().min(1).max(80),
  image: httpsImage.nullable(),
  slug: z.string().min(1).max(200).nullable(),
}).strict();
export const productCardSchema = z.object({
  id: z.string().min(1).max(160),
  handle: catalogueHandleSchema,
  title: z.string().min(1).max(500),
  image: httpsImage.nullable(),
  pricePaise: priceSchema,
  compareAtPaise: priceSchema,
  priceFrom: z.boolean(),
  otherOptionsOnRequest: z.boolean(),
  optionCount: z.number().int().min(0).max(500),
  // Read from the catalogue for the card's category line and colour dots; absent from older payloads.
  category: z.enum(categories).nullable().default(null),
  // At most eight short names, which keeps a compact card small (the card shows six dots).
  optionNames: z.array(z.string().min(1).max(80)).max(8).default([]),
  // The options' own photos for the card's round thumbnails; absent from older payloads.
  optionThumbs: z.array(optionThumbSchema).max(8).default([]),
}).strict().superRefine((card, ctx) => {
  if ((card.compareAtPaise !== null && (card.pricePaise === null || card.compareAtPaise <= card.pricePaise)) ||
      (card.pricePaise === null && (card.priceFrom || card.otherOptionsOnRequest)) ||
      (card.pricePaise !== null && card.optionCount === 0) ||
      (card.priceFrom && card.optionCount < 2) ||
      (card.otherOptionsOnRequest && !card.priceFrom) ||
      card.optionThumbs.length > card.optionCount) {
    ctx.addIssue({ code: "custom", message: "Inconsistent product price or options" });
  }
});
export type ProductCard = z.infer<typeof productCardSchema>;
export type PriceOption = { pricePaise: number | null };
export function pricedVariants<T extends PriceOption>(product: { variants: T[] }) {
  return product.variants.filter((variant): variant is T & { pricePaise: number } => variant.pricePaise !== null);
}
export function lowestPrice(product: { variants: PriceOption[] }): number | null {
  const priced = pricedVariants(product);
  return priced.length ? Math.min(...priced.map(variant => variant.pricePaise)) : null;
}
export function canOrder(variant?: { available: boolean; pricePaise: number | null; stockPolicy: string }) {
  return Boolean(variant && variant.available && variant.pricePaise !== null && variant.pricePaise > 0 && ["stocked", "dropship"].includes(variant.stockPolicy));
}
// Placeholder or colourless option names, never offered as colours.
const placeholderOption = /^(default( title)?|standard)$/i;
const httpsPhoto = (value: string | undefined) => value !== undefined && httpsImage.safeParse(value).success ? value : null;
function optionThumbs(variants: { title?: string; images?: string[]; slug?: string | null }[]) {
  const seen = new Set<string>();
  const thumbs: z.infer<typeof optionThumbSchema>[] = [];
  for (const variant of variants) {
    const name = variant.title?.trim() ?? "";
    if (!name || name.length > 80 || placeholderOption.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const image = httpsPhoto(variant.images?.[0]);
    const slug = variant.slug?.trim() || null;
    // An option with neither a photo nor an address says nothing beyond optionNames.
    if (image === null && (slug === null || slug.length > 200)) continue;
    thumbs.push({ name, image, slug: slug !== null && slug.length <= 200 ? slug : null });
    if (thumbs.length === 8) break;
  }
  return thumbs;
}
export function toProductCard(product: {
  id: string; handle: string; title: string; images: string[]; category?: string | null;
  variants: { pricePaise: number | null; compareAtPaise: number | null; title?: string; images?: string[]; slug?: string | null }[];
}): ProductCard {
  const priced = pricedVariants(product);
  // Stable sorting retains the first equal-price variant's compare-at amount.
  const cheapest = priced.sort((a, b) => a.pricePaise - b.pricePaise)[0];
  const price = cheapest?.pricePaise ?? null;
  const unknownPrices = priced.length < product.variants.length;
  return {
    id: product.id, handle: product.handle, title: product.title, image: product.images[0] ?? null,
    pricePaise: price,
    compareAtPaise: price !== null && cheapest?.compareAtPaise != null && cheapest.compareAtPaise > price ? cheapest.compareAtPaise : null,
    priceFrom: price !== null && (unknownPrices || new Set(priced.map(variant => variant.pricePaise)).size > 1),
    otherOptionsOnRequest: unknownPrices && price !== null,
    optionCount: product.variants.length,
    category: categories.find(category => category === product.category) ?? null,
    optionNames: [...new Set(product.variants.map(variant => variant.title?.trim() ?? "")
      .filter(name => name && name.length <= 80 && !placeholderOption.test(name)))].slice(0, 8),
    optionThumbs: optionThumbs(product.variants),
  };
}
export const catalogueCardResponseSchema = z.object({ product: productCardSchema, published: z.literal(true) }).strict();
export const catalogueCardsResponseSchema = z.object({ products: z.array(productCardSchema).max(50), published: z.literal(true) }).strict()
  .refine(value => new Set(value.products.map(product => product.handle)).size === value.products.length, "Duplicate product handles");
export const relatedCatalogueCardsResponseSchema = z.object({
  category: z.enum(categories), products: z.array(productCardSchema).max(5), published: z.literal(true),
}).strict().refine(value => new Set(value.products.map(product => product.handle)).size === value.products.length, "Duplicate product handles");
export type RelatedCatalogueCardsResponse = z.infer<typeof relatedCatalogueCardsResponseSchema>;
