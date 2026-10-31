import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { toProductCard, type Cart, type Product, type ProductHighlights } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { RelatedProducts } from "../components/store/related-products";

// "Maple / PDF Review / Product Detail" (Figma nTEPXzov9IuWraGF0Ace6V, node 1044:638).
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A considered silhouette for a welcoming place at the table.", category: "chairs",
  images: ["https://example.com/aero-1.jpg", "https://example.com/aero-2.jpg", "https://example.com/aero-3.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, stockPolicy: "stocked" },
    { id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, stockPolicy: "stocked" },
  ],
};
const highlights: ProductHighlights = { swatches: [{ name: "Deep Atlantic", hex: "#264f63" }, { name: "Desert Taupe", hex: "#b59f86" }], products: [] };
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = product, options: { highlights?: ProductHighlights; reviewLabel?: string | null } = {}) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const presentation = options.reviewLabel === undefined ? undefined : { variantImages: {}, reviewLabel: options.reviewLabel };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ProductHighlightsProvider value={options.highlights}><ShopProvider>
      <ProductDetail product={value} presentation={presentation} />
    </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

test("the breadcrumb names the category and the piece, the piece as the current page", async () => {
  await mount((doc) => {
    const crumbs = [...doc.querySelectorAll("[data-breadcrumb] li")];
    assert.deepEqual(crumbs.map((crumb) => crumb.querySelector("a, span[aria-current]")?.textContent), ["Home", "Chairs", "Aero Dining Chair"]);
    assert.equal(crumbs[2]!.querySelector("[aria-current]")?.getAttribute("aria-current"), "page");
  });
});

test("the buying column reads eyebrow, serif title, price, struck-out price and description, with no invented chips or ratings", async () => {
  await mount((doc) => {
    const info = doc.querySelector("[data-product-info]")!;
    assert.equal(text(info.querySelector("[data-product-eyebrow]")), "Maple · Chairs collection");
    assert.equal(info.querySelector("h1")?.textContent, "Aero Dining Chair");
    assert.equal(info.querySelector("[data-price-block] strong")?.textContent, "Rs. 23,600.00");
    assert.equal(info.querySelector("[data-price-block] del")?.textContent, "Rs. 27,140.00");
    assert.equal(Boolean(info.querySelector("[data-discount]")), false, "The design shows no discount chip");
    assert.doesNotMatch(info.textContent!, /No reviews yet/, "Ratings stay out of the buying column");
    assert.equal(text(info.querySelector("[data-price-block] [data-was]")), "Was Rs. 27,140.00", "The struck-out price is announced as the old price");
  }, product, { reviewLabel: "No reviews" });
});

test("options are the design's finish swatches: a heading, a circle per option and its name, no per-tile prices", async () => {
  await mount((doc) => {
    const group = doc.querySelector("[data-variants]")!;
    assert.equal(group.querySelector("legend")?.textContent, "Personalise your finish");
    const swatches = [...group.querySelectorAll<HTMLElement>("[data-variant-swatch]")];
    assert.deepEqual(swatches.map((swatch) => swatch.style.backgroundColor), ["rgb(38, 79, 99)", "rgb(181, 159, 134)"], "Staff-entered swatch colours fill the circles");
    assert.deepEqual([...group.querySelectorAll("label")].map((label) => label.textContent), ["Deep Atlantic", "Desert Taupe"]);
    assert.match(text(doc.querySelector("[data-variant-note]")) ?? "", /^Other finishes are custom requests\. Confirm materials and pricing with our team\.$/);
  }, product, { highlights });
});

test("purchase actions, the customisation panel and the delivery enquiry follow the design", async () => {
  await mount((doc) => {
    const purchase = doc.querySelector("[data-purchase]")!;
    assert.equal(purchase.querySelector("button[data-primary]")?.textContent, "Add to cart");
    assert.equal(purchase.querySelector("output")?.textContent, "1");
    const custom = doc.querySelector("[data-custom]")!;
    assert.equal(custom.querySelector("h2")?.textContent, "Customisation available");
    assert.equal(text(custom.querySelector("p")), "A different colour or material? Let’s shape it together.");
    const designer = custom.querySelector<HTMLAnchorElement>("a[data-customization]")!;
    assert.equal(text(designer), "Speak to a designer →");
    assert.match(designer.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero\+Dining\+Chair&variant=Deep\+Atlantic/);
    const delivery = doc.querySelector("[data-serviceability]")!;
    assert.equal(delivery.querySelector<HTMLInputElement>("#delivery-pincode")?.placeholder, "Enter your pincode");
    assert.match(text(delivery.querySelector("[data-disclosure]")) ?? "", /^Enter a pincode so our team can confirm delivery, lead time and applicable taxes\. Delivery and payment options will be confirmed before ordering\.$/);
    assert.equal(Boolean(doc.querySelector("[data-phone]")), false, "The phone number lives in the footer");
    assert.equal(Boolean(doc.querySelector("[data-ask]")), false, "Speak to a designer replaces Ask a question");
    assert.equal(Boolean(doc.querySelector("[data-product-promises]")), false, "The promises move to the strip under the gallery");
    assert.ok(doc.querySelector("button[data-share]"), "Share stays a real control");
  });
});

test("the gallery reads as the main photo first, then a row of photo thumbnails", async () => {
  await mount((doc) => {
    const gallery = doc.querySelector("[data-gallery]")!;
    const stage = gallery.querySelector("[data-main-image]")!;
    const strip = gallery.querySelector("[data-thumbnails]")!;
    assert.equal(stage.compareDocumentPosition(strip) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(strip.querySelectorAll("button").length, 3);
    const status = gallery.querySelector("[data-gallery-status]")!;
    assert.equal(status.getAttribute("aria-live"), "polite", "The photo position is announced at every width");
    assert.equal(status.textContent, "Photo 1 of 3");
  });
});

test("details sit under the Maple promise strip as full-width disclosures, with Details open and the photo gone", async () => {
  await mount((doc) => {
    const section = doc.querySelector("[data-product-details]")!;
    assert.deepEqual([...section.querySelectorAll("[data-promise-strip] strong")].map((title) => title.textContent),
      ["Fully customisable", "Crafted in Delhi", "36-month warranty", "Delivery across India"]);
    assert.equal(Boolean(section.querySelector("img:not([src^='/icons/'])")), false, "No product photo beside the disclosures");
    assert.doesNotMatch(section.textContent!, /Precision in every detail/);
    const details = [...section.querySelectorAll<HTMLDetailsElement>("[data-accordions] details")];
    assert.deepEqual(details.map((item) => item.querySelector("summary")?.textContent), ["Details", "Materials & care", "Shipping & returns", "Product specifications"]);
    assert.deepEqual(details.map((item) => item.open), [true, false, false, false]);
    assert.ok(details.every((item) => item.querySelector("summary [data-disclosure-sign][aria-hidden='true']")), "The +/− sign is decorative");
  });
});

test("the promise strip carries the product's own warranty when it has one", async () => {
  await mount((doc) => {
    assert.deepEqual([...doc.querySelectorAll("[data-promise-strip] strong")].map((title) => title.textContent),
      ["Fully customisable", "Crafted in Delhi", "Warranty: One year", "Delivery across India"]);
  }, { ...product, sourceDetails: { details: null, materials: null, dimensions: null, careInstructions: null, warranty: "One year" } } as Product);
});

test("customer reviews invite a review without inventing any", async () => {
  await mount((doc) => {
    const reviews = doc.querySelector("#product-reviews")!;
    assert.equal(reviews.querySelector("h2")?.textContent, "Customer reviews");
    assert.equal(text(reviews.querySelector("p")), "No reviews yet. Share your experience with this piece.");
    const write = reviews.querySelector<HTMLAnchorElement>("a")!;
    assert.equal(write.textContent, "Write a review");
    assert.match(write.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero\+Dining\+Chair/);
  }, product, { reviewLabel: "No reviews" });
});

test("without a review count, the reviews block says reviews are not shown here yet", async () => {
  await mount((doc) => {
    assert.equal(text(doc.querySelector("#product-reviews p")), "Customer reviews are not shown on this storefront yet. Share your experience with this piece.");
  }, product, { reviewLabel: null });
});

test("related pieces use the shared section heading and name the category", () => {
  const card = toProductCard({ ...product, id: "beno", handle: "beno", title: "Beno" });
  const html = new JSDOM(renderToStaticMarkup(<ShopProvider><RelatedProducts products={[card]} category="chairs" /></ShopProvider>)).window.document;
  assert.equal(html.querySelector("[data-related] [data-section-eyebrow]")?.textContent, "You may also like");
  assert.equal(html.querySelector("[data-related] h2")?.textContent, "More chairs to explore");
});
