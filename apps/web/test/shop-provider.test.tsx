import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ShopProvider, useShop } from "../components/shop-provider";
const dom = new JSDOM("<!doctype html><div id='root'></div>", {
  url: "http://localhost:3000",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const cart = {
  items: [],
  itemCount: 3,
  subtotalPaise: 300,
  currency: "INR",
  checkoutEnabled: false,
  mode: "preview",
};
let shop: ReturnType<typeof useShop>;
function Probe() {
  shop = useShop();
  return <button disabled={shop.busy}>Add</button>;
}
test("cart writes wait for the returning shopper's saved cart", async () => {
  let resolve!: (r: Response) => void;
  const requests: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Promise<Response>((r) => {
      resolve = r;
    });
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(
        <ShopProvider>
          <Probe />
        </ShopProvider>,
      );
    });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.equal(await shop.setQuantity("chair", 1), false);
    assert.deepEqual(requests, ["/api/cart"]);
    await act(async () => {
      resolve(Response.json(cart));
    });
    assert.equal(shop.cart.itemCount, 3);
    assert.equal(shop.busy, false);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("failed initial cart loads cannot overwrite an unknown saved quantity", async () => {
  const previous = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(null, { status: 503 });
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(
        <ShopProvider>
          <Probe />
        </ShopProvider>,
      );
    });
    assert.match(shop.error, /couldn't be loaded/);
    assert.equal(shop.busy, true);
    assert.equal(await shop.setQuantity("chair", 1), false);
    assert.deepEqual(requests, ["/api/cart"]);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
