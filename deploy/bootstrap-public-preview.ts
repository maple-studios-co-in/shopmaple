import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { assertPreviewTarget, bootstrapPublicPreview } from "./public-preview.js";

assertPreviewTarget(process.env.DATABASE_URL ?? "", process.env.PREVIEW_DATABASE_NAME ?? "", process.env.APPROVE_PUBLIC_PREVIEW ?? "");
// Only the version-controlled public snapshot is eligible; never export a local user database.
const input = JSON.parse(await readFile(new URL("../apps/api/data/preview-catalog.json", import.meta.url), "utf8"));
const db = new PrismaClient();
try {
  const count = await bootstrapPublicPreview(db, input);
  console.log(`Published ${count} preview products; all stock unverified and unavailable, checkout disabled.`);
} finally { await db.$disconnect(); }
