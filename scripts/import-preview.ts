import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
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
    (p) => p.source !== "shopify-preview" || !p.id.startsWith("preview-"),
  )
)
  throw new Error("This command accepts only a Shopify preview snapshot");
const db = new PrismaClient();
try {
  await db.$transaction(
    async (tx) => {
      for (const p of parsed.products) {
        const { variants, ...product } = p;
        await tx.product.upsert({
          where: { id: p.id },
          create: { ...product, sourceUpdatedAt: new Date(p.sourceUpdatedAt) },
          update: { ...product, sourceUpdatedAt: new Date(p.sourceUpdatedAt) },
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
    { timeout: 30000 },
  );
  console.log(
    "Imported " +
      parsed.products.length +
      " preview products. No stock reservation or live Keeri sync is implied.",
  );
} finally {
  await db.$disconnect();
}
