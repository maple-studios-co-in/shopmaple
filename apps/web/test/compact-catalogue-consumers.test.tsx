import assert from "node:assert/strict";
import { test } from "node:test";
import { Children, isValidElement, type ReactNode } from "react";
import Collection from "../app/collections/[handle]/page";
import { CollectionListing } from "../components/collection-listing";
import { searchProducts, recentProduct } from "../lib/search-products";
import { requestSavedProduct } from "../lib/saved-product-request";

const card = { id: "oak", handle: "oak", title: "Oak Chair", image: null, pricePaise: 120000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1 };
const query = { q: "", sort: "title", availability: "", min: "", max: "", category: "", page: 1 };
const page = { handle: "all", query, products: [card], total: 1, collectionTotal: 539, inStock: 400, outOfStock: 200, highestPrice: 990000, limit: 24, published: true, mode: "preview", checkoutEnabled: false };
const full = { id: "oak", handle: "oak", title: "Oak Chair", description: "Full description", images: [], category: "chairs", published: true, source: "fixture", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: "oak-v", title: "Standard", sku: null, pricePaise: 120000, compareAtPaise: null, available: true, stockPolicy: "stocked" }] };
let sequence = 0;
async function transport(run: (requests: URL[]) => Promise<void>, reply: (url: URL) => unknown) {
  const previous = globalThis.fetch, previousApi = process.env.API_URL, requests: URL[] = [];
  process.env.API_URL = `http://compact-consumers-${++sequence}.invalid`;
  globalThis.fetch = async input => { const url = new URL(String(input), "http://localhost"); requests.push(url); return Response.json(reply(url)); };
  try { await run(requests); } finally { globalThis.fetch = previous; if (previousApi === undefined) delete process.env.API_URL; else process.env.API_URL = previousApi; }
}
function listing(node: ReactNode): Record<string, unknown> | undefined {
  for (const child of Children.toArray(node)) if (isValidElement<Record<string, unknown>>(child)) {
    if (child.type === CollectionListing) return child.props;
    const nested = listing(child.props.children as ReactNode); if (nested) return nested;
  }
}

// The old route downloads every page. One compact response must own cards and facets.
test("a normal collection makes one compact read and displays its authoritative page and facets", async () => {
  await transport(async requests => {
    const result = listing(await Collection({ params: Promise.resolve({ handle: "all" }), searchParams: Promise.resolve({ q: " oak ", sort_by: "price-descending", page: "999" }) }))!;
    assert.equal(requests.length, 1, "one collection page must not fetch the whole catalogue");
    assert.equal(requests[0]!.pathname, "/api/catalogue/collections/all");
    assert.equal(requests[0]!.searchParams.get("limit"), "24");
    assert.equal(requests[0]!.searchParams.get("q"), "oak");
    assert.equal(requests[0]!.searchParams.get("sort"), "price-desc");
    assert.equal(requests[0]!.searchParams.has("availability"), false, "blank filters must be omitted from the strict HTTP query");
    assert.deepEqual(result.products, [card]);
    assert.equal(result.collectionTotal, 539); assert.equal(result.inStock, 400); assert.equal(result.outOfStock, 200); assert.equal(result.highestPrice, 990000);
    assert.deepEqual(result.query, { ...query, q: "oak", sort: "price-desc" });
  }, url => url.pathname === "/api/products" ? { products: [full], total: 539, page: Number(url.searchParams.get("page") ?? 1), limit: 50, mode: "preview", checkoutEnabled: false } : { ...page, query: { ...query, q: "oak", sort: "price-desc" } });
});

test("search receives compact cards from the same title-sorted collection query as View all", async () => {
  await transport(async requests => {
    const result = await searchProducts("oak", new AbortController());
    assert.equal(requests[0]!.pathname, "/api/catalogue/collections/all");
    assert.equal(requests[0]!.searchParams.get("sort"), "title");
    assert.equal(requests[0]!.searchParams.get("limit"), "4");
    assert.deepEqual(result, { products: [card], total: 1 });
  }, () => ({ ...page, query: { ...query, q: "oak" }, limit: 4 }));
});

test("saved and recent product reads accept only matching compact publication envelopes", async () => {
  await transport(async requests => {
    assert.deepEqual(await requestSavedProduct("oak", new AbortController().signal), card);
    assert.deepEqual(await recentProduct("oak", new AbortController()), card);
    assert.deepEqual(requests.map(url => url.pathname), ["/api/catalogue/cards/oak", "/api/catalogue/cards/oak"]);
  }, () => ({ product: card, published: true }));
});

test("search rejects a valid summary page for another query instead of showing stale results", async () => {
  await transport(async () => { await assert.rejects(searchProducts("oak", new AbortController())); }, () => ({ ...page, query: { ...query, q: "brass" }, limit: 4 }));
});

test("bare editorial chairs adds one canonical compact category page to bounded unique editorial card batches", async () => {
  await transport(async requests => {
    const result = listing(await Collection({ params: Promise.resolve({ handle: "chairs" }), searchParams: Promise.resolve({}) }))!;
    const collections = requests.filter(request => request.pathname === "/api/catalogue/collections/chairs");
    assert.equal(collections.length, 1, "the canonical chair category requires exactly one compact page read");
    assert.equal(collections[0]!.searchParams.get("limit"), "24");
    assert.equal(collections[0]!.searchParams.get("page"), "1");
    assert.equal(collections[0]!.searchParams.get("sort"), "title");
    assert.equal(collections[0]!.searchParams.has("q"), false);
    assert.equal(collections[0]!.searchParams.has("category"), false);
    assert.deepEqual(result.products, [card]);
    assert.equal(result.total, 1);
    const batches = requests.filter(request => request.pathname === "/api/catalogue/cards");
    assert.ok(batches.length > 0);
    assert.equal(requests.length, collections.length + batches.length, "no full-product or unrelated catalogue reads are allowed");
    for (const request of batches) {
      const handles = request.searchParams.get("handles")!.split(",");
      assert.ok(handles.length > 0 && handles.length <= 50);
    }
    const requestedHandles = batches.flatMap(request => request.searchParams.get("handles")!.split(","));
    assert.equal(new Set(requestedHandles).size, requestedHandles.length, "editorial products are deduplicated across all batches");
    assert.deepEqual(requestedHandles, [
      "aera-swivel-lounge-chair", "aero-dining-chair", "aileron-signature-bed", "aileron-upholstered-bench", "alcyone-7-seater-sofa", "alina-7-seater-sofa",
      "lira-barrel-accent-chair", "nimbus-cloud-lounge-chair-grey-boucle-walnut", "aurelia-luxe-accent-chair-walnut-mocha", "alto-luxe-lounge-chair-gold-charcoal", "ovalo-modern-console-walnut-white", "maple-bloom-petal-coffee-table-white-marble-brass-finish", "aurelia-fluted-coffee-table-white-marble-gold", "caro", "ario", "nola", "tara", "arno", "rollo",
    ]);
  }, url => url.pathname === "/api/catalogue/collections/chairs"
    ? { ...page, handle: "chairs", collectionTotal: 1, inStock: 1, outOfStock: 0, highestPrice: 120000 }
    : { products: [], published: true });
});
