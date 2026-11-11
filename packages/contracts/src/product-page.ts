import { z } from "zod";

/**
 * What the product page shows beyond the catalogue copy, as Keeri exports it at the `productPage=1`
 * level (Keeri docs/shopmaple-product-page.md), with Keeri ids already translated to store ids.
 * Nothing here is invented: reviews, counts and batch figures exist only when Keeri sent them.
 */
const httpsUrl = z.url().refine((url) => new URL(url).protocol === "https:");
const storeId = z.string().min(1).max(160);
const measure = z.number().positive().max(10_000).nullable();
const line = (max: number) => z.string().trim().min(1).max(max);

export const productSpecsSchema = z.object({
  widthCm: measure, depthCm: measure, heightCm: measure, seatHeightCm: measure, weightKg: measure,
}).strict();
export type ProductSpecs = z.infer<typeof productSpecsSchema>;

export const hotspotTypes = ["fabric", "material", "size", "feature"] as const;
export const productHotspotSchema = z.object({
  /** Fractions of the picture's width and height from its top-left corner. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: line(60),
  text: z.string().trim().max(300),
  type: z.enum(hotspotTypes),
}).strict();

export const productMediaSchema = z.object({
  url: httpsUrl,
  /** The store variant this photo belongs to, or null for the whole product. */
  variantId: storeId.nullable(),
  /** front, angle, side, back, detail, lifestyle, set, dimension or cutout; older imports may carry other words. */
  role: z.string().trim().min(1).max(40),
  width: z.number().int().positive().max(20_000).nullable(),
  height: z.number().int().positive().max(20_000).nullable(),
  altText: z.string().trim().max(250).nullable(),
  /** Staff marked it an unedited photograph of the actual piece; never true on a generated picture. */
  realPhoto: z.boolean(),
  /** Only on `cutout` photographs, in display order. */
  hotspots: z.array(productHotspotSchema).max(12),
}).strict();
export type ProductMedia = z.infer<typeof productMediaSchema>;

export const reviewSources = ["online_order", "showroom", "whatsapp", "google", "other"] as const;
const reviewPhotoUrl = z.string().regex(/^https:\/\/store\.maplefurnishers\.com\/media\/keeri-review\/[A-Za-z0-9_-]{1,64}\.webp$/);
export const productReviewSchema = z.object({
  id: line(64),
  rating: z.number().int().min(1).max(5),
  title: line(120),
  body: line(2000),
  reviewerName: line(60),
  city: line(60).nullable(),
  /** When the customer gave it, YYYY-MM-DD. */
  reviewedAt: z.iso.date(),
  source: z.enum(reviewSources),
  /** True exactly when Keeri linked the review to an order. */
  verifiedBuyer: z.boolean(),
  variantId: storeId.nullable(),
  photos: z.array(z.object({
    id: line(64),
    url: reviewPhotoUrl,
    width: z.number().int().positive().max(20_000).nullable(),
    height: z.number().int().positive().max(20_000).nullable(),
  }).strict()).max(5),
}).strict();
export type ProductReview = z.infer<typeof productReviewSchema>;

export const productBundleSchema = z.object({
  id: line(64),
  name: line(120),
  description: z.string().trim().max(1000).nullable(),
  items: z.array(z.object({
    productId: storeId,
    handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200),
    /** The default variant, or null when the buyer chooses. */
    variantId: storeId.nullable(),
    quantity: z.number().int().min(1).max(20),
  }).strict()).min(2).max(6),
}).strict();
export type ProductBundle = z.infer<typeof productBundleSchema>;

export const customisationOptions = ["fabric", "size", "finish", "colour", "material", "configuration"] as const;
export const productPageSchema = z.object({
  specs: productSpecsSchema,
  highlights: z.array(line(120)).max(5),
  faq: z.array(z.object({ question: line(200), answer: line(2000) }).strict()).max(20),
  /** null: not stated; minutes only when assembly is required. */
  assembly: z.object({ required: z.boolean(), minutes: z.number().int().min(1).max(1440).nullable() }).strict().nullable(),
  customisation: z.object({ options: z.array(z.enum(customisationOptions)).max(6), note: z.string().trim().max(500).nullable() }).strict().nullable(),
  rooms: z.array(z.object({ id: line(64), name: line(120) }).strict()).max(20),
  reviews: z.object({
    /** Mean of every approved rating to one decimal; null when there are none. */
    average: z.number().min(1).max(5).nullable(),
    count: z.number().int().min(0),
    /** The newest approved reviews, at most 50. */
    items: z.array(productReviewSchema).max(50),
  }).strict(),
  media: z.array(productMediaSchema).max(600),
  bundles: z.array(productBundleSchema).max(20),
}).strict();
export type ProductPage = z.infer<typeof productPageSchema>;

export const variantProductPageSchema = z.object({
  /** This variant's own measurements; null fields fall back to the product's. */
  specs: productSpecsSchema,
  copy: z.object({
    description: z.string().max(10_000).nullable(), details: z.string().max(10_000).nullable(),
    materials: z.string().max(10_000).nullable(), dimensions: z.string().max(10_000).nullable(),
    careInstructions: z.string().max(10_000).nullable(),
  }).strict(),
  /** A staff-set production batch counted down by store holds; null when none is running. */
  batch: z.object({ remaining: z.number().int().min(1), showAtOrBelow: z.number().int().min(1) }).strict().nullable(),
  /** The variant's named choices with their swatch colour. */
  options: z.array(z.object({
    axis: line(80), value: line(200), code: z.string().trim().max(20).nullable(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  }).strict()).max(20),
}).strict();
export type VariantProductPage = z.infer<typeof variantProductPageSchema>;

/** "Only N left" only when the batch is at or below its threshold; otherwise the page shows the lead time. */
export function batchNudge(batch: VariantProductPage["batch"] | null | undefined): number | null {
  return batch && batch.remaining <= batch.showAtOrBelow ? batch.remaining : null;
}
