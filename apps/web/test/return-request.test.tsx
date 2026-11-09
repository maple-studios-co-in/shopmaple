import assert from "node:assert/strict";
import { test } from "node:test";
import { enquiryInputSchema } from "@shopmaple/contracts";
import { returnRequest } from "../lib/return-request";

// Catches the request reaching the care team without the order number, or in a shape the enquiry API refuses.
test("an order number and an email become a Return & Exchange enquiry the API accepts", () => {
  const request = returnRequest({ order: "  #1001 ", contact: " Meera@Example.invalid " });
  assert.deepEqual(request, {
    kind: "send",
    order: "#1001",
    email: "Meera@Example.invalid",
    enquiry: {
      kind: "contact",
      name: "",
      email: "Meera@Example.invalid",
      phone: "",
      message: "Return or exchange request for order #1001.",
      context: { product: "Return & Exchange", variant: "", sku: "", pincode: "" },
    },
  });
  assert.equal(enquiryInputSchema.safeParse(request.kind === "send" ? request.enquiry : null).success, true);
});

// Catches "1001" and "#1001" reading differently to the care team, and other order formats being mangled.
test("a bare order number gains its #, while other order formats are kept as typed", () => {
  const order = (value: string) => {
    const request = returnRequest({ order: value, contact: "meera@example.invalid" });
    return request.kind === "send" ? request.order : request.kind;
  };
  assert.equal(order("1001"), "#1001");
  assert.equal(order("#1001"), "#1001");
  assert.equal(order("MF-2026-118"), "MF-2026-118");
});

// Catches a phone number being sent as an email the API would refuse, losing the request without a word.
test("a phone number asks the customer to call or use their email, and sends nothing", () => {
  for (const contact of ["+91 92118 19727", "9211819727", "(011) 4567-8901"])
    assert.deepEqual(returnRequest({ order: "#1001", contact }), { kind: "phone", order: "#1001" }, contact);
});

// Catches empty or nonsense details reaching the API, and the customer not being told which field to fix.
test("missing or unreadable details name the field to fix", () => {
  const invalid = (order: string, contact: string) => returnRequest({ order, contact });
  assert.deepEqual(invalid("", "meera@example.invalid"), { kind: "invalid", field: "order", message: "Enter your order number, for example #1001." });
  assert.deepEqual(invalid("#", "meera@example.invalid"), { kind: "invalid", field: "order", message: "Enter your order number, for example #1001." });
  assert.deepEqual(invalid("order 1001; drop", "meera@example.invalid"), { kind: "invalid", field: "order", message: "Enter your order number, for example #1001." });
  assert.deepEqual(invalid("#1001", ""), { kind: "invalid", field: "contact", message: "Enter the email or phone number you used for your order." });
  assert.deepEqual(invalid("#1001", "meera@"), { kind: "invalid", field: "contact", message: "Enter the email or phone number you used for your order." });
  assert.deepEqual(invalid("#1001", "12"), { kind: "invalid", field: "contact", message: "Enter the email or phone number you used for your order." });
  assert.deepEqual(invalid("#".repeat(1) + "1".repeat(31), "meera@example.invalid"), { kind: "invalid", field: "order", message: "Enter your order number, for example #1001." });
});
