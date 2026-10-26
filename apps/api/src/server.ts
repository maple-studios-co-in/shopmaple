import { isAbsolute } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createApp } from "./app.js";
import { loadEnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { processEnquiryDeliveries } from "./enquiry-delivery-worker.js";
import { startEnquiryDeliveryRunner } from "./enquiry-delivery-runner.js";
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
  })
  .parse(process.env);
if (
  env.API_TRUST_PROXY_LOOPBACK === "true" &&
  !["127.0.0.1", "::1"].includes(env.API_HOST)
)
  throw new Error("Trusted local proxy requires a loopback-bound API");
const enquiryDelivery = loadEnquiryDeliveryConfig(process.env);
const db = new PrismaClient();
const server = createApp(db, {
  webOrigin: new URL(env.WEB_ORIGIN).origin,
  catalogMode: env.CATALOG_MODE,
  mediaRoot: env.SHOP_MEDIA_ROOT,
  secureCookies: process.env.NODE_ENV === "production",
  trustProxyLoopback: env.API_TRUST_PROXY_LOOPBACK === "true",
  enquiryDelivery,
  catalogueMedia: process.env.KEERI_ORIGIN && process.env.KEERI_CATALOGUE_TOKEN ? { origin: process.env.KEERI_ORIGIN, token: process.env.KEERI_CATALOGUE_TOKEN } : undefined,
}).listen(env.API_PORT, env.API_HOST, () =>
  console.log(
    "Maple API listening on " +
      env.API_HOST +
      ":" +
      env.API_PORT +
      " (preview; checkout disabled)",
  ),
);
const deliveryRunner = enquiryDelivery
  ? startEnquiryDeliveryRunner(
      () => processEnquiryDeliveries(db, enquiryDelivery),
      () => console.error("Enquiry delivery cycle failed; queued work remains recoverable."),
    )
  : null;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const drained = deliveryRunner?.stop();
    server.close(() => {
      void Promise.resolve(drained).then(() => db.$disconnect()).then(() => process.exit(0));
    });
  });
