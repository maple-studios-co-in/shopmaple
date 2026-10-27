import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

const originalBestsellers = ["aera-swivel-lounge-chair", "aero-dining-chair", "aileron-signature-bed", "aileron-upholstered-bench", "alcyone-7-seater-sofa", "alina-7-seater-sofa"];
const originalChairs = ["caro", "ario", "nola", "tara", "arno", "rollo"];
function product(handle: string, pricePaise = 2360000, published = true) {
  return {
    id: handle, handle, title: `Catalogue ${handle}`, description: "A catalogue product", category: "chairs", images: [], published,
    source: "test-catalogue", sourceUpdatedAt: "2026-10-26T00:00:00Z",
    variants: [{ id: `${handle}-natural`, title: "Natural", sku: handle.toUpperCase(), pricePaise, compareAtPaise: null, available: false, stockPolicy: "unverified" }],
  };
}
const customMerchandising = () => ({
  bestsellers: ["custom-second", "missing-product", "private-product", "broken-product", "custom-first"],
  chairs: ["custom-chair-two", "custom-chair-one"],
  categories: [
    { key: "beds-card", title: "Restful beds", collectionHandle: "beds", image: "https://shop.maplefurnishers.com/cdn/shop/collections/beds.webp?v=2", alt: "A restful bedroom", enabled: true },
    { key: "hidden-card", title: "Hidden sofas", collectionHandle: "sofas", image: "https://shop.maplefurnishers.com/cdn/shop/collections/sofas.webp", alt: "Hidden sofa", enabled: false },
    { key: "chairs-card", title: "Everyday seats", collectionHandle: "dining-chair", image: "https://shop.maplefurnishers.com/cdn/shop/collections/seats.webp", alt: "Handcrafted dining seats", enabled: true },
  ],
  offers: [
    { key: "value-card", title: "Furniture for your room", collectionHandle: "best-buy-under-rs-50-000", image: "https://shop.maplefurnishers.com/cdn/shop/collections/value.webp", alt: "Discover our furniture offer", enabled: true },
    { key: "hidden-offer", title: "Hidden clearance", collectionHandle: "clearance-sale", image: "https://shop.maplefurnishers.com/cdn/shop/collections/clearance.webp", alt: "Hidden offer", enabled: false },
  ],
});
let renderNumber = 0;
async function renderHome({ merchandising, products = Object.fromEntries([...originalBestsellers, ...originalChairs].map(handle => [handle, product(handle)])), sections, copy }: {
  merchandising?: ReturnType<typeof customMerchandising>;
  products?: Record<string, ReturnType<typeof product>>;
  sections?: typeof defaultStorefrontContent.homeSections;
  copy?: { chairsHeading?: string; bestsellersHeading?: string };
} = {}) {
  const content = structuredClone(defaultStorefrontContent);
  if (copy) Object.assign(content.homeCopy, copy);
  delete (content as Record<string, unknown>).homeMerchandising;
  if (merchandising) Object.assign(content, { homeMerchandising: merchandising });
  content.homeSections = sections ?? ["categories", "offers", "bestsellers", "chairs"].map(key => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, revealSections: false };
  const previousFetch = globalThis.fetch;
  const previousApi = process.env.API_URL;
  // Isolate catalogue cache entries while keeping all transport requests in-process.
  process.env.API_URL = `http://merchandising-${++renderNumber}.test`;
  const requests: { url: string; method: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url: url.pathname, method: init?.method ?? "GET" });
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 9, content });
    if (url.pathname === "/api/catalogue/cards") {
      const handles = url.searchParams.get("handles")!.split(",");
      if (handles.includes("broken-product")) return new Response(null, { status: 503 });
      return Response.json({ published: true, products: handles.flatMap(handle => {
        const item = products[handle];
        return item?.published ? [{ id: item.id, handle, title: item.title, image: null,
          pricePaise: item.variants[0]!.pricePaise, compareAtPaise: null,
          priceFrom: false, otherOptionsOnRequest: false, optionCount: 1 }] : [];
      }) });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return { doc: new JSDOM(await new Response(stream).text()).window.document, requests };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApi === undefined) delete process.env.API_URL;
    else process.env.API_URL = previousApi;
  }
}
const texts = (doc: Document, selector: string) => [...doc.querySelectorAll(selector)].map(node => node.textContent?.trim());
const attributes = (doc: Document, selector: string, attribute: string) => [...doc.querySelectorAll(selector)].map(node => node.getAttribute(attribute));

test("both homepage rails expose a visible heading and a context-labelled browse destination even when empty", async () => {
  for (const options of [{}, { merchandising: { bestsellers: [], chairs: [], categories: [], offers: [] } }]) {
    const { doc } = await renderHome(options);
    for (const [key, heading, href] of [["bestsellers", "Bestsellers", "/collections/all"], ["chairs", "Chairs", "/collections/chairs"]]) {
      const rail = doc.querySelector(`[data-home-section="${key}"]`)!;
      assert.equal(rail.querySelector("h2")?.textContent, heading);
      const browse = rail.querySelector("header a");
      assert.equal(browse?.getAttribute("href"), href, "browse action must reach the source collection, not a product or Shopify");
      assert.equal(browse?.getAttribute("aria-label"), `View all ${heading}`);
      assert.equal(browse?.textContent, "View all →");
    }
  }
});

test("published rail headings are used for visible navigation without changing collection destinations", async () => {
  const { doc } = await renderHome({ copy: { chairsHeading: "Your reading nook", bestsellersHeading: "Selected favourites" } });
  assert.equal(doc.querySelector('[data-home-section="chairs"] h2')?.textContent, "Your reading nook");
  assert.equal(doc.querySelector('[data-home-section="chairs"] header a')?.getAttribute("aria-label"), "View all Your reading nook");
  assert.equal(doc.querySelector('[data-home-section="bestsellers"] h2')?.textContent, "Selected favourites");
  assert.equal(doc.querySelector('[data-home-section="bestsellers"] header a')?.getAttribute("href"), "/collections/all");
});

test("category and offer images describe their different responsive slots without changing artwork", async () => {
  const { doc } = await renderHome({ merchandising: customMerchandising() });
  // Categories: two mobile columns, six desktop columns inside a 1440px container.
  assert.deepEqual(attributes(doc, ".home-categories img", "sizes"), Array(2).fill(
    "(max-width:749px) calc((100vw - 52px) / 2), (min-width:1440px) 210px, calc((100vw - 180px) / 6)",
  ));
  // Offers: 70% mobile rail cards, four desktop columns, with existing gaps/padding.
  assert.equal(doc.querySelector(".home-offer-tiles img")?.getAttribute("sizes"),
    "(max-width:749px) calc(70vw - 22.4px), (min-width:1440px) 328px, calc((100vw - 128px) / 4)");
  assert.equal(doc.querySelector(".home-offer-tiles img")?.getAttribute("src"),
    "https://shop.maplefurnishers.com/cdn/shop/collections/value.webp");
});

test("legacy published homepage preserves original collection copy, media, links and both product orders", async () => {
  const { doc } = await renderHome();
  assert.deepEqual(texts(doc, ".home-categories h3"), ["Sofas", "Dining Chair", "Coffee Tables", "Accent Chair", "Beds", "Dinings"]);
  assert.deepEqual(attributes(doc, ".home-categories > a", "href"), ["/collections/sofas", "/collections/dining-chair", "/collections/center-tables", "/collections/accent-chair", "/collections/beds", "/collections/dinings"]);
  assert.deepEqual(attributes(doc, ".home-categories img", "alt"), ["Sofas", "Dining Chair", "Coffee Tables", "Accent Chair", "Beds", "Dinings"]);
  // SVG-wrapped covers resolve to the CDN raster so next/image can resize them (lib/shopify-artwork.ts).
  assert.deepEqual(attributes(doc, ".home-categories img", "src"), [
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_6.webp?width=600",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Dining_Chairs_bac53a57-f5ab-4af0-beec-7ca279851dc3.png?v=1776235600",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_7.webp?width=600",
    "https://shop.maplefurnishers.com/cdn/shop/collections/ChatGPTImageJun18_2025_08_27_31PM.png?v=1776235338",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_8.webp?width=600",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_10.webp?width=600",
  ]);
  assert.deepEqual(attributes(doc, ".home-offer-tiles > a", "href"), ["/collections/clearance-sale", "/collections/minimum-60-off", "/collections/best-buy-under-rs-50-000", "/collections/furniture-store-under-rs-25-000"]);
  assert.deepEqual(attributes(doc, ".home-offer-tiles img", "alt"), ["Clearance Sale", "Minimum 30% Off", "Best Buy Under Rs.50,000", "Furniture Store under Rs. 25,000"]);
  assert.deepEqual(attributes(doc, ".home-offer-tiles img", "src"), [
    "https://shop.maplefurnishers.com/cdn/shop/collections/Clearance_Sale.webp?v=1778257635",
    "https://shop.maplefurnishers.com/cdn/shop/collections/min_30_off_sale_banner.webp?v=1778255612",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Maple_Banner_1.webp?v=1778268771",
    "https://shop.maplefurnishers.com/cdn/shop/collections/Maple_Banner_2.webp?v=1778269923",
  ]);
  assert.deepEqual(attributes(doc, '[data-home-section="bestsellers"] .product-card-name', "href"), ["/products/aera-swivel-lounge-chair", "/products/aero-dining-chair", "/products/aileron-signature-bed", "/products/aileron-upholstered-bench", "/products/alcyone-7-seater-sofa", "/products/alina-7-seater-sofa"]);
  assert.deepEqual(attributes(doc, '[data-home-section="chairs"] .product-card-name', "href"), ["/products/caro", "/products/ario", "/products/nola", "/products/tara", "/products/arno", "/products/rollo"]);
});

test("published tiles follow saved order, visibility, full image URLs and accessible descriptions", async () => {
  const { doc } = await renderHome({ merchandising: customMerchandising(), sections: [
    { key: "offers", enabled: true }, { key: "bestsellers", enabled: false }, { key: "categories", enabled: true },
  ] });
  assert.deepEqual(attributes(doc, ".managed-home-section", "data-home-section"), ["offers", "categories"]);
  assert.deepEqual(texts(doc, ".home-categories h3"), ["Restful beds", "Everyday seats"]);
  assert.deepEqual(attributes(doc, ".home-categories > a", "href"), ["/collections/beds", "/collections/dining-chair"]);
  assert.deepEqual(attributes(doc, ".home-categories img", "src"), ["https://shop.maplefurnishers.com/cdn/shop/collections/beds.webp?v=2", "https://shop.maplefurnishers.com/cdn/shop/collections/seats.webp"]);
  assert.deepEqual(attributes(doc, ".home-categories img", "alt"), ["A restful bedroom", "Handcrafted dining seats"]);
  assert.deepEqual(attributes(doc, ".home-offer-tiles > a", "href"), ["/collections/best-buy-under-rs-50-000"]);
  assert.equal(doc.querySelector(".home-offer-tiles img")?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/collections/value.webp");
  assert.equal(doc.querySelector(".home-offer-tiles img")?.getAttribute("alt"), "Discover our furniture offer");
  assert.equal(doc.querySelector(".product-card"), null);
});

test("published rails preserve product order, omit missing, unavailable and unpublished products, and use catalogue prices", async () => {
  const { doc, requests } = await renderHome({ merchandising: customMerchandising(), products: {
    "custom-first": product("custom-first", 1234500),
    "custom-second": product("custom-second", 4789000),
    "private-product": product("private-product", 9900, false),
    "custom-chair-one": product("custom-chair-one", 850000),
    "custom-chair-two": product("custom-chair-two", 900000),
  } });
  assert.deepEqual(texts(doc, '[data-home-section="bestsellers"] .product-card-name'), ["Catalogue custom-second", "Catalogue custom-first"]);
  assert.deepEqual(texts(doc, '[data-home-section="bestsellers"] .product-card-price'), ["Rs. 47,890.00", "Rs. 12,345.00"]);
  assert.deepEqual(attributes(doc, '[data-home-section="chairs"] .product-card-name', "href"), ["/products/custom-chair-two", "/products/custom-chair-one"]);
  assert.deepEqual(texts(doc, '[data-home-section="chairs"] .product-card-price'), ["Rs. 9,000.00", "Rs. 8,500.00"]);
  assert.ok(requests.every(({ method, url }) => method === "GET" && /^\/api\/(content\/storefront|catalogue\/cards)$/.test(url)), "Rendering only reads published content and catalogue data");
  assert.equal(doc.querySelector('[href="/checkout"], button[name="checkout"]'), null);
});

test("explicitly empty merchandising keeps rails honestly empty without restoring legacy products or tiles", async () => {
  const { doc } = await renderHome({ merchandising: { bestsellers: [], chairs: [], categories: [], offers: [] } });
  assert.equal(doc.querySelectorAll(".product-card, .home-categories > a, .home-offer-tiles > a").length, 0);
  assert.equal(doc.querySelectorAll(".home-catalogue-unavailable").length, 2);
  assert.deepEqual(attributes(doc, ".home-catalogue-unavailable a", "href"), ["/collections/all", "/collections/all"]);
});

test("a rail with no published catalogue products shows the existing unavailable message", async () => {
  const merchandising = customMerchandising();
  merchandising.bestsellers = ["private-product", "missing-product", "broken-product"];
  merchandising.chairs = [];
  const { doc } = await renderHome({ merchandising, products: { "private-product": product("private-product", 90000, false) } });
  assert.equal(doc.querySelectorAll(".product-card").length, 0);
  assert.equal(doc.querySelectorAll(".home-catalogue-unavailable").length, 2);
});
