import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { checkoutInputSchema, quoteRequestSchema, quoteSnapshotSchema } from "@shopmaple/contracts";

const address = { line1: "1 Test Street", line2: "", city: "Mumbai", stateCode: "27", pincode: "400001", country: "IN" };
const input = {
  customer: { name: "Test Buyer", email: "buyer@example.test", phone: "+919876543210" },
  billingAddress: address,
  shippingAddress: address,
  deliveryMethodId: "standard",
};
const fixture = async () =>
  JSON.parse(await readFile(new URL("../../../docs/contracts/shopmaple-quote-v2.json", import.meta.url), "utf8")).response.snapshot;

test("a promo code is optional checkout input, trimmed and uppercased the way Keeri reads it", () => {
  assert.equal(checkoutInputSchema.parse(input).promoCode, undefined);
  assert.equal(checkoutInputSchema.parse({ ...input, promoCode: " diwali15 " }).promoCode, "DIWALI15");
  for (const promoCode of ["", "  ", "AB", "A".repeat(25), "SALE-20", "SALE 20", "SALE20%", 15, null])
    assert.equal(checkoutInputSchema.safeParse({ ...input, promoCode }).success, false, JSON.stringify(promoCode));
  const request = quoteRequestSchema.parse({ ...input, version: 2, items: [{ variantId: "keeri:maple:v", quantity: 1 }], promoCode: "diwali15" });
  assert.equal(request.promoCode, "DIWALI15");
});

test("a quote snapshot without promotion fields still parses exactly as before", async () => {
  const snapshot = await fixture();
  assert.equal(quoteSnapshotSchema.safeParse(snapshot).success, true);
  // Keeri names the applied code in `promotion`; a snapshot never echoes the request's promoCode key.
  assert.equal(quoteSnapshotSchema.safeParse({ ...snapshot, promoCode: "DIWALI15" }).success, false);
});

test("a promoted snapshot carries its promotion and each line's discount and undiscounted unit price", async () => {
  const snapshot = await fixture();
  const item = snapshot.items[0];
  const promoted = {
    ...snapshot,
    items: [{ ...item, discountPaise: 0, undiscountedUnitPricePaise: item.unitPricePaise }],
    promotion: { code: "DIWALI15", label: "15% off", discountPaise: 1500 },
  };
  const parsed = quoteSnapshotSchema.parse(promoted);
  assert.deepEqual(parsed.promotion, { code: "DIWALI15", label: "15% off", discountPaise: 1500 });
  assert.equal(parsed.items[0]!.undiscountedUnitPricePaise, item.unitPricePaise);
  for (const promotion of [
    { code: "DIWALI15", label: "15% off" },
    { code: "DIWALI15", label: "15% off", discountPaise: 0 },
    { code: "diwali15", label: "15% off", discountPaise: 1500 },
    { code: "DIWALI15", label: "", discountPaise: 1500 },
    { code: "DIWALI15", label: "15% off", discountPaise: 1500, extra: true },
  ])
    assert.equal(quoteSnapshotSchema.safeParse({ ...promoted, promotion }).success, false, JSON.stringify(promotion));
  assert.equal(quoteSnapshotSchema.safeParse({ ...promoted, items: [{ ...item, discountPaise: -1, undiscountedUnitPricePaise: 1 }] }).success, false);
});
