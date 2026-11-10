import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";

// "Customisation available" (Figma GJsFInfhys0crdNpQsbUUU, 44:479 on desktops and 46:630 on phones; owner, 4 Nov 2026):
// the piece's fabric and wood polish, an idea of the visitor's own and where to send the quote, with "Get a quote" kept
// at the foot while the rest scrolls.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A considered silhouette for a welcoming place at the table.", category: "chairs",
  images: ["https://example.com/aero-1.jpg", "https://example.com/aero-2.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" },
    { id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" },
  ],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const receipt = { reference: "enq_" + "a".repeat(8) + "-" + "b".repeat(4) + "-" + "c".repeat(4) + "-" + "d".repeat(4) + "-" + "e".repeat(12), mode: "preview", notificationSent: false };

async function mount(check: (doc: Document) => Promise<void>, value: Product = product, fetcher: typeof fetch = async () => Response.json(empty)) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const panel = (doc: Document) => doc.querySelector<HTMLDialogElement>("dialog[data-customise]");
async function open(doc: Document) {
  await act(async () => doc.querySelector<HTMLAnchorElement>("a[data-customization]")!.click());
  return panel(doc)!;
}
async function pick(dialog: HTMLDialogElement, name: string, value: string) {
  await act(async () => dialog.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!.click());
}

test("Customisation available opens the panel: the piece, four steps and a live selection, with Get a quote outside the scrolling part", async () => {
  await mount(async (doc) => {
    assert.equal(panel(doc), null, "the panel joins the page only when asked for");
    assert.match(doc.querySelector("a[data-customization]")!.getAttribute("href")!, /^\/contact\?/, "without script the link still leads to an enquiry");
    const dialog = await open(doc);
    assert.equal(dialog.open, true);
    assert.equal(dialog.getAttribute("aria-labelledby"), "customise-title");
    assert.equal(text(doc.getElementById("customise-title")), "Make it unmistakably yours.");
    assert.match(text(dialog)!, /Aero Dining Chair/);
    assert.equal(document.body.style.overflow, "hidden", "the page behind holds still");
    assert.equal(dialog.querySelectorAll("fieldset").length, 4, "fabric, wood polish, an idea of their own, and where to send the quote");
    assert.deepEqual([...dialog.querySelectorAll<HTMLInputElement>('input[name="fabric"]')].map((input) => input.value), ["Ivory", "Oatmeal", "Taupe", "Olive", "Terracotta", "Charcoal"]);
    assert.deepEqual([...dialog.querySelectorAll<HTMLInputElement>('input[name="polish"]')].map((input) => input.value), ["Natural", "Walnut", "Espresso", "Black"]);
    const fabricShown = () => [...dialog.querySelectorAll("[data-selection-fabric]")].map(text);
    assert.deepEqual(fabricShown(), ["Not chosen yet", "Not chosen yet"], "the desktop panel and the phone card both say so");
    await pick(dialog, "fabric", "Olive");
    assert.deepEqual(fabricShown(), ["Olive", "Olive"]);
    assert.equal(text(dialog.querySelector("fieldset [data-picked]")), "Olive", "the step names the choice too");
    const submit = dialog.querySelector<HTMLButtonElement>("button[data-quote-submit]")!;
    assert.equal(text(submit), "Get a quote →");
    assert.equal(submit.type, "submit");
    const scroll = dialog.querySelector("[data-customise-scroll]")!;
    assert.equal(scroll.contains(submit), false, "the button stays at the foot while the steps scroll");
    assert.ok(dialog.querySelector("[data-customise-footer]")!.contains(submit));
    assert.equal(scroll.compareDocumentPosition(submit) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING, "below the steps");
    await act(async () => dialog.querySelector<HTMLButtonElement>("button[aria-label='Close customisation']")!.click());
    assert.equal(dialog.open, false);
    assert.equal(document.body.style.overflow, "", "the page scrolls again");
    assert.equal(document.activeElement, doc.querySelector("a[data-customization]"), "focus returns to the link that opened it");
    const again = await open(doc);
    assert.equal(again, dialog, "the same panel comes back");
    assert.deepEqual(fabricShown(), ["Olive", "Olive"], "with the visitor's choice kept");
    await act(async () => { dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    assert.equal(dialog.open, false, "a click on the backdrop closes it");
  });
});

test("Get a quote sends the choices, the idea and the piece to the store's enquiries, then thanks the visitor", async () => {
  const sent: unknown[] = [];
  await mount(async (doc) => {
    const dialog = await open(doc);
    await pick(dialog, "fabric", "Olive");
    await pick(dialog, "polish", "Walnut");
    const form = dialog.querySelector("form")!;
    const set = (name: string, value: string) => { (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value = value; };
    set("idea", "A deeper seat in a linen weave"); set("name", "Asha"); set("phone", "98110 00000"); set("email", "Asha@Example.com");
    await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => {});
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      kind: "project", name: "Asha", email: "asha@example.com", phone: "+91 98110 00000",
      message: "Customisation quote request\nFabric: Olive\nWood polish: Walnut\nTheir idea: A deeper seat in a linen weave",
      context: { product: "Aero Dining Chair", variant: "Deep Atlantic", sku: "AERO-A", pincode: "" },
    });
    const [thanks, next] = [...dialog.querySelectorAll("[data-customise-sent] p")].map(text);
    assert.equal(thanks, "Thank you. Your request is with us.");
    assert.match(next!, /^The Maple team will contact you about your Aero Dining Chair and confirm finishes, pricing and lead time\. Reference: enq_a{8}-/);
    assert.equal(dialog.querySelector("[data-quote-submit]"), null, "the form's foot gives way to the thanks");
  }, product, async (url, init) => {
    if (String(url) !== "/api/enquiries") return Response.json(empty);
    sent.push(JSON.parse(String(init!.body)));
    return Response.json(receipt, { status: 201 });
  });
});

test("a request with no choices says so, and a refused one keeps the form with the reason", async () => {
  const sent: { message: string }[] = [];
  await mount(async (doc) => {
    const dialog = await open(doc);
    const form = dialog.querySelector("form")!;
    (form.elements.namedItem("name") as HTMLInputElement).value = "Asha";
    (form.elements.namedItem("email") as HTMLInputElement).value = "asha@example.com";
    await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => {});
    assert.equal(sent[0]!.message, "Customisation quote request\nFabric: Not chosen\nWood polish: Not chosen");
    assert.equal(text(dialog.querySelector("[role='alert']")), "Your enquiry could not be saved. Please check your details and try again.");
    assert.ok(dialog.querySelector("[data-quote-submit]"), "the visitor can try again");
    assert.equal(dialog.querySelector("[data-customise-sent]"), null);
  }, product, async (url, init) => {
    if (String(url) !== "/api/enquiries") return Response.json(empty);
    sent.push(JSON.parse(String(init!.body)));
    return Response.json({ error: "invalid" }, { status: 400 });
  });
});

test("reference photos go to the Maple team on WhatsApp with the piece and the choices named", async () => {
  await mount(async (doc) => {
    const dialog = await open(doc);
    await pick(dialog, "fabric", "Terracotta");
    const share = dialog.querySelector<HTMLAnchorElement>("[data-reference-images] a")!;
    assert.equal(text(share), "Share on WhatsApp");
    assert.equal(share.target, "_blank");
    assert.match(share.rel, /noopener/);
    const link = new URL(share.href);
    assert.equal(link.origin, "https://wa.me");
    assert.equal(link.searchParams.get("text"), "Hello Maple, here are reference photos for a customised Aero Dining Chair, fabric Terracotta.");
  });
});

test("a piece with a single option offers customisation too, and the gallery stays within the window beside the buy box", async () => {
  await mount(async (doc) => {
    // Every piece can be made around its buyer (owner, 4 Nov 2026): with no options to sit beside, the link has its own line.
    const link = doc.querySelector<HTMLAnchorElement>("a[data-customization]")!;
    assert.ok(link, "Customisation available");
    assert.equal(text(link), "Customisation available");
    assert.equal(doc.querySelector("[data-option-group], [role=radiogroup]")?.contains(link) ?? false, false, "not inside an options block it does not have");
    const dialog = await open(doc);
    assert.equal(dialog.open, true);
    assert.match(text(dialog)!, /Aero Dining Chair/);
    const photo = doc.querySelector<HTMLElement>("[data-main-image]")!;
    assert.match(photo.className, /lg:max-h-\[calc\(100svh-48px-var\(--gallery-below,0px\)-var\(--site-header-offset,0px\)\)\]/, "no taller than the window on a desktop (owner, 4 Nov 2026), less what sits under it and the pinned header (10 Nov 2026)");
    assert.ok(photo.closest(".lg\\:sticky"), "and pinned while the buy box scrolls past");
  }, { ...product, variants: product.variants.slice(0, 1) });
});
