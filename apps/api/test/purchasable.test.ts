import assert from "node:assert/strict";
import { test } from "node:test";
import { canAddToCart, canOrder } from "@shopmaple/contracts";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

// A variant becomes purchasable only when Keeri says it can sell it today
// (published, INR MRP, explicitly selected for ShopMaple, and stocked or an
// approved made-to-order piece with a lead time). The store shows Keeri's store
// price, its before-GST MRP plus GST, which is what Keeri's quote charges.
// Without a store price the variant shows no price and is never purchasable.
// Anything else is an enquiry.
function keeri(variant: Record<string, unknown>, storePrice = 12345) {
  const k = v2Fixture();
  k.publicMedia = [];
  const v = k.models[0]!.variants[0]! as Record<string, unknown>;
  Object.assign(v, { sku: "CHAIR-OAK", prices: [
    { kind: "mrp", amount: Math.round(storePrice / 1.18), currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
    { kind: "store_price", amount: storePrice, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
  ], ...variant });
  return k;
}
const sellableStocked = { stockPolicy: "stocked", fulfilment: { kind: "stocked", leadTimeDays: null }, eligibility: { sellable: true, reasons: [] } };
const sellableMto = { stockPolicy: "made_to_order", fulfilment: { kind: "made_to_order", leadTimeDays: 28 }, eligibility: { sellable: true, reasons: [] } };
const variantOf = (k: ReturnType<typeof keeri>) => planCatalogueUnion(k, "maple").products[0]!.variants[0]!;

test("a Keeri-sellable stocked variant priced by Keeri's store price is purchasable", () => {
  const v = variantOf(keeri(sellableStocked));
  assert.equal(v.pricePaise, 12345);
  assert.equal(v.available, true);
  assert.equal(v.leadTimeDays, null);
});

test("an approved made-to-order variant is purchasable and carries its lead time", () => {
  const v = variantOf(keeri(sellableMto));
  assert.equal(v.available, true);
  assert.equal(v.stockPolicy, "made_to_order");
  assert.equal(v.leadTimeDays, 28);
});

test("Keeri's refusal, a missing verdict, or a contradictory fulfilment keeps the variant an enquiry", () => {
  for (const overrides of [
    { ...sellableStocked, eligibility: { sellable: false, reasons: ["not_selected"] } },
    { stockPolicy: "stocked" },
    { ...sellableStocked, fulfilment: null },
    { ...sellableMto, fulfilment: { kind: "stocked", leadTimeDays: null } },
    { ...sellableStocked, stockPolicy: "dropship", fulfilment: null },
  ])
    assert.equal(variantOf(keeri(overrides)).available, false, JSON.stringify(overrides));
});

test("the store shows Keeri's store price, so the price shown is the price charged", () => {
  const v = variantOf(keeri(sellableStocked, 13000));
  assert.equal(v.pricePaise, 13000);
  assert.equal(v.available, true);
});

test("the struck-through price is Keeri's compare-at", () => {
  const withCompare = keeri({ ...sellableMto, prices: [
    { kind: "mrp", amount: 2000000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
    { kind: "store_price", amount: 2360000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
    { kind: "compare_at", amount: 2714000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
  ] });
  assert.deepEqual([variantOf(withCompare).pricePaise, variantOf(withCompare).compareAtPaise], [2360000, 2714000]);
  assert.equal(variantOf(keeri(sellableStocked)).compareAtPaise, null);
});

test("a before-GST MRP is never shown: without a store price the variant shows no price and is an enquiry", () => {
  const raw = [{ kind: "mrp", amount: 2000000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" }];
  const v = variantOf(keeri({ ...sellableStocked, prices: raw }));
  assert.deepEqual([v.pricePaise, v.compareAtPaise, v.available], [null, null, false]);
});

test("a compare-at no higher than the store price is not shown, even above the before-GST MRP", () => {
  const v = variantOf(keeri({ ...sellableMto, prices: [
    { kind: "mrp", amount: 2000000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
    { kind: "store_price", amount: 2360000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
    { kind: "compare_at", amount: 2200000, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" },
  ] }));
  assert.deepEqual([v.pricePaise, v.compareAtPaise], [2360000, null]);
});

test("where Keeri has no MRP the variant shows no price and stays an enquiry", () => {
  const v = variantOf(keeri({ ...sellableStocked, prices: [] }));
  assert.deepEqual([v.pricePaise, v.compareAtPaise, v.available], [null, null, false]);
});

test("the sync report counts the variants Keeri prices", () => {
  assert.equal(planCatalogueUnion(keeri(sellableStocked, 13000), "maple").report.keeriPricedVariants, 1);
  assert.equal(planCatalogueUnion(keeri({ ...sellableStocked, prices: [] }), "maple").report.keeriPricedVariants, 0);
});

test("with checkout on, only purchasable variants go in the cart; in the preview a priced item can still be saved", () => {
  const priced = { pricePaise: 12345, published: true, available: false };
  assert.equal(canAddToCart(priced), true);
  assert.equal(canAddToCart(priced, true), false);
  assert.equal(canAddToCart({ ...priced, available: true }, true), true);
  assert.equal(canOrder({ available: true, pricePaise: 12345, stockPolicy: "made_to_order" }), true);
  assert.equal(canOrder({ available: true, pricePaise: 12345, stockPolicy: "dropship" }), false);
});
