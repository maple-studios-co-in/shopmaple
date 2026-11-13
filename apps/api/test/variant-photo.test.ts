import assert from "node:assert/strict";
import { test } from "node:test";
import { variantPhoto } from "../src/variant-photo.js";

const photo = (name: string) => `https://store.maplefurnishers.com/media/keeri/${name}.webp`;
const product = { published: true, images: [photo("main"), photo("deep-atlantic-1"), photo("deep-atlantic-2")] };

test("the chosen variant's own first photo, when its product serves it", () => {
  assert.equal(variantPhoto({ images: [photo("deep-atlantic-1"), photo("deep-atlantic-2")], product }), photo("deep-atlantic-1"));
});

test("else the product's first photo: no photo of its own, one the product does not serve, or one that is not https", () => {
  assert.equal(variantPhoto({ images: [], product }), photo("main"));
  assert.equal(variantPhoto({ images: [photo("unserved")], product }), photo("main"));
  const insecure = "http://store.maplefurnishers.com/media/keeri/deep-atlantic-1.webp";
  assert.equal(variantPhoto({ images: [insecure], product: { ...product, images: [insecure, photo("main")] } }), null,
    "an http product photo is never shown either");
});

test("nothing for a product the store no longer lists, or one without photos", () => {
  assert.equal(variantPhoto({ images: [photo("deep-atlantic-1")], product: { ...product, published: false } }), null);
  assert.equal(variantPhoto({ images: [], product: { published: true, images: [] } }), null);
});
