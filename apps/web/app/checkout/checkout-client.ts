import { checkoutInputSchema, type CheckoutInput } from "@shopmaple/contracts";
import { z } from "zod";

export const checkoutOptionsSchema = z.object({
  deliveryMethods: z
    .array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), label: z.string().min(1).max(60) }))
    .min(1)
    .max(20),
  paymentKeyId: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
});
export type CheckoutOptions = z.infer<typeof checkoutOptionsSchema>;
const money = z.number().int().min(0);
export const checkoutAttemptSchema = z.object({
  id: z.uuid(),
  state: z.string().min(1).max(64),
  amountPaise: money,
  currency: z.literal("INR"),
  paid: z.boolean(),
  providerOrderId: z.string().regex(/^order_[A-Za-z0-9]{1,80}$/).nullable(),
  quote: z
    .object({
      items: z.array(
        z.object({
          variantId: z.string(),
          productId: z.string(),
          title: z.string(),
          variantTitle: z.string(),
          sku: z.string().nullable(),
          quantity: z.number().int().min(1),
          unitPricePaise: money,
          lineTotalPaise: money,
          fulfilment: z
            .object({ kind: z.enum(["stocked", "made_to_order"]), leadTimeDays: z.number().int().min(1).nullable() })
            .optional(),
        }),
      ),
      /** The Shiprocket courier Keeri chose and its transit estimate. */
      delivery: z.object({ courierName: z.string().min(1).max(200), estimatedDays: z.number().int().min(0).nullable() }).nullable().optional(),
      currency: z.literal("INR"),
      subtotalPaise: money,
      shippingPaise: money,
      taxPaise: money,
      totalPaise: money,
      gstMode: z.enum(["included", "excluded"]),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .optional(),
  fulfillmentStatus: z.enum(["pending", "confirmed", "review_required"]).optional(),
  orderReference: z.string().nullable().optional(),
  /** When the payment window must close: two minutes before Keeri's stock hold lapses. */
  payBy: z.iso.datetime({ offset: true }).nullable().optional(),
  /** The same window in seconds from now on the server's clock; preferred over `payBy`. */
  payWithinSeconds: z.number().int().min(0).nullable().optional(),
});
export type CheckoutAttempt = z.infer<typeof checkoutAttemptSchema>;

/** A failure the buyer can act on. `closed` means the API no longer offers checkout at all. */
export class CheckoutClientError extends Error {
  constructor(
    public readonly kind: "closed" | "blocked" | "unavailable" | "lost" | "invalid" | "network" | "unpriced",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutClientError";
  }
}
const safeMessages: Record<string, CheckoutClientError["kind"]> = {
  CHECKOUT_NOT_AVAILABLE: "closed",
  CHECKOUT_BLOCKED: "blocked",
  CHECKOUT_IN_PROGRESS: "blocked",
  QUOTE_REJECTED: "invalid",
  DELIVERY_UNPRICED: "unpriced",
  PRICE_CHANGED: "invalid",
  QUOTE_UNAVAILABLE: "unavailable",
  PAYMENT_UNAVAILABLE: "unavailable",
  CHECKOUT_NOT_FOUND: "lost",
  INVALID_INPUT: "invalid",
};
const fallback: Record<CheckoutClientError["kind"], string> = {
  closed: "Online checkout is not available right now. No payment has been taken.",
  blocked: "This checkout requires review. Check your order status before trying another payment.",
  unavailable: "We couldn't reach our payment or stock services. Please try again in a moment. No payment has been taken.",
  lost: "We couldn't find your cart. Please return to your cart and try again.",
  invalid: "Check the supplied values and try again.",
  network: "We couldn't confirm that request. Please check your connection and try again.",
  unpriced: "We can't price delivery to this pincode online right now. Send us an enquiry and our team will quote delivery for you. No payment has been taken.",
};
async function translate(response: Response): Promise<CheckoutClientError> {
  let code = "";
  let message = "";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") code = body.code;
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") message = body.message;
  } catch {
    /* Non-JSON failures use the fallback copy. */
  }
  const kind = safeMessages[code] ?? (response.status >= 500 ? "unavailable" : "network");
  // Only known, public API codes may surface their message; anything else uses fixed copy.
  return new CheckoutClientError(kind, safeMessages[code] && message.length <= 300 ? message : fallback[kind]);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Browser client for the guest checkout routes. Prices and totals come only from the API. */
export function createCheckoutClient(transport: typeof fetch = (...args) => fetch(...args)) {
  let keyedPayload = "";
  let key = "";
  async function call(path: string, init: RequestInit): Promise<CheckoutAttempt> {
    let response: Response;
    try {
      response = await transport(path, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000) });
    } catch {
      throw new CheckoutClientError("network", fallback.network);
    }
    if (!response.ok) throw await translate(response);
    try {
      return checkoutAttemptSchema.parse(await response.json());
    } catch {
      throw new CheckoutClientError("network", fallback.network);
    }
  }
  return {
    /** Same details replay the same attempt; changed details or `fresh` start a new one. */
    async quote(input: CheckoutInput, fresh = false) {
      const body = JSON.stringify(checkoutInputSchema.parse(input));
      const payload = canonical(JSON.parse(body));
      if (fresh || payload !== keyedPayload) {
        key = crypto.randomUUID();
        keyedPayload = payload;
      }
      return call("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body,
      });
    },
    paymentOrder(attemptId: string) {
      return call(`/api/checkout/${encodeURIComponent(attemptId)}/payment-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    },
    status(attemptId: string) {
      return call(`/api/checkout/${encodeURIComponent(attemptId)}`, { method: "GET" });
    },
    /** Hand Razorpay's signed success callback to the store, which verifies it and the capture. */
    paymentCallback(attemptId: string, signed: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
      return call(`/api/checkout/${encodeURIComponent(attemptId)}/payment-callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: signed.razorpay_order_id,
          razorpay_payment_id: signed.razorpay_payment_id,
          razorpay_signature: signed.razorpay_signature,
        }),
      });
    },
    /** Free the stock hold of an attempt the buyer is walking away from. */
    release(attemptId: string) {
      return call(`/api/checkout/${encodeURIComponent(attemptId)}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    },
    /** After a release or a server-side state change the next quote must not replay the old attempt. */
    forgetKey() {
      keyedPayload = "";
    },
  };
}
