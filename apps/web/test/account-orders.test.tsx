import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type { OrderSummary } from "@shopmaple/contracts/account";

// The order list (Figma 392:1338): search by number or piece, status tabs with counts, and the table.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/account/orders" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { OrderHistory } = await import("../components/account/order-history");

const order = (number: string, status: OrderSummary["status"], title: string, placedAt: string): OrderSummary => ({
  number, placedAt, status, statusLabel: { confirmed: "Confirmed", confirming: "Confirming", delivered: "Delivered", cancelled: "Cancelled" }[status],
  itemCount: 1, totalPaise: 2640000, firstItem: { title, variant: "Natural cane · Oak finish", imageUrl: null },
});
const orders = [
  order("MF-10482", "confirmed", "Nola Accent Chair", "2026-11-10T06:30:00.000Z"),
  order("MF-10455", "confirming", "Arlo Dining Table", "2026-11-02T06:30:00.000Z"),
  order("MF-10316", "delivered", "Sana Lounge Sofa", "2026-09-21T06:30:00.000Z"),
  order("MF-10207", "cancelled", "Ivo Side Table", "2026-08-14T06:30:00.000Z"),
];
async function mount(list: OrderSummary[]) {
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<AppRouterContext.Provider value={router}><OrderHistory orders={list} /></AppRouterContext.Provider>));
  return async () => act(async () => root.unmount());
}
const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const tab = (name: string) => {
  const found = tabs().find((t) => t.textContent?.startsWith(name));
  assert.ok(found, `the ${name} tab is shown`);
  return found!;
};
const rows = () => [...document.querySelectorAll<HTMLElement>("[data-order-row]")].map((row) => row.getAttribute("data-order-row"));
const text = () => document.getElementById("root")!.textContent ?? "";
function search(value: string) {
  const field = document.querySelector<HTMLInputElement>('input[type="search"]');
  assert.ok(field, "the search field is shown");
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

test("the tabs count orders by status, In progress holding confirmed and confirming ones", async () => {
  const cleanup = await mount(orders);
  try {
    assert.deepEqual(tabs().map((t) => t.textContent?.replace(/\s+/g, " ").trim()), ["All orders 4", "In progress 2", "Delivered 1", "Cancelled 1"]);
    assert.equal(tab("All orders")!.getAttribute("aria-selected"), "true");
    assert.deepEqual(rows(), ["MF-10482", "MF-10455", "MF-10316", "MF-10207"]);
    assert.match(text(), /Showing 4 orders/);
    const first = document.querySelector('[data-order-row="MF-10482"]')!;
    assert.ok(first.querySelector('a[href="/account/orders/MF-10482"]'), "each row opens its order");
    assert.match(first.textContent!, /10 Nov 2026/);
    assert.match(first.textContent!, /Confirmed/);
    assert.match(first.textContent!, /₹26,400/);
    assert.match(first.textContent!, /1 item/);

    await act(async () => tab("Delivered")!.click());
    assert.equal(tab("Delivered")!.getAttribute("aria-selected"), "true");
    assert.equal(tab("All orders")!.getAttribute("aria-selected"), "false");
    assert.deepEqual(rows(), ["MF-10316"]);
    assert.match(text(), /Showing 1 order\b/);

    await act(async () => tab("In progress")!.click());
    assert.deepEqual(rows(), ["MF-10482", "MF-10455"]);
  } finally { await cleanup(); }
});

test("arrow keys move between the tabs, as tabs do", async () => {
  const cleanup = await mount(orders);
  try {
    const all = tab("All orders")!;
    assert.equal(all.getAttribute("tabindex"), "0");
    assert.equal(tab("Delivered")!.getAttribute("tabindex"), "-1", "one tab stop for the whole row");
    all.focus();
    await act(async () => { all.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    assert.equal(document.activeElement, tab("In progress"));
    assert.equal(tab("In progress")!.getAttribute("aria-selected"), "true");
    await act(async () => { tab("In progress")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    assert.equal(document.activeElement, tab("Cancelled"));
    await act(async () => { tab("Cancelled")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    assert.equal(document.activeElement, tab("All orders"), "the row wraps");
  } finally { await cleanup(); }
});

test("search finds an order by its number, typed any way, or by the piece in it", async () => {
  const cleanup = await mount(orders);
  try {
    for (const [query, expected] of [["10455", ["MF-10455"]], ["mf-10207", ["MF-10207"]], ["#MF-10482", ["MF-10482"]], ["sofa", ["MF-10316"]], ["  NOLA ", ["MF-10482"]]] as const) {
      await act(async () => search(query));
      assert.deepEqual(rows(), expected, query);
    }
    await act(async () => search("zzz"));
    assert.deepEqual(rows(), []);
    assert.match(text(), /No orders match “zzz”/);
    assert.match(text(), /Showing 0 orders/);
    assert.match(tabs()[0]!.textContent!, /All orders\s*0/, "the counts follow the search");

    await act(async () => tab("Cancelled")!.click());
    const reset = [...document.querySelectorAll("button")].find((b) => b.textContent === "All orders")!;
    assert.ok(reset, "the All orders button resets the list");
    await act(async () => reset.click());
    assert.equal(document.querySelector<HTMLInputElement>('input[type="search"]')!.value, "");
    assert.equal(tab("All orders")!.getAttribute("aria-selected"), "true");
    assert.equal(rows().length, 4);
  } finally { await cleanup(); }
});

test("the search field is labelled, and an empty tab says so", async () => {
  const cleanup = await mount(orders.filter((o) => o.status !== "cancelled"));
  try {
    const field = document.querySelector<HTMLInputElement>('input[type="search"]');
    assert.ok(field, "the search field is shown");
    const label = document.querySelector(`label[for="${field!.id}"]`);
    assert.equal(label?.textContent, "Search your orders");
    await act(async () => tab("Cancelled")!.click());
    assert.match(text(), /No cancelled orders/);
  } finally { await cleanup(); }
});

test("a customer with no orders yet is shown where to start, without empty controls", async () => {
  const cleanup = await mount([]);
  try {
    assert.match(text(), /No orders yet/);
    assert.ok(document.querySelector('a[href="/collections/all"]'));
    assert.equal(tabs().length, 0);
    assert.equal(document.querySelector('input[type="search"]'), null);
  } finally { await cleanup(); }
});
