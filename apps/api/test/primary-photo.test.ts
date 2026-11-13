import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptKeeriExportV2 } from "../src/keeri.js";
import { leadPhotoOrder } from "../src/primary-photo.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

/** A design whose dimension drawings sit before its photographs, as 23 live designs did on 14 Nov 2026. */
function drawingsFirst() {
  const k = v2Fixture() as any;
  const asset = (id: string, role: string, position: number, variantId: string | null = null) => ({
    id, tenantId: "maple", modelId: "model1", variantId, stage: "approved", storageKey: `maple/approved/${id}.webp`,
    supersededAt: null, position, role,
  });
  k.models[0].media = [asset("drawing1", "dimension", 0), asset("front1", "front", 1), asset("drawing2", "dimension", 2), asset("angle1", "angle", 3)];
  k.models[0].variants[0].media = [asset("vdrawing", "dimension", 0, "variant1"), asset("vfront", "front", 1, "variant1")];
  k.publicMedia = ["drawing1", "front1", "drawing2", "angle1", "vdrawing", "vfront"].map((id) => ({ assetId: id, url: `https://media.example.com/${id}.webp` }));
  return k;
}
const names = (urls: string[]) => urls.map((url) => url.replace(/^.*\/(.*)\.webp$/, "$1"));

test("a product's photographs lead and its dimension drawings follow, each kind in staff's order", () => {
  const product = adaptKeeriExportV2(drawingsFirst(), "maple").products[0]!;
  assert.deepEqual(names(product.images), ["front1", "vfront", "angle1", "drawing1", "vdrawing", "drawing2"]);
});

test("a variant's own photographs lead its drawings too, so the bag, emails and WhatsApp show the piece", () => {
  const product = adaptKeeriExportV2(drawingsFirst(), "maple").products[0]!;
  assert.deepEqual(names(product.variants[0]!.images), ["vfront", "vdrawing"]);
});

test("a design with only drawings still shows them, and staff's order is kept where no drawing is involved", () => {
  const rows = [{ role: "dimension", position: 1, id: "b" }, { role: "dimension", position: 0, id: "a" }];
  assert.deepEqual(leadPhotoOrder(rows).map((r) => r.id), ["a", "b"]);
  const photos = [{ role: "lifestyle", position: 0, id: "l" }, { role: "front", position: 1, id: "f" }, { position: 2, id: "x" }];
  assert.deepEqual(leadPhotoOrder(photos).map((r) => r.id), ["l", "f", "x"]);
});
