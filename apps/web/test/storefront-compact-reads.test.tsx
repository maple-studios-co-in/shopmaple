import assert from "node:assert/strict";
import test from "node:test";
import React, { Children, isValidElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import ProductPage from "../app/products/[handle]/page";
import { CategoryLanding, CategoryProducts } from "../components/category-landing";
import { NimbusCollection } from "../components/nimbus-collection";
import { ShopProvider } from "../components/shop-provider";
import { ProductCard } from "../components/product-card";
import { RelatedProducts } from "../components/store/related-products";
import { ProductDetail } from "../components/product-detail";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultCategoryPages } from "../lib/category-content-defaults";
import { nimbusPieceHandles, resolveNimbusPageContent } from "../lib/nimbus-content-defaults";
import categories from "../data/landing-categories.json";

const card = (handle: string) => ({ id: handle, handle, title: `Live ${handle}`, image: "https://example.com/chair.jpg", pricePaise: 1234500, compareAtPaise: 1500000, priceFrom: true, otherOptionsOnRequest: true, optionCount: 2, category: null, optionNames: [] as string[], optionThumbs: [] as never[] });
const product = (handle: string) => ({ id: handle, handle, title: `Live ${handle}`, description: "Full detail description", category: "chairs", images: ["https://example.com/chair.jpg", "https://example.com/gallery.jpg"], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: "one", title: "Oak", sku: "ONE", pricePaise: 1234500, compareAtPaise: 1500000, available: true, stockPolicy: "stocked" }, { id: "two", title: "Custom", sku: null, pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" }] });
// Keeri's product page data holding one bundle staff built (Keeri calls them "Complete the look"), and nothing else.
const keeriPage = (items: { handle: string; quantity: number }[]) => ({
  specs: { widthCm: null, depthCm: null, heightCm: null, seatHeightCm: null, weightKg: null }, highlights: [], faq: [], assembly: null, customisation: null,
  rooms: [], reviews: { average: null, count: 0, items: [] }, media: [],
  bundles: [{ id: "set", name: "Dining set", description: null, items: items.map(({ handle, quantity }) => ({ productId: handle, handle, variantId: null, quantity })) }],
});
let fixtureId = 0;
async function fixture(run: (requests: URL[]) => Promise<void>, options: { content?: typeof defaultStorefrontContent; missing?: string[]; broken?: string[]; unavailable?: boolean; related?: string[]; cardsGate?: Promise<void>; gated?: (handles: string[]) => boolean; bundle?: { handle: string; quantity: number }[] } = {}) {
  const previousFetch = globalThis.fetch;
  const previousApi = process.env.API_URL;
  process.env.API_URL = `http://storefront-compact-${++fixtureId}.test`;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 1, content: options.content ?? defaultStorefrontContent });
    if (url.pathname === "/api/catalogue/cards") {
      const handles = url.searchParams.get("handles")!.split(",");
      if (!options.gated || options.gated(handles)) await options.cardsGate;
      if (options.unavailable || handles.some(h => options.broken?.includes(h))) return new Response(null, { status: 503 });
      return Response.json({ products: handles.filter(h => !options.missing?.includes(h)).map(card), published: true });
    }
    if (url.pathname === "/api/catalogue/related") return Response.json({ category: url.searchParams.get("category"), products: (options.related ?? []).map(card), published: true });
    if (url.pathname.startsWith("/api/products/")) {
      const handle = url.pathname.split("/").at(-1)!;
      if (options.broken?.includes(handle)) return new Response(null, { status: 503 });
      if (options.missing?.includes(handle)) return new Response(null, { status: 404 });
      return Response.json(handle === "main" && options.bundle ? { ...product(handle), productPage: keeriPage(options.bundle) } : product(handle));
    }
    if (url.pathname === "/api/products") {
      if (options.unavailable) return new Response(null, { status: 503 });
      const handles = url.searchParams.has("category") ? options.related ?? [] : ["live-chair"];
      return Response.json({ products: handles.filter(h => !options.missing?.includes(h)).map(product), total: handles.length, page: 1, limit: 50, mode: "preview", checkoutEnabled: false });
    }
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  };
  try { await run(requests); } finally {
    globalThis.fetch = previousFetch;
    if (previousApi === undefined) delete process.env.API_URL; else process.env.API_URL = previousApi;
  }
}
async function documentFor(node: ReactNode) {
  const stream = await renderToReadableStream(<ShopProvider>{node}</ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  // Product rails stream in after the rest of the page (9 Nov 2026); read the finished page in one piece, as a crawler gets it.
  await stream.allReady;
  return new JSDOM(await new Response(stream).text()).window.document;
}
function propsOf(node: ReactNode, type: unknown): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => !isValidElement<Record<string, unknown>>(child) ? [] : child.type === type ? [child.props] : propsOf(child.props.children as ReactNode, type));
}
function railContent() {
  const content = structuredClone(defaultStorefrontContent);
  content.homeSections = [{ key: "bestsellers", enabled: true }, { key: "chairs", enabled: true }];
  content.homeMerchandising = { bestsellers: ["second", "first"], chairs: ["chair-two", "chair-one"], categories: [], offers: [] };
  return content;
}
/** The Keeri products whose photos stand in for the default hero's four stills (no uploads in the default content). */
const heroArtwork = "arbor-sofa,aurevo,altura-table,meridian-table";
const notHeroArtwork = (u: URL) => !(u.pathname === "/api/catalogue/cards" && u.searchParams.get("handles") === heroArtwork);
const links = (doc: Document) => [...doc.querySelectorAll("[data-card-name]")].map(n => n.getAttribute("href"));
/** The Keeri products whose photos a category page's banners and circles show, in page order (data/landing-categories.json). */
const artworkHandles = (slug: keyof typeof categories, hidden: string[] = []) => [...new Set((categories[slug].sections as { type: string; heading?: string; product?: string; items?: { product?: string }[] }[])
  .filter(s => !hidden.includes(s.heading ?? ""))
  .flatMap(s => [...(s.type === "banner" && s.product ? [s.product] : []), ...(s.type === "categories" ? (s.items ?? []).flatMap(i => i.product ? [i.product] : []) : [])]))];
const railHandles = (slug: keyof typeof categories) => (categories[slug].sections as { type: string; handles?: string[] }[]).filter(s => s.type === "products").flatMap(s => s.handles ?? []);

test("characterization: homepage retains rail order, prices and partial success", async () => {
  const content = railContent();
  content.homeMerchandising!.bestsellers = ["second", "missing", "broken", "first"];
  await fixture(async () => {
    const doc = await documentFor(<Home />);
    assert.deepEqual(links(doc), ["/products/second", "/products/first", "/products/chair-two", "/products/chair-one"]);
    assert.match(doc.querySelector("[data-card-price]")!.textContent!, /From Rs. 12,345.00/);
  }, { content, missing: ["missing"], broken: ["broken"] });
});

test("homepage reads one compact batch per enabled rail and recovers only compact singletons after batch failure", async () => {
  await fixture(async requests => {
    const doc = await documentFor(<Home />);
    assert.equal(doc.querySelectorAll("[data-product-card]").length, 4);
    // The hero is not shown here, so its stand-in photos are not read either.
    assert.deepEqual(requests.filter(u => !["/api/content/storefront", "/api/instagram/feed"].includes(u.pathname)).map(u => u.pathname + u.search).sort(), [
      "/api/catalogue/cards?handles=second%2Cfirst", "/api/catalogue/cards?handles=chair-two%2Cchair-one",
    ].sort(), "one batch per rail and nothing for a hidden hero");
  }, { content: railContent() });
  const content = railContent();
  content.homeMerchandising!.bestsellers = ["second", "broken", "first"];
  await fixture(async requests => {
    const doc = await documentFor(<Home />);
    assert.deepEqual(links(doc), ["/products/second", "/products/first", "/products/chair-two", "/products/chair-one"]);
    assert.equal(requests.some(u => u.pathname.startsWith("/api/products")), false);
    assert.deepEqual(requests.filter(u => u.pathname === "/api/catalogue/cards").filter(notHeroArtwork).map(u => u.searchParams.get("handles")).sort(), ["second,broken,first", "chair-two,chair-one", "second", "broken", "first"].sort());
  }, { content, broken: ["broken"] });
});

test("hidden or empty homepage rails issue no product requests", async () => {
  const content = railContent();
  content.homeSections = [{ key: "bestsellers", enabled: false }, { key: "chairs", enabled: true }];
  content.homeMerchandising!.chairs = [];
  await fixture(async requests => {
    const doc = await documentFor(<Home />);
    assert.equal(doc.querySelectorAll(".home-catalogue-unavailable").length, 1);
    assert.deepEqual(requests.filter(notHeroArtwork).map(u => u.pathname).sort(), ["/api/content/storefront", "/api/instagram/feed"], "Only the content, the Instagram feed and the hero's stand-in photos; no rail reads");
  }, { content });
});

test("category parent returns its hero once its artwork photos are read, before the rails' cards, and all rendered rails share one deferred read", async () => {
  let release!: () => void;
  const cardsGate = new Promise<void>(resolve => { release = resolve; });
  const rails = new Set(railHandles("sofas"));
  const railRead = (u: URL) => u.pathname === "/api/catalogue/cards" && u.searchParams.get("handles")!.split(",").every(h => rails.has(h));
  await fixture(async requests => {
    let resolved = false;
    const pendingPage = CategoryLanding({ slug: "sofas" }).then(page => { resolved = true; return page; });
    let pendingDocument: Promise<Document> | undefined;
    try {
      for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(resolved, true, "hero tree must resolve without awaiting the rails' catalogue response");
      assert.deepEqual(requests.filter(u => u.pathname === "/api/catalogue/cards").map(u => u.searchParams.get("handles")), [artworkHandles("sofas").join(",")], "only the banners' and circles' photos were read; an abandoned page tree starts no rail request");
      pendingDocument = documentFor(await pendingPage);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(requests.filter(railRead).length, 1, "all concurrently rendered rails share a single read");
      release();
      const doc = await pendingDocument;
      assert.equal(doc.querySelector("h1")?.textContent, "Sofas");
      assert.equal(doc.querySelectorAll(".landing-products").length, 5);
      assert.ok(doc.querySelectorAll("[data-product-card]").length > 0);
    } finally {
      release();
      await pendingPage;
      await pendingDocument;
    }
  }, { cardsGate, gated: handles => handles.every(h => rails.has(h)) });
});

test("category reads unique visible curated handles once and keeps each rail order", async () => {
  const content = structuredClone(defaultStorefrontContent);
  const page = structuredClone(defaultCategoryPages.find(p => p.slug === "sofas")!);
  page.sections.find(s => s.key === "bedroom-products")!.enabled = false;
  content.landingPages = [page];
  const visible = categories.sofas.sections.filter(s => s.type === "products" && s.heading !== "Bedrooms") as { handles: string[] }[];
  const handles = [...new Set(visible.flatMap(s => s.handles))];
  await fixture(async requests => {
    const doc = await documentFor(<CategoryLanding slug="sofas" />);
    assert.deepEqual(links(doc), visible.flatMap(s => s.handles.map(h => `/products/${h}`)));
    assert.deepEqual(requests.filter(u => u.pathname !== "/api/content/storefront").map(u => [u.pathname, u.searchParams.get("handles")]), [
      ["/api/catalogue/cards", artworkHandles("sofas").join(",")],
      ["/api/catalogue/cards", handles.join(",")],
    ], "one read for the artwork's photos, then one for the rails");
  }, { content });
});

test("standalone category rail shows only the pieces the catalogue lists, with no fallback cards", async () => {
  await fixture(async requests => {
    // sora-5-seater-sofa left the store with Shopify; once it had a "Price on request" card from older data.
    const doc = await documentFor(<CategoryProducts handles={["live-chair", "sora-5-seater-sofa", "unknown-chair"]} />);
    assert.deepEqual(links(doc), ["/products/live-chair"]);
    assert.equal(doc.querySelector(".landing-source-product"), null);
    assert.doesNotMatch(doc.body.textContent ?? "", /Price on request/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.pathname, "/api/catalogue/cards");
  }, { missing: ["sora-5-seater-sofa", "unknown-chair"] });
});

test("deferred category errors are consumed by every rail without falling back to invented availability", async () => {
  await fixture(async requests => {
    const page = await CategoryLanding({ slug: "sofas" });
    const rails = propsOf(page, CategoryProducts);
    assert.equal(rails.length, 5);
    const results = await Promise.allSettled(rails.map(props =>
      CategoryProducts(props as Parameters<typeof CategoryProducts>[0]),
    ));
    assert.deepEqual(results.map(result => result.status), Array(5).fill("rejected"));
    assert.equal(requests.filter(u => u.pathname === "/api/catalogue/cards").length, 2, "the artwork's photo read (which fails quietly) and one shared rail read");
  }, { unavailable: true });
});

test("failed category catalogue remains an error instead of masquerading as source-only stock", async () => {
  await fixture(async () => { await assert.rejects(CategoryProducts({ handles: ["live-chair"] })); }, { unavailable: true });
});

// The Nimbus redesign (Figma 311:548, 10 Nov 2026) reads its edit's eight pieces in one compact batch.
test("Nimbus reads only its edit's handles and a hidden edit reads none", async () => {
  const handles = [...nimbusPieceHandles];
  await fixture(async requests => {
    const doc = await documentFor(<NimbusCollection site={defaultStorefrontContent} />);
    assert.deepEqual([...doc.querySelectorAll("[data-collection-piece] h3 a")].map(n => n.getAttribute("href")), handles.map(h => `/products/${h}`));
    assert.deepEqual(requests.map(u => [u.pathname, u.searchParams.get("handles")]), [["/api/catalogue/cards", handles.join(",")]]);
  });
  const content = resolveNimbusPageContent();
  content.sections.find(s => s.key === "pieces")!.enabled = false;
  await fixture(async requests => {
    await documentFor(<NimbusCollection site={{ ...defaultStorefrontContent, nimbusPage: content }} />);
    assert.equal(requests.length, 0);
  });
});

test("PDP retains full main detail and requests five compact related cards before self exclusion, plus its rooms' cards for Complete the look", async () => {
  for (const related of [["main", "first", "second", "third", "fourth"], ["first", "second", "third", "fourth", "fifth"]]) {
    await fixture(async requests => {
      const node = await ProductPage({ params: Promise.resolve({ handle: "main" }), searchParams: Promise.resolve({ variant: "one" }) });
      const detail = propsOf(node, ProductDetail)[0]!;
      assert.deepEqual(detail.product, product("main"));
      assert.equal(detail.initialVariant, "one");
      assert.deepEqual(propsOf(node, RelatedProducts).flatMap(p => p.products), ["first", "second", "third", "fourth"].map(card));
      assert.deepEqual(requests.map(u => u.pathname + u.search), ["/api/products/main", "/api/catalogue/related?category=chairs", "/api/catalogue/related?category=tables", "/api/catalogue/related?category=sofas"], "and no piece in full for a bundle");
      assert.deepEqual(detail.bundle, [], "Buy in Bundle comes only from a bundle staff built in Keeri, never from pieces the store picks");
      assert.equal(detail.bundleQuantities, undefined);
      assert.deepEqual(detail.completeLook, ["first", "second", "third", "fourth"].map(card), "compact cards, never the piece itself");
    }, { related });
  }
});

test("a bundle staff built in Keeri is the page's Buy in Bundle and leads Complete the look, with Keeri's quantities", async () => {
  await fixture(async requests => {
    const node = await ProductPage({ params: Promise.resolve({ handle: "main" }), searchParams: Promise.resolve({}) });
    const detail = propsOf(node, ProductDetail)[0]!;
    assert.deepEqual(detail.completeLook, ["first", "second"].map(card), "the bundle's other pieces, in Keeri's order");
    assert.deepEqual((detail.bundle as { handle: string }[]).map(piece => piece.handle), ["first", "second"], "read in full for their options and prices");
    assert.deepEqual(detail.bundleQuantities, { main: 4, first: 1, second: 2 });
    assert.deepEqual(requests.map(u => u.pathname), ["/api/products/main", "/api/catalogue/related", "/api/catalogue/cards", "/api/products/first", "/api/products/second"]);
    assert.equal(requests[2]!.searchParams.get("handles"), "first,second");
  }, { related: ["first", "second", "third"], bundle: [{ handle: "main", quantity: 4 }, { handle: "first", quantity: 1 }, { handle: "second", quantity: 2 }] });
});
