import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { catalogueImportSchema } from "@shopmaple/contracts";
import { isKeeriPreviewSnapshot } from "../deploy/public-preview.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Preview import is disabled in production");
const file = process.argv[2] ?? "apps/api/data/preview-catalog.json";
const parsed = catalogueImportSchema.parse(
  JSON.parse(await readFile(file, "utf8")),
);
// Keeri's products only (owner, 11 Nov 2026): the committed snapshot of what the store lists, with Keeri identities.
if (!isKeeriPreviewSnapshot(parsed))
  throw new Error("This command accepts only the Keeri preview snapshot");
const source = parsed.products[0]!.source;
const db = new PrismaClient();
try {
  await db.$transaction(
    async (tx) => {
      for (const p of parsed.products) {
        const existing = await tx.product.findUnique({ where: { id: p.id } });
        if (existing && existing.source !== source)
          throw new Error("Preview product identity belongs to another source");
        const existingVariants = await tx.variant.findMany({
          where: { id: { in: p.variants.map((v) => v.id) } },
          include: { product: true },
        });
        if (
          existingVariants.some(
            (v) =>
              v.productId !== p.id || v.product.source !== source,
          )
        )
          throw new Error(
            "Preview variant identity belongs to another product or source",
          );
        const { variants, ...product } = p;
        const data = { ...product, pdpContent: product.pdpContent ?? Prisma.DbNull, sourceTaxonomy: product.sourceTaxonomy ?? Prisma.DbNull, sourceDetails: product.sourceDetails ?? Prisma.DbNull, productPage: product.productPage ?? Prisma.DbNull, offer: product.offer ?? Prisma.DbNull, sourceUpdatedAt: new Date(p.sourceUpdatedAt) };
        await tx.product.upsert({ where: { id: p.id }, create: data, update: data });
        for (const v of variants)
          await tx.variant.upsert({
            where: { id: v.id },
            create: { ...v, productPage: v.productPage ?? Prisma.DbNull, productId: p.id },
            update: { ...v, productPage: v.productPage ?? Prisma.DbNull, productId: p.id },
          });
        await tx.variant.updateMany({
          where: { productId: p.id, id: { notIn: variants.map((v) => v.id) } },
          data: { available: false },
        });
      }
      // An earlier preview (the former Shopify snapshot included) that this one no longer lists is unpublished.
      await tx.product.updateMany({
        where: {
          source: { in: [source, "shopify-preview"] },
          id: { notIn: parsed.products.map((p) => p.id) },
        },
        data: { published: false },
      });
    },
    { timeout: 30000, isolationLevel: "Serializable" },
  );
  console.log(
    "Imported " +
      parsed.products.length +
      " preview products. No stock reservation or live Keeri sync is implied.",
  );
} finally {
  await db.$disconnect();
}
