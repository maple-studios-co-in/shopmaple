import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { OrderStatus } from "../components/store/order-status";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/orders/x" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const id = "0b8e1c3a-5d2f-4a6b-9c8d-7e6f5a4b3c2d";
const quote = {
  items: [{ variantId: "keeri:maple:v", productId: "keeri:maple:p", title: "Aera Chair", variantTitle: "Oak", sku: null, quantity: 1,
    unitPricePaise: 4500000, lineTotalPaise: 4500000, hsn: "9401", taxRateBps: 1800, fulfilment: { kind: "made_to_order", leadTimeDays: 21 } }],
  currency: "INR", subtotalPaise: 4500000, shippingPaise: 250000, taxPaise: 0, totalPaise: 4750000, gstMode: "included",
  expiresAt: "2026-11-01T10:15:00.000Z", delivery: { courierName: "Bluedart", estimatedDays: 4 },
};
const status = (extra: Record<string, unknown>) => ({ id, state: "captured", amountPaise: 4750000, currency: "INR", paid: true,
  providerOrderId: "order_x", payBy: null, quote, fulfillmentStatus: "pending", orderReference: null, ...extra });
async function mount(responder: () => Response, check: () => void) {
  const previous = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => { paths.push(new URL(String(input), "http://localhost:3000").pathname); return responder(); };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<OrderStatus attemptId={id} pollIntervalMs={5} />));
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 8)); });
    check();
    assert.ok(paths.every((p) => p === `/api/checkout/${id}`));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = () => document.getElementById("root")!.textContent!;

test("a confirmed order shows its Keeri reference, items, making time, courier and total", async () => {
  await mount(() => Response.json(status({ fulfillmentStatus: "confirmed", orderReference: "SO-77" })), () => {
    assert.ok(document.querySelector("[data-store] [data-order-status]"));
    for (const expected of [/Order confirmed/, /SO-77/, /Aera Chair/, /Oak/, /21 days for making/, /Bluedart/, /about 4 days/, /47,500/])
      assert.match(text(), expected);
  });
});

test("a paid order awaiting Keeri says payment is received and the order is being confirmed", async () => {
  await mount(() => Response.json(status({})), () => {
    assert.match(text(), /Payment received/);
    assert.match(text(), /confirming your order/i);
  });
});

test("a paid order whose hold lapsed promises a call or a full refund", async () => {
  await mount(() => Response.json(status({ state: "paid_hold_lapsed", fulfillmentStatus: "review_required" })), () => {
    assert.match(text(), /payment has been received/i);
    assert.match(text(), /refund in full/i);
  });
});

test("an unpaid or unknown checkout says so without inventing an order", async () => {
  await mount(() => Response.json({ code: "CHECKOUT_NOT_FOUND", message: "We couldn't find that checkout." }, { status: 404 }), () => {
    assert.match(text(), /couldn't find this order in this browser/i);
    assert.ok(document.querySelector('a[href="/pages/contact"]'));
  });
  await mount(() => Response.json(status({ state: "abandoned", paid: false })), () => {
    assert.match(text(), /No payment was taken/);
  });
});
