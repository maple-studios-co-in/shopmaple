import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import { findOrderPieceDetails } from "../src/orders/order-email.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const clock = new Date("2026-11-14T10:00:00.000Z");
const media = (name: string) => `https://store.maple.example.com/media/keeri/${name}.webp`;

/** One design in three finishes: oak has three photos of its own, walnut one, ash none. */
async function design() {
  await db.product.create({ data: {
    id: "keeri:maple:gallery-chair", handle: "gallery-chair", title: "Nola Chair", description: "", published: true,
    source: "keeri:maple", sourceUpdatedAt: clock,
    images: [media("oak-front"), media("oak-angle"), media("oak-side"), media("oak-back"), media("walnut-front"), media("drawing")],
    variants: { create: [
      { id: "gallery-oak", title: "Oak", images: [media("oak-front"), media("oak-angle"), media("oak-side"), media("oak-back")] },
      { id: "gallery-walnut", title: "Walnut", images: [media("walnut-front")] },
      { id: "gallery-ash", title: "Ash", images: [] },
    ] },
  } });
}
function order(variants: string[]) {
  const items = variants.map((variant) => ({ localVariantId: `gallery-${variant}`, localProductId: "keeri:maple:gallery-chair",
    sourceVariantId: `keeri:maple:gallery-${variant}-v`, sourceProductId: "keeri:maple:gallery-chair" }));
  const quote = { items: variants.map((variant) => ({ variantId: `keeri:maple:gallery-${variant}-v` })) } as unknown as QuoteSnapshot;
  return { attempt: { catalogueBindings: { version: 1, tenantId: "maple", items } }, quote };
}

beforeEach(async () => {
  await db.product.deleteMany({ where: { id: "keeri:maple:gallery-chair" } });
});
after(async () => {
  await db.product.deleteMany({ where: { id: "keeri:maple:gallery-chair" } });
  await db.$disconnect();
});

test("the email's extra photos are the variant bought, never the design's other finishes or drawings", async () => {
  await design();
  const { attempt, quote } = order(["oak", "walnut", "ash"]);
  const details = await findOrderPieceDetails(db, attempt, quote);
  // Oak: its own photos after the lead, at most three.
  assert.deepEqual(details.get("keeri:maple:gallery-oak-v")?.photos, [media("oak-angle"), media("oak-side"), media("oak-back")]);
  // Walnut has one photo of its own (the lead) and ash none: neither borrows oak's photos or the drawing.
  assert.deepEqual(details.get("keeri:maple:gallery-walnut-v")?.photos, []);
  assert.deepEqual(details.get("keeri:maple:gallery-ash-v")?.photos, []);
});

test("a photo the product no longer serves, or a product taken down, adds no photos", async () => {
  await design();
  await db.product.update({ where: { id: "keeri:maple:gallery-chair" }, data: { images: [media("oak-front"), media("oak-side")] } });
  const { attempt, quote } = order(["oak"]);
  assert.deepEqual((await findOrderPieceDetails(db, attempt, quote)).get("keeri:maple:gallery-oak-v")?.photos, [media("oak-side")]);
  await db.product.update({ where: { id: "keeri:maple:gallery-chair" }, data: { published: false } });
  assert.deepEqual((await findOrderPieceDetails(db, attempt, quote)).get("keeri:maple:gallery-oak-v")?.photos, []);
});
