import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { reviewSubmissionSchema } from "@shopmaple/contracts/reviews";
import sharp from "sharp";
import { z } from "zod";
import { HttpError } from "./cart.js";
import { saveEnquiry } from "./enquiries.js";
import type { EnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";

export type KeeriReviewsConfig = { origin: string; token: string; fetch?: typeof fetch; timeoutMs?: number };
export type ReviewRoutesConfig = { webOrigin: string; keeri?: KeeriReviewsConfig | null; enquiryDelivery?: EnquiryDeliveryConfig | null };

/** Off until the server holds Keeri's HTTPS origin and a review-writing credential of its own. */
export function loadKeeriReviewsConfig(env: Record<string, string | undefined>): KeeriReviewsConfig | null {
  const { KEERI_ORIGIN: origin, KEERI_REVIEWS_TOKEN: token } = env;
  if (!origin || !token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.href !== `${url.origin}/` || url.username || url.password) return null;
  } catch { return null; }
  return { origin, token };
}

const invalidPhoto = () => new HttpError(400, "REVIEW_PHOTO_INVALID", "One of your photos could not be read. Please choose a JPG or PNG.");

// The browser sends no photo over 2000 px on its longer side (review-client.ts), so 4 MP; a little over that is allowed.
// Kept tight because a decoded photo is held whole in memory: a 24 MP limit let one request hold gigabytes.
const photoPixelLimit = 4_200_000;

/**
 * A customer's photo made anew: checked to really be a JPEG or PNG, turned upright, bounded in size and written as WebP,
 * the format Keeri serves review photos in. Nothing of the original file's metadata (location, camera) is carried over.
 */
async function remadePhoto(encoded: string) {
  try {
    const decoder = sharp(Buffer.from(encoded, "base64"), { limitInputPixels: photoPixelLimit, failOn: "warning" });
    const { format } = await decoder.metadata();
    if (format !== "jpeg" && format !== "png") throw invalidPhoto();
    const { data, info } = await decoder.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { contentType: "image/webp", data: data.toString("base64"), width: info.width, height: info.height };
  } catch { throw invalidPhoto(); }
}

/** True once Keeri has taken the review. Only a status or an error's kind is ever logged: never the customer's words. */
async function sentToKeeri(config: KeeriReviewsConfig, key: string, review: object) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 20_000);
  try {
    const response = await (config.fetch ?? fetch)(new URL("/api/storefront/reviews", config.origin), {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, "Idempotency-Key": key },
      body: JSON.stringify(review),
    });
    void response.body?.cancel().catch(() => {});
    if (response.ok) return true;
    console.warn(`Keeri did not take a review (status ${response.status}); it is kept in the store's inbox.`);
    return false;
  } catch (error) {
    console.warn(`A review could not reach Keeri (${error instanceof Error ? error.name : "unknown"}); it is kept in the store's inbox.`);
    return false;
  } finally { clearTimeout(timer); }
}

const keeriId = ({ source, externalId }: { source: string; externalId: string }) => externalId.startsWith(`${source}:`) ? externalId.slice(source.length + 1) : externalId;

/**
 * The product page's "Write a review" (docs/product-reviews.md). Mounted before the app's small JSON parser, as it takes
 * photos: the origin and rate checks run first, so a stranger's large body is never read. A review goes to Keeri, which
 * moderates and publishes it. When Keeri cannot take it (no credential here yet, a listing with no Keeri model, a refusal,
 * an outage) it is kept as a "review" enquiry in the admin's inbox instead, so what the customer wrote is never lost.
 */
export function registerReviewRoutes(app: Express, db: PrismaClient, config: ReviewRoutesConfig) {
  let active = 0;
  app.post(
    "/api/reviews",
    (req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      if (req.get("origin") !== config.webOrigin) {
        res.status(403).json({ code: "ORIGIN_REJECTED", message: "Please make this change from the Maple website." });
        return;
      }
      next();
    },
    rateLimit({
      windowMs: 60 * 60_000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { code: "TOO_MANY_REVIEWS", message: "Too many reviews from this connection. Please try again later." },
    }),
    (_req, res, next) => {
      // A slot is held until the response ends, photos and Keeri's reply included.
      if (active >= 4) throw new HttpError(503, "REVIEWS_BUSY", "Many reviews are arriving at once. Please try again in a moment.");
      active++;
      res.once("close", () => { active--; });
      next();
    },
    express.json({ limit: "10mb" }),
    async (req, res) => {
      const key = z.uuid().parse(req.get("Idempotency-Key"));
      const input = reviewSubmissionSchema.parse(req.body);
      const product = await db.product.findFirst({
        where: { handle: input.handle, published: true },
        select: {
          title: true,
          identities: { select: { source: true, externalId: true } },
          variants: { where: { published: true }, select: { id: true, title: true, sku: true, identities: { select: { source: true, externalId: true } } } },
        },
      });
      if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product.");
      // One photo at a time, so a request holds a single decoded photo in memory rather than all five.
      const photos = [];
      for (const encoded of input.photos) photos.push(await remadePhoto(encoded));
      const variant = product.variants.find((item) => item.id === input.variantId);
      const model = product.identities.find((identity) => identity.source.startsWith("keeri:"));
      const finish = model && variant?.identities.find((identity) => identity.source === model.source);
      const taken = Boolean(config.keeri && model) && await sentToKeeri(config.keeri!, key, {
        modelId: keeriId(model!),
        variantId: finish ? keeriId(finish) : null,
        rating: input.rating,
        title: input.title,
        body: input.body,
        reviewerName: input.displayName,
        reviewerEmail: input.email,
        city: null,
        reviewedAt: new Date().toISOString().slice(0, 10),
        // Keeri's sources name where a review came from; the website form is none of its other four.
        source: "other",
        photos,
      });
      if (!taken) await saveEnquiry(db, {
        kind: "review",
        name: input.displayName,
        email: input.email,
        message: [
          `Rating: ${input.rating} out of 5`,
          `Title: ${input.title}`,
          input.body,
          ...(photos.length ? [`Photos: ${photos.length} sent with the review, not kept here. Ask the customer to send them again if needed.`] : []),
        ].join("\n\n"),
        context: { product: product.title, variant: variant?.title ?? "", sku: variant?.sku ?? "" },
      }, key, config.enquiryDelivery ?? null);
      res.status(201).json({ status: "received" });
    },
  );
}
