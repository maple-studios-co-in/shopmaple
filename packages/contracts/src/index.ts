import { z } from "zod";
export const categories = [
  "sofas",
  "chairs",
  "tables",
  "beds",
  "storage",
  "outdoors",
] as const;
export const variantSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(300),
  sku: z.string().nullable(),
  pricePaise: z.number().int().min(0).max(1_000_000_000),
  compareAtPaise: z.number().int().min(0).max(1_000_000_000).nullable(),
  available: z.boolean(),
  stockPolicy: z.enum(["stocked", "made_to_order", "dropship", "unverified"]),
});
export const productSchema = z.object({
  id: z.string().min(1).max(160),
  handle: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(200),
  title: z.string().min(1).max(500),
  description: z.string().max(50000),
  category: z.enum(categories),
  images: z
    .array(z.url().refine((url) => new URL(url).protocol === "https:"))
    .min(1)
    .max(30),
  published: z.boolean(),
  source: z.string().min(1).max(100),
  sourceUpdatedAt: z.iso.datetime({ offset: true }),
  variants: z.array(variantSchema).min(1).max(500),
});
export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export const productListSchema = z.object({
  products: z.array(productSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  mode: z.literal("preview"),
  checkoutEnabled: z.literal(false),
});
export type ProductList = z.infer<typeof productListSchema>;
export const cartItemSchema = z.object({
  variantId: z.string(),
  handle: z.string(),
  title: z.string(),
  variantTitle: z.string(),
  image: z.string(),
  pricePaise: z.number().int(),
  quantity: z.number().int(),
  lineTotalPaise: z.number().int(),
  available: z.boolean(),
  stockPolicy: z.string(),
});
export const cartSchema = z.object({
  items: z.array(cartItemSchema),
  itemCount: z.number().int(),
  subtotalPaise: z.number().int(),
  currency: z.literal("INR"),
  checkoutEnabled: z.literal(false),
  mode: z.literal("preview"),
});
export type Cart = z.infer<typeof cartSchema>;
export const catalogueImportSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.string(),
    capturedAt: z.iso.datetime({ offset: true }),
    products: z.array(productSchema).min(1).max(5000),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>(),
      handles = new Set<string>(),
      variants = new Set<string>();
    for (const p of data.products) {
      if (ids.has(p.id) || handles.has(p.handle))
        ctx.addIssue({ code: "custom", message: "Duplicate product identity" });
      ids.add(p.id);
      handles.add(p.handle);
      for (const v of p.variants) {
        if (variants.has(v.id))
          ctx.addIssue({
            code: "custom",
            message: "Duplicate variant identity",
          });
        variants.add(v.id);
      }
    }
  });
