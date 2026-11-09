import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Server-only boundary. Nothing here persists an order or authorizes fulfilment. */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}
export interface ExpectedPayment {
  /** Load from the persisted checkout attempt, never from the callback. */
  orderId: string;
  amountPaise: number;
  currency: "INR";
}
export interface CheckoutCallback {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
export interface CapturedPaymentEvidence extends ExpectedPayment {
  paymentId: string;
  status: "captured";
}
export interface AuthenticatedWebhook {
  /** This header is not part of the signed body; use both identifiers for replay protection. */
  eventId: string;
  bodySha256: string;
  eventType: string;
  paymentId?: string;
  orderId?: string;
}
type ErrorCode =
  | "MISSING_CONFIGURATION"
  | "INVALID_INPUT"
  | "INVALID_SIGNATURE"
  | "INVALID_WEBHOOK"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "UPSTREAM_HTTP_ERROR"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "PAYMENT_MISMATCH"
  | "PAYMENT_NOT_CAPTURED"
  | "PAYMENT_REFUNDED_OR_UNKNOWN";
export class PaymentGatewayError extends Error {
  constructor(
    public readonly code: ErrorCode,
    /** Failed POSTs may have created a provider order; reconcile before any retry. */
    public readonly operationOutcome:
      | "unknown"
      | "not_applicable" = "not_applicable",
    public readonly httpStatus?: number,
  ) {
    super(`Razorpay: ${code}`);
    this.name = "PaymentGatewayError";
  }
}
type FetchTransport = (url: string, init: RequestInit) => Promise<Response>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validId(value: unknown, prefix: "order" | "pay"): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${prefix}_[A-Za-z0-9]{1,80}$`).test(value)
  );
}
function validMoney(amount: unknown, currency: unknown): boolean {
  return (
    typeof amount === "number" &&
    Number.isSafeInteger(amount) &&
    amount >= 100 &&
    currency === "INR"
  );
}
function requireSecret(secret: string): void {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new PaymentGatewayError("MISSING_CONFIGURATION");
  }
}
function matchesHmac(
  body: string | Buffer,
  signature: unknown,
  secret: string,
): boolean {
  requireSecret(secret);
  if (typeof signature !== "string" || !/^[a-fA-F0-9]{64}$/.test(signature))
    return false;
  const digest = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(digest, Buffer.from(signature, "hex"));
}

/** Authenticity only. Fetch and validate current payment state before changing business state. */
export function verifyCheckoutSignature(
  storedOrderId: string,
  callback: CheckoutCallback,
  keySecret: string,
): boolean {
  requireSecret(keySecret);
  if (
    !record(callback) ||
    !validId(storedOrderId, "order") ||
    callback.razorpay_order_id !== storedOrderId ||
    !validId(callback.razorpay_payment_id, "pay")
  )
    return false;
  return matchesHmac(
    `${storedOrderId}|${callback.razorpay_payment_id}`,
    callback.razorpay_signature,
    keySecret,
  );
}

/** Supply the original HTTP bytes, before any JSON parsing or reserialization. */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
): boolean {
  requireSecret(webhookSecret);
  return (
    Buffer.isBuffer(rawBody) && matchesHmac(rawBody, signature, webhookSecret)
  );
}

export function createRazorpayGateway(
  config: RazorpayConfig,
  options: { fetch?: FetchTransport; timeoutMs?: number } = {},
) {
  requireSecret(config?.keyId);
  requireSecret(config?.keySecret);
  requireSecret(config?.webhookSecret);
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(config.keyId))
    throw new PaymentGatewayError("INVALID_INPUT");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new PaymentGatewayError("INVALID_INPUT");
  // Copy credentials so mutation of the caller's config cannot change verification mid-attempt.
  const { keyId, keySecret, webhookSecret } = config;
  const transport: FetchTransport = options.fetch ?? globalThis.fetch;
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  async function request(
    method: "GET" | "POST",
    path: string,
    body?: object,
  ): Promise<unknown> {
    const outcome = method === "POST" ? "unknown" : "not_applicable";
    const controller = new AbortController();
    const maxResponseBytes = 256 * 1024;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new PaymentGatewayError("UPSTREAM_TIMEOUT", outcome));
        controller.abort();
        void reader?.cancel().catch(() => {});
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await transport(
            `https://api.razorpay.com/v1/${path}`,
            {
              method,
              redirect: "error",
              signal: controller.signal,
              headers: {
                authorization,
                "content-type": "application/json",
                accept: "application/json",
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            },
          );
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => {});
            throw new PaymentGatewayError("UPSTREAM_TIMEOUT", outcome);
          }
          if (!response.ok) {
            // Do not surface provider bodies, headers or transport errors (may contain personal data).
            void response.body?.cancel().catch(() => {});
            throw new PaymentGatewayError(
              "UPSTREAM_HTTP_ERROR",
              outcome,
              response.status,
            );
          }
          const length = response.headers.get("content-length");
          if (length !== null && Number(length) > maxResponseBytes) {
            void response.body?.cancel().catch(() => {});
            throw new PaymentGatewayError("RESPONSE_TOO_LARGE", outcome);
          }
          try {
            if (!response.body)
              throw new PaymentGatewayError("INVALID_RESPONSE", outcome);
            reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
              const next = await reader.read();
              if (controller.signal.aborted)
                throw new PaymentGatewayError("UPSTREAM_TIMEOUT", outcome);
              if (next.done) break;
              size += next.value.byteLength;
              if (size > maxResponseBytes)
                throw new PaymentGatewayError("RESPONSE_TOO_LARGE", outcome);
              chunks.push(next.value);
            }
            return JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch (error) {
            if (error instanceof PaymentGatewayError) throw error;
            throw new PaymentGatewayError("INVALID_RESPONSE", outcome);
          }
        })(),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof PaymentGatewayError) throw error;
      throw new PaymentGatewayError("UPSTREAM_UNAVAILABLE", outcome);
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  }

  async function createOrder(input: {
    amountPaise: number;
    currency: "INR";
    receipt: string;
  }) {
    if (
      !validMoney(input.amountPaise, input.currency) ||
      typeof input.receipt !== "string" ||
      !/^[\x21-\x7e]{1,40}$/.test(input.receipt)
    )
      throw new PaymentGatewayError("INVALID_INPUT");
    // Freeze caller values across the asynchronous network operation.
    const { amountPaise, currency, receipt } = input;
    const order = await request("POST", "orders", {
      amount: amountPaise,
      currency,
      receipt,
      partial_payment: false,
    });
    if (
      !record(order) ||
      order.entity !== "order" ||
      !validId(order.id, "order") ||
      order.amount !== amountPaise ||
      order.currency !== currency ||
      order.receipt !== receipt ||
      order.status !== "created" ||
      order.amount_paid !== 0 ||
      order.amount_due !== amountPaise
    ) {
      throw new PaymentGatewayError("INVALID_RESPONSE", "unknown");
    }
    return { orderId: order.id, amountPaise, currency, receipt };
  }

  async function verifyCapturedPayment(
    expected: ExpectedPayment,
    paymentId: string,
  ): Promise<CapturedPaymentEvidence> {
    if (
      !validId(expected.orderId, "order") ||
      !validId(paymentId, "pay") ||
      !validMoney(expected.amountPaise, expected.currency)
    )
      throw new PaymentGatewayError("INVALID_INPUT");
    const { orderId, amountPaise, currency } = expected;
    const payment = await request("GET", `payments/${paymentId}`);
    if (
      !record(payment) ||
      payment.entity !== "payment" ||
      payment.id !== paymentId ||
      payment.order_id !== orderId ||
      payment.amount !== amountPaise ||
      payment.currency !== currency
    ) {
      throw new PaymentGatewayError("PAYMENT_MISMATCH");
    }
    if (payment.status !== "captured" || payment.captured !== true) {
      throw new PaymentGatewayError("PAYMENT_NOT_CAPTURED");
    }
    if (payment.amount_refunded !== 0 || payment.refund_status !== null) {
      throw new PaymentGatewayError("PAYMENT_REFUNDED_OR_UNKNOWN");
    }
    return { paymentId, orderId, amountPaise, currency, status: "captured" };
  }

  async function verifyCallback(
    expected: ExpectedPayment,
    callback: CheckoutCallback,
  ) {
    if (!verifyCheckoutSignature(expected.orderId, callback, keySecret))
      throw new PaymentGatewayError("INVALID_SIGNATURE");
    return verifyCapturedPayment(expected, callback.razorpay_payment_id);
  }

  function authenticateWebhook(
    rawBody: Buffer,
    signature: string,
    eventId: string,
  ): AuthenticatedWebhook {
    if (
      !Buffer.isBuffer(rawBody) ||
      rawBody.length > 1_048_576 ||
      typeof eventId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)
    )
      throw new PaymentGatewayError("INVALID_WEBHOOK");
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret))
      throw new PaymentGatewayError("INVALID_SIGNATURE");
    let event: unknown;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new PaymentGatewayError("INVALID_WEBHOOK");
    }
    if (
      !record(event) ||
      event.entity !== "event" ||
      typeof event.event !== "string" ||
      !/^[a-z][a-z0-9_.]{1,100}$/.test(event.event)
    )
      throw new PaymentGatewayError("INVALID_WEBHOOK");
    const result: AuthenticatedWebhook = {
      eventId,
      bodySha256: createHash("sha256").update(rawBody).digest("hex"),
      eventType: event.event,
    };
    // All other authenticated events are non-actionable here (including refunds).
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const wrapper = record(event.payload) ? event.payload.payment : undefined;
      const payment = record(wrapper) ? wrapper.entity : undefined;
      if (
        !record(payment) ||
        payment.entity !== "payment" ||
        !validId(payment.id, "pay") ||
        !validId(payment.order_id, "order")
      ) {
        throw new PaymentGatewayError("INVALID_WEBHOOK");
      }
      result.paymentId = payment.id;
      result.orderId = payment.order_id;
    }
    return result;
  }

  /** Authenticity of the browser's success callback only; capture is still verified by fetch. */
  function authenticateCheckoutCallback(storedOrderId: string, callback: CheckoutCallback) {
    if (!verifyCheckoutSignature(storedOrderId, callback, keySecret))
      throw new PaymentGatewayError("INVALID_SIGNATURE");
    return { orderId: storedOrderId, paymentId: callback.razorpay_payment_id };
  }

  return {
    createOrder,
    authenticateCheckoutCallback,
    verifyCallback,
    verifyCapturedPayment,
    authenticateWebhook,
  };
}
