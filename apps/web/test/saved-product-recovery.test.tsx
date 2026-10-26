import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import type { Product } from "@shopmaple/contracts";
import { Favourites } from "../components/favourites";
import { requestSavedProduct } from "../lib/saved-product-request";
import { ShopProvider, useShop } from "../components/shop-provider";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
function product(handle: string): Product {
  return { id: handle, handle, title: `${handle} Chair`, description: "Original description", category: "chairs", images: [], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: `${handle}-variant`, title: "Default", sku: handle, pricePaise: 120000, compareAtPaise: null, available: false, stockPolicy: "unverified" }] };
}
function Controls() {
  const { toggleFavourite } = useShop();
  return <button onClick={() => toggleFavourite("bravo")}>Toggle bravo elsewhere</button>;
}
type Request = { handle: string; signal: AbortSignal | null | undefined; resolve: (response: Response) => void };
async function mount(handles: string[], check: (requests: Request[]) => Promise<void>) {
  localStorage.clear(); localStorage.setItem("maple-favourites", JSON.stringify(handles));
  const requests: Request[] = []; const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/cart") return Response.json(cart);
    return new Promise<Response>((resolve) => requests.push({ handle: decodeURIComponent(String(input).split("/").at(-1)!), signal: init?.signal, resolve }));
  };
  const root = createRoot(document.getElementById("root")!);
  try { await act(async () => root.render(<ShopProvider><Controls /><Favourites /></ShopProvider>)); await check(requests); }
  finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
}
async function settle(request: Request, response = Response.json(product(request.handle))) {
  await act(async () => request.resolve(response));
}
function button(label: RegExp) {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => label.test(item.getAttribute("aria-label") ?? item.textContent ?? ""));
  assert.ok(result, `button ${label}`); return result;
}
async function click(target: HTMLElement, focus = true) { if (focus) target.focus(); await act(async () => target.click()); }

test("successful and missing saved pieces preserve loaded cards and removal", async () => {
  await mount(["alpha", "missing"], async (requests) => {
    await settle(requests[0]!);
    const card = document.querySelector('.product-card');
    assert.equal(document.querySelector('.product-card-name')?.textContent, "alpha Chair");
    await settle(requests[1]!, new Response(null, { status: 404 }));
    assert.equal(document.querySelector('.product-card'), card);
    await click(button(/^Remove$/));
    assert.equal(document.querySelector('.product-card'), card);
    assert.equal(localStorage.getItem("maple-favourites"), '["alpha"]');
  });
});

// Removing the deadline would leave the loading state present and no recovery message.
test("a saved-product header request ends its loading state at six seconds even when transport ignores cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await mount(["alpha"], async (requests) => {
      await act(async () => { t.mock.timers.tick(5999); });
      assert.ok(document.querySelector('[role="status"]'));
      assert.equal(document.querySelector('[role="alert"]'), null);
      await act(async () => { t.mock.timers.tick(1); });
      assert.equal(!!document.querySelector('[role="status"]'), false, "six seconds must end loading");
      assert.ok(document.querySelector('[role="alert"]'), "the shopper receives an actionable failure");
      assert.equal(requests[0]!.signal?.aborted, true, "deadline cancels transport");
      await settle(requests[0]!);
      assert.equal(document.querySelectorAll('.product-card').length, 0, "late success cannot overwrite the failure");
    });
  } finally { t.mock.timers.reset(); }
});

// Clearing the deadline when headers arrive would allow a stalled JSON body to hang forever.
test("the same six-second deadline includes reading a saved-product response body", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release!: (value: Product) => void;
  const body = new Promise<Product>((resolve) => { release = resolve; });
  try {
    await mount(["alpha"], async (requests) => {
      await act(async () => { t.mock.timers.tick(4500); });
      const response = Response.json(product("alpha"));
      response.json = () => body;
      await settle(requests[0]!, response);
      await act(async () => { t.mock.timers.tick(1499); });
      assert.ok(document.querySelector('[role="status"]'));
      await act(async () => { t.mock.timers.tick(1); });
      assert.equal(!!document.querySelector('[role="status"]'), false, "a delayed body must use the original deadline");
      assert.ok(document.querySelector('[role="alert"]'));
      assert.equal(requests[0]!.signal?.aborted, true);
      await act(async () => release(product("alpha")));
      assert.equal(document.querySelectorAll('.product-card').length, 0);
    });
  } finally { t.mock.timers.reset(); }
});

// Accepting an unpublished API record could expose a withdrawn piece as a saved product.
test("an unpublished saved-product response never renders a furniture card", async () => {
  await mount(["alpha"], async (requests) => {
    await settle(requests[0]!, Response.json({ ...product("alpha"), published: false }));
    assert.equal(document.querySelectorAll('.product-card').length, 0, "only published matching products may appear");
    assert.ok(document.querySelector('[role="alert"]'));
    assert.equal(localStorage.getItem("maple-favourites"), '["alpha"]');
  });
});

// Restarting every request on retry would unmount or refetch already loaded cards.
test("Retry reloads only failed items while loaded cards, missing pieces and pending requests remain intact", async () => {
  await mount(["alpha", "bravo", "missing", "pending"], async (requests) => {
    await settle(requests[0]!);
    await settle(requests[1]!, new Response(null, { status: 503 }));
    await settle(requests[2]!, new Response(null, { status: 404 }));
    const card = document.querySelector('.product-card');
    await click(button(/^Retry failed items$/));
    assert.ok(document.querySelector('.product-card') === card, "retry retains the loaded card DOM");
    assert.deepEqual(requests.map((entry) => entry.handle), ["alpha", "bravo", "missing", "pending", "bravo"]);
    assert.equal(requests[3]!.signal?.aborted, false, "unrelated pending requests keep running");
    assert.match(document.body.textContent!, /This saved piece is no longer available: missing\./);
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Saved furniture", "focus survives Retry disappearing");
    await settle(requests[4]!);
    assert.deepEqual([...document.querySelectorAll('.product-card-name')].map((node) => node.textContent), ["alpha Chair", "bravo Chair"]);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Saved furniture");
    await settle(requests[3]!);
    assert.equal(localStorage.getItem("maple-favourites"), '["alpha","bravo","missing","pending"]');
  });
});

// A late old body must not replace a newer successful retry.
test("retry after a timed-out body accepts the current piece and ignores the obsolete response", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release!: (value: Product) => void;
  const body = new Promise<Product>((resolve) => { release = resolve; });
  try {
    await mount(["bravo"], async (requests) => {
      const response = Response.json(product("bravo")); response.json = () => body;
      await settle(requests[0]!, response);
      await act(async () => { t.mock.timers.tick(6000); });
      await click(button(/^Retry failed items$/));
      await settle(requests[1]!, Response.json({ ...product("bravo"), title: "Current chair" }));
      await act(async () => release({ ...product("bravo"), title: "Obsolete chair" }));
      assert.equal(document.querySelector('.product-card-name')?.textContent, "Current chair");
      assert.equal(document.querySelectorAll('.product-card').length, 1);
      assert.equal(document.querySelector('[role="alert"]'), null);
    });
  } finally { t.mock.timers.reset(); }
});

test("a stalled retry is bounded again and repeated recovery remains available without automatic requests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await mount(["bravo"], async (requests) => {
      await settle(requests[0]!, new Response(null, { status: 503 }));
      await click(button(/^Retry failed items$/));
      await act(async () => { t.mock.timers.tick(6000); });
      assert.equal(!!document.querySelector('[role="status"]'), false);
      assert.ok(document.querySelector('[role="alert"]'));
      assert.equal(requests[1]!.signal?.aborted, true);
      await act(async () => { t.mock.timers.tick(60000); });
      assert.equal(requests.length, 2, "recovery is initiated only by the shopper");
      await click(button(/^Retry failed items$/));
      await settle(requests[2]!);
      assert.equal(document.querySelector('.product-card-name')?.textContent, "bravo Chair");
    });
  } finally { t.mock.timers.reset(); }
});

test("retry preserves unrelated keyboard focus and removing its pending piece cancels and suppresses the result", async () => {
  await mount(["alpha", "bravo"], async (requests) => {
    await settle(requests[0]!); await settle(requests[1]!, new Response(null, { status: 503 }));
    const elsewhere = button(/^Toggle bravo elsewhere$/); elsewhere.focus();
    await click(button(/^Retry failed items$/), false);
    assert.ok(document.activeElement === elsewhere, "a programmatic retry must not steal unrelated focus");
    await click(elsewhere);
    assert.equal(requests[2]!.signal?.aborted, true);
    await settle(requests[2]!);
    assert.deepEqual([...document.querySelectorAll('.product-card-name')].map((node) => node.textContent), ["alpha Chair"]);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(document.querySelector('[role="status"]'), null);
    assert.ok(document.activeElement === elsewhere);
  });
});

test("unmount aborts an active retry and a late result cannot populate a newly mounted wishlist", async () => {
  let pending!: Request;
  await mount(["bravo"], async (requests) => {
    await settle(requests[0]!, new Response(null, { status: 503 }));
    await click(button(/^Retry failed items$/)); pending = requests[1]!;
  });
  assert.equal(pending.signal?.aborted, true);
  await mount(["alpha"], async (requests) => {
    await settle(requests[0]!); await settle(pending);
    assert.deepEqual([...document.querySelectorAll('.product-card-name')].map((node) => node.textContent), ["alpha Chair"]);
  });
});

// A cancelled caller must never dispatch a request, even before the helper is entered.
test("a pre-aborted saved-product request rejects without dispatching transport", async () => {
  const controller = new AbortController(); controller.abort();
  const previous = globalThis.fetch;
  const dispatched: string[] = [];
  globalThis.fetch = async (input) => {
    dispatched.push(String(input)); return Response.json(product("alpha"));
  };
  try {
    await assert.rejects(requestSavedProduct("alpha", controller.signal), /Saved furniture unavailable/);
    assert.deepEqual(dispatched, []);
  } finally { globalThis.fetch = previous; }
});
