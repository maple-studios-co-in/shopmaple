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
import { otherPieces } from "../lib/product-related";
import { warrantyLabel } from "../components/store/product-assurances";

// "1440w light" (Figma nTEPXzov9IuWraGF0Ace6V, node 999:3): the product page the owner chose.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A considered silhouette for a welcoming place at the table.", category: "chairs",
  images: ["https://example.com/aero-1.jpg", "https://example.com/aero-2.jpg", "https://example.com/aero-3.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  sourceDetails: { details: "Solid wood frame with a woven seat.", materials: "Oak frame, boucle seat.", dimensions: "Width 56 cm\nDepth 61 cm", careInstructions: "Dust weekly.", warranty: null },
  variants: [
    { id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, stockPolicy: "stocked" },
    { id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: true, stockPolicy: "stocked" },
  ],
};
const highlights: ProductHighlights = { swatches: [], products: [{ handle: "aero-dining-chair", isNew: true, rating: { value: 4.6, count: 12 } }] };
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
type Mount = { highlights?: ProductHighlights; fetcher?: typeof fetch; push?: (href: string) => void; checkoutEnabled?: boolean };
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = product, options: Mount = {}) {
  const previous = globalThis.fetch;
  globalThis.fetch = options.fetcher ?? (async () => Response.json({ ...empty, checkoutEnabled: options.checkoutEnabled ?? false }));
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push: options.push ?? (() => {}), replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ProductHighlightsProvider value={options.highlights}><ShopProvider>
      <ProductDetail product={value} />
    </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const hook = (doc: Document, name: string) => doc.querySelector(`[${name}]`);

test("the buy box shows the title, price, discount, struck-out price, rating and New chip only from product data", async () => {
  await mount((doc) => {
    const info = hook(doc, "data-product-info")!;
    assert.equal(info.querySelector("h1")?.textContent, "Aero Dining Chair");
    assert.equal(text(info.querySelector("[data-price]")), "Rs. 23,600.00");
    assert.equal(text(info.querySelector("[data-discount]")), "13%OFF", "(27,140 − 23,600) / 27,140 = 13.04 %");
    assert.equal(text(info.querySelector("[data-was]")), "Was Rs. 27,140.00");
    assert.equal(info.querySelector("[data-was] del")?.textContent, "Rs. 27,140.00");
    assert.equal(text(info.querySelector("[data-rating]")), "4.6");
    assert.equal(text(info.querySelector("[data-chip='new']")), "New");
    assert.equal(info.querySelector("[data-description]")?.textContent, "A considered silhouette for a welcoming place at the table.");
  }, product, { highlights });
});

test("what the frame shows without data behind it is left out: vendor, countdown, code, stock, pickup, absent rating", async () => {
  await mount((doc) => {
    const page = hook(doc, "data-product-page")!;
    const info = hook(doc, "data-product-info")!;
    assert.equal(info.querySelector("[data-rating]"), null, "No staff-entered rating, no number");
    assert.equal(info.querySelector("[data-chip='new']"), null);
    for (const hookName of ["data-countdown", "data-stock", "data-pickup", "data-vendor"]) assert.equal(hook(doc, hookName), null, hookName);
    assert.doesNotMatch(page.textContent!, /in stock|Pickup available|SALE30|NEW20|ChicAura|Don.t miss the deal|\$\s?100/i);
    assert.doesNotMatch(page.textContent!, /\b435\b|Name Here|Verified Customer|FlexCore|Free Shipping|30 days return|2-Year Warranty|14 days|24\/7/i);
    assert.equal(hook(doc, "data-rating-summary"), null, "The reviews band shows no rating summary without real ratings");
  });
});

test("finish options are photo tiles under a label naming the chosen finish, with the customisation link outside the group", async () => {
  await mount(async (doc) => {
    const group = hook(doc, "data-variants")!;
    assert.equal(text(group.querySelector("legend")), "Finish: Deep Atlantic");
    assert.deepEqual([...group.querySelectorAll("label")].map(text), ["Deep Atlantic", "Desert Taupe"]);
    const link = doc.querySelector<HTMLAnchorElement>("a[data-customization]")!;
    assert.equal(text(link), "Customisation available");
    assert.match(link.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero\+Dining\+Chair&variant=Deep\+Atlantic/);
    assert.equal(group.contains(link), false);
    await act(async () => group.querySelectorAll<HTMLInputElement>("input")[1]!.click());
    assert.equal(text(group.querySelector("legend")), "Finish: Desert Taupe");
    assert.match(dom.window.location.search, /variant=/, "The chosen option stays in the address");
  });
});

test("purchase row: quantity, Add to cart and a second action that follows whether checkout is on", async () => {
  await mount((doc) => {
    const purchase = hook(doc, "data-purchase")!;
    assert.equal(purchase.querySelector("button[data-primary]")?.textContent, "Add to cart");
    assert.equal(purchase.querySelector("output")?.textContent, "1");
    assert.ok(purchase.querySelector('[aria-label="Increase quantity"]'));
    assert.equal(doc.querySelector("button[data-buy-now]"), null, "No Buy it now while online checkout is off");
    const enquire = doc.querySelector<HTMLAnchorElement>("a[data-enquire]")!;
    assert.equal(text(enquire), "Enquire about this piece");
    assert.match(enquire.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero\+Dining\+Chair/);
  });
  const pushed: string[] = [];
  const writes: string[] = [];
  await mount(async (doc) => {
    await act(async () => {});
    const buy = doc.querySelector<HTMLButtonElement>("button[data-buy-now]")!;
    assert.equal(buy.textContent, "Buy it now");
    await act(async () => buy.click());
    assert.deepEqual(writes, ["/api/cart/items/atlantic"], "Buy it now adds the chosen option once");
    assert.deepEqual(pushed, ["/checkout"]);
  }, product, {
    checkoutEnabled: true,
    push: (href) => { pushed.push(href); },
    fetcher: async (url, init) => {
      if (init?.method !== "PUT") return Response.json({ ...empty, checkoutEnabled: true });
      const body = JSON.parse(String(init.body));
      writes.push(String(url));
      return Response.json({ ...empty, checkoutEnabled: true, mutationContext: { ...empty.mutationContext, revision: 1 }, mutationResult: { id: body.mutation.id, status: "applied" } });
    },
  });
});

test("assurances state only what the store's policies support", async () => {
  await mount((doc) => {
    assert.deepEqual([...doc.querySelectorAll("[data-assurances] li")].map(text), ["Delivery across India", "Defects and transit damage", "36-month warranty"]);
  });
  await mount((doc) => {
    assert.equal(text(doc.querySelectorAll("[data-assurances] li")[2]), "One year warranty", "The product's own warranty replaces the store-wide one");
    assert.match(text(hook(doc, "data-ticker"))!, /One year warranty/);
  }, { ...product, sourceDetails: { ...product.sourceDetails!, warranty: "One year" } });
});

test("Ask a question opens an enquiry about the piece, and Share stays a real control", async () => {
  await mount((doc) => {
    assert.equal(text(hook(doc, "data-shipping-note")), "Shipping is charged separately and quoted before you confirm your order.");
    const ask = doc.querySelector<HTMLAnchorElement>("a[data-ask]")!;
    assert.equal(text(ask), "Ask a question");
    assert.match(ask.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero\+Dining\+Chair/);
    assert.ok(doc.querySelector("button[data-share]"));
  });
});

test("the gallery keeps its thumbnails, status and previous / next controls at every width", async () => {
  await mount((doc) => {
    const gallery = hook(doc, "data-gallery")!;
    assert.equal(gallery.querySelectorAll("[data-thumbnails] button").length, 3);
    assert.equal(text(gallery.querySelector("[data-gallery-status]")), "Photo 1 of 3");
    const controls = gallery.querySelector("[data-gallery-controls]")!;
    assert.ok(controls.querySelector('button[aria-label="Previous product image"]'));
    assert.ok(controls.querySelector('button[aria-label="Next product image"]'));
  });
});

test("Precision in Every Detail pairs three expandable cards with a second photo of the piece", async () => {
  await mount(async (doc) => {
    const section = hook(doc, "data-features")!;
    assert.equal(text(section.querySelector("h2")), "Precision in Every Detail");
    assert.equal(text(section.querySelector("[data-features-intro]")), "Crafted in Delhi, made to order and fully customisable.");
    const cards = [...section.querySelectorAll("[data-feature]")];
    assert.deepEqual(cards.map((card) => text(card.querySelector("h3"))), ["About Product", "Specification", "Material & Care"]);
    const toggles = cards.map((card) => card.querySelector<HTMLButtonElement>("button[aria-expanded]")!);
    assert.deepEqual(toggles.map((toggle) => toggle.getAttribute("aria-expanded")), ["false", "false", "false"]);
    assert.equal(text(cards[0]!.querySelector("[data-feature-body]")), "Solid wood frame with a woven seat.");
    assert.equal(cards[1]!.querySelector("[data-feature-body]")?.textContent, "Width 56 cm\nDepth 61 cm");
    assert.equal(text(cards[2]!.querySelector("[data-feature-body]")), "Oak frame, boucle seat. Dust weekly.");
    await act(async () => toggles[1]!.click());
    assert.equal(toggles[1]!.getAttribute("aria-expanded"), "true");
    assert.equal(cards[1]!.getAttribute("data-open"), "true");
    assert.equal(cards[0]!.getAttribute("data-open"), "false", "Cards open independently");
    assert.equal(section.querySelector<HTMLImageElement>("[data-feature-photo] img")?.getAttribute("alt"), "Aero Dining Chair — detail view");
    assert.match(section.querySelector<HTMLImageElement>("[data-feature-photo] img")!.getAttribute("src")!, /aero-2\.jpg/, "The second photo of the piece");
  });
});

test("feature cards without catalogue text are left out, and the About card falls back to the description", async () => {
  await mount((doc) => {
    const cards = [...doc.querySelectorAll("[data-feature]")];
    assert.deepEqual(cards.map((card) => text(card.querySelector("h3"))), ["About Product"]);
    assert.equal(text(cards[0]!.querySelector("[data-feature-body]")), "A considered silhouette for a welcoming place at the table.");
  }, { ...product, sourceDetails: null });
  await mount((doc) => {
    assert.equal(hook(doc, "data-features"), null, "No text and no photos, no section");
  }, { ...product, description: "", sourceDetails: null, images: [] });
});

test("the banner uses Maple's own static photo and the store's promises instead of the frame's fabric claims", async () => {
  await mount((doc) => {
    const banner = hook(doc, "data-banner")!;
    assert.match(banner.querySelector("img")!.getAttribute("src")!, /^\/product-page\/banner\.jpg/);
    assert.equal(text(banner.querySelector("h2")), "Crafted in Delhi. Made to order.");
    assert.equal(text(banner.querySelector("p")), "In our own workshop, and backed by our warranty.");
    assert.equal(banner.querySelector("button, video"), null, "The frame's play button has no video behind it");
  });
});

test("the ticker names the warranty and the store's promises, and is readable without motion", async () => {
  await mount((doc) => {
    const ticker = hook(doc, "data-ticker")!;
    assert.deepEqual([...ticker.querySelectorAll("[data-ticker-item]")].slice(0, 4).map(text), ["36-month warranty", "Crafted in Delhi", "Fully customisable", "Delivery across India"]);
    assert.equal(ticker.querySelector("[data-ticker-copy]")?.textContent, "36-month warranty. Crafted in Delhi. Fully customisable. Delivery across India.");
    assert.equal(ticker.querySelector("[data-ticker-track]")?.getAttribute("aria-hidden"), "true", "The moving copy is decoration");
  });
});

test("Hear From Them shows the real rating and count, invites a review and shows no invented reviews", async () => {
  await mount((doc) => {
    const band = hook(doc, "data-reviews")!;
    assert.equal(band.id, "product-reviews");
    assert.equal(text(band.querySelector("h2")), "Hear From Them");
    assert.equal(text(band.querySelector("[data-rating-summary]")), "4.6 12 reviews");
    assert.equal(band.querySelectorAll("[data-rating-summary] [data-star]").length, 5);
    const write = band.querySelector<HTMLAnchorElement>("a[data-write-review]")!;
    assert.equal(text(write), "Write a review");
    assert.match(write.getAttribute("href") ?? "", /^\/pages\/contact\?product=Aero\+Dining\+Chair/);
    assert.equal(band.querySelector("[data-review-card]"), null, "The catalogue holds no customer review text");
  }, product, { highlights });
  await mount((doc) => {
    assert.equal(text(hook(doc, "data-reviews-note")), "No reviews to show yet. Share your experience with this piece.");
  });
});

test("the FAQ answers from the store's published policies and opens one question at a time", async () => {
  await mount(async (doc) => {
    const faq = hook(doc, "data-faq")!;
    assert.equal(text(faq.querySelector("h2")), "Frequently asked questions");
    const items = [...faq.querySelectorAll<HTMLDetailsElement>("[data-faq-item]")];
    assert.deepEqual(items.map((item) => text(item.querySelector("summary"))), [
      "How long does delivery take?", "Is shipping included in the price?", "Can I cancel, return or exchange my order?", "What warranty do I get?", "Can I customise the finish or size?", "Do you deliver across India?",
    ]);
    assert.match(text(items[0]!)!, /made to order/i);
    assert.match(text(items[1]!)!, /charged separately.*before you confirm/i);
    assert.match(text(items[2]!)!, /manufacturing defects.*transit damage.*24–48 hours/i);
    assert.match(text(items[3]!)!, /36 months/);
    const contact = faq.querySelector<HTMLAnchorElement>("a[data-faq-contact]")!;
    assert.equal(text(contact), "Contact us");
    assert.equal(contact.getAttribute("href"), "/pages/contact");
    await act(async () => { items[2]!.querySelector("summary")!.click(); items[2]!.open = true; items[2]!.dispatchEvent(new dom.window.Event("toggle")); });
    assert.deepEqual(items.map((item) => item.open), [false, false, true, false, false, false]);
    await act(async () => { items[4]!.open = true; items[4]!.dispatchEvent(new dom.window.Event("toggle")); });
    assert.deepEqual(items.map((item) => item.open), [false, false, false, false, true, false], "Opening another question closes the first");
  });
});

test("the promise row keeps to promises the store can keep", async () => {
  await mount((doc) => {
    const row = hook(doc, "data-promises")!;
    assert.deepEqual([...row.querySelectorAll("li")].map((item) => text(item.querySelector("strong"))), ["Delivery across India", "Defects and transit damage", "Customer service"]);
    assert.match(text(row)!, /Report within 24–48 hours of delivery/);
    assert.doesNotMatch(text(row)!, /secure checkout|free shipping|hassle/i);
  });
});

test("the enquiry form sends a project enquiry about this piece through the enquiry service", async () => {
  const sent: any[] = [];
  await mount(async (doc) => {
    const section = hook(doc, "data-enquiry")!;
    assert.equal(text(section.querySelector("h2")), "Have a Space in Mind?");
    const form = section.querySelector("form")!;
    const set = (name: string, value: string) => {
      const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
      const prototype = field instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    };
    await act(async () => { set("name", "Asha"); set("email", "asha@example.com"); set("phone", "9811000000"); set("message", "A study with two chairs"); });
    await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => {});
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { kind: "project", name: "Asha", email: "asha@example.com", phone: "9811000000", message: "A study with two chairs", context: { product: "Aero Dining Chair", variant: "Deep Atlantic", sku: "AERO-A", pincode: "" } });
    assert.match(text(section.querySelector("[role='status']"))!, /^Your enquiry has been saved\. Reference: enq_/);
  }, product, {
    fetcher: async (url, init) => {
      if (String(url) !== "/api/enquiries") return Response.json(empty);
      sent.push(JSON.parse(String(init!.body)));
      return Response.json({ reference: "enq_" + "a".repeat(8) + "-" + "b".repeat(4) + "-" + "c".repeat(4) + "-" + "d".repeat(4) + "-" + "e".repeat(12), mode: "preview", notificationSent: false }, { status: 201 });
    },
  });
});

test("sections follow the frame's order, and the visible breadcrumb is gone", async () => {
  await mount((doc) => {
    const order = ["data-product-info", "data-features", "data-banner", "data-ticker", "data-reviews", "data-faq", "data-promises", "data-enquiry"];
    const nodes = order.map((name) => hook(doc, name)!);
    nodes.forEach((node, i) => assert.ok(node, order[i]));
    for (let i = 1; i < nodes.length; i++) assert.equal(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING, `${order[i - 1]} before ${order[i]}`);
    assert.equal(hook(doc, "data-breadcrumb"), null);
  });
});

test("related pieces sit under the frame's own heading", () => {
  const card = toProductCard({ ...product, id: "beno", handle: "beno", title: "Beno" });
  const html = new JSDOM(renderToStaticMarkup(<ShopProvider><RelatedProducts products={[card]} /></ShopProvider>)).window.document;
  assert.equal(html.querySelector("[data-related] h2")?.textContent, "You may also like");
  assert.equal(html.querySelectorAll("[data-related] [data-product-card]").length, 1);
});

test("the related row holds other pieces only, in order, at most four", () => {
  const cards = ["a", "own", "b", "c", "d", "e"].map((id) => ({ id }));
  assert.deepEqual(otherPieces(cards, { id: "own" }).map((card) => card.id), ["a", "b", "c", "d"]);
  assert.deepEqual(otherPieces(cards.slice(0, 2), { id: "own" }).map((card) => card.id), ["a"]);
});

test("the warranty label reads well for short, self-describing and long catalogue text, and falls back to the store's 36 months", () => {
  const label = (warranty: string | null) => warrantyLabel({ sourceDetails: { details: null, materials: null, dimensions: null, careInstructions: null, warranty } });
  assert.equal(label("36 Months"), "36 Months warranty");
  assert.equal(label("1 year warranty"), "1 year warranty");
  assert.equal(label("Covers the frame for five years and the upholstery for two, excluding wear and tear from daily use."), "Product warranty");
  assert.equal(label("  "), "36-month warranty");
  assert.equal(label(null), "36-month warranty");
  assert.equal(warrantyLabel({ sourceDetails: null }), "36-month warranty");
});

test("the ticker can be paused, a photo without cards shows no feature section, and the warranty text sits in the Specification card", async () => {
  await mount(async (doc) => {
    const pause = doc.querySelector<HTMLButtonElement>("button[data-ticker-pause]")!;
    assert.equal(pause.getAttribute("aria-pressed"), "false");
    await act(async () => pause.click());
    assert.equal(pause.getAttribute("aria-pressed"), "true");
    assert.equal(hook(doc, "data-ticker-track")!.getAttribute("style")?.includes("paused"), true);
  });
  await mount((doc) => assert.equal(hook(doc, "data-features"), null), { ...product, description: "", sourceDetails: null });
  await mount(async (doc) => {
    const spec = doc.querySelectorAll("[data-feature]")[1]!;
    assert.equal(spec.querySelector("[data-feature-meta]"), null, "Collapsed, the card shows no extras");
    await act(async () => spec.querySelector<HTMLButtonElement>("button[aria-expanded]")!.click());
    assert.equal(text(spec.querySelector("[data-feature-meta]")), "Warranty: Covers the frame for five years and the upholstery for two, excluding wear and tear from daily use.");
    assert.equal(text(doc.querySelectorAll("[data-assurances] li")[2]), "Product warranty");
  }, { ...product, sourceDetails: { ...product.sourceDetails!, warranty: "Covers the frame for five years and the upholstery for two, excluding wear and tear from daily use." } });
});
