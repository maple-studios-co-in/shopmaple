import { z } from "zod";
import { productSchema } from "@shopmaple/contracts";
export function approvedCatalogueImage(value: string) {
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.port &&
    ((u.hostname === "cdn.shopify.com" && u.pathname.startsWith("/s/files/")) ||
      (u.hostname === "shop.maplefurnishers.com" &&
        u.pathname.startsWith("/cdn/shop/")))
  );
}
const money = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/)
  .transform((v) => {
    const [whole, fraction = ""] = v.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (amount > 1_000_000_000) throw new Error("PRICE_OUT_OF_RANGE");
    return amount > 0 ? amount : null;
  });
const schema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("shopify-admin"),
    capturedAt: z.iso.datetime({ offset: true }),
    complete: z.literal(true),
    products: z
      .array(
        z
          .object({
            id: z.string().regex(/^gid:\/\/shopify\/Product\/[1-9][0-9]*$/),
            handle: productSchema.shape.handle,
            title: z.string().min(1).max(500),
            description: z.string().max(50000),
            productType: z.string(),
            updatedAt: z.iso.datetime({ offset: true }),
            status: z.enum(["ACTIVE", "DRAFT", "UNLISTED", "ARCHIVED"]),
            media: z
              .object({
                nodes: z
                  .array(
                    z
                      .object({
                        image: z
                          .object({
                            url: z.url().refine(approvedCatalogueImage),
                          })
                          .nullable()
                          .optional(),
                      })
                      .strict(),
                  )
                  .max(30),
              })
              .strict(),
            variants: z
              .object({
                pageInfo: z
                  .object({
                    hasNextPage: z.literal(false),
                    endCursor: z.string().nullable(),
                  })
                  .strict(),
                nodes: z
                  .array(
                    z
                      .object({
                        id: z
                          .string()
                          .regex(
                            /^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]*$/,
                          ),
                        title: z.string().max(300),
                        sku: z.string().nullable(),
                        price: money,
                        compareAtPrice: money.nullable(),
                      })
                      .strict(),
                  )
                  .max(500),
              })
              .strict(),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();
export function adaptShopifyCatalogue(input: unknown) {
  const data = schema.parse(input);
  const products = new Set<string>();
  const variants = new Set<string>();
  const handles = new Set<string>();
  for (const p of data.products) {
    if (products.has(p.id) || handles.has(p.handle))
      throw new Error("DUPLICATE_SHOPIFY_PRODUCT");
    products.add(p.id);
    handles.add(p.handle);
    if (Date.parse(p.updatedAt) > Date.parse(data.capturedAt))
      throw new Error("FUTURE_SHOPIFY_PRODUCT");
    for (const v of p.variants.nodes) {
      if (variants.has(v.id)) throw new Error("DUPLICATE_SHOPIFY_VARIANT");
      variants.add(v.id);
    }
  }
  const category: Record<string, string> = {
    chair: "chairs",
    chairs: "chairs",
    sofa: "sofas",
    sofas: "sofas",
    table: "tables",
    tables: "tables",
    bed: "beds",
    beds: "beds",
    storage: "storage",
    outdoors: "outdoors",
  };
  return {
    capturedAt: data.capturedAt,
    products: data.products
      .filter((p) => p.status !== "ARCHIVED")
      .map((p) =>
        productSchema.parse({
          id: `preview-${p.id.split("/").at(-1)}`,
          handle: p.handle,
          title: p.title,
          description: p.description,
          category: category[p.productType.toLowerCase()] ?? null,
          images: p.media.nodes.flatMap((m) => (m.image ? [m.image.url] : [])),
          published: true,
          source: "shopify-preview",
          sourceStatus: p.status,
          sourceUpdatedAt: data.capturedAt,
          variants: p.variants.nodes.map((v) => ({
            id: `preview-${v.id.split("/").at(-1)}`,
            title: v.title || "Details on request",
            sku: v.sku?.trim() || null,
            pricePaise: v.price,
            compareAtPaise: v.compareAtPrice,
            available: false,
            stockPolicy: "unverified",
          })),
        }),
      ),
  };
}
