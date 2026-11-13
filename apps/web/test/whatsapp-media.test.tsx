import assert from "node:assert/strict";
import { test } from "node:test";
import { headerPhoto } from "../lib/whatsapp-media";

const product = {
  images: ["https://shop.example/media/keeri/front-oak.webp", "https://shop.example/media/keeri/front-walnut.webp", "https://shop.example/media/keeri/drawing.webp"],
  variants: [
    { slug: "oak", images: ["https://shop.example/media/keeri/front-oak.webp"] },
    { slug: "walnut", images: ["https://shop.example/media/keeri/front-walnut.webp", "https://shop.example/media/keeri/drawing.webp"] },
  ],
};

test("the WhatsApp header draws the variant bought, not the listing's first photo", () => {
  assert.equal(headerPhoto(product, "walnut"), "https://shop.example/media/keeri/front-walnut.webp");
  assert.equal(headerPhoto(product, "oak"), "https://shop.example/media/keeri/front-oak.webp");
});

test("without a usable variant it falls back to the product's first photo", () => {
  for (const slug of [null, undefined, "", "missing", "Walnut", "../oak", "a".repeat(65)])
    assert.equal(headerPhoto(product, slug), "https://shop.example/media/keeri/front-oak.webp");
  // A variant photo the product no longer serves is not shown.
  assert.equal(headerPhoto({ ...product, variants: [{ slug: "walnut", images: ["https://elsewhere.example/x.webp"] }] }, "walnut"), product.images[0]);
});
