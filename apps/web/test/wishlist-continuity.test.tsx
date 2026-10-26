import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { cardEnvelope } from "./support/catalogue-fixtures";
import { Favourites } from "../components/favourites";
import { ShopProvider, useShop } from "../components/shop-provider";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const product = (handle: string) => cardEnvelope(handle);
function Controls() {
  const { toggleFavourite } = useShop();
  return <><button onClick={() => toggleFavourite("charlie")}>Toggle charlie elsewhere</button><button onClick={() => toggleFavourite("bravo")}>Toggle bravo elsewhere</button></>;
}
type Request = { handle: string; signal: AbortSignal | null | undefined; resolve: (response: Response) => void };
async function mount(handles: string[], check: (requests: Request[]) => Promise<void>, strict = false) {
  localStorage.clear(); localStorage.setItem("maple-favourites", JSON.stringify(handles));
  const requests: Request[] = []; const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/cart") return Response.json(cart);
    return new Promise<Response>((resolve) => requests.push({ handle: decodeURIComponent(String(input).split("/").at(-1)!), signal: init?.signal, resolve }));
  };
  const root = createRoot(document.getElementById("root")!);
  try { await act(async () => root.render(strict ? <React.StrictMode><ShopProvider><Controls /><Favourites /></ShopProvider></React.StrictMode> : <ShopProvider><Controls /><Favourites /></ShopProvider>)); await check(requests); }
  finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
}
async function settle(requests: Request[], handle: string, response = Response.json(product(handle))) {
  const request = [...requests].reverse().find((entry) => entry.handle === handle && !entry.signal?.aborted);
  assert.ok(request, `request for ${handle}`); await act(async () => request.resolve(response));
}
function button(label: string) {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent === label);
  assert.ok(result, `button ${label}`); return result;
}
async function click(target: HTMLElement, focus = true) { if (focus) target.focus(); await act(async () => target.click()); }
test("saved product, unavailable piece and empty wishlist preserve their original copy and removal behavior", async () => {
  await mount(["alpha", "missing"], async (requests) => {
    assert.equal(document.querySelector('[role="status"]')?.textContent, "Loading saved furniture…");
    await settle(requests, "alpha"); await settle(requests, "missing", new Response(null, { status: 404 }));
    assert.equal(document.querySelector('.product-card-name')?.textContent, "alpha Chair");
    assert.match(document.body.textContent!, /This saved piece is no longer available: missing\./);
    await click(button("Remove"));
    for (const request of requests.filter((entry) => entry.handle === "alpha" && !entry.signal?.aborted)) await act(async () => request.resolve(Response.json(product("alpha"))));
    await click(button("Unsave alpha Chair"));
    assert.equal(document.querySelector("h2")?.textContent, "Your wishlist is empty");
    assert.match(document.body.textContent!, /Saved furniture stays in this browser\./);
    assert.equal(document.querySelector('.wishlist-empty a')?.getAttribute("href"), "/collections/all");
    assert.equal(localStorage.getItem("maple-favourites"), "[]");
  });
});
test("failed requests retain the error explanation and offer recovery", async () => {
  await mount(["alpha"], async (requests) => {
    await settle(requests, "alpha", new Response(null, { status: 503 }));
    assert.equal(document.querySelector('[role="alert"]')?.textContent, "Saved furniture couldn’t be loaded. Please try again. Retry failed items");
  });
});
test("removal retains settled cards without refetching and moves focused controls next, previous, then to Explore", async () => {
  await mount(["alpha", "bravo", "charlie"], async (requests) => {
    for (const handle of ["alpha", "bravo", "charlie"]) await settle(requests, handle);
    const alpha = document.querySelector('.product-card')!;
    const charlie = button("Unsave charlie Chair");
    await click(button("Unsave bravo Chair"));
    assert.equal(document.querySelector('.product-card'), alpha, "settled cards must not unmount on removal");
    assert.equal(requests.length, 3, "removing a saved product needs no product requests");
    assert.equal(document.activeElement, charlie, "focus moves to the next remaining remove control");
    await click(charlie);
    assert.equal(document.activeElement, button("Unsave alpha Chair"), "last card falls back to the previous control");
    await click(button("Unsave alpha Chair"));
    assert.equal(document.activeElement, document.querySelector('.wishlist-empty a'));
  });
});
test("adding a pending piece keeps settled cards and removed pending responses cannot resurrect it", async () => {
  await mount(["alpha"], async (requests) => {
    await settle(requests, "alpha");
    const alpha = document.querySelector('.product-card');
    await click(button("Toggle charlie elsewhere"));
    assert.equal(document.querySelector('.product-card'), alpha, "loading an addition retains existing furniture");
    assert.equal(requests.filter((entry) => entry.handle === "alpha").length, 1);
    const pending = requests.find((entry) => entry.handle === "charlie")!;
    await click(button("Toggle charlie elsewhere"));
    assert.equal(pending.signal?.aborted, true);
    await act(async () => pending.resolve(Response.json(product("charlie"))));
    assert.equal(document.querySelectorAll('.product-card').length, 1);
    assert.equal(document.querySelector('.product-card'), alpha);
    assert.equal(document.querySelector('[role="status"]'), null);
    assert.equal(document.activeElement, button("Toggle charlie elsewhere"), "external controls retain focus");
  });
});
test("one failed request does not hide successful pieces and missing removal retains focus continuity", async () => {
  await mount(["alpha", "missing", "bravo"], async (requests) => {
    await settle(requests, "alpha");
    await settle(requests, "missing", new Response(null, { status: 404 }));
    await settle(requests, "bravo", new Response(null, { status: 503 }));
    assert.ok(document.querySelector('.product-card'), "a failed piece must not hide the successfully loaded piece");
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Saved furniture couldn’t be loaded/);
    await click(button("Remove"));
    assert.equal(document.activeElement, button("Unsave alpha Chair"));
    assert.equal(requests.length, 3);
  });
});
test("unrelated pending requests survive removal and old responses cannot replace a re-added piece", async () => {
  await mount(["alpha", "bravo"], async (requests) => {
    await settle(requests, "alpha");
    const bravo = requests.find((entry) => entry.handle === "bravo")!;
    await click(button("Unsave alpha Chair"));
    assert.equal(bravo.signal?.aborted, false, "an unresolved remaining piece keeps its request");
    assert.equal(requests.length, 2);
    await click(button("Toggle bravo elsewhere"));
    assert.equal(bravo.signal?.aborted, true);
    await click(button("Toggle bravo elsewhere"));
    await settle(requests, "bravo", Response.json(cardEnvelope("bravo", "Current chair")));
    await act(async () => bravo.resolve(Response.json(cardEnvelope("bravo", "Obsolete chair"))));
    assert.equal(document.querySelector('.product-card-name')?.textContent, "Current chair");
    assert.equal(document.querySelectorAll('.product-card').length, 1);
  });
});
test("removal does not steal unrelated focus and malformed responses remain bounded to their own piece", async () => {
  await mount(["alpha", "bravo"], async (requests) => {
    await settle(requests, "alpha");
    await settle(requests, "bravo", Response.json({ title: "Invalid payload" }));
    assert.ok(document.querySelector('[role="alert"]'));
    const elsewhere = button("Toggle charlie elsewhere");
    elsewhere.focus();
    await click(button("Unsave alpha Chair"), false);
    assert.equal(document.activeElement, elsewhere);
    assert.equal(document.querySelectorAll('.product-card').length, 0);
    assert.ok(document.querySelector('[role="alert"]'));
  });
});
test("removing the only loaded card retains focus within the wishlist while another piece is unresolved", async () => {
  await mount(["alpha", "bravo"], async (requests) => {
    await settle(requests, "alpha");
    await click(button("Unsave alpha Chair"));
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Saved furniture");
    assert.ok(document.activeElement?.querySelector('[role="status"]'));
    await settle(requests, "bravo", new Response(null, { status: 503 }));
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Saved furniture");
    assert.ok(document.activeElement?.querySelector('[role="alert"]'));
  });
});
test("a response for a different handle cannot produce a removal control for the wrong saved piece", async () => {
  await mount(["alpha"], async (requests) => {
    await settle(requests, "alpha", Response.json(product("bravo")));
    assert.equal(document.querySelectorAll('.product-card').length, 0);
    assert.ok(document.querySelector('[role="alert"]'));
    assert.equal(localStorage.getItem("maple-favourites"), '["alpha"]');
  });
});

test("strict effect replay resolves the active request and unmount aborts outstanding transport", async () => {
  let pending: Request | undefined;
  await mount(["alpha"], async (requests) => {
    await settle(requests, "alpha");
    assert.equal(document.querySelector('.product-card-name')?.textContent, "alpha Chair");
    await click(button("Toggle charlie elsewhere"));
    pending = requests.find((entry) => entry.handle === "charlie" && !entry.signal?.aborted);
    assert.ok(pending);
  }, true);
  assert.equal(pending?.signal?.aborted, true);
});
