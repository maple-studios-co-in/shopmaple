import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { categories, productSchema } from "@shopmaple/contracts";
export const querySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.enum(categories).optional(),
    sort: z
      .enum(["featured", "price-asc", "price-desc", "title"])
      .default("featured"),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export function serializeProduct(
  p: Prisma.ProductGetPayload<{ include: { variants: true } }>,
) {
  return productSchema.parse({
    ...p,
    sourceUpdatedAt: p.sourceUpdatedAt.toISOString(),
  });
}
export async function listProducts(db: PrismaClient, input: unknown) {
  const q = querySchema.parse(input);
  const where: Prisma.ProductWhereInput = {
    published: true,
    ...(q.category ? { category: q.category } : {}),
    ...(q.q
      ? {
          OR: [
            { title: { contains: q.q, mode: "insensitive" } },
            { description: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  // Catalogue is bounded for the initial channel; prices sort by the cheapest displayed variant.
  const all = await db.product.findMany({
    where,
    include: {
      variants: { where: { published: true }, orderBy: { id: "asc" } },
    },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  });
  if (q.sort.startsWith("price")) {
    const minimum = (variants: { pricePaise: number | null }[]) => {
      const prices = variants.flatMap((v) =>
        v.pricePaise === null ? [] : [v.pricePaise],
      );
      return prices.length ? Math.min(...prices) : null;
    };
    all.sort((a, b) => {
      const left = minimum(a.variants),
        right = minimum(b.variants);
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return (left - right) * (q.sort === "price-desc" ? -1 : 1);
    });
  }
  return {
    products: all
      .slice((q.page - 1) * q.limit, q.page * q.limit)
      .map((product) => {
        const { pdpContent: _pdpContent, ...card } = serializeProduct(product);
        return card;
      }),
    total: all.length,
    page: q.page,
    limit: q.limit,
    mode: "preview" as const,
    checkoutEnabled: false as const,
  };
}
