import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { bootstrapPublicPreview } from "./public-preview.js";

const url = process.env.PREVIEW_IMPORT_TEST_DATABASE_URL ?? "";
if (new URL(url).pathname !== "/shopmaple_preview_import_test") throw new Error("Dedicated import test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const full = JSON.parse(await readFile(new URL("../apps/api/data/preview-catalog.json", import.meta.url), "utf8"));
const fixture = { ...full, products: full.products.slice(0, 2) };
test("bootstrap publishes two catalogue products, never stock, and refuses any repeat or existing catalogue", async () => {
  try {
    await db.variant.deleteMany(); await db.product.deleteMany();
    await bootstrapPublicPreview(db, fixture);
    assert.equal(await db.product.count(), 2);
    assert.equal(await db.variant.count({ where: { available: true } }), 0);
    assert.equal(await db.variant.count({ where: { stockPolicy: { not: "unverified" } } }), 0);
    await assert.rejects(bootstrapPublicPreview(db, fixture), /empty/i);
    assert.equal(await db.product.count(), 2);
  } finally { await db.variant.deleteMany(); await db.product.deleteMany(); await db.$disconnect(); }
});
