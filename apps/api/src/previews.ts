import type { Express } from "express";
import { quoteSnapshotSchema } from "@shopmaple/contracts";
import { formatOrderNumber } from "@shopmaple/contracts/account";
import { z } from "zod";
import { renderOrderEmail } from "./orders/order-email.js";

/**
 * Development previews of the customer emails: the real templates rendered with the owner's sample order (Figma
 * 394:1418). GET /api/previews/emails/order-confirmation shows the confirmation; `?kind=received` the "payment
 * received" email; `?format=text` either one's plain-text part.
 *
 * Registered only when NODE_ENV is development or test. Anything else, unset included, is production (the rule the
 * account settings use), and gets no route at all: the API's ordinary 404.
 */
export function registerEmailPreviews(app: Express, webOrigin: string, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== "development" && nodeEnv !== "test") return;
  const origin = new URL(webOrigin).origin;
  const query = z.object({
    kind: z.enum(["confirmed", "received"]).default("confirmed"),
    format: z.enum(["html", "text"]).default("html"),
  });
  app.get("/api/previews/emails/order-confirmation", (req, res) => {
    const { kind, format } = query.parse(req.query);
    // As a store with customer accounts on sends it: "View your order" opens the order in the buyer's account.
    const email = renderOrderEmail({ kind, ...sampleOrder(origin), accountLinks: true });
    res.set("Cache-Control", "no-store");
    if (format === "text") {
      res.type("text/plain; charset=utf-8").send(email.text);
      return;
    }
    // The storefront's photos and Google's fonts, which the API's own policy (helmet) would refuse; no scripts at all.
    res.set(
      "Content-Security-Policy",
      `default-src 'none'; img-src 'self' ${origin} https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'`,
    );
    res.type("html").send(email.html);
  });
}

/** Aditi's order from the frame: one Nola Accent Chair, captured 10 Nov 2026, arriving 24–28 Nov. */
function sampleOrder(origin: string) {
  const address = { line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", stateCode: "29", pincode: "560001", country: "IN" };
  const quote = quoteSnapshotSchema.parse({
    version: 2,
    currency: "INR",
    policyId: "email-preview",
    quoteId: "quote_email_preview",
    expiresAt: "2026-11-10T06:00:00.000Z",
    customer: { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" },
    billingAddress: address,
    shippingAddress: address,
    deliveryMethodId: "standard",
    gstMode: "included",
    items: [{
      variantId: "keeri:maple:nola-accent-chair-cane-oak",
      productId: "keeri:maple:nola-accent-chair",
      title: "Nola Accent Chair",
      variantTitle: "Natural cane · Oak finish",
      sku: null,
      quantity: 1,
      unitPricePaise: 2_490_000,
      lineTotalPaise: 2_490_000,
      hsn: "9401",
      taxRateBps: 1800,
      fulfilment: { kind: "stocked", leadTimeDays: null },
    }],
    subtotalPaise: 2_490_000,
    shippingPaise: 150_000,
    // 18% GST inside ₹26,400.
    taxPaise: 402_712,
    totalPaise: 2_640_000,
    // Fourteen days from the 10 November capture is the frame's 24–28 Nov window (account/orders.ts).
    delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
      carrier: { provider: "shiprocket", courierId: 1, courierName: "Delhivery Surface", estimatedDays: 14, chargeWeightGrams: 12_000 } },
  });
  return {
    attempt: { id: "00000000-0000-4000-8000-000000010482", amountPaise: 2_640_000, capturedAt: new Date("2026-11-10T05:30:00.000Z") },
    quote,
    orderNumber: formatOrderNumber(10482),
    // The storefront's own picture of the chair; real orders use the catalogue's photo.
    photos: new Map([[quote.items[0]!.variantId, `${origin}/media/previews/nola-accent-chair.webp`]]),
    origin,
  };
}
