import { z } from "zod";
import { productPdpContentSchema } from "./product-pdp-content";
export { productRichTextSchema, productPdpContentSchema } from "./product-pdp-content";
export type { ProductRichText, ProductRichTextNode, ProductPdpContent } from "./product-pdp-content";
export { campaignScheduleSchema, isCampaignActive } from "./campaign-schedule";
export type { CampaignSchedule } from "./campaign-schedule";
export {
  storefrontContentSchema,
  homeSectionKeys,
  campaignKeys,
  campaignContentSchema,
  contentPageSchema,
  contentLinkSchema,
  contentImageSchema,
  homeMerchandisingSchema,
  homeCollectionTileSchema,
  templateMediaKeys,
  templateMediaResponsiveKeys,
  templateMediaSchema,
} from "./content";
export type {
  StorefrontContent,
  HomeMerchandising,
  HomeCollectionTile,
  TemplateMediaKey,
  TemplateMediaItem,
  TemplateMedia,
  CampaignContent,
  ContentPage,
} from "./content";
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
  pricePaise: z.number().int().min(0).max(1_000_000_000).nullable(),
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
  pdpContent: productPdpContentSchema.nullable().optional(),
  category: z.enum(categories).nullable(),
  images: z
    .array(z.url().refine((url) => new URL(url).protocol === "https:"))
    .max(30),
  published: z.boolean(),
  source: z.string().min(1).max(100),
  sourceStatus: z.string().max(80).nullable().optional(),
  sourceUpdatedAt: z.iso.datetime({ offset: true }),
  variants: z.array(variantSchema).max(500),
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
  pricePaise: z.number().int().nullable(),
  quantity: z.number().int(),
  lineTotalPaise: z.number().int().nullable(),
  available: z.boolean(),
  stockPolicy: z.string(),
});
export const cartSchema = z.object({
  items: z.array(cartItemSchema),
  itemCount: z.number().int(),
  subtotalPaise: z.number().int().nullable(),
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

const enquiryContextSchema = z
  .object({
    product: z.string().trim().max(500).default(""),
    variant: z.string().trim().max(300).default(""),
    sku: z.string().trim().max(160).default(""),
    pincode: z
      .union([z.literal(""), z.string().regex(/^[1-9][0-9]{5}$/)])
      .default(""),
  })
  .strict();
export const enquiryInputSchema = z
  .object({
    kind: z.enum(["contact", "project", "bulk"]),
    name: z.string().trim().max(100).default(""),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    phone: z.string().trim().max(30).default(""),
    message: z.string().trim().max(5000).default(""),
    context: enquiryContextSchema.default({
      product: "",
      variant: "",
      sku: "",
      pincode: "",
    }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "bulk" && (!value.name || !value.phone))
      ctx.addIssue({
        code: "custom",
        message: "Name and phone are required for bulk enquiries",
      });
  });
export type EnquiryInput = z.infer<typeof enquiryInputSchema>;
export const enquiryReceiptSchema = z.object({
  reference: z.string().regex(/^enq_[a-f0-9-]{36}$/),
  mode: z.literal("preview"),
  notificationSent: z.literal(false),
});
export type EnquiryReceipt = z.infer<typeof enquiryReceiptSchema>;

export {
  checkoutInputSchema,
  checkoutAddressSchema,
  quoteRequestSchema,
  quoteSnapshotSchema,
  quoteResponseSchema,
} from "./checkout";
export type { CheckoutInput, QuoteRequest, QuoteSnapshot } from "./checkout";

export * from "./category-content";
export * from "./story-content";
export * from "./nimbus-content";
export * from "./enquiry-admin";

export { homeDetailsSchema } from "./home-details";
export type { HomeDetails } from "./home-details";

export * from "./service-pages";

export * from "./editorial-content";
