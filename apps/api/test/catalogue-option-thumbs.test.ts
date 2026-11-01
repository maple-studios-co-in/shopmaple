import assert from "node:assert/strict";
import { test } from "node:test";
import { productCardSchema, toProductCard } from "@shopmaple/contracts";

const card = { id: "chair", handle: "chair", title: "Chair", image: null, pricePaise: 1000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 3 };
const thumb = (name: string, image: string | null = `https://cdn.example.com/${name}.jpg`, slug: string | null = name.toLowerCase()) => ({ name, image, slug });
const product = (variants: object[]) => ({ id: "p", handle: "p", title: "P", images: ["https://cdn.example.com/p.jpg"], category: "chairs", variants: variants as never });
const v = (title: string, extra: object = {}) => ({ pricePaise: 1000, compareAtPaise: null, title, ...extra });

test("a card from an older payload without thumbnails still parses, with none", () => {
  const parsed = productCardSchema.parse(card);
  assert.deepEqual(parsed.optionThumbs, []);
});
test("a card carries up to eight option thumbnails (name, https photo or null, slug or null)", () => {
  const thumbs = Array.from({ length: 8 }, (_, i) => thumb(`Colour ${i}`, i % 2 ? null : undefined, i === 3 ? null : undefined));
  const parsed = productCardSchema.safeParse({ ...card, optionCount: 8, optionThumbs: thumbs });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.optionThumbs, thumbs);
});
for (const [name, changes] of [
  ["more than eight thumbnails", { optionCount: 9, optionThumbs: Array.from({ length: 9 }, (_, i) => thumb(`Colour ${i}`)) }],
  ["a non-https thumbnail photo", { optionThumbs: [thumb("Walnut", "http://cdn.example.com/walnut.jpg")] }],
  ["a thumbnail name over 80 characters", { optionThumbs: [thumb("x".repeat(81))] }],
  ["an empty thumbnail name", { optionThumbs: [thumb("")] }],
  ["unexpected thumbnail fields", { optionThumbs: [{ ...thumb("Walnut"), sku: "PRIVATE" }] }],
  ["more thumbnails than options", { optionCount: 1, optionThumbs: [thumb("A"), thumb("B")] }],
] as const) test(`summary rejects ${name}`, () => {
  assert.equal(productCardSchema.safeParse({ ...card, ...changes }).success, false);
});

test("toProductCard takes each option's first own photo and slug", () => {
  const result = toProductCard(product([
    v("Walnut", { images: ["https://cdn.example.com/w1.jpg", "https://cdn.example.com/w2.jpg"], slug: "walnut" }),
    v("Oak", { images: ["https://cdn.example.com/o1.jpg"], slug: "oak" }),
  ]));
  assert.deepEqual(result.optionThumbs, [
    { name: "Walnut", image: "https://cdn.example.com/w1.jpg", slug: "walnut" },
    { name: "Oak", image: "https://cdn.example.com/o1.jpg", slug: "oak" },
  ]);
  assert.equal(productCardSchema.safeParse(result).success, true);
});
test("an option without a photo keeps its name and slug so the page can still link to it", () => {
  const result = toProductCard(product([v("Walnut", { images: [], slug: "walnut" }), v("Oak", { images: ["https://cdn.example.com/o.jpg"], slug: null })]));
  assert.deepEqual(result.optionThumbs, [
    { name: "Walnut", image: null, slug: "walnut" },
    { name: "Oak", image: "https://cdn.example.com/o.jpg", slug: null },
  ]);
});
test("options with neither photo nor slug add nothing beyond optionNames", () => {
  const result = toProductCard(product([v("Walnut"), v("Oak", { images: [], slug: null })]));
  assert.deepEqual(result.optionThumbs, []);
  assert.deepEqual(result.optionNames, ["Walnut", "Oak"]);
});
test("placeholder names, repeated names and over-long names are not thumbnails; at most eight remain", () => {
  const photo = { images: ["https://cdn.example.com/a.jpg"] };
  const result = toProductCard(product([
    v("Default Title", photo), v("Standard", photo), v("x".repeat(81), photo), v("Walnut", photo), v("walnut ", { images: ["https://cdn.example.com/b.jpg"] }),
    ...Array.from({ length: 10 }, (_, i) => v(`Colour ${i}`, photo)),
  ]));
  assert.deepEqual(result.optionThumbs.map(item => item.name), ["Walnut", ...Array.from({ length: 7 }, (_, i) => `Colour ${i}`)]);
  assert.equal(result.optionThumbs[0]!.image, "https://cdn.example.com/a.jpg", "the first option of a repeated name wins");
  assert.equal(productCardSchema.safeParse(result).success, true);
});
test("a photo that is not an https address is dropped rather than failing the whole card", () => {
  const result = toProductCard(product([v("Walnut", { images: ["http://cdn.example.com/w.jpg"], slug: "walnut" }), v("Oak", { images: ["not a url"], slug: "oak" })]));
  assert.deepEqual(result.optionThumbs, [{ name: "Walnut", image: null, slug: "walnut" }, { name: "Oak", image: null, slug: "oak" }]);
  assert.equal(productCardSchema.safeParse(result).success, true);
});
test("existing callers that pass no photos or slugs get an empty list", () => {
  assert.deepEqual(toProductCard(product([v("Walnut")])).optionThumbs, []);
});
