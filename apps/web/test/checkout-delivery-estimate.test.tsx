import assert from "node:assert/strict";
import { test } from "node:test";
import { estimatedArrival } from "../app/checkout/delivery-estimate";
import { displayPhone, formatDate, formatDayRange } from "../lib/account/format";

// The checkout states the arrival window the order page will show (owner's spec, 10 Nov 2026): the longest making time
// plus the courier's days, counted from India's calendar day, then four days' spread (the design's "24–28 Nov").
const madeToOrder = (days: number | null) => ({ fulfilment: { kind: "made_to_order" as const, leadTimeDays: days } });
const stocked = { fulfilment: { kind: "stocked" as const, leadTimeDays: null } };

test("the arrival window adds the longest making time to the courier's days, from today in India", () => {
  // 10 Nov 2026, 11:30 in India.
  const morning = new Date("2026-11-10T06:00:00Z");
  assert.deepEqual(estimatedArrival({ items: [stocked, madeToOrder(28), madeToOrder(21)], delivery: { estimatedDays: 6 } }, morning), { from: "2026-12-14", to: "2026-12-18" });
  // 11 Nov 2026, 01:30 in India, though still 10 Nov in UTC: the count starts from India's day.
  assert.deepEqual(estimatedArrival({ items: [stocked], delivery: { estimatedDays: 4 } }, new Date("2026-11-10T20:00:00Z")), { from: "2026-11-15", to: "2026-11-19" });
});

test("without a courier estimate or a known making time there is no window, rather than an invented one", () => {
  const now = new Date("2026-11-10T06:00:00Z");
  assert.equal(estimatedArrival({ items: [stocked], delivery: { estimatedDays: null } }, now), null);
  assert.equal(estimatedArrival({ items: [stocked], delivery: null }, now), null);
  assert.equal(estimatedArrival({ items: [stocked] }, now), null);
  assert.equal(estimatedArrival({ items: [madeToOrder(null)], delivery: { estimatedDays: 5 } }, now), null);
  assert.equal(estimatedArrival({ items: [{}], delivery: { estimatedDays: 5 } }, now), null, "an item quoted before Keeri stated its fulfilment");
});

test("day ranges read as the frames write them", () => {
  assert.equal(formatDayRange("2026-11-24", "2026-11-28", { month: "long" }), "24–28 November 2026");
  assert.equal(formatDayRange("2026-11-24", "2026-11-28", { month: "short" }), "24–28 Nov 2026");
  assert.equal(formatDayRange("2026-11-24", "2026-11-28", { month: "short", year: false }), "24–28 Nov");
  assert.equal(formatDayRange("2026-11-29", "2026-12-02", { month: "long" }), "29 November – 2 December 2026");
  assert.equal(formatDayRange("2026-12-30", "2027-01-02", { month: "short" }), "30 Dec 2026 – 2 Jan 2027");
  assert.equal(formatDayRange("2026-11-24", "2026-11-24", { month: "short" }), "24 Nov 2026");
});

test("dates fall on India's calendar day and use the frames' short months", () => {
  assert.equal(formatDate("2026-09-21T05:00:00.000Z"), "21 Sep 2026");
  assert.equal(formatDate("2026-11-09T19:00:00.000Z"), "10 Nov 2026", "00:30 on 10 Nov in India");
});

test("a phone number is shown in full where it is edited (the API masks it where it is only read)", () => {
  assert.equal(displayPhone("+919876543210"), "+91 98765 43210");
});
