import assert from "node:assert/strict";
import { test } from "node:test";
import { productPath, productRedirect, selectedVariant } from "../lib/product-address";

const product = { handle: "alain", variants: [
  { id: "keeri:t:v1", slug: "ivory-boucle" },
  { id: "keeri:t:v2", slug: "dark-walnut" },
  { id: "keeri:t:v3", slug: null },
] };

test("a product address names the chair, and the variant when one is chosen", () => {
  assert.equal(productPath("alain"), "/products/alain");
  assert.equal(productPath("alain", product.variants[1]), "/products/alain?variant=dark-walnut");
  assert.equal(productPath("alain", product.variants[2]), "/products/alain?variant=keeri%3At%3Av3", "a variant without a slug falls back to its id");
});

test("an old address, or an old variant id, moves to the readable address", () => {
  assert.equal(productRedirect("keeri-abc123", product, undefined), "/products/alain");
  assert.equal(productRedirect("keeri-abc123", product, "dark-walnut"), "/products/alain?variant=dark-walnut");
  assert.equal(productRedirect("alain", product, "keeri:t:v1"), "/products/alain?variant=ivory-boucle", "old links carried variant ids");
  assert.equal(productRedirect("alain", product, "dark-walnut"), null, "already readable");
  assert.equal(productRedirect("alain", product, undefined), null);
  assert.equal(productRedirect("alain", product, "unknown"), null, "an unknown variant is left to the page's default");
});

test("the variant in the address is found by slug or by id", () => {
  assert.equal(selectedVariant(product, "dark-walnut")?.id, "keeri:t:v2");
  assert.equal(selectedVariant(product, "keeri:t:v3")?.id, "keeri:t:v3");
  assert.equal(selectedVariant(product, "nope"), undefined);
  assert.equal(selectedVariant(product, undefined), undefined);
});
