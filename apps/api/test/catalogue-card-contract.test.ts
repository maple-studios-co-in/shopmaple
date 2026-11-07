import assert from "node:assert/strict";
import { test } from "node:test";
import { productCardSchema, toProductCard } from "@shopmaple/contracts";

const card = { id: "chair", handle: "chair", title: "Chair", image: null, pricePaise: 1000, compareAtPaise: 1500, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1 };
// Prevent malformed transport from displaying discounts/options the old full-record projection could never produce.
for (const [name, changes] of [
  ["equal compare-at", { compareAtPaise: 1000 }],
  ["lower compare-at", { compareAtPaise: 900 }],
  ["compare-at without price", { pricePaise: null }],
  ["from without price", { pricePaise: null, compareAtPaise: null, priceFrom: true, optionCount: 2 }],
  ["other options without price", { pricePaise: null, compareAtPaise: null, otherOptionsOnRequest: true, priceFrom: true, optionCount: 2 }],
  ["price without options", { optionCount: 0 }],
  ["other options without from", { otherOptionsOnRequest: true, optionCount: 2 }],
  ["other options with one option", { otherOptionsOnRequest: true, priceFrom: true }],
  ["from with one option", { priceFrom: true }],
] as const) test(`summary rejects ${name}`, () => {
  assert.equal(productCardSchema.safeParse({ ...card, ...changes }).success, false);
});
test("summary accepts consistent zero prices and enquiry-only cards", () => {
  assert.equal(productCardSchema.safeParse({ ...card, pricePaise: 0 }).success, true);
  assert.equal(productCardSchema.safeParse({ ...card, pricePaise: null, compareAtPaise: null, optionCount: 0 }).success, true);
  assert.equal(productCardSchema.safeParse({ ...card, pricePaise: null, compareAtPaise: null, optionCount: 1 }).success, true);
  assert.equal(productCardSchema.safeParse({ ...card, priceFrom: true, otherOptionsOnRequest: true, optionCount: 2 }).success, true);
});

// Ratings come from Keeri's approved reviews (owner, 4 Nov 2026), kept beside the product by the sync.
test("a card carries Keeri's approved review average and count, and no rating at all for a piece without reviews", () => {
  const piece = { id: "chair", handle: "chair", title: "Chair", images: [] as string[], variants: [{ pricePaise: 1000, compareAtPaise: null }] };
  assert.deepEqual(toProductCard({ ...piece, reviewCount: 12, reviewAverage: 4.6 }).rating, { value: 4.6, count: 12 });
  for (const none of [{}, { reviewCount: 0, reviewAverage: null }, { reviewCount: 3, reviewAverage: null }, { reviewCount: 0, reviewAverage: 4.2 }])
    assert.equal("rating" in toProductCard({ ...piece, ...none }), false, JSON.stringify(none));
  assert.equal(productCardSchema.safeParse({ ...card, rating: { value: 4.6, count: 12 } }).success, true);
  assert.equal(productCardSchema.safeParse(card).success, true, "older payloads without a rating still read");
  for (const bad of [{ value: 0.5, count: 1 }, { value: 4.2, count: 0 }, { value: 5.5, count: 2 }, { value: 4, count: 1.5 }, { value: 4, count: 1, extra: 1 }])
    assert.equal(productCardSchema.safeParse({ ...card, rating: bad }).success, false, JSON.stringify(bad));
});
