import assert from "node:assert/strict";
import { test } from "node:test";
import { commerceHttpError } from "../src/commerce-http.js";
import { KeeriCommerceError } from "../src/keeri-commerce.js";
import { OrderFlowError } from "../src/orders/service.js";

const shown = (error: unknown) => {
  const http = commerceHttpError(error)!;
  return { status: http.status, code: http.code, message: http.message };
};

test("each promo refusal has its own buyer message, from the quote or from the hold", () => {
  const expected = {
    PROMO_NOT_FOUND: "We don't recognise that code. No payment has been taken.",
    PROMO_NOT_RUNNING: "That offer isn't running right now. No payment has been taken.",
    PROMO_NOT_APPLICABLE: "That code doesn't apply to anything in your cart. No payment has been taken.",
    PROMO_ALREADY_USED: "That code has already been used with this phone number or email. No payment has been taken.",
  };
  for (const [code, message] of Object.entries(expected))
    for (const error of [new KeeriCommerceError(code), new OrderFlowError(code)])
      assert.deepEqual(shown(error), { status: 422, code, message });
});

test("an item that can no longer be bought online says so instead of asking for a review", () => {
  for (const code of ["CATALOGUE_BINDING_REQUIRED", "RESERVATION_NOT_ELIGIBLE"])
    assert.deepEqual(shown(new OrderFlowError(code)), {
      status: 422,
      code: "ITEM_NOT_BUYABLE",
      message: "An item in your cart can no longer be bought online. Remove it or send us an enquiry. No payment has been taken.",
    });
});

test("unknown order errors and Keeri refusals keep their existing messages", () => {
  assert.equal(shown(new OrderFlowError("RESERVATION_UNCERTAIN")).code, "CHECKOUT_BLOCKED");
  assert.equal(shown(new KeeriCommerceError("UPSTREAM_REJECTED")).code, "QUOTE_REJECTED");
  assert.equal(shown(new KeeriCommerceError("toString")).code, "QUOTE_UNAVAILABLE", "only the known codes are promo refusals");
});
