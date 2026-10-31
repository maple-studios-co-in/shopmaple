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

test("an old address moves to the readable one and keeps the chosen variant exactly as it was given", () => {
  assert.equal(productRedirect("keeri-abc123", product, undefined), "/products/alain");
  assert.equal(productRedirect("keeri-abc123", product, "dark-walnut"), "/products/alain?variant=dark-walnut");
  assert.equal(productRedirect("keeri-abc123", product, "keeri:t:v1"), "/products/alain?variant=keeri%3At%3Av1", "today's page picks variants by id, so an id is kept");
  assert.equal(productRedirect("alain", product, "keeri:t:v1"), null, "a readable address is left alone, whatever the variant");
  assert.equal(productRedirect("alain", product, undefined), null);
});

test("the variant in the address is found by slug or by id", () => {
  assert.equal(selectedVariant(product, "dark-walnut")?.id, "keeri:t:v2");
  assert.equal(selectedVariant(product, "keeri:t:v3")?.id, "keeri:t:v3");
  assert.equal(selectedVariant(product, "nope"), undefined);
  assert.equal(selectedVariant(product, undefined), undefined);
});
