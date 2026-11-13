import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v));
export const checkoutAddressSchema = z
  .object({
    line1: text(200),
    line2: z
      .string()
      .trim()
      .max(200)
      .refine((v) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v))
      .default(""),
    city: text(100),
    stateCode: z.string().regex(/^(0[1-9]|1[0-9]|2[0-46-9]|3[0-8])$/),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/),
    country: z.literal("IN"),
  })
  .strict();
/** A ShopMaple offer code as Keeri matches it: trimmed and uppercased, 3-24 capital letters and digits. */
export const promoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,24}$/);
export const checkoutInputSchema = z
  .object({
    customer: z
      .object({
        name: text(120),
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        phone: z
          .string()
          .regex(/^(?:\+91)?[6-9][0-9]{9}$/)
          .transform((v) => (v.startsWith("+91") ? v : "+91" + v)),
      })
      .strict(),
    billingAddress: checkoutAddressSchema,
    shippingAddress: checkoutAddressSchema,
    deliveryMethodId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    // Optional and additive: without it the quote is exactly what it always was. It is part of the
    // input, so a different code is a different quote (idempotency key, replay, CHECKOUT_INPUT_CHANGED).
    promoCode: promoCodeSchema.optional(),
  })
  .strict();
/**
 * What the checkout page posts to `/api/checkout`: the quote's input, and whether the buyer ticked "Send my order
 * updates on WhatsApp" (owner, 13 Nov 2026). The tick is the buyer's consent to WhatsApp messages about this order. It
 * is kept with the checkout attempt and never goes into the quote Keeri prices, so the quote request and its snapshot
 * are exactly what they were. Absent or false: no consent.
 */
export const checkoutRequestSchema = checkoutInputSchema
  .extend({ whatsappOrderUpdates: z.boolean().optional() })
  .strict();
const identity = z
  .string()
  .regex(/^keeri:[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/);
const money = z.number().int().min(0).max(2147483647);
const id = z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/);
export const quoteRequestSchema = checkoutInputSchema
  .extend({
    version: z.literal(2),
    items: z
      .array(
        z
          .object({
            variantId: identity,
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
/** Stocked, or made to order with the lead time Keeri staff approved. */
export const fulfilmentSchema = z
  .object({
    kind: z.enum(["stocked", "made_to_order"]),
    leadTimeDays: z.number().int().min(1).max(365).nullable(),
  })
  .strict();
const deliverySchema = z
  .object({
    source: z.enum(["policy", "carrier"]),
    carrierPriced: z.boolean(),
    fallbackReason: z
      .enum([
        "shipping_data_missing",
        "shipment_out_of_bounds",
        "carrier_not_configured",
        "carrier_unserviceable",
        "carrier_unavailable",
      ])
      .nullable(),
    carrier: z
      .object({
        provider: z.literal("shiprocket"),
        courierId: z.number().int().min(0),
        courierName: text(200),
        estimatedDays: z.number().int().min(0).max(365).nullable(),
        chargeWeightGrams: z.number().int().min(0),
      })
      .strict()
      .nullable(),
  })
  .strict();
/** The offer a promo code applied; Keeri adds it, and the per-item discount fields, only when one did. */
export const promotionSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]{3,24}$/),
    label: text(40),
    discountPaise: money.min(1),
  })
  .strict();
// Keeri names the applied code in `promotion`; the snapshot never echoes the request's promoCode.
export const quoteSnapshotSchema = checkoutInputSchema
  .omit({ promoCode: true })
  .extend({
    version: z.literal(2),
    currency: z.literal("INR"),
    policyId: text(128),
    quoteId: id,
    expiresAt: z.iso.datetime({ offset: true }),
    gstMode: z.enum(["included", "excluded"]),
    items: z
      .array(
        z
          .object({
            variantId: identity,
            productId: identity,
            title: text(500),
            variantTitle: text(300),
            sku: z.string().max(300).nullable(),
            quantity: z.number().int().min(1).max(20),
            unitPricePaise: money,
            lineTotalPaise: money,
            hsn: z.string().regex(/^\d{2,8}$/),
            taxRateBps: z.number().int().min(0).max(10000),
            // Keeri states it on every new quote; absent only on attempts frozen before it did.
            fulfilment: fulfilmentSchema.optional(),
            // Present on every item, and only, when a code applied: the line's whole discount (0 where
            // the offer does not reach) and the unit price before it. unitPricePaise is after it.
            discountPaise: money.optional(),
            undiscountedUnitPricePaise: money.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    subtotalPaise: money,
    shippingPaise: money,
    taxPaise: money,
    totalPaise: money.min(100),
    /** How Keeri priced `shippingPaise`; absent only on quotes issued before carrier pricing. */
    delivery: deliverySchema.optional(),
    promotion: promotionSchema.optional(),
  })
  .strict();
export const quoteResponseSchema = z
  .object({
    version: z.literal(2),
    quoteId: id,
    expiresAt: z.iso.datetime({ offset: true }),
    snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: quoteSnapshotSchema,
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type QuoteSnapshot = z.infer<typeof quoteSnapshotSchema>;
export type Fulfilment = z.infer<typeof fulfilmentSchema>;
export type Promotion = z.infer<typeof promotionSchema>;

/**
 * What the store adds to a paid order it hands to Keeri (outbox `keeri.order.captured.v2`, payload key
 * `whatsappUpdates`) when the buyer agreed to order updates on WhatsApp. Keeri sends every WhatsApp order message
 * (owner, 13 Nov 2026); the key's presence is the consent, and without it Keeri sends nothing. Keeri's intake
 * (`apps/admin/src/storefront/orders.ts` there) accepts the key as optional and checks exactly these fields.
 */
export const orderWhatsappUpdatesSchema = z
  .object({
    /** When the buyer ticked the box and asked for the quote. */
    consentedAt: z.iso.datetime(),
    /** Maple's order number as the buyer knows it: the messages' "#MF-10482" and the "View order" link. */
    orderNumber: z.string().regex(/^MF-[1-9][0-9]{0,9}$/),
    /** The first piece's product handle, for the confirmation's header image `/whatsapp/order-media/<handle>`. */
    headerHandle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).nullable(),
    /** The delivery window the store shows the buyer, as calendar days in India; null when it has no estimate. */
    estimatedDelivery: z
      .object({ from: z.iso.date(), to: z.iso.date() })
      .strict()
      .nullable(),
  })
  .strict();
export type OrderWhatsappUpdates = z.infer<typeof orderWhatsappUpdatesSchema>;
