import assert from "node:assert/strict";
import { test } from "node:test";
import { productCardSchema } from "@shopmaple/contracts";

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
