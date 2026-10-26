import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptKeeriExportV2 } from "../src/keeri.js";
import { keeriFixture } from "./fixtures/keeri.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
test("V2 explicitly channel-published draft products survive missing commercial data without invented values", () => {
  const data = v2Fixture();
  data.models[0]!.variants[0]!.prices = [];
  data.publicMedia = [];
  const p = adaptKeeriExportV2(data, "maple").products[0]!;
  assert.equal(p.sourceStatus, "draft");
  assert.equal(p.variants[0]!.pricePaise, null);
  assert.equal(p.variants[0]!.available, false);
  assert.deepEqual(p.images, []);
  data.models[0]!.variants = [];
  assert.deepEqual(adaptKeeriExportV2(data, "maple").products[0]!.variants, []);
});
test("V2 rejects cross-tenant and malformed Shopify evidence, and respects channel opt-out", () => {
  const data = v2Fixture();
  assert.throws(() => adaptKeeriExportV2(data, "other"));
  assert.throws(() =>
    adaptKeeriExportV2(
      {
        ...data,
        models: [{ ...data.models[0], shopifyProductId: "gid://private/1" }],
      },
      "maple",
    ),
  );
  data.models[0]!.channelPublished = false;
  assert.equal(adaptKeeriExportV2(data, "maple").products.length, 0);
});

test("V2 source empty SKU becomes unknown rather than suppressing the product", () => {
  const x = v2Fixture();
  x.models[0]!.variants[0]!.sku = "";
  assert.equal(
    adaptKeeriExportV2(x, "maple").products[0]!.variants[0]!.sku,
    null,
  );
});

test("V2 unknown stock policy stays unverified and never implies availability", () => {
  const x = v2Fixture();
  const variant = { ...x.models[0]!.variants[0]!, stockPolicy: "unverified" };
  const p = adaptKeeriExportV2(
    { ...x, models: [{ ...x.models[0]!, variants: [variant] }] },
    "maple",
  ).products[0]!;
  assert.equal(p.variants[0]!.stockPolicy, "unverified");
  assert.equal(p.variants[0]!.available, false);
});

test("explicit publication categories remain authoritative and unknown product types stay uncategorized", () => {
  const data = v2Fixture();
  data.publication[0]!.category = "outdoors";
  assert.equal(adaptKeeriExportV2(data, "maple").products[0]!.category, "outdoors");
  data.publication[0]!.category = null;
  data.models[0]!.productType = "custom";
  data.models[0]!.name = "Chair and table collection";
  assert.equal(adaptKeeriExportV2(data, "maple").products[0]!.category, null);
});

test("canonical Keeri product types fill missing publication categories without requiring a price or photo", () => {
  for (const [productType, category] of [
    ["chair", "chairs"], ["Chairs", "chairs"],
    ["table", "tables"], ["tables", "tables"],
    ["sofa", "sofas"], ["sofas", "sofas"],
    ["bed", "beds"], [" Beds ", "beds"],
    ["storage", "storage"], ["outdoors", "outdoors"],
  ] as const) {
    const data = v2Fixture();
    data.publication[0]!.category = null;
    data.publicMedia = [];
    data.models[0]!.productType = productType;
    data.models[0]!.variants[0]!.prices = [];
    const p = adaptKeeriExportV2(data, "maple").products[0]!;
    assert.equal(p.category, category, `${productType} must remain discoverable by its known category`);
    assert.deepEqual(p.images, []);
    assert.equal(p.variants[0]!.pricePaise, null);
    assert.equal(p.variants[0]!.available, false);
  }
});
