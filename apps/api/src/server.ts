import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createApp } from "./app.js";
const env = z
  .object({
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    API_HOST: z.string().default("127.0.0.1"),
    CATALOG_MODE: z.literal("preview").default("preview"),
  })
  .parse(process.env);
const db = new PrismaClient();
const server = createApp(db, {
  webOrigin: new URL(env.WEB_ORIGIN).origin,
  catalogMode: env.CATALOG_MODE,
  secureCookies: process.env.NODE_ENV === "production",
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
