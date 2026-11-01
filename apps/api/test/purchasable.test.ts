import assert from "node:assert/strict";
import { test } from "node:test";
import { canAddToCart, canOrder } from "@shopmaple/contracts";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { shopifyFixture, shopifyPricedFixture } from "./fixtures/shopify-admin.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

// A variant becomes purchasable only when Keeri says it can sell it today
// (published, INR MRP, explicitly selected for ShopMaple, and stocked or an
// approved made-to-order piece with a lead time) AND the store shows the very
// price Keeri will quote. Anything else stays an enquiry.
function keeri(variant: Record<string, unknown>, mrp = 12345) {
  const k = v2Fixture();
  k.publicMedia = [];
  const v = k.models[0]!.variants[0]! as Record<string, unknown>;
  Object.assign(v, { sku: "CHAIR-OAK", prices: [{ kind: "mrp", amount: mrp, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" }], ...variant });
  return k;
}
const sellableStocked = { stockPolicy: "stocked", fulfilment: { kind: "stocked", leadTimeDays: null }, eligibility: { sellable: true, reasons: [] } };
const sellableMto = { stockPolicy: "made_to_order", fulfilment: { kind: "made_to_order", leadTimeDays: 28 }, eligibility: { sellable: true, reasons: [] } };
const variantOf = (k: ReturnType<typeof keeri>) => planCatalogueUnion(shopifyPricedFixture(), k, "maple").products[0]!.variants[0]!;

test("a Keeri-sellable stocked variant whose shown price equals Keeri's MRP is purchasable", () => {
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

test("a shown price that differs from the price Keeri will quote is never purchasable", () => {
  const v = variantOf(keeri(sellableStocked, 13000));
  assert.equal(v.pricePaise, 12345, "the store keeps its verified public price");
  assert.equal(v.available, false);
});

test("a Keeri-only listing has no verified public price, so it stays an enquiry even when sellable", () => {
  const s = shopifyFixture();
  s.products = [];
  const v = planCatalogueUnion(s, keeri(sellableStocked), "maple").products[0]!.variants[0]!;
  assert.equal(v.pricePaise, null);
  assert.equal(v.available, false);
});

test("with checkout on, only purchasable variants go in the cart; in the preview a priced item can still be saved", () => {
  const priced = { pricePaise: 12345, published: true, available: false };
  assert.equal(canAddToCart(priced), true);
  assert.equal(canAddToCart(priced, true), false);
  assert.equal(canAddToCart({ ...priced, available: true }, true), true);
  assert.equal(canOrder({ available: true, pricePaise: 12345, stockPolicy: "made_to_order" }), true);
  assert.equal(canOrder({ available: true, pricePaise: 12345, stockPolicy: "dropship" }), false);
});
