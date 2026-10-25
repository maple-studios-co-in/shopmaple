import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { listProducts, serializeProduct } from "./catalog.js";
import { currentCart, readCart, setCartQuantity, HttpError } from "./cart.js";

export type AppConfig = {
  webOrigin: string;
  catalogMode: "preview";
  secureCookies: boolean;
};
export function createApp(db: PrismaClient, config: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== config.webOrigin
    ) {
      res
        .status(403)
        .json({
          code: "ORIGIN_REJECTED",
          message: "Please make this change from the Maple website.",
        });
      return;
    }
    next();
  });
  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      catalogMode: config.catalogMode,
      checkoutEnabled: false,
    });
  });
  app.get("/api/products", async (req, res) => {
    const result = await listProducts(db, req.query);
    res.set("Cache-Control", "public, max-age=30, s-maxage=60").json(result);
  });
  app.get("/api/products/:handle", async (req, res) => {
    const p = await db.product.findFirst({
      where: { handle: req.params.handle, published: true },
      include: { variants: { orderBy: { id: "asc" } } },
    });
    if (!p)
      throw new HttpError(
        404,
        "PRODUCT_NOT_FOUND",
        "We couldn't find that product.",
      );
    res
      .set("Cache-Control", "public, max-age=30, s-maxage=60")
      .json(serializeProduct(p));
  });
  app.use(["/api/cart", "/api/checkout"], (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  app.get("/api/cart", async (req, res) =>
    res.json(await readCart(db, (await currentCart(db, req))?.id)),
  );
  app.put("/api/cart/items/:variantId", async (req, res) => {
    const { quantity } = z
      .object({ quantity: z.number().int().min(0).max(20) })
      .strict()
      .parse(req.body);
    const id = z.string().min(1).max(160).parse(req.params.variantId);
    res.json(
      await setCartQuantity(db, req, res, id, quantity, config.secureCookies),
    );
  });
  app.post("/api/checkout", (_req, res) =>
    res
      .status(503)
      .json({
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
      res
        .status(400)
        .json({
          code: "INVALID_INPUT",
          message: "Check the supplied values and try again.",
        });
      return;
    }
    if (error instanceof HttpError) {
      res
        .status(error.status)
        .json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res
        .status(400)
        .json({
          code: "INVALID_JSON",
          message: "The request must contain valid JSON.",
        });
      return;
    }
    console.error(
      "API request failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    res
      .status(500)
      .json({
        code: "SERVER_ERROR",
        message: "We couldn't complete that request. Please try again.",
      });
  };
  app.use(onError);
  return app;
}
