import { isAbsolute } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createApp } from "./app.js";
import { composeCommerce, loadCommerceConfig } from "./commerce-composition.js";
import { loadEnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { processEnquiryDeliveries } from "./enquiry-delivery-worker.js";
import { startEnquiryDeliveryRunner } from "./enquiry-delivery-runner.js";
import { installShutdown } from "./server-lifecycle.js";
const env = z
  .object({
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    API_HOST: z.string().default("127.0.0.1"),
    API_TRUST_PROXY_LOOPBACK: z.enum(["true", "false"]).default("false"),
    SHOP_MEDIA_ROOT: z
      .string()
      .refine(isAbsolute, "Media root must be absolute")
      .optional(),
    CATALOG_MODE: z.literal("preview").default("preview"),
    ADMIN_PREVIEW_SECRET: z.string().min(32).max(256).optional(),
  })
  .parse(process.env);
if (
  env.API_TRUST_PROXY_LOOPBACK === "true" &&
  !["127.0.0.1", "::1"].includes(env.API_HOST)
)
  throw new Error("Trusted local proxy requires a loopback-bound API");
const enquiryDelivery = loadEnquiryDeliveryConfig(process.env);
// Checkout is off unless CHECKOUT_ENABLED=true and every commerce value is valid.
const commerceConfig = loadCommerceConfig(process.env);
const db = new PrismaClient();
const commerce = commerceConfig ? composeCommerce(db, commerceConfig) : null;
const server = createApp(
  db,
  {
    webOrigin: new URL(env.WEB_ORIGIN).origin,
    catalogMode: env.CATALOG_MODE,
    mediaRoot: env.SHOP_MEDIA_ROOT,
    previewSecret: env.ADMIN_PREVIEW_SECRET,
    secureCookies: process.env.NODE_ENV === "production",
    trustProxyLoopback: env.API_TRUST_PROXY_LOOPBACK === "true",
    enquiryDelivery,
    catalogueMedia: process.env.KEERI_ORIGIN && process.env.KEERI_CATALOGUE_TOKEN ? { origin: process.env.KEERI_ORIGIN, token: process.env.KEERI_CATALOGUE_TOKEN } : undefined,
    checkout: commerce?.checkout,
  },
  commerce?.commerce,
).listen(env.API_PORT, env.API_HOST, () =>
  console.log(
    "Maple API listening on " +
      env.API_HOST +
      ":" +
      env.API_PORT +
      (commerce ? " (preview catalogue; checkout enabled)" : " (preview; checkout disabled)"),
  ),
);
const deliveryRunner = enquiryDelivery
  ? startEnquiryDeliveryRunner(
      () => processEnquiryDeliveries(db, enquiryDelivery),
      () => console.error("Enquiry delivery cycle failed; queued work remains recoverable."),
    )
  : null;
const orderRunner = commerce
  ? startEnquiryDeliveryRunner(
      () => commerce.runWorkers(),
      () => console.error("Order worker cycle failed; queued payments and orders remain recoverable."),
      5_000,
    )
  : null;
installShutdown({
  server,
  db,
  runners: [deliveryRunner, orderRunner],
  exit: (code) => process.exit(code),
});
