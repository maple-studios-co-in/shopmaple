import { cartMutationInputSchema } from "@shopmaple/contracts";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { registerStaffRoutes } from "./admin/auth.js";
import { keeriSessionGuard, registerKeeriSignInRoutes } from "./admin/keeri-session.js";
import { signInOffer, type AdminSignIn } from "./admin/keeri-sign-in.js";
import { registerMediaRoutes } from "./admin/media.js";
import { registerEnquiryAdminRoutes } from "./admin/enquiries.js";
import { registerEnquiryDeliveryAdminRoutes } from "./admin/enquiry-delivery.js";
import type { EnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { registerContentRoutes } from "./admin/content.js";
import { listProducts, serializeProduct } from "./catalog.js";
import { registerCatalogueMedia, type CatalogueMediaConfig } from "./catalogue-media.js";
import { registerCatalogueViewRoutes } from "./catalogue-view.js";
import { registerInstagramFeedRoutes, type InstagramFeedConfig } from "./instagram-feed.js";
import { saveEnquiry } from "./enquiries.js";
import type { KeeriLeadsConfig } from "./keeri-leads.js";
import { registerReviewRoutes, type KeeriReviewsConfig } from "./reviews.js";
import { registerAccountRoutes, type AccountOptions } from "./account/routes.js";
import { registerEmailPreviews } from "./previews.js";
import { isLoopbackAddress } from "./network.js";
import { bootstrapCart, setCartQuantity, HttpError } from "./cart.js";
import {
  commerceHttpError,
  registerCheckoutRoutes,
  registerPaymentWebhook,
  type CheckoutOptions,
  type CommerceHttpService,
} from "./commerce-http.js";
import { ingestKeeriOrderEvent, registerKeeriOrderEvents, type KeeriOrderEventsConfig } from "./orders/keeri-events.js";

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
  /** KEERI_LEADS_ENABLED: contact, project and bulk enquiries are also queued as Keeri leads. */
  keeriLeads?: KeeriLeadsConfig | null;
  /** Where the product page's reviews go; null or absent keeps them in the admin's inbox until the credential is present. */
  keeriReviews?: KeeriReviewsConfig | null;
  /** Keeri's signed order updates (status, delivery, cancellation, refund); without it the route does not exist. */
  keeriOrderEvents?: (KeeriOrderEventsConfig & { now?: () => Date }) | null;
  /** Public checkout options; only meaningful together with an injected commerce service. */
  checkout?: CheckoutOptions;
  /** The automatic Instagram feed; null or absent until every private Meta setting is present. */
  instagramFeed?: InstagramFeedConfig | null;
  /** ADMIN_SIGN_IN: absent or `password` keeps shop passwords; `keeri` signs staff in with their Keeri accounts. */
  adminSignIn?: AdminSignIn;
  /** Customer accounts (CUSTOMER_ACCOUNTS_ENABLED); null or absent answers every /api/account route with a 404. */
  accounts?: AccountOptions | null;
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
      // The storefront's own server-side reads (Next on this host) reach the API from loopback with no
      // X-Forwarded-For, and would otherwise share ONE bucket for every visitor: busy account pages could make checkout
      // look closed for everyone. Skipping exactly those is safe because the API listens on loopback only (API_HOST),
      // and every browser request arrives through the Cloudflare tunnel and the Next proxy, which always add
      // X-Forwarded-For (docs/store-deployment.md, "Client rate-limit identity"), so a visitor cannot qualify.
      skip: (req) => isLoopbackAddress(req.socket.remoteAddress) && req.headers["x-forwarded-for"] === undefined,
    }),
  );
  if (commerce) registerPaymentWebhook(app, commerce);
  if (config.keeriOrderEvents) {
    const { merchantScope, now } = config.keeriOrderEvents;
    registerKeeriOrderEvents(app, config.keeriOrderEvents, (rawBody) => ingestKeeriOrderEvent(db, merchantScope, rawBody), now);
  }
  const adminSignIn: AdminSignIn = config.adminSignIn ?? { mode: "password" };
  // Before every staff route, including the media ones registered next: Keeri is asked again about a
  // Keeri session that is more than a minute old.
  app.use("/api/admin", keeriSessionGuard(db, config.secureCookies, adminSignIn));
  registerMediaRoutes(app, db, config);
  registerReviewRoutes(app, db, { webOrigin: config.webOrigin, keeri: config.keeriReviews, enquiryDelivery: config.enquiryDelivery });
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
  // Reached without a session, so they sit before the staff gate that registerStaffRoutes installs.
  if (adminSignIn.mode === "keeri") registerKeeriSignInRoutes(app, db, config.secureCookies, adminSignIn, config.webOrigin);
  registerStaffRoutes(app, db, config.secureCookies, adminSignIn);
  registerContentRoutes(app, db, config.secureCookies, config.mediaRoot, config.previewSecret);
  registerEnquiryAdminRoutes(app, db, config.secureCookies, config.keeriLeads ?? null);
  registerEnquiryDeliveryAdminRoutes(app, db, config.secureCookies, config.enquiryDelivery ?? null, config.keeriLeads ?? null);
  registerCatalogueViewRoutes(app, db);
  registerCatalogueMedia(app, db, config.catalogueMedia);
  registerInstagramFeedRoutes(app, db, config.instagramFeed ?? null, config.secureCookies);
  if (config.accounts) registerAccountRoutes(app, db, { ...config.accounts, secureCookies: config.secureCookies });
  registerEmailPreviews(app, config.webOrigin); // NODE_ENV development or test only; production never has the route
  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      catalogMode: config.catalogMode,
      checkoutEnabled: Boolean(commerce),
      accountsEnabled: Boolean(config.accounts),
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
        config.keeriLeads ?? null,
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
  const onError: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: "INVALID_INPUT",
        message: "Check the supplied values and try again.",
      });
      return;
    }
    error = commerceHttpError(error) ?? error;
    if (error instanceof HttpError) {
      // With Keeri sign-in on, a staff "sign in first" also says how, so the sign-in screen knows what to offer.
      const offer = error.status === 401 && req.path.startsWith("/api/admin") ? signInOffer(adminSignIn) : {};
      res
        .status(error.status)
        .json({ code: error.code, message: error.message, ...offer });
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
