import { quoteSnapshotSchema, type QuoteSnapshot } from "@shopmaple/contracts";
import { checkoutRequestSchema } from "@shopmaple/contracts/checkout-consent";
import { formatOrderNumber } from "@shopmaple/contracts/account";
import express, { type Express, type Request } from "express";
import type { CheckoutAttempt } from "@prisma/client";
import { z } from "zod";
import type { OrderProgress } from "./orders/keeri-events.js";
import { HttpError } from "./cart.js";
import { OrderFlowError, type createOrderService } from "./orders/service.js";
import { PaymentGatewayError } from "./payments/razorpay.js";
import { guestCartToken } from "./cart-credential.js";
import { KeeriCommerceError } from "./keeri-commerce.js";

export type CommerceHttpService = Pick<
  ReturnType<typeof createOrderService>,
  "freezeCart" | "getAttempt" | "createProviderOrder" | "releaseAttempt" | "ingestWebhook"
> &
  Partial<Pick<ReturnType<typeof createOrderService>, "recordPaymentCallback">>;
/** Public, non-secret values the storefront needs before it can quote and pay. */
export interface CheckoutOptions {
  deliveryMethods: Array<{ id: string; label: string }>;
  /** The Razorpay key id is a public identifier used by the hosted checkout. Never the secret. */
  paymentKeyId: string;
  /** Whether the checkout page offers "Send my order updates on WhatsApp" (WHATSAPP_ORDER_UPDATES). */
  whatsappOrderUpdates?: boolean;
}
const emptyBody = z.object({}).strict();
const quoteRejectedMessage =
  "We can't quote this order as entered. Check the delivery method and address, or contact our team. No payment has been taken.";
/** What a buyer can do about each of Keeri's promo refusals, at the quote or the hold. */
const promoMessages: Record<string, string> = {
  PROMO_NOT_FOUND: "We don't recognise that code. No payment has been taken.",
  PROMO_NOT_RUNNING: "That offer isn't running right now. No payment has been taken.",
  PROMO_NOT_APPLICABLE: "That code doesn't apply to anything in your cart. No payment has been taken.",
  PROMO_ALREADY_USED: "That code has already been used with this phone number or email. No payment has been taken.",
};
const belowMinimum = () => new HttpError(422, "BELOW_MINIMUM_ORDER",
  "A piece in your bag has a minimum order. Add more of it (finishes can be mixed) and try again. No payment has been taken.");
const promoError = (code: string) =>
  Object.hasOwn(promoMessages, code) ? new HttpError(422, code, promoMessages[code]!) : undefined;
const attemptId = z.uuid();
const paymentCallback = z
  .object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{1,80}$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{1,80}$/),
    razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
/** The buyer's payment window closes this long before Keeri's hold lapses. */
const payWindowMarginMs = 2 * 60_000;
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

function guestToken(req: Request, secure: boolean) {
  const token = guestCartToken(req, secure);
  if (!token) throw new OrderFlowError("CART_NOT_FOUND");
  return token;
}
/** What the buyer is told about free delivery: whether it covers the whole order, and the pieces it
 * covers by name. Nothing at all on an ordinary delivery charge. */
function freeDeliveryOf(quote: QuoteSnapshot) {
  const ids = quote.delivery?.freeDeliveryVariantIds;
  if (!ids?.length) return {};
  const titles = quote.items.filter((item) => ids.includes(item.variantId)).map((item) => item.title);
  return { freeDelivery: { all: quote.delivery?.source === "free", titles: [...new Set(titles)] } };
}
// The catalogue identities frozen with the quote (orders/catalogue-bindings.ts), read only for the store's variant ids.
const frozenBindings = z.object({ items: z.array(z.object({ localVariantId: z.string().min(1), sourceVariantId: z.string().min(1) })) });
function publicAttempt(
  attempt: CheckoutAttempt & {
    fulfillmentStatus?: string;
    orderReference?: string | null;
    orderProgress?: OrderProgress | null;
  },
) {
  const quote = quoteSnapshotSchema.safeParse(attempt.snapshot);
  // Keeri's quote names each piece by Keeri's variant id. The cart, and so the photos the storefront keeps, name it by
  // the store's own, which differs for a variant carried over from the old store (live: Aero's Deep Atlantic is
  // "preview-46728293843133"). Each line gets the store's id beside Keeri's; an attempt frozen without bindings has none.
  const bindings = frozenBindings.safeParse(attempt.catalogueBindings);
  const storeVariant = new Map(bindings.success ? bindings.data.items.map((item) => [item.sourceVariantId, item.localVariantId]) : []);
  return {
    ...(quote.success
      ? {
          quote: {
            items: quote.data.items.map((item) => {
              const localVariantId = storeVariant.get(item.variantId);
              return localVariantId ? { ...item, localVariantId } : item;
            }),
            // The courier and its estimate only: the carrier's ids and weights stay internal.
            delivery: quote.data.delivery?.carrier
              ? {
                  courierName: quote.data.delivery.carrier.courierName,
                  estimatedDays: quote.data.delivery.carrier.estimatedDays,
                  // Only when free delivery changed the charge; otherwise the reply is what it always was.
                  ...freeDeliveryOf(quote.data),
                }
              : null,
            currency: quote.data.currency,
            subtotalPaise: quote.data.subtotalPaise,
            shippingPaise: quote.data.shippingPaise,
            taxPaise: quote.data.taxPaise,
            totalPaise: quote.data.totalPaise,
            gstMode: quote.data.gstMode,
            // The applied code, its label and the whole discount; null without one.
            promotion: quote.data.promotion ?? null,
            expiresAt: quote.data.expiresAt,
          },
        }
      : {}),
    ...(quote.success
      ? {
          fulfillmentStatus: attempt.fulfillmentStatus ?? "pending",
          orderReference: attempt.orderReference ?? null,
          // Where a confirmed order stands, from Keeri's updates: null until Keeri reports a move past "confirmed".
          orderStage: attempt.orderProgress?.stage ?? null,
          refund: attempt.orderProgress?.refund
            ? { status: attempt.orderProgress.refund.status, amountPaise: attempt.orderProgress.refund.amountPaise }
            : null,
        }
      : {}),
    id: attempt.id,
    // Maple's order number ("MF-…"), assigned when the payment is captured; null until then.
    orderNumber: attempt.orderNumber ? formatOrderNumber(attempt.orderNumber) : null,
    state: attempt.state,
    amountPaise: attempt.amountPaise,
    currency: attempt.currency,
    // A payment Razorpay confirmed is never reported as unpaid, even if the hold lapsed.
    paid: attempt.state === "captured" || attempt.state === "paid_hold_lapsed",
    providerOrderId: attempt.providerOrderId,
    payBy:
      attempt.state === "awaiting_payment" && attempt.reservationExpiresAt
        ? new Date(attempt.reservationExpiresAt.getTime() - payWindowMarginMs).toISOString()
        : null,
    // Relative to the server clock, so a buyer's wrong clock cannot stretch the window.
    payWithinSeconds:
      attempt.state === "awaiting_payment" && attempt.reservationExpiresAt
        ? Math.max(0, Math.floor((attempt.reservationExpiresAt.getTime() - payWindowMarginMs - Date.now()) / 1000))
        : null,
  };
}

/** Register before JSON parsing and browser Origin enforcement. The exact POST
 * route is authenticated using the raw bytes; no other route gains an exemption. */
export function registerPaymentWebhook(
  app: Express,
  commerce: CommerceHttpService,
) {
  app.post(
    /^\/api\/webhooks\/razorpay$/,
    (req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      if (
        !req.is("application/json") ||
        (req.get("content-encoding") &&
          req.get("content-encoding") !== "identity")
      )
        throw new HttpError(
          415,
          "UNSUPPORTED_CONTENT_TYPE",
          "Send uncompressed application/json.",
        );
      next();
    },
    express.raw({ type: "application/json", limit: "64kb", inflate: false }),
    async (req, res) => {
      const signature = z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .parse(req.get("x-razorpay-signature"));
      const eventId = z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .parse(req.get("x-razorpay-event-id"));
      if (!Buffer.isBuffer(req.body))
        throw new HttpError(400, "INVALID_WEBHOOK", "Invalid webhook request.");
      await commerce.ingestWebhook(req.body, signature, eventId);
      // Receipt only. A separately leased worker verifies capture before fulfilling.
      res.status(202).json({ accepted: true });
    },
  );
}

/** Mount after normal Origin and private/no-store middleware. Production must
 * explicitly inject a fully configured service; server.ts does not do so. */
export function registerCheckoutRoutes(
  app: Express,
  commerce: CommerceHttpService,
  secure: boolean,
  options?: CheckoutOptions,
) {
  app.get("/api/checkout/options", (_req, res) => {
    if (!options)
      throw new HttpError(
        503,
        "CHECKOUT_NOT_AVAILABLE",
        "Online checkout is not available right now. No payment has been taken.",
      );
    res.json({
      deliveryMethods: options.deliveryMethods.map(({ id, label }) => ({ id, label })),
      paymentKeyId: options.paymentKeyId,
      whatsappOrderUpdates: options.whatsappOrderUpdates === true,
    });
  });
  app.post("/api/checkout", async (req, res) => {
    const input = checkoutRequestSchema.or(emptyBody).parse(req.body);
    const key = idempotencyKey.parse(req.get("Idempotency-Key"));
    if (
      options &&
      "deliveryMethodId" in input &&
      !options.deliveryMethods.some((method) => method.id === input.deliveryMethodId)
    )
      throw new HttpError(422, "QUOTE_REJECTED", quoteRejectedMessage);
    res.json(
      publicAttempt(await commerce.freezeCart(guestToken(req, secure), key, input)),
    );
  });
  app.post("/api/checkout/:attemptId/release", async (req, res) => {
    emptyBody.parse(req.body);
    const id = attemptId.parse(req.params.attemptId);
    res.json(
      publicAttempt(await commerce.releaseAttempt(guestToken(req, secure), id)),
    );
  });
  app.post("/api/checkout/:attemptId/payment-order", async (req, res) => {
    emptyBody.parse(req.body);
    const id = attemptId.parse(req.params.attemptId);
    res.json(
      publicAttempt(await commerce.createProviderOrder(guestToken(req, secure), id)),
    );
  });
  app.post("/api/checkout/:attemptId/payment-callback", async (req, res) => {
    const id = attemptId.parse(req.params.attemptId);
    const body = paymentCallback.parse(req.body);
    if (!commerce.recordPaymentCallback) throw new OrderFlowError("ATTEMPT_REQUIRES_RECONCILIATION");
    const attempt = await commerce.recordPaymentCallback(guestToken(req, secure), id, body);
    // Receipt only: the worker verifies the capture with Razorpay before anything is paid.
    res.status(202).json(publicAttempt(await commerce.getAttempt(guestToken(req, secure), attempt.id)));
  });
  app.get("/api/checkout/:attemptId", async (req, res) => {
    const id = attemptId.parse(req.params.attemptId);
    res.json(publicAttempt(await commerce.getAttempt(guestToken(req, secure), id)));
  });
}

/** Translate known domain failures without exposing merchant data, provider
 * payloads, reservation IDs, internal failure codes or exception messages. */
export function commerceHttpError(error: unknown): HttpError | undefined {
  if (error instanceof OrderFlowError || error instanceof KeeriCommerceError) {
    const promo = promoError(error.code);
    if (promo) return promo;
  }
  if (error instanceof OrderFlowError) {
    if (["CART_NOT_FOUND", "ATTEMPT_NOT_FOUND"].includes(error.code))
      return new HttpError(
        404,
        "CHECKOUT_NOT_FOUND",
        "We couldn't find that checkout.",
      );
    if (error.code === "INVALID_IDEMPOTENCY_KEY")
      return new HttpError(
        400,
        "INVALID_INPUT",
        "Check the supplied values and try again.",
      );
    if (error.code === "WEBHOOK_ID_COLLISION")
      return new HttpError(
        409,
        "WEBHOOK_CONFLICT",
        "The webhook could not be accepted.",
      );
    if (error.code === "PRICE_CHANGED")
      return new HttpError(
        409,
        "PRICE_CHANGED",
        "The price of an item in your cart has changed. Review your cart and try again. No payment has been taken.",
      );
    if (error.code === "BELOW_MINIMUM_ORDER") return belowMinimum();
    if (error.code === "DELIVERY_UNPRICED")
      return new HttpError(
        422,
        "DELIVERY_UNPRICED",
        "We can't price delivery to this pincode online right now. Send us an enquiry and our team will quote delivery for you. No payment has been taken.",
      );
    // A piece the store no longer links to Keeri, or that Keeri no longer sells online.
    if (["CATALOGUE_BINDING_REQUIRED", "RESERVATION_NOT_ELIGIBLE"].includes(error.code))
      return new HttpError(
        422,
        "ITEM_NOT_BUYABLE",
        "An item in your cart can no longer be bought online. Remove it or send us an enquiry. No payment has been taken.",
      );
    if (error.code === "CHECKOUT_IN_PROGRESS")
      return new HttpError(
        409,
        "CHECKOUT_IN_PROGRESS",
        "A payment for this cart is already in progress. Finish or close it, then check your order status before starting another.",
      );
    return new HttpError(
      409,
      "CHECKOUT_BLOCKED",
      "This checkout requires review. Check your order status before trying another payment.",
    );
  }
  if (error instanceof KeeriCommerceError) {
    if (error.code === "BELOW_MINIMUM_ORDER") return belowMinimum();
    if (error.code === "UPSTREAM_REJECTED")
      return new HttpError(422, "QUOTE_REJECTED", quoteRejectedMessage);
    return new HttpError(
      503,
      "QUOTE_UNAVAILABLE",
      "We couldn't confirm pricing and delivery right now. Please try again in a moment. No payment has been taken.",
    );
  }
  if (error instanceof PaymentGatewayError) {
    if (error.code === "INVALID_SIGNATURE")
      return new HttpError(
        401,
        "INVALID_SIGNATURE",
        "The payment confirmation could not be authenticated.",
      );
    if (error.code === "INVALID_WEBHOOK")
      return new HttpError(400, "INVALID_WEBHOOK", "Invalid webhook request.");
    return new HttpError(
      503,
      "PAYMENT_UNAVAILABLE",
      "Payment service is temporarily unavailable. Check your order status before trying another payment.",
    );
  }
}
