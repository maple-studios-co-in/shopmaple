import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountCookieName,
  accountOverviewResponseSchema,
  accountPhoneSchema,
  accountProfileUpdateSchema,
  addressInputSchema,
  addressUpdateSchema,
  formatOrderNumber,
  orderDetailSchema,
  orderSummarySchema,
  parseOrderNumber,
  signInStartRequestSchema,
  signInVerifyRequestSchema,
  type OrderDetail,
} from "@shopmaple/contracts/account";

// Customer accounts (owner's spec, 10 Nov 2026): the shapes both the API and the account pages read.

test("an order number reads as MF- plus the sequence number, typed either way, and nothing else", () => {
  assert.equal(formatOrderNumber(10482), "MF-10482");
  for (const typed of ["MF-10482", "mf-10482", "Mf-10482", " MF-10482 ", "10482", " 10482"])
    assert.equal(parseOrderNumber(typed), 10482, typed);
  for (const bad of ["", "MF-", "MF10482", "MF-010482", "010482", "10482a", "-10482", "MF--10482", "1e5", "10 482", "2147483648", "99999999999999"])
    assert.equal(parseOrderNumber(bad), null, bad);
});

test("sign-in normalises the email the way checkout and the CRM key it, and takes a pasted code with spaces", () => {
  assert.deepEqual(signInStartRequestSchema.parse({ email: "  Asha.Rao@Example.COM " }), { email: "asha.rao@example.com" });
  for (const bad of [{ email: "not-an-email" }, { email: "" }, { email: "a@example.com", next: "/checkout" }, {}])
    assert.equal(signInStartRequestSchema.safeParse(bad).success, false, JSON.stringify(bad));
  assert.deepEqual(signInVerifyRequestSchema.parse({ email: "ASHA@example.com", code: " 123 456 " }), { email: "asha@example.com", code: "123456" });
  assert.equal(signInVerifyRequestSchema.parse({ email: "asha@example.com", code: "012-345" }).code, "012345");
  for (const code of ["12345", "1234567", "abcdef", "12345a", ""])
    assert.equal(signInVerifyRequestSchema.safeParse({ email: "asha@example.com", code }).success, false, code);
});

test("a phone becomes the +91 form the checkout snapshot stores, whichever way it was typed", () => {
  for (const typed of ["9876543210", "98765 43210", "+91 98765-43210", "+919876543210", "919876543210", "09876543210"])
    assert.equal(accountPhoneSchema.parse(typed), "+919876543210", typed);
  for (const bad of ["5876543210", "12345", "+1 415 555 0100", "98765432101", "phone"])
    assert.equal(accountPhoneSchema.safeParse(bad).success, false, bad);
  assert.deepEqual(accountProfileUpdateSchema.parse({ name: "  Asha Rao ", phone: "98765 43210" }), { name: "Asha Rao", phone: "+919876543210" });
  assert.deepEqual(accountProfileUpdateSchema.parse({ phone: null }), { phone: null });
  assert.equal(accountProfileUpdateSchema.safeParse({ email: "other@example.com" }).success, false, "the email cannot be changed");
});

const address = { name: "Asha Rao", line1: "12 Lake Road", city: "Pune", state: "27", pin: "411001", phone: "9876543210" };
test("an address uses checkout's GST state code and PIN rules, with line 2 optional", () => {
  assert.deepEqual(addressInputSchema.parse(address), { ...address, label: "", line2: "", phone: "+919876543210" });
  assert.equal(addressInputSchema.parse({ ...address, isDefault: true }).isDefault, true);
  // A place's own name (Figma 392:1527), optional, trimmed, at most 40 characters.
  assert.equal(addressInputSchema.parse({ ...address, label: "  Studio " }).label, "Studio");
  assert.equal(addressInputSchema.safeParse({ ...address, label: "x".repeat(41) }).success, false);
  assert.deepEqual(addressUpdateSchema.parse({ label: "" }), { label: "" }, "a name can be cleared");
  // An API from before addresses had names leaves the name out of its answers; the web reads that as none.
  const saved = { id: "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b", name: "Asha Rao", line1: "12 Lake Road", line2: "", city: "Pune", state: "27", pin: "411001",
    phone: "+919876543210", isDefault: true };
  const overview = { customer: { name: "Asha Rao", email: "asha@example.com", phone: null }, counts: { orders: 0, addresses: 1 }, latestOrder: null, defaultAddress: saved };
  assert.equal(accountOverviewResponseSchema.parse(overview).defaultAddress?.label, "");
  for (const [name, change] of [
    ["state 25 (not a GST code)", { state: "25" }], ["state as a name", { state: "Maharashtra" }],
    ["PIN starting with 0", { pin: "011001" }], ["short PIN", { pin: "41100" }],
    ["blank first line", { line1: "  " }], ["control characters", { city: "Pune\u0000" }],
    ["an unknown field", { country: "IN" }],
  ] as const)
    assert.equal(addressInputSchema.safeParse({ ...address, ...change }).success, false, name);
  assert.equal(addressUpdateSchema.safeParse({}).success, false, "an empty update changes nothing and is refused");
  assert.equal(addressUpdateSchema.safeParse({ isDefault: false }).success, false, "a default is replaced, never switched off");
  assert.deepEqual(addressUpdateSchema.parse({ isDefault: true }), { isDefault: true });
  assert.deepEqual(addressUpdateSchema.parse({ line2: "" }), { line2: "" });
});

test("an address request without a label, as a web from before names (or one given no name) sends, is still taken", () => {
  // The request a web from before PR 130 sends, and what the web now sends for a place left unnamed: no `label` key.
  const created = addressInputSchema.parse({ ...address, line2: "Flat 2", isDefault: true });
  assert.equal(created.label, "", "no name: stored as none");
  assert.deepEqual(created, { ...address, label: "", line2: "Flat 2", phone: "+919876543210", isDefault: true });
  assert.deepEqual(addressUpdateSchema.parse({ city: "Satara" }), { city: "Satara" }, "an edit need not mention the name");
  // That API's own request schema: this one without `label`, strict. It refuses any `label`, even an empty one, which is
  // why the web leaves `label` out unless the customer gave a name.
  const namelessApi = addressInputSchema.omit({ label: true });
  assert.equal(namelessApi.safeParse(address).success, true);
  assert.equal(namelessApi.safeParse({ ...address, label: "" }).success, false);
});

const detail: OrderDetail = {
  number: "MF-10482",
  placedAt: "2026-11-10T09:30:00.000Z",
  status: "confirmed",
  statusLabel: "Confirmed",
  itemCount: 3,
  totalPaise: 4_550_000,
  firstItem: { title: "Arlo Sofa", variant: "Oat", imageUrl: "https://store.maplefurnishers.com/media/keeri/arlo.webp" },
  items: [
    { title: "Arlo Sofa", variant: "Oat", quantity: 1, linePaise: 4_200_000, imageUrl: "https://store.maplefurnishers.com/media/keeri/arlo.webp" },
    { title: "Pebble Side Table", variant: "Walnut", quantity: 2, linePaise: 300_000, imageUrl: null },
  ],
  delivery: { name: "Asha Rao", line1: "12 Lake Road", line2: "", city: "Pune", state: "27", pin: "411001", phone: "+919876543210" },
  totals: { subtotalPaise: 4_500_000, deliveryPaise: 50_000, taxPaise: 686_441, totalPaise: 4_550_000, taxIncluded: true },
  payment: { label: "Paid online", reference: "pay_Fixture123" },
  estimate: { from: "2026-11-27", to: "2026-11-30" },
  cancellation: null,
  refund: null,
  journey: [
    { key: "confirmed", label: "Confirmed", state: "done", at: "2026-11-10T09:31:00.000Z" },
    { key: "preparing", label: "Preparing", state: "upcoming", at: null },
    { key: "dispatched", label: "Dispatched", state: "upcoming", at: null },
    { key: "delivered", label: "Delivered", state: "upcoming", at: null },
  ],
};
test("order summaries and details hold the shapes the account pages render, and refuse drift", () => {
  assert.deepEqual(orderDetailSchema.parse(detail), detail);
  const { items: _items, delivery: _delivery, totals: _totals, payment: _payment, estimate: _estimate, cancellation: _cancellation, refund: _refund, journey: _journey, ...summary } = detail;
  assert.deepEqual(orderSummarySchema.parse(summary), summary);
  for (const [name, change] of [
    ["a bare number", { number: "10482" }],
    ["an unknown status", { status: "shipped" }],
    ["three journey steps", { journey: detail.journey.slice(0, 3) }],
    ["an estimate that is not a date", { estimate: { from: "soon", to: "later" } }],
    ["a payment label other than Paid online", { payment: { label: "Card", reference: "pay_x" } }],
    ["an internal field", { attemptId: "6a1f3f8e-0000-4000-8000-000000000000" }],
  ] as const)
    assert.equal(orderDetailSchema.safeParse({ ...detail, ...change }).success, false, name);
  assert.equal(orderDetailSchema.safeParse({ ...detail, estimate: null }).success, true, "an unknown estimate is null");
  // Keeri's order updates: the two further statuses, and a cancelled order's refund.
  for (const status of ["preparing", "dispatched"] as const) assert.equal(orderSummarySchema.safeParse({ ...summary, status }).success, true, status);
  assert.equal(orderDetailSchema.safeParse({ ...detail, status: "cancelled", cancellation: { cancelledAt: "2026-11-15T05:00:00.000Z" },
    refund: { status: "pending", amountPaise: 4_550_000, refundedAt: null } }).success, true);
  assert.equal(orderDetailSchema.safeParse({ ...detail, refund: { status: "requested", amountPaise: 1, refundedAt: null } }).success, false, "an unknown refund state");
  assert.equal(orderDetailSchema.safeParse({ ...detail, cancellation: { cancelledAt: "2026-11-15T05:00:00.000Z", reason: "Out of fabric" } }).success, false, "the staff reason is never sent");
  assert.equal(orderSummarySchema.safeParse({ ...summary, status: "delivered", statusLabel: "Delivered" }).success, true, "delivered is reserved for later");
  assert.equal(accountOverviewResponseSchema.safeParse({
    customer: { name: null, email: "asha@example.com", phone: null },
    counts: { orders: 0, addresses: 0 }, latestOrder: null, defaultAddress: null,
  }).success, true, "a brand-new account has no orders and no address");
});

test("the session cookie is host-only in production and plain in development", () => {
  assert.equal(accountCookieName(true), "__Host-maple_account");
  assert.equal(accountCookieName(false), "maple_account");
});
