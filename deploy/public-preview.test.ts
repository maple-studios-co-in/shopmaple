import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertPreviewTarget, preparePublicPreview } from "./public-preview.js";

const fixture = JSON.parse(await readFile(new URL("../apps/api/data/preview-catalog.json", import.meta.url), "utf8"));
test("operator must explicitly approve an exact isolated ShopMaple database", () => {
  assert.doesNotThrow(() => assertPreviewTarget("postgresql://u:p@127.0.0.1:55440/shopmaple_store", "shopmaple_store", "publish-public-preview-no-checkout"));
  for (const [url, name, approval] of [
    ["postgresql://u:p@127.0.0.1:55440/shopmaple_store", "shopmaple_store", ""],
    ["postgresql://u:p@127.0.0.1:55440/keeri", "shopmaple_store", "publish-public-preview-no-checkout"],
    ["postgresql://u:p@127.0.0.1:55440/keeri", "keeri", "publish-public-preview-no-checkout"],
    ["postgresql://u:p@127.0.0.1:55440/shopmaple_store?schema=other", "shopmaple_store", "publish-public-preview-no-checkout"],
    ["postgresql://u:p@other-host:55440/shopmaple_store", "shopmaple_store", "publish-public-preview-no-checkout"],
    ["postgresql://u:p@127.0.0.1:5432/shopmaple_store", "shopmaple_store", "publish-public-preview-no-checkout"],
  ]) assert.throws(() => assertPreviewTarget(url!, name!, approval!));
});
test("public preview has all public products but never claims available stock", () => {
  const output = preparePublicPreview(fixture);
  assert.equal(output.products.length, 85);
  assert.equal(output.products.flatMap(p => p.variants).every(v => !v.available && v.stockPolicy === "unverified"), true);
});
test("public preview refuses non-preview identities or sources", () => {
  for (const mutate of [
    (p: any) => { p.source = "keeri"; },
    (p: any) => { p.products[0].source = "keeri"; },
    (p: any) => { p.products[0].id = "real-product"; },
    (p: any) => { p.products[0].variants[0].id = "real-variant"; },
  ]) {
    const altered = structuredClone(fixture); mutate(altered);
    assert.throws(() => preparePublicPreview(altered), /preview/i);
  }
});
test("unknown input fields never become persisted public catalogue fields", () => {
  const altered = structuredClone(fixture);
  altered.customerEmail = "private@example.invalid";
  altered.products[0].customerName = "Do not copy";
  const output = preparePublicPreview(altered);
  assert.equal("customerEmail" in output, false);
  assert.equal("customerName" in output.products[0]!, false);
});
