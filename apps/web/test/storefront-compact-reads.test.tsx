import assert from "node:assert/strict";
import test from "node:test";
import React, { Children, isValidElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import ProductPage from "../app/products/[handle]/page";
import { CategoryLanding, CategoryProducts } from "../components/category-landing";
import { CategoryRail } from "../components/store/category-landing";
import { NimbusLanding } from "../components/category-nimbus";
import { ShopProvider } from "../components/shop-provider";
import { ProductCard } from "../components/product-card";
import { RelatedProducts } from "../components/store/related-products";
import { ProductDetail } from "../components/product-detail";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultCategoryPages } from "../lib/category-content-defaults";
import { resolveNimbusPageContent } from "../lib/nimbus-content-defaults";
import categories from "../data/landing-categories.json";
import nimbus from "../data/landing-nimbus.json";
import source from "../data/landing-catalog.json";

const card = (handle: string) => ({ id: handle, handle, title: `Live ${handle}`, image: "https://example.com/chair.jpg", pricePaise: 1234500, compareAtPaise: 1500000, priceFrom: true, otherOptionsOnRequest: true, optionCount: 2, category: null, optionNames: [] as string[] });
const product = (handle: string) => ({ id: handle, handle, title: `Live ${handle}`, description: "Full detail description", category: "chairs", images: ["https://example.com/chair.jpg", "https://example.com/gallery.jpg"], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: "one", title: "Oak", sku: "ONE", pricePaise: 1234500, compareAtPaise: 1500000, available: true, stockPolicy: "stocked" }, { id: "two", title: "Custom", sku: null, pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" }] });
let fixtureId = 0;
async function fixture(run: (requests: URL[]) => Promise<void>, options: { content?: typeof defaultStorefrontContent; missing?: string[]; broken?: string[]; unavailable?: boolean; related?: string[]; cardsGate?: Promise<void> } = {}) {
  const previousFetch = globalThis.fetch;
  const previousApi = process.env.API_URL;
  process.env.API_URL = `http://storefront-compact-${++fixtureId}.test`;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 1, content: options.content ?? defaultStorefrontContent });
    if (url.pathname === "/api/catalogue/cards") {
      await options.cardsGate;
      const handles = url.searchParams.get("handles")!.split(",");
      if (options.unavailable || handles.some(h => options.broken?.includes(h))) return new Response(null, { status: 503 });
      return Response.json({ products: handles.filter(h => !options.missing?.includes(h)).map(card), published: true });
    }
    if (url.pathname === "/api/catalogue/related") return Response.json({ category: "chairs", products: (options.related ?? []).map(card), published: true });
    if (url.pathname.startsWith("/api/products/")) {
      const handle = url.pathname.split("/").at(-1)!;
      if (options.broken?.includes(handle)) return new Response(null, { status: 503 });
      if (options.missing?.includes(handle)) return new Response(null, { status: 404 });
      return Response.json(product(handle));
    }
    if (url.pathname === "/api/products") {
      if (options.unavailable) return new Response(null, { status: 503 });
      const handles = url.searchParams.has("category") ? options.related ?? [] : [...Object.keys(source), "live-chair"];
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
  return new JSDOM(await new Response(await renderToReadableStream(<ShopProvider>{node}</ShopProvider>)).text()).window.document;
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
const links = (doc: Document) => [...doc.querySelectorAll("[data-card-name]")].map(n => n.getAttribute("href"));

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
    assert.deepEqual(requests.filter(u => u.pathname !== "/api/content/storefront").map(u => u.pathname + u.search), ["/api/catalogue/cards?handles=second%2Cfirst", "/api/catalogue/cards?handles=chair-two%2Cchair-one"]);
  }, { content: railContent() });
  const content = railContent();
  content.homeMerchandising!.bestsellers = ["second", "broken", "first"];
  await fixture(async requests => {
    const doc = await documentFor(<Home />);
    assert.deepEqual(links(doc), ["/products/second", "/products/first", "/products/chair-two", "/products/chair-one"]);
    assert.equal(requests.some(u => u.pathname.startsWith("/api/products")), false);
    assert.deepEqual(requests.filter(u => u.pathname === "/api/catalogue/cards").map(u => u.searchParams.get("handles")).sort(), ["second,broken,first", "chair-two,chair-one", "second", "broken", "first"].sort());
  }, { content, broken: ["broken"] });
});

test("hidden or empty homepage rails issue no product requests", async () => {
  const content = railContent();
  content.homeSections = [{ key: "bestsellers", enabled: false }, { key: "chairs", enabled: true }];
  content.homeMerchandising!.chairs = [];
  await fixture(async requests => {
    const doc = await documentFor(<Home />);
    assert.equal(doc.querySelectorAll("[data-catalogue-unavailable]").length, 1);
    assert.deepEqual(requests.map(u => u.pathname), ["/api/content/storefront"]);
  }, { content });
});

test("category parent returns its hero before catalogue loading and all rendered rails share one deferred read", async () => {
  let release!: () => void;
  const cardsGate = new Promise<void>(resolve => { release = resolve; });
  await fixture(async requests => {
    let resolved = false;
    const pendingPage = CategoryLanding({ slug: "sofas" }).then(page => { resolved = true; return page; });
    let pendingDocument: Promise<Document> | undefined;
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(resolved, true, "hero tree must resolve without awaiting the catalogue response");
      assert.equal(requests.filter(u => u.pathname === "/api/catalogue/cards").length, 0, "an abandoned page tree must not start a catalogue request");
      pendingDocument = documentFor(await pendingPage);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(requests.filter(u => u.pathname === "/api/catalogue/cards").length, 1, "all concurrently rendered rails share a single read");
      release();
      const doc = await pendingDocument;
      assert.equal(doc.querySelector("h1")?.textContent, "Sofas");
      assert.equal(doc.querySelectorAll("[data-category-rail]").length, 5);
      assert.ok(doc.querySelectorAll("[data-product-card]").length > 0);
    } finally {
      release();
      await pendingPage;
      await pendingDocument;
    }
  }, { cardsGate });
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
    assert.deepEqual(requests.filter(u => u.pathname !== "/api/content/storefront").map(u => [u.pathname, u.searchParams.get("handles")]), [["/api/catalogue/cards", handles.join(",")]]);
  }, { content });
});

test("standalone category rail preserves source-only enquiry cards and skips unknown handles", async () => {
  const handle = Object.keys(source)[0]!;
  const original = source[handle as keyof typeof source];
  await fixture(async requests => {
    const doc = await documentFor(<CategoryProducts handles={["live-chair", handle, "unknown-chair"]} />);
    assert.deepEqual(links(doc), ["/products/live-chair", `/pages/contact?product=${encodeURIComponent(original.title)}`]);
    assert.equal(doc.querySelector("[data-source-product] [data-card-price]")!.textContent, "Price on request");
    assert.equal(doc.querySelector("[data-source-product] img")!.getAttribute("alt"), original.title);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.pathname, "/api/catalogue/cards");
  }, { missing: [handle, "unknown-chair"] });
});

test("deferred category errors are consumed by every rail without falling back to invented availability", async () => {
  await fixture(async requests => {
    const page = await CategoryLanding({ slug: "sofas" });
    const rails = propsOf(page, CategoryRail);
    assert.equal(rails.length, 5);
    const results = await Promise.allSettled(rails.map(props =>
      CategoryRail(props as Parameters<typeof CategoryRail>[0]),
    ));
    assert.deepEqual(results.map(result => result.status), Array(5).fill("rejected"));
    assert.equal(requests.filter(u => u.pathname === "/api/catalogue/cards").length, 1);
  }, { unavailable: true });
});

test("failed category catalogue remains an error instead of masquerading as source-only stock", async () => {
  await fixture(async () => { await assert.rejects(CategoryProducts({ handles: [Object.keys(source)[0]!] })); }, { unavailable: true });
});

test("Nimbus reads only series handles and hidden series reads none", async () => {
  const handles = nimbus.sections.find(s => s.key === "product_list_fTpw38")!.handles;
  await fixture(async requests => {
    const doc = await documentFor(<NimbusLanding />);
    assert.deepEqual(links(doc), handles.map(h => `/products/${h}`));
    assert.deepEqual(requests.map(u => [u.pathname, u.searchParams.get("handles")]), [["/api/catalogue/cards", handles.join(",")]]);
  });
  const content = resolveNimbusPageContent();
  content.sections.find(s => s.key === "series")!.enabled = false;
  await fixture(async requests => {
    await documentFor(<NimbusLanding content={content} />);
    assert.equal(requests.length, 0);
  });
});

test("PDP retains full main detail and requests five compact related cards before self exclusion", async () => {
  for (const related of [["main", "first", "second", "third", "fourth"], ["first", "second", "third", "fourth", "fifth"]]) {
    await fixture(async requests => {
      const node = await ProductPage({ params: Promise.resolve({ handle: "main" }), searchParams: Promise.resolve({ variant: "one" }) });
      const detail = propsOf(node, ProductDetail)[0]!;
      assert.deepEqual(detail.product, product("main"));
      assert.equal(detail.initialVariant, "one");
      assert.deepEqual(propsOf(node, RelatedProducts).flatMap(p => p.products), ["first", "second", "third", "fourth"].map(card));
      assert.deepEqual(requests.map(u => u.pathname + u.search), ["/api/products/main", "/api/catalogue/related?category=chairs"]);
    }, { related });
  }
});
