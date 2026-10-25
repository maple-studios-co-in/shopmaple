import { isAbsolute } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createApp } from "./app.js";
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
const db = new PrismaClient();
const server = createApp(db, {
  webOrigin: new URL(env.WEB_ORIGIN).origin,
  catalogMode: env.CATALOG_MODE,
  mediaRoot: env.SHOP_MEDIA_ROOT,
  secureCookies: process.env.NODE_ENV === "production",
  trustProxyLoopback: env.API_TRUST_PROXY_LOOPBACK === "true",
}).listen(env.API_PORT, env.API_HOST, () =>
  console.log(
    "Maple API listening on " +
      env.API_HOST +
      ":" +
      env.API_PORT +
      " (preview; checkout disabled)",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    }),
  );
