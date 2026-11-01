import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

// The owner's question: how does a shopper ask for Aero Dining Chair in another fabric, size or finish?
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A considered silhouette.", category: "chairs",
  images: ["https://example.com/aero-1.jpg", "https://example.com/aero-2.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  sourceDetails: { details: null, materials: null, dimensions: null, careInstructions: null, warranty: null },
  variants: [
    { id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
    { id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: null, available: true, stockPolicy: "stocked" },
  ],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const reference = "enq_01234567-89ab-cdef-0123-456789abcdef";
async function mount(check: (doc: Document, sent: unknown[]) => Promise<void>, value: Product = product) {
  const previous = globalThis.fetch;
  const sent: unknown[] = [];
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    if (String(url) === "/api/enquiries") { sent.push(JSON.parse(String(options?.body))); return Response.json({ reference, mode: "preview", notificationSent: false }, { status: 201 }); }
    return Response.json(empty);
  }) as typeof fetch;
  window.history.replaceState(null, "", "/products/aero-dining-chair");
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} /></ShopProvider></AppRouterContext.Provider>));
    await check(document, sent);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const dialog = (doc: Document) => doc.querySelector<HTMLDialogElement>('dialog[aria-label="Request a customisation"]')!;
const field = (doc: Document, label: string) => {
  const match = [...dialog(doc).querySelectorAll("label")].find((item) => text(item.querySelector("span"))?.startsWith(label));
  assert.ok(match, `Missing field ${label}`);
  return match.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")!;
};
const click = (element: Element, init: MouseEventInit = {}) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })); });
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => { input.value = value; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });

test("Customisation available opens a short request form naming the piece and the chosen finish", async () => {
  await mount(async (doc) => {
    const link = doc.querySelector<HTMLAnchorElement>("a[data-customization]")!;
    assert.match(link.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero/, "Without scripts the link still reaches the contact form");
    assert.equal(dialog(doc).open, false);
    await click(link);
    assert.equal(dialog(doc).open, true);
    assert.equal(dialog(doc).getAttribute("aria-label"), "Request a customisation");
    const piece = text(dialog(doc).querySelector("[data-custom-piece]"));
    assert.match(piece!, /Aero Dining Chair/);
    assert.match(piece!, /Deep Atlantic/);
    assert.match(piece!, /AERO-A/);
    assert.equal(field(doc, "Finish").value, "Deep Atlantic", "The chosen finish is the starting point");
    assert.equal(field(doc, "Fabric").value, "");
    assert.equal(field(doc, "Quantity").value, "1");
    assert.match(text(dialog(doc))!, /No payment is taken now/, "No deposit at launch: the team prices it first");
  });
});

test("a new finish choice carries into the form, and a modified click keeps the link's own behaviour", async () => {
  await mount(async (doc) => {
    await act(async () => doc.querySelectorAll<HTMLInputElement>("[data-variants] input")[1]!.click());
    const link = doc.querySelector<HTMLAnchorElement>("a[data-customization]")!;
    // jsdom cannot open the new tab the browser would; the handler still sees the click first.
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await click(link, { ctrlKey: true });
    assert.equal(dialog(doc).open, false, "Ctrl-click opens the contact page in a new tab instead");
    await click(link);
    assert.equal(field(doc, "Finish").value, "Desert Taupe");
    assert.match(text(dialog(doc).querySelector("[data-custom-piece]"))!, /AERO-T/);
  });
});

test("sending the form saves a custom enquiry with every requested option and shows the reference", async () => {
  await mount(async (doc, sent) => {
    await click(doc.querySelector("a[data-customization]")!);
    await type(field(doc, "Fabric"), "Olive boucle");
    await type(field(doc, "Finish"), "Walnut legs");
    await type(field(doc, "Size or dimensions"), "Seat width 60 cm");
    await type(field(doc, "Quantity"), "6");
    await type(field(doc, "Delivery pincode"), "110015");
    await type(field(doc, "Notes"), "Can the arms be a little lower?");
    await type(field(doc, "Name"), "Asha Rao");
    await type(field(doc, "Phone"), "9811000000");
    await type(field(doc, "Email"), "asha@example.invalid");
    await act(async () => { dialog(doc).querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(sent, [{
      kind: "custom", name: "Asha Rao", email: "asha@example.invalid", phone: "9811000000", message: "Can the arms be a little lower?",
      context: { product: "Aero Dining Chair", handle: "aero-dining-chair", variant: "Deep Atlantic", sku: "AERO-A", pincode: "110015",
        fabric: "Olive boucle", finish: "Walnut legs", size: "Seat width 60 cm", quantity: 6 },
    }]);
    const status = dialog(doc).querySelector("[role='status']");
    assert.match(text(status)!, new RegExp(reference));
  });
});

test("a piece that cannot be bought online opens the same form from Speak to a designer", async () => {
  const made = { ...product, variants: product.variants.map((v) => ({ ...v, pricePaise: null })) } as Product;
  await mount(async (doc) => {
    const designer = doc.querySelector<HTMLAnchorElement>("a[data-designer]")!;
    assert.equal(text(designer), "Speak to a designer");
    await click(designer);
    assert.equal(dialog(doc).open, true);
    assert.equal(field(doc, "Finish").value, "Deep Atlantic");
  }, made);
});
