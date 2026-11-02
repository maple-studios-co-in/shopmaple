import { cartMutationInputSchema } from "@shopmaple/contracts";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { registerStaffRoutes } from "./admin/auth.js";
import { registerMediaRoutes } from "./admin/media.js";
import { registerEnquiryAdminRoutes } from "./admin/enquiries.js";
import { registerEnquiryDeliveryAdminRoutes } from "./admin/enquiry-delivery.js";
import { registerCrmRoutes } from "./admin/crm.js";
import type { EnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { registerContentRoutes } from "./admin/content.js";
import { listProducts, serializeProduct } from "./catalog.js";
import { registerCatalogueMedia, type CatalogueMediaConfig } from "./catalogue-media.js";
import { registerCatalogueViewRoutes } from "./catalogue-view.js";
import { registerInstagramFeedRoutes, type InstagramFeedConfig } from "./instagram-feed.js";
import { saveEnquiry } from "./enquiries.js";
import { registerKeeriDeliveryRoute, registerReviewRoutes, type ReviewsConfig } from "./reviews/routes.js";
import { bootstrapCart, setCartQuantity, HttpError } from "./cart.js";
import {
  commerceHttpError,
  registerCheckoutRoutes,
  registerPaymentWebhook,
  type CheckoutOptions,
  type CommerceHttpService,
} from "./commerce-http.js";

export type AppConfig = {
  webOrigin: string;
  catalogMode: "preview";
  secureCookies: boolean;
  /** Only opt in for a loopback-bound API behind the trusted local Next/Tunnel proxy. */
  trustProxyLoopback?: boolean;
  mediaRoot?: string;
  /** SEO_INDEXING=on: the store's photos may appear in search. The API itself never may. */
  seoIndexing?: boolean;
  /** Signs staff draft-preview tokens; share it across API processes, or omit it for a per-process key. */
  previewSecret?: string;
  catalogueMedia?: CatalogueMediaConfig;
  enquiryDelivery?: EnquiryDeliveryConfig | null;
  /** Transport for outbound staff replies; tests inject a local double. Defaults to global fetch. */
  outboundFetch?: typeof fetch;
  /** Accepted staff replies per actor per window; defaults to 20 per hour. Tests inject a smaller limit. */
  replyRateLimit?: { limit: number; windowMs: number };
  /** Public checkout options; only meaningful together with an injected commerce service. */
  checkout?: CheckoutOptions;
  /** The automatic Instagram feed; null or absent until every private Meta setting is present. */
  instagramFeed?: InstagramFeedConfig | null;
  /** Verified reviews; null or absent until REVIEW_LINK_SECRET is set. */
  reviews?: ReviewsConfig | null;
};
export function createApp(
  db: PrismaClient,
  config: AppConfig,
  commerce?: CommerceHttpService,
) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxyLoopback) app.set("trust proxy", "loopback");
  app.use(helmet());
  // The API is never a search result; product photos join search only once the store launches.
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || !config.seoIndexing) res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });
  app.use("/api/admin", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  if (commerce) registerPaymentWebhook(app, commerce);
  registerKeeriDeliveryRoute(app, db, config.reviews);
  registerMediaRoutes(app, db, config);
  app.use("/api/admin/content", express.json({ limit: "128kb" }));
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== config.webOrigin
    ) {
      res.status(403).json({
        code: "ORIGIN_REJECTED",
        message: "Please make this change from the Maple website.",
      });
      return;
    }
    next();
  });
  registerStaffRoutes(app, db, config.secureCookies);
  registerContentRoutes(app, db, config.secureCookies, config.mediaRoot, config.previewSecret);
  registerEnquiryAdminRoutes(app, db, config.secureCookies, config.enquiryDelivery ?? null, config.outboundFetch, config.replyRateLimit);
  registerEnquiryDeliveryAdminRoutes(app, db, config.secureCookies, config.enquiryDelivery ?? null);
  registerCrmRoutes(app, db, config.secureCookies);
  registerCatalogueViewRoutes(app, db);
  registerCatalogueMedia(app, db, config.catalogueMedia);
  registerInstagramFeedRoutes(app, db, config.instagramFeed ?? null, config.secureCookies);
  registerReviewRoutes(app, db, config.reviews, config.secureCookies, config.enquiryDelivery ?? null);
  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      catalogMode: config.catalogMode,
      checkoutEnabled: Boolean(commerce),
    });
  });
  app.get("/api/products", async (req, res) => {
    const result = await listProducts(db, req.query);
    res.set("Cache-Control", "public, max-age=30, s-maxage=60").json(result);
  });
  app.get("/api/products/:handle", async (req, res) => {
    const p = await db.product.findFirst({
      where: { handle: req.params.handle, published: true },
      include: {
        variants: { where: { published: true }, orderBy: { id: "asc" } },
      },
    });
    if (!p) {
      // An earlier address (a renamed keeri-<id> one) moves permanently to the current one.
      const alias = await db.productHandleAlias.findUnique({
        where: { handle: req.params.handle },
        select: { product: { select: { handle: true, published: true } } },
      });
      if (alias?.product.published) {
        res
          .set("Cache-Control", "public, max-age=300, s-maxage=3600")
          .redirect(308, `/api/products/${encodeURIComponent(alias.product.handle)}`);
        return;
      }
      throw new HttpError(
        404,
        "PRODUCT_NOT_FOUND",
        "We couldn't find that product.",
      );
    }
    res
      .set("Cache-Control", "public, max-age=30, s-maxage=60")
      .json(serializeProduct(p));
  });
  app.use(
    ["/api/cart", "/api/checkout", "/api/enquiries"],
    (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    },
  );
  app.get("/api/cart", async (req, res) =>
    res.json(await bootstrapCart(db, req, res, config.secureCookies, Boolean(commerce))),
  );
  app.put("/api/cart/items/:variantId", async (req, res) => {
    const input = cartMutationInputSchema.parse(req.body);
    const id = z.string().min(1).max(160).parse(req.params.variantId);
    const result = await setCartQuantity(db, req, id, input, config.secureCookies, Boolean(commerce));
    res.status(result.status).json(result.body);
  });
  app.post(
    "/api/enquiries",
    rateLimit({
      windowMs: 60 * 60_000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        code: "TOO_MANY_ENQUIRIES",
        message:
          "Too many submissions. Please try again later or contact us by phone.",
      },
    }),
    async (req, res) => {
      const result = await saveEnquiry(
        db,
        req.body,
        req.get("Idempotency-Key"),
        config.enquiryDelivery ?? null,
      );
      res.status(result.created ? 201 : 200).json(result.receipt);
    },
  );
  if (commerce) registerCheckoutRoutes(app, commerce, config.secureCookies, config.checkout);
  app.post("/api/checkout", (_req, res) =>
    res.status(503).json({
      code: "CHECKOUT_NOT_AVAILABLE",
      message:
        "Online checkout is not available in this preview. No payment has been taken.",
    }),
  );
  app.use((_req, res) =>
    res
      .status(404)
      .json({ code: "NOT_FOUND", message: "This endpoint does not exist." }),
  );
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: "INVALID_INPUT",
        message: "Check the supplied values and try again.",
      });
      return;
    }
    error = commerceHttpError(error) ?? error;
    if (error instanceof HttpError) {
      res
        .status(error.status)
        .json({ code: error.code, message: error.message });
      return;
    }
    if (error?.type === "entity.too.large") {
      res
        .status(413)
        .json({
          code: "REQUEST_TOO_LARGE",
          message:
            "Your submission is too long. Please shorten it and try again.",
        });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        code: "INVALID_JSON",
        message: "The request must contain valid JSON.",
      });
      return;
    }
    console.error(
      "API request failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      code: "SERVER_ERROR",
      message: "We couldn't complete that request. Please try again.",
    });
  };
  app.use(onError);
  return app;
}
