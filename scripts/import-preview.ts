import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { catalogueImportSchema } from "@shopmaple/contracts";
if (process.env.NODE_ENV === "production")
  throw new Error("Preview import is disabled in production");
const file = process.argv[2] ?? "apps/api/data/preview-catalog.json";
const parsed = catalogueImportSchema.parse(
  JSON.parse(await readFile(file, "utf8")),
);
if (
  parsed.source !== "shopify-preview" ||
  parsed.products.some(
    (p) =>
      p.source !== "shopify-preview" ||
      !p.id.startsWith("preview-") ||
      p.variants.some((v) => !v.id.startsWith("preview-")),
  )
)
  throw new Error("This command accepts only a Shopify preview snapshot");
const db = new PrismaClient();
try {
  await db.$transaction(
    async (tx) => {
      for (const p of parsed.products) {
        const existing = await tx.product.findUnique({ where: { id: p.id } });
        if (existing && existing.source !== "shopify-preview")
          throw new Error("Preview product identity belongs to another source");
        const existingVariants = await tx.variant.findMany({
          where: { id: { in: p.variants.map((v) => v.id) } },
          include: { product: true },
        });
        if (
          existingVariants.some(
            (v) =>
              v.productId !== p.id || v.product.source !== "shopify-preview",
          )
        )
          throw new Error(
            "Preview variant identity belongs to another product or source",
          );
        const { variants, ...product } = p;
        await tx.product.upsert({
          where: { id: p.id },
          create: { ...product, pdpContent: product.pdpContent ?? Prisma.DbNull, sourceUpdatedAt: new Date(p.sourceUpdatedAt) },
          update: { ...product, pdpContent: product.pdpContent ?? Prisma.DbNull, sourceUpdatedAt: new Date(p.sourceUpdatedAt) },
        });
        for (const v of variants)
          await tx.variant.upsert({
            where: { id: v.id },
            create: { ...v, productId: p.id },
            update: { ...v, productId: p.id },
          });
        await tx.variant.updateMany({
          where: { productId: p.id, id: { notIn: variants.map((v) => v.id) } },
          data: { available: false },
        });
      }
      await tx.product.updateMany({
        where: {
          source: "shopify-preview",
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
