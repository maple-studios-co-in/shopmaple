import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { OrderFlowError } from "./errors.js";

const bindingSchema = z.object({
  version: z.literal(1),
  tenantId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  items: z.array(z.object({
    localVariantId: z.string().min(1),
    localProductId: z.string().min(1),
    sourceVariantId: z.string().min(1),
    sourceProductId: z.string().min(1),
  }).strict()).min(1).max(50),
}).strict();
export type CatalogueBindings = z.infer<typeof bindingSchema>;

/** Read only persisted union identities. An ID that happens to look like a
 * Keeri ID is never evidence of an authoritative catalogue relationship. */
export async function resolveCatalogueBindings(
  tx: Prisma.TransactionClient,
  variantIds: string[],
  tenantId: string,
): Promise<CatalogueBindings> {
  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds } },
    include: {
      identities: { where: { source: "keeri" } },
      product: { include: { identities: { where: { source: "keeri" } } } },
    },
    orderBy: { id: "asc" },
  });
  const prefix = `keeri:${tenantId}:`;
  if (!variantIds.length || variants.length !== variantIds.length)
    throw new OrderFlowError("CATALOGUE_BINDING_REQUIRED");
  const items = variants.map((v) => {
    if (!v.published || !v.product.published || v.stockPolicy !== "stocked")
      throw new OrderFlowError("RESERVATION_NOT_ELIGIBLE");
    const sourceVariantId = v.identities[0]?.externalId;
    const sourceProductId = v.product.identities[0]?.externalId;
    if (v.identities.length !== 1 || v.product.identities.length !== 1 ||
        !sourceVariantId?.startsWith(prefix) || sourceVariantId.length === prefix.length ||
        !sourceProductId?.startsWith(prefix) || sourceProductId.length === prefix.length)
      throw new OrderFlowError("CATALOGUE_BINDING_REQUIRED");
    return { localVariantId: v.id, localProductId: v.productId, sourceVariantId, sourceProductId };
  });
  if (new Set(items.map((i) => i.sourceVariantId)).size !== items.length)
    throw new OrderFlowError("CATALOGUE_BINDING_REQUIRED");
  return { version: 1, tenantId, items };
}

export function sameCatalogueBindings(a: CatalogueBindings, b: CatalogueBindings) {
  const sorted = (x: CatalogueBindings) => [...x.items].sort((a, b) =>
    a.localVariantId.localeCompare(b.localVariantId));
  return a.tenantId === b.tenantId && JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

export function storedCatalogueBindings(raw: unknown, tenantId: string, snapshot: QuoteSnapshot) {
  const parsed = bindingSchema.safeParse(raw);
  if (!parsed.success) throw new OrderFlowError("CATALOGUE_BINDING_REQUIRED");
  const bindings = parsed.data;
  if (bindings.tenantId !== tenantId || bindings.items.length !== snapshot.items.length ||
      new Set(bindings.items.map((i) => i.localVariantId)).size !== bindings.items.length ||
      new Set(bindings.items.map((i) => i.sourceVariantId)).size !== bindings.items.length ||
      snapshot.items.some((i) => !bindings.items.some((b) =>
        b.sourceVariantId === i.variantId && b.sourceProductId === i.productId)))
    throw new OrderFlowError("CATALOGUE_BINDING_CHANGED");
  return bindings;
}

export async function revalidateCatalogueBindings(
  tx: Prisma.TransactionClient,
  expected: CatalogueBindings,
) {
  let current: CatalogueBindings;
  try {
    current = await resolveCatalogueBindings(tx, expected.items.map((i) => i.localVariantId), expected.tenantId);
  } catch (error) {
    if (error instanceof OrderFlowError && error.code === "CATALOGUE_BINDING_REQUIRED")
      throw new OrderFlowError("CATALOGUE_BINDING_CHANGED");
    throw error;
  }
  if (!sameCatalogueBindings(expected, current))
    throw new OrderFlowError("CATALOGUE_BINDING_CHANGED");
}
