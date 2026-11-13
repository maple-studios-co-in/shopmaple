import { z } from "zod";
// Through the index, as every other importer reaches the checkout schemas: a second path to ./checkout makes the
// bundler regroup the homepage's chunks, which costs its compressed-size budget (scripts/check-homepage-payload.mjs).
import { checkoutInputSchema } from "./index";

/**
 * The buyer's consent to order updates on WhatsApp (owner, 13 Nov 2026): what the checkout page posts, and what the
 * store tells Keeri, which sends the messages (docs/whatsapp-order-confirmation.md).
 *
 * Import this module by its subpath, `@shopmaple/contracts/checkout-consent`. Like `/account` and `/whatsapp`, it is not
 * re-exported from the package index, which ships in the homepage's JavaScript.
 */

/**
 * What the checkout page posts to `/api/checkout`: the quote's input, and whether the buyer ticked "Send my order
 * updates on WhatsApp" (owner, 13 Nov 2026). The tick is the buyer's consent to WhatsApp messages about this order. It
 * is kept with the checkout attempt and never goes into the quote Keeri prices, so the quote request and its snapshot
 * are exactly what they were. Absent or false: no consent.
 */
export const checkoutRequestSchema = checkoutInputSchema
  .extend({ whatsappOrderUpdates: z.boolean().optional() })
  .strict();
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

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
    /** Only with WHATSAPP_ORDER_LINKS=true (Keeri accepts them from 14 Nov 2026): the ends of the order's private links,
     * which Keeri's "View order" button carries after `/account/orders/`; the dispatched message opens tracking. */
    orderLinks: z
      .object({ view: z.string().regex(/^MF-[1-9][0-9]{0,9}-[a-f0-9]{32}$/), tracking: z.string().regex(/^MF-[1-9][0-9]{0,9}-[a-f0-9]{32}-tracking$/) })
      .strict()
      .optional(),
    /** Only with WHATSAPP_ORDER_LINKS=true: the first piece's variant slug, so the picture is the variant bought. */
    headerVariantId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64).nullable().optional(),
  })
  .strict();
export type OrderWhatsappUpdates = z.infer<typeof orderWhatsappUpdatesSchema>;
