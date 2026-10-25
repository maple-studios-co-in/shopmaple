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

test('V2 source empty SKU becomes unknown rather than suppressing the product',()=>{
 const x=v2Fixture(); x.models[0]!.variants[0]!.sku='';
 assert.equal(adaptKeeriExportV2(x,'maple').products[0]!.variants[0]!.sku,null);
});
