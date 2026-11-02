import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product, ProductCard, ProductPage, ProductSpecs, VariantProductPage } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { bundleHandles, bundlePieces, specLines } from "../lib/product-page-data";
import { productStructuredData, seoSettings } from "../lib/seo";

// Keeri's product-page data on the page (Keeri docs/shopmaple-product-page.md). Synthetic test values only.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/demo-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const photo = (name: string) => `https://store.maplefurnishers.com/media/keeri/${name}.webp`;
const noSpecs: ProductSpecs = { widthCm: null, depthCm: null, heightCm: null, seatHeightCm: null, weightKg: null };
const variantPage = (batch: VariantProductPage["batch"], specs = noSpecs): VariantProductPage => ({ specs, copy: { description: null, details: null, materials: null, dimensions: null, careInstructions: null }, batch, options: [] });
const page: ProductPage = {
  specs: { widthCm: 52.5, depthCm: 56, heightCm: 81, seatHeightCm: 46, weightKg: 6.5 },
  highlights: ["Solid wood frame", "Choose your fabric", "Hand-finished"],
  faq: [{ question: "Can I choose a different fabric?", answer: "Yes, from the swatches on this page." }, { question: "What warranty do I get?", answer: "36 months, as for every Maple piece." }],
  assembly: { required: true, minutes: 20 },
  customisation: { options: ["fabric"], note: null },
  rooms: [],
  reviews: { average: 4.5, count: 2, items: [
    { id: "r1", rating: 5, title: "Sturdy and comfortable", body: "Synthetic review text one.", reviewerName: "Asha", city: "Jaipur", reviewedAt: "2026-10-20", source: "online_order", verifiedBuyer: true, variantId: "grey", photos: [{ id: "p1", url: "https://store.maplefurnishers.com/media/keeri-review/p1.webp", width: 800, height: 600 }] },
    { id: "r2", rating: 4, title: "Good finish", body: "Synthetic review text two.", reviewerName: "Ravi", city: null, reviewedAt: "2026-09-01", source: "showroom", verifiedBuyer: false, variantId: null, photos: [] },
  ] },
  media: [
    { url: photo("grey-cutout"), variantId: "grey", role: "cutout", width: 1600, height: 1200, altText: "Demo chair in grey", realPhoto: false, hotspots: [
      { x: 0.48, y: 0.31, label: "Fabric", text: "Ash Grey boucle, removable cover.", type: "fabric" },
      { x: 0.31, y: 0.82, label: "Legs", text: "Solid oak, oil finish.", type: "material" },
    ] },
  ],
  bundles: [{ id: "set", name: "Dining set", description: "A chair and its table.", items: [
    { productId: "demo", handle: "demo-chair", variantId: null, quantity: 4 },
    { productId: "table", handle: "demo-table", variantId: null, quantity: 1 },
  ] }],
};
const demo: Product = {
  id: "demo", handle: "demo-chair", title: "Demo Chair", description: "A demo chair.", category: "chairs", published: true, source: "keeri:maple", sourceUpdatedAt: "2026-11-01T00:00:00Z",
  images: [photo("grey-cutout"), photo("grey-1"), photo("oak-1")],
  sourceDetails: { details: "About the chair.", materials: null, dimensions: "Width 52 cm (free text)", careInstructions: null, warranty: null },
  productPage: page,
  variants: [
    { id: "grey", title: "Ash Grey", sku: "G", pricePaise: 1_250_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: [photo("grey-1")], slug: "ash-grey", productPage: variantPage({ remaining: 3, showAtOrBelow: 5 }) },
    { id: "oak", title: "Natural Oak", sku: "O", pricePaise: 1_300_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: [photo("oak-1")], slug: "natural-oak", productPage: variantPage({ remaining: 9, showAtOrBelow: 5 }, { ...noSpecs, widthCm: 60 }) },
  ],
};
const table: ProductCard = { id: "table", handle: "demo-table", title: "Demo Table", image: photo("table"), pricePaise: 4_500_000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: "tables", optionNames: [], optionThumbs: [] };

async function mount(check: (doc: Document) => void | Promise<void>, value: Product = demo, cards: ProductCard[] = [table], variant = "ash-grey") {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  window.history.replaceState(null, "", `/products/demo-chair?variant=${variant}`);
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} initialVariant={variant} bundleCards={cards} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const click = (element: Element) => act(async () => { (element as HTMLElement).click(); });

test("the finish's white-background photo from Keeri leads the gallery, with Keeri's own notes on it", async () => {
  await mount(async (doc) => {
    assert.match(decodeURIComponent(doc.querySelector("[data-main-image] img")!.getAttribute("src")!), /grey-cutout\.webp/);
    const markers = [...doc.querySelectorAll<HTMLButtonElement>("button[data-hotspot]")];
    assert.deepEqual(markers.map((m) => m.getAttribute("aria-label")), ["Fabric", "Legs"]);
    await click(markers[0]!);
    assert.equal(text(doc.querySelector("[data-hotspot-note]")), "Fabric Ash Grey boucle, removable cover.");
  });
});

test("Keeri's average and count rate the piece, and each approved review shows, verified only when Keeri says so", async () => {
  await mount((doc) => {
    assert.match(text(doc.querySelector("[data-price-block] [data-rating]"))!, /^4\.5/);
    assert.match(text(doc.querySelector("[data-rating-summary]"))!, /4\.5.*2 reviews/);
    const cards = [...doc.querySelectorAll("[data-review]")];
    assert.equal(cards.length, 2);
    assert.match(text(cards[0])!, /Sturdy and comfortable.*Synthetic review text one\..*Asha, Jaipur.*Verified buyer.*October 2026/);
    assert.equal(cards[1]!.querySelector("[data-verified]"), null);
    assert.match(decodeURIComponent(cards[0]!.querySelector("img")!.getAttribute("src")!), /keeri-review\/p1\.webp/);
  });
});

test("a product nobody has reviewed in Keeri says so, with no cards and no invented rating", async () => {
  await mount((doc) => {
    assert.equal(text(doc.querySelector("[data-rating-empty]")), "No reviews yet");
    assert.equal(doc.querySelectorAll("[data-review]").length, 0);
    assert.ok(doc.querySelector("[data-reviews-note]"));
  }, { ...demo, productPage: { ...page, reviews: { average: null, count: 0, items: [] } } });
});

test("'Only N left' shows for a batch at or below its threshold, and not for one above it", async () => {
  await mount((doc) => assert.equal(text(doc.querySelector("[data-batch] p")), "Only 3 left in this batch"));
  await mount((doc) => assert.equal(doc.querySelector("[data-batch]"), null), demo, [table], "natural-oak");
});

test("measured specifications replace the free-text dimensions, using this finish's own measurement first", () => {
  assert.deepEqual(specLines(demo, demo.variants[0]), ['Width: 52.5 cm (≈ 20.7")', 'Depth: 56 cm (≈ 22")', 'Height: 81 cm (≈ 31.9")', 'Seat height: 46 cm (≈ 18.1")', "Weight: 6.5 kg", "Assembly: needed, about 20 min"]);
  assert.equal(specLines(demo, demo.variants[1])[0], 'Width: 60 cm (≈ 23.6")');
  assert.deepEqual(specLines({ ...demo, productPage: null }, demo.variants[0]), []);
});

test("the product's own questions lead the FAQ, and a general question it repeats appears once", async () => {
  await mount((doc) => {
    const questions = [...doc.querySelectorAll("[data-faq-item] summary")].map(text);
    assert.equal(questions[0], "Can I choose a different fabric?");
    assert.equal(questions[1], "What warranty do I get?");
    assert.equal(questions.filter((q) => q === "What warranty do I get?").length, 1);
  });
});

test("a bundle shows its pieces, links the others, and totals only when every piece has one price", async () => {
  await mount((doc) => {
    assert.match(text(doc.querySelector("[data-complete-look]"))!, /Complete the look.*Demo Table/);
    assert.equal(doc.querySelector("[data-complete-look] a")!.getAttribute("href"), "/products/demo-table");
    assert.equal(doc.querySelectorAll("[data-bundle-piece]").length, 2);
    // 4 chairs at Rs. 12,500 and 1 table at Rs. 45,000; Keeri adds no bundle discount.
    assert.equal(text(doc.querySelector("[data-bundle-total]")), "Rs. 95,000.00");
  });
  const fromPrice = bundlePieces(page.bundles[0]!, demo, demo.variants[0], [{ ...table, priceFrom: true, optionCount: 3 }]);
  assert.equal(fromPrice!.totalPaise, null);
  assert.equal(bundlePieces(page.bundles[0]!, demo, demo.variants[0], []), null, "a piece the catalogue cannot show leaves the bundle out");
  assert.deepEqual(bundleHandles(demo), ["demo-table"]);
});

test("search engines get Keeri's real rating and reviews, and nothing for a product without any", () => {
  const settings = seoSettings({ SEO_INDEXING: "on" } as never);
  const rated = productStructuredData(settings, demo) as { aggregateRating?: { ratingValue: number; reviewCount: number }; review?: unknown[] };
  assert.deepEqual([rated.aggregateRating?.ratingValue, rated.aggregateRating?.reviewCount, rated.review?.length], [4.5, 2, 2]);
  const unrated = productStructuredData(settings, { ...demo, productPage: null }) as Record<string, unknown>;
  assert.equal("aggregateRating" in unrated, false);
});
