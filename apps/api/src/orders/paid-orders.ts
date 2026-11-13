import type { Prisma, PrismaClient } from "@prisma/client";
import { quoteSnapshotSchema } from "@shopmaple/contracts";
import { z } from "zod";
import type { OrderImages, PaidOrder } from "../account/orders.js";
import { variantPhoto } from "../variant-photo.js";
import { loadOrderProgress } from "./keeri-events.js";

/** What an order page reads of a paid checkout attempt. */
export const orderSelect = {
  id: true, orderNumber: true, state: true, capturedAt: true, paymentId: true, snapshot: true, catalogueBindings: true,
} satisfies Prisma.CheckoutAttemptSelect;
export type OrderRow = Prisma.CheckoutAttemptGetPayload<{ select: typeof orderSelect }>;
export type ReadOrder = PaidOrder & { row: OrderRow };

const frozenBindings = z.object({ items: z.array(z.object({ localVariantId: z.string(), sourceVariantId: z.string() })) });

/**
 * Paid orders as the buyer's pages show them, for the account's orders and for the private order links alike: each with
 * Keeri's delivery outcome, what Keeri has reported since, and the pieces' photos.
 */
export function createPaidOrderReader(db: PrismaClient, merchantScope: string | undefined) {
  /** Rows with their Keeri delivery outcome and a parsed snapshot; a row whose snapshot no longer parses is left out. */
  async function paidOrders(rows: OrderRow[]): Promise<ReadOrder[]> {
    if (!rows.length) return [];
    const outboxes = await db.orderOutbox.findMany({
      where: { attemptId: { in: rows.map((row) => row.id) }, kind: "keeri.order.captured.v2" },
      select: { attemptId: true, state: true, externalOrderId: true, deliveredAt: true },
    });
    const byAttempt = new Map(outboxes.map((outbox) => [outbox.attemptId, outbox]));
    // What Keeri has reported since accepting each order (status, delivery, cancellation, refund).
    const progress = await loadOrderProgress(db, merchantScope, outboxes.flatMap((outbox) => (outbox.externalOrderId ? [outbox.externalOrderId] : [])));
    return rows.flatMap((row) => {
      const snapshot = quoteSnapshotSchema.safeParse(row.snapshot);
      if (!snapshot.success || row.orderNumber === null || !row.capturedAt || !row.paymentId) return [];
      return [{ row, orderNumber: row.orderNumber, state: row.state, capturedAt: row.capturedAt, paymentId: row.paymentId,
        snapshot: snapshot.data, outbox: byAttempt.get(row.id) ?? null,
        progress: progress.get(byAttempt.get(row.id)?.externalOrderId ?? "") ?? null }];
    });
  }

  /**
   * Item photos from the catalogue, chosen by variantPhoto (variant-photo.ts) as the bag and the order emails choose
   * them; only for published products (the media route serves nothing else). Found through the bindings frozen with the
   * quote, else the variant's Keeri identity.
   */
  async function orderImages(orders: ReadOrder[], firstOnly: boolean): Promise<OrderImages> {
    const local = new Map<string, string>();
    const unbound: string[] = [];
    for (const order of orders) {
      const bindings = frozenBindings.safeParse(order.row.catalogueBindings);
      for (const item of firstOnly ? order.snapshot.items.slice(0, 1) : order.snapshot.items) {
        const bound = bindings.success ? bindings.data.items.find((binding) => binding.sourceVariantId === item.variantId) : undefined;
        if (bound) local.set(item.variantId, bound.localVariantId);
        else unbound.push(item.variantId);
      }
    }
    if (unbound.length) {
      const identities = await db.variantSourceIdentity.findMany({
        where: { OR: unbound.map((externalId) => ({ source: externalId.split(":").slice(0, 2).join(":"), externalId })) },
        select: { externalId: true, variantId: true },
      });
      for (const identity of identities) local.set(identity.externalId, identity.variantId);
    }
    if (!local.size) return new Map();
    const variants = await db.variant.findMany({
      where: { id: { in: [...new Set(local.values())] } },
      select: { id: true, images: true, product: { select: { published: true, images: true } } },
    });
    const photos = new Map(variants.map((variant) => [variant.id, variantPhoto(variant)] as const));
    const images = new Map<string, string>();
    for (const [source, variantId] of local) {
      const photo = photos.get(variantId);
      if (photo) images.set(source, photo);
    }
    return images;
  }
  return { paidOrders, orderImages };
}
