import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { cancelOrderInputSchema, type OrderDetail, type OrderShipment, type OrderTracking } from "@shopmaple/contracts/account";
import { HttpError } from "../cart.js";
import { paidOrderStates, toOrderDetail } from "../account/orders.js";
import { KeeriCommerceError, type KeeriShipment } from "../keeri-commerce.js";
import { orderLinkPaths, parseOrderLinkRef, type OrderLinkConfig } from "./order-access.js";
import { createPaidOrderReader, orderSelect, type ReadOrder } from "./paid-orders.js";

/** What the store asks Keeri after an order is accepted (the store's Keeri credential needs `orders:read` and
 * `orders:write`). */
export type KeeriOrderFollowUp = {
  orderShipment(externalOrderId: string): Promise<KeeriShipment>;
  requestCancellation(input: { requestId: string; externalOrderId: string; reason: string }): Promise<{ requestId: string; status: string }>;
};
export type BuyerOrdersOptions = {
  links: OrderLinkConfig;
  merchantScope?: string;
  /** Null or absent: checkout is off, so there is no Keeri to ask; Cancel and tracking say so. */
  keeri?: KeeriOrderFollowUp | null;
};

const notFound = () => new HttpError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
const notAvailable = () => new HttpError(409, "CANCELLATION_NOT_AVAILABLE",
  "This order can't be cancelled online any more. Please contact us and our team will help.");

type CancelRow = { id: string; state: string; createdAt: Date };
/** The buyer's latest request as the page shows it, and whether Cancel is offered. A request Keeri has not acknowledged
 * (pending) is offered again, and sent with the same id; one Keeri refused is not shown. */
export function cancellationState(order: ReadOrder, latest: CancelRow | null, keeriReachable: boolean) {
  const declinedAt = order.progress?.cancellationDeclinedAt ?? null;
  const cancelRequest = latest?.state === "requested"
    ? { status: declinedAt && declinedAt >= latest.createdAt ? "declined" as const : "requested" as const, requestedAt: latest.createdAt.toISOString() }
    : null;
  const confirmed = order.state === "captured" && order.outbox?.state === "delivered" && Boolean(order.outbox.externalOrderId);
  // Keeri accepts a request only before production starts (its status still "confirmed").
  const stage = order.progress?.stage ?? "confirmed";
  return { cancelRequest, canCancel: keeriReachable && confirmed && stage === "confirmed" && !cancelRequest };
}

/**
 * The buyer's order pages behind a private link (order-access.ts), and the account's order with the same extras: the
 * order, its tracking from Keeri's shipment, and a cancellation request staff decide in Keeri.
 */
export function createBuyerOrders(db: PrismaClient, options: BuyerOrdersOptions) {
  const reader = createPaidOrderReader(db, options.merchantScope);
  const keeri = options.keeri ?? null;

  async function readOrder(orderNumber: number): Promise<ReadOrder | null> {
    const row = await db.checkoutAttempt.findFirst({
      where: { orderNumber, state: { in: [...paidOrderStates] }, capturedAt: { not: null }, paymentId: { not: null },
        ...(options.merchantScope ? { merchantScope: options.merchantScope } : {}) },
      select: orderSelect,
    });
    const [order] = await reader.paidOrders(row ? [row] : []);
    return order ?? null;
  }
  const latestRequest = (attemptId: string) =>
    db.orderCancellationRequest.findFirst({ where: { attemptId, state: { in: ["pending", "requested"] } }, orderBy: { createdAt: "desc" }, select: { id: true, state: true, createdAt: true } });

  /** The order page's view: the account's detail plus its private links, its cancellation request and Cancel. */
  async function detailOf(order: ReadOrder): Promise<OrderDetail> {
    const detail = toOrderDetail(order, await reader.orderImages([order], false));
    const paths = orderLinkPaths(options.links.secret, order.orderNumber);
    return { ...detail, links: { view: paths.view, tracking: paths.tracking }, ...cancellationState(order, await latestRequest(order.row.id), keeri !== null) };
  }
  async function byRef(ref: string) {
    const orderNumber = parseOrderLinkRef(options.links.secret, ref);
    const order = orderNumber === null ? null : await readOrder(orderNumber);
    if (!order) throw notFound();
    return order;
  }

  async function tracking(order: ReadOrder): Promise<OrderTracking> {
    const detail = await detailOf(order);
    const externalOrderId = order.outbox?.state === "delivered" ? order.outbox.externalOrderId : null;
    if (!externalOrderId || !keeri) return { order: detail, shipment: null, shipmentUnavailable: false };
    try {
      const { externalOrderId: _id, ...shipment } = await keeri.orderShipment(externalOrderId);
      return { order: detail, shipment: shipment satisfies OrderShipment, shipmentUnavailable: false };
    } catch {
      // Keeri down, or the store's credential without orders:read: the page still shows the order.
      return { order: detail, shipment: null, shipmentUnavailable: true };
    }
  }

  async function cancel(order: ReadOrder, raw: unknown): Promise<OrderDetail> {
    const input = cancelOrderInputSchema.safeParse(raw);
    if (!input.success) throw new HttpError(400, "INVALID_REASON", "Tell us in a few words why you'd like to cancel (3 to 500 characters).");
    const latest = await latestRequest(order.row.id);
    const state = cancellationState(order, latest, keeri !== null);
    if (state.cancelRequest?.status === "requested")
      throw new HttpError(409, "CANCELLATION_ALREADY_REQUESTED", "We already have your request to cancel this order. Our team will be in touch.");
    if (!state.canCancel || !keeri) throw notAvailable();
    // A request Keeri never acknowledged is sent again under its own id, so Keeri cannot hold two.
    const request = latest?.state === "pending"
      ? latest
      : await db.orderCancellationRequest.create({ data: { attemptId: order.row.id, reason: input.data.reason }, select: { id: true, state: true, createdAt: true } });
    try {
      await keeri.requestCancellation({ requestId: request.id, externalOrderId: order.outbox!.externalOrderId!, reason: input.data.reason });
    } catch (error) {
      if (error instanceof KeeriCommerceError && error.code === "CANCELLATION_ALREADY_REQUESTED") {
        await db.orderCancellationRequest.update({ where: { id: request.id }, data: { state: "requested" } });
        return detailOf(order);
      }
      if (error instanceof KeeriCommerceError && ["CANCELLATION_NOT_ALLOWED", "ORDER_NOT_FOUND", "UPSTREAM_REJECTED"].includes(error.code)) {
        await db.orderCancellationRequest.update({ where: { id: request.id }, data: { state: "refused" } });
        throw notAvailable();
      }
      throw new HttpError(503, "CANCELLATION_UNAVAILABLE", "We couldn't send your request just now. Please try again in a moment.");
    }
    await db.orderCancellationRequest.update({ where: { id: request.id }, data: { state: "requested" } });
    return detailOf(order);
  }

  return {
    detailOf,
    async detail(ref: string) { return detailOf(await byRef(ref)); },
    async tracking(ref: string) { return tracking(await byRef(ref)); },
    async cancel(ref: string, raw: unknown) { return cancel(await byRef(ref), raw); },
  };
}
export type BuyerOrders = ReturnType<typeof createBuyerOrders>;

/** `/api/orders/link/:ref` (GET), `/api/orders/link/:ref/tracking` (GET) and `/api/orders/link/:ref/cancel` (POST, the
 * store's own pages only, which the API's Origin check already enforces). Never cached. */
export function registerBuyerOrderRoutes(app: Express, orders: BuyerOrders) {
  app.use("/api/orders/link", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Referrer-Policy", "no-referrer");
    next();
  });
  app.get("/api/orders/link/:ref", async (req, res) => {
    res.json(await orders.detail(req.params.ref));
  });
  app.get("/api/orders/link/:ref/tracking", async (req, res) => {
    res.json(await orders.tracking(req.params.ref));
  });
  app.post("/api/orders/link/:ref/cancel", async (req, res) => {
    res.json(await orders.cancel(req.params.ref, req.body));
  });
}
