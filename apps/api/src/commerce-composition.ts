import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { CheckoutOptions, CommerceHttpService } from "./commerce-http.js";
import { createKeeriCommerce } from "./keeri-commerce.js";
import { createOrderService } from "./orders/service.js";
import { createOrderWorkers } from "./orders/workers.js";
import { createRazorpayGateway } from "./payments/razorpay.js";
import { createOrderNotifications } from "./orders/notifications.js";
import { loadEnquiryDeliveryConfig, type EnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";

/** Every key below must be present and valid once CHECKOUT_ENABLED=true. Values are never logged. */
export const commerceEnvKeys = [
  "KEERI_ORIGIN",
  "KEERI_COMMERCE_TOKEN",
  "KEERI_TENANT_ID",
  "KEERI_MERCHANT_SCOPE",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "CHECKOUT_DELIVERY_METHODS",
] as const;
/** Order emails: each ORDER_* key falls back to the enquiry sender's key. */
const emailKeys = [
  ["ORDER_RESEND_API_KEY", "ENQUIRY_RESEND_API_KEY"],
  ["ORDER_MAIL_FROM", "ENQUIRY_MAIL_FROM"],
  ["ORDER_MAIL_TO", "ENQUIRY_MAIL_TO"],
] as const;
function loadOrderEmail(env: Record<string, string | undefined>): EnquiryDeliveryConfig {
  const pick = ([own, shared]: readonly [string, string]) => env[own]?.trim() || env[shared]?.trim() || "";
  const missing = emailKeys.filter((pair) => !pick(pair)).map(([own, shared]) => `${shared} (or ${own})`);
  if (!env.WEB_ORIGIN) missing.push("WEB_ORIGIN");
  if (missing.length) throw new Error(`CHECKOUT_ENABLED=true requires valid values for: ${missing.sort().join(", ")}`);
  try {
    const config = loadEnquiryDeliveryConfig({
      ENQUIRY_DELIVERY_ENABLED: "true",
      ENQUIRY_RESEND_API_KEY: pick(emailKeys[0]),
      ENQUIRY_MAIL_FROM: pick(emailKeys[1]),
      ENQUIRY_MAIL_TO: pick(emailKeys[2]),
      WEB_ORIGIN: env.WEB_ORIGIN,
      NODE_ENV: env.NODE_ENV,
    });
    if (!config) throw new Error();
    return config;
  } catch {
    throw new Error("CHECKOUT_ENABLED=true requires valid values for: ENQUIRY_MAIL_FROM, ENQUIRY_MAIL_TO, ENQUIRY_RESEND_API_KEY (or their ORDER_* overrides), WEB_ORIGIN");
  }
}
const deliveryMethodsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        label: z.string().trim().min(1).max(60),
      })
      .strict(),
  )
  .min(1)
  .max(20)
  .refine((list) => new Set(list.map((m) => m.id)).size === list.length);
const schema = z.object({
  KEERI_ORIGIN: z.url().refine((v) => new URL(v).protocol === "https:"),
  KEERI_COMMERCE_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  KEERI_TENANT_ID: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  KEERI_MERCHANT_SCOPE: z.string().regex(/^[a-z0-9_-]{1,100}$/),
  RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
  RAZORPAY_KEY_SECRET: z.string().trim().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().trim().min(1),
  CHECKOUT_DELIVERY_METHODS: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Delivery methods must be a JSON array" });
        return z.NEVER;
      }
    })
    .pipe(deliveryMethodsSchema),
});
export interface CommerceConfig {
  keeri: { origin: string; token: string; tenantId: string; merchantScope: string };
  razorpay: { keyId: string; keySecret: string; webhookSecret: string };
  deliveryMethods: Array<{ id: string; label: string }>;
  email: EnquiryDeliveryConfig;
}
/** Returns null unless checkout is explicitly enabled; then fails loudly naming
 * any missing or invalid key, so a half-configured deployment never half-works. */
export function loadCommerceConfig(
  env: Record<string, string | undefined>,
): CommerceConfig | null {
  if (env.CHECKOUT_ENABLED !== "true") return null;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))]
      .filter(Boolean)
      .sort();
    throw new Error(
      `CHECKOUT_ENABLED=true requires valid values for: ${keys.join(", ")}`,
    );
  }
  const v = parsed.data;
  const email = loadOrderEmail(env);
  return {
    keeri: {
      origin: v.KEERI_ORIGIN,
      token: v.KEERI_COMMERCE_TOKEN,
      tenantId: v.KEERI_TENANT_ID,
      merchantScope: v.KEERI_MERCHANT_SCOPE,
    },
    razorpay: {
      keyId: v.RAZORPAY_KEY_ID,
      keySecret: v.RAZORPAY_KEY_SECRET,
      webhookSecret: v.RAZORPAY_WEBHOOK_SECRET,
    },
    deliveryMethods: v.CHECKOUT_DELIVERY_METHODS,
    email,
  };
}
type Transport = (url: string | URL, init: RequestInit) => Promise<Response>;
export interface ComposedCommerce {
  commerce: CommerceHttpService;
  checkout: CheckoutOptions;
  /** One bounded worker cycle: verify captured payments, then deliver captured orders to Keeri. */
  runWorkers(): Promise<{
    payments: Awaited<ReturnType<ReturnType<typeof createOrderWorkers>["runPaymentBatch"]>>;
    keeri: Awaited<ReturnType<ReturnType<typeof createOrderWorkers>["runKeeriBatch"]>>;
    emails: Awaited<ReturnType<ReturnType<typeof createOrderNotifications>["runBatch"]>>;
  }>;
}
/** The only place the Keeri commerce client, gateway, order service and workers
 * are wired together. Tests inject a fake transport; production uses global fetch. */
export function composeCommerce(
  db: PrismaClient,
  config: CommerceConfig,
  options: { fetch?: Transport; now?: () => Date } = {},
): ComposedCommerce {
  const transport = options.fetch;
  const keeriFetch: typeof fetch | undefined = transport
    ? (input, init) =>
        transport(input instanceof Request ? input.url : input, init ?? {})
    : undefined;
  const keeri = createKeeriCommerce({ ...config.keeri, fetch: keeriFetch });
  const gateway = createRazorpayGateway(config.razorpay, {
    fetch: transport ? (url, init) => transport(url, init) : undefined,
  });
  const orders = createOrderService(db, {
    merchantScope: config.keeri.merchantScope,
    gateway,
    reservations: keeri.reservations,
    quoteAuthority: keeri.quote,
    keeriTenantId: config.keeri.tenantId,
    now: options.now,
  });
  const workers = createOrderWorkers(db, {
    merchantScope: config.keeri.merchantScope,
    payments: orders,
    keeri,
    now: options.now,
    // One payment verification can take the Keeri verify timeout (10 s) plus the
    // Razorpay fetch timeout (10 s) plus the capture transaction; the lease must outlive it.
    leaseMs: 90_000,
    // Backoff 5 s doubling: eight tries span about ten minutes, inside Keeri's
    // fifteen-minute hold, so a short Keeri outage after a payment still lands the order.
    maxAttempts: 8,
  });
  const notifications = createOrderNotifications(db, {
    merchantScope: config.keeri.merchantScope,
    email: config.email,
    fetch: transport ? (url, init) => transport(url instanceof Request ? url.url : url, init ?? {}) : undefined,
    now: options.now,
  });
  return {
    commerce: orders,
    checkout: {
      deliveryMethods: config.deliveryMethods.map(({ id, label }) => ({ id, label })),
      paymentKeyId: config.razorpay.keyId,
    },
    async runWorkers() {
      const payments = await workers.runPaymentBatch();
      const delivered = await workers.runKeeriBatch();
      // Email never gates an order: a sweep or send failure is retried next cycle.
      await notifications.sweep();
      const emails = await notifications.runBatch();
      return { payments, keeri: delivered, emails };
    },
  };
}
