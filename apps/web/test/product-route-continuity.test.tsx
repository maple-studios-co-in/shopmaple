import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { Product } from "@shopmaple/contracts";
import ProductPage from "../app/products/[handle]/page";
import { ShopProvider } from "../components/shop-provider";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const chair: Product = {
  id: "continuity-chair", handle: "continuity-chair", title: "Continuity Chair", description: "A chair", category: null,
  images: ["https://example.com/first.jpg", "https://example.com/second.jpg"],
  published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "first", title: "First option", sku: "FIRST", pricePaise: 1000000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
    { id: "second", title: "Second option", sku: "SECOND", pricePaise: 1200000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
    { id: "preview-third", title: "Third option", sku: "THIRD", pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" },
  ],
};
const other = { ...chair, id: "continuity-other", handle: "continuity-other", title: "Other Chair" };
const mapped: Product = {
  ...chair, id: "continuity-aero", handle: "aero-dining-chair", source: "shopify-preview",
  images: ["https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Frame174.png?v=1777655455", "https://example.com/aero-side.jpg"],
  variants: [{ ...chair.variants[0]!, id: "preview-46728293843133" }, chair.variants[1]!],
};
const cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const input = () => document.querySelector<HTMLInputElement>("#delivery-pincode")!;
const option = (id: string) => document.querySelector<HTMLInputElement>(`input[name="variant"][value="${id}"]`)!;
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const selected = () => document.querySelector<HTMLInputElement>('input[name="variant"]:checked')?.value;
const selectedImage = () => document.querySelector('[data-thumbnails] [aria-pressed="true"]')?.getAttribute("aria-label");
async function fillPin(value = "110015") {
  await act(async () => {
    // React's legacy input-event path in JSDOM observes keyup on the focused input.
    input().focus();
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "5", bubbles: true }));
  });
  await act(async () => input().form!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.match(document.querySelector("[data-serviceability] [role=status]")!.textContent!, /110015/);
}
async function withRoute(run: (render: (variant?: string, handle?: string, retainUrl?: boolean) => Promise<void>, replacements: string[]) => Promise<void>, initial?: string) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch;
  const replacements: string[] = [];
  globalThis.fetch = async (input, init) => {
    assert.notEqual(init?.method, "PUT", "continuity checks must not mutate a cart");
    const path = new URL(String(input), "http://localhost:3000").pathname;
    if (path === "/api/cart") return Response.json(cart);
    if (path === `/api/products/${chair.handle}`) return Response.json(chair);
    if (path === `/api/products/${other.handle}`) return Response.json(other);
    if (path === `/api/products/${mapped.handle}`) return Response.json(mapped);
    throw new Error(`Unexpected test request: ${path}`);
  };
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {},
    replace(href: string) { replacements.push(href); }, prefetch() {} };
  async function render(variant?: string, handle = chair.handle, retainUrl = false) {
    if (!retainUrl) window.history.replaceState(null, "", `/products/${handle}${variant ? `?variant=${encodeURIComponent(variant)}` : ""}`);
    const page = await ProductPage({ params: Promise.resolve({ handle }), searchParams: Promise.resolve({ variant }) });
    await act(async () => root.render(<AppRouterContext.Provider value={router}><SearchParamsContext.Provider value={new URLSearchParams(window.location.search)}><ShopProvider>{page}</ShopProvider></SearchParamsContext.Provider></AppRouterContext.Provider>));
  }
  try { await render(initial); await run(render, replacements); }
  finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; localStorage.clear(); }
}

test("the real product route honors explicit options, legacy aliases and safe fallback without enabling checkout", async () => {
  await withRoute(async render => {
    assert.equal(selected(), "second");
    await render("third");
    assert.equal(selected(), "preview-third");
    assert.equal(document.querySelector("[data-purchase] button"), null);
    assert.match(document.querySelector("[data-disclosure]")!.textContent!, /Delivery and payment options will be confirmed before ordering/);
    await render("unknown");
    assert.equal(selected(), "first");
  }, "second");
});

test("changing products deliberately resets delivery, quantity and gallery state", async () => {
  await withRoute(async render => {
    await fillPin();
    await act(async () => button("Increase quantity").click());
    await act(async () => button("Show product image 2").click());
    await render(undefined, other.handle);
    assert.equal(document.querySelector("h1")?.textContent, "Other Chair");
    assert.equal(input().value, "");
    assert.equal(document.querySelector('output[aria-label="Quantity"]')?.textContent, "1");
    assert.equal(selectedImage(), "Show product image 1");
  });
});

test("same-product variant navigation retains postcode, quantity, gallery and keyboard focus", async () => {
  await withRoute(async (render, replacements) => {
    await fillPin();
    await act(async () => button("Increase quantity").click());
    await act(async () => button("Show product image 2").click());
    const pin = input(), second = option("second");
    second.focus();
    await act(async () => second.click());
    assert.deepEqual(replacements, [], "option changes need no asynchronous route request");
    assert.equal(new URL(window.location.href).searchParams.get("variant"), "second");
    await render("second");
    assert.equal(input().value, "110015", "completed query navigation must retain the entered postcode");
    assert.ok(input() === pin, "the same-product input must retain its DOM identity");
    assert.ok(document.activeElement === second, "the selected option must retain keyboard focus");
    assert.equal(document.querySelector('output[aria-label="Quantity"]')?.textContent, "2");
    assert.equal(selectedImage(), "Show product image 2");
    assert.equal(selected(), "second");
    const enquiry = document.querySelector<HTMLAnchorElement>("[data-custom] a")!;
    assert.equal(new URL(enquiry.href).searchParams.get("pincode"), "110015");
    assert.equal(new URL(enquiry.href).searchParams.get("sku"), "SECOND");
  });
});

test("server query changes update the option while preserving the current enquiry", async () => {
  await withRoute(async render => {
    await fillPin();
    const pin = input();
    for (const [query, expected] of [["second", "second"], ["first", "first"], ["third", "preview-third"], ["unknown", "first"], [undefined, "first"]]) {
      await render(query);
      assert.equal(selected(), expected, "external query navigation must update the selected variant");
      assert.ok(input() === pin, "external query navigation must preserve the enquiry input");
      assert.equal(input().value, "110015");
    }
  });
});

test("an intermediate query acknowledgement cannot replace a newer local option", async () => {
  await withRoute(async render => {
    await fillPin();
    await act(async () => option("second").click());
    await act(async () => option("preview-third").click());
    await render("second", chair.handle, true);
    assert.equal(selected(), "preview-third", "the current URL must win over an older server prop");
    await render("preview-third");
    assert.equal(selected(), "preview-third");
    assert.equal(input().value, "110015");
    await render("second");
    assert.equal(selected(), "second", "after acknowledgement, external navigation remains authoritative");
  });
});

test("returning to the initial option cannot make a later external option navigation stale", async () => {
  await withRoute(async render => {
    await act(async () => option("second").click());
    await act(async () => option("first").click());
    await render();
    assert.equal(selected(), "first");
    await render("second");
    assert.equal(selected(), "second", "a later external query must not be mistaken for an old acknowledgement");
  });
});

test("external mapped options update their image and acknowledgements preserve a later gallery choice", async () => {
  await withRoute(async render => {
    await render("second", mapped.handle);
    await fillPin();
    await act(async () => button("Show product image 2").click());
    await render("preview-46728293843133", mapped.handle);
    assert.equal(selectedImage(), "Show product image 1", "external option uses its validated mapped image");
    assert.equal(input().value, "110015");
    await render("second", mapped.handle);
    await act(async () => option("preview-46728293843133").click());
    await act(async () => button("Show product image 2").click());
    await render("preview-46728293843133", mapped.handle);
    assert.equal(selectedImage(), "Show product image 2", "acknowledgement must not undo a later manual gallery selection");
  });
});


test("variant URL updates preserve the current path, unrelated query and hash without adding history entries", async () => {
  await withRoute(async (_render, replacements) => {
    window.history.replaceState({ existing: true }, "", "/products/continuity-chair?campaign=diwali&variant=first#delivery-enquiry");
    const entries = window.history.length;
    await act(async () => option("second").click());
    assert.equal(window.location.pathname, "/products/continuity-chair");
    assert.equal(window.location.search, "?campaign=diwali&variant=second");
    assert.equal(window.location.hash, "#delivery-enquiry");
    assert.equal(window.history.length, entries);
    assert.deepEqual(replacements, []);
  });
});

test("the product page ends with its reviews and related pieces, not the homepage newsletter and values", async () => {
  await withRoute(async () => {
    assert.ok(document.querySelector("[data-product-details]"));
    assert.equal(Boolean(document.querySelector("[data-newsletter-form]")), false, "No newsletter sign-up on the product page");
    assert.equal(Boolean(document.querySelector("[data-home-values]")), false, "No homepage values section on the product page");
  });
});
