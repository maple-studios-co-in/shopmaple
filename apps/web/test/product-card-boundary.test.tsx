import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactNode, type ReactElement } from "react";
import type { Product } from "@shopmaple/contracts";
import Collection from "../app/collections/[handle]/page";
import Home from "../app/page";
import ProductPage from "../app/products/[handle]/page";
import { CategoryProducts } from "../components/category-landing";
import { LegacyChairs } from "../components/legacy-chairs";
import { ProductCard } from "../components/product-card";
import { ProductDetail } from "../components/product-detail";
import { CollectionListing } from "../components/collection-listing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import chairs from "../data/legacy-chairs.json";

const product: Product = {
  id: "card-one", handle: chairs.bestsellers[0]!, title: "Boundary Chair",
  description: "Full upholstery and dimension description".repeat(200), category: "chairs",
  images: ["https://example.com/first.jpg", "https://example.com/detail.jpg"],
  published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    { id: "private-option", title: "Oak finish", sku: "VARIANT-SKU", pricePaise: 25000, compareAtPaise: 30000, available: true, stockPolicy: "stocked" },
    { id: "pending-option", title: "Custom finish", sku: null, pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" },
  ],
};
const expected = {
  id: product.id, handle: product.handle, title: "Boundary Chair", image: "https://example.com/first.jpg",
  pricePaise: 25000, compareAtPaise: 30000, priceFrom: true, otherOptionsOnRequest: true, optionCount: 2,
};
function find(node: ReactNode, component: unknown): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return child.type === component ? [child] : find(child.props.children as ReactNode, component);
  });
}
// Expand only the server-owned rail components. Client components are left intact
// so these assertions exercise the props Next serializes, not their HTML markup.
async function railCards(node: ReactNode): Promise<unknown[]> {
  const cards: unknown[] = [];
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; product?: unknown }>(child)) continue;
    if (child.type === ProductCard) cards.push(child.props.product);
    else if (typeof child.type === "function" && ["HomeProducts", "LegacyProducts"].includes(child.type.name)) {
      cards.push(...await railCards(await (child.type as (props: unknown) => Promise<ReactNode>)(child.props)));
    } else cards.push(...await railCards(child.props.children));
  }
  return cards;
}
async function withCatalogue(run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === "/api/catalogue/collections/all") return Response.json({ handle: "all", query: { q: "", sort: "title", availability: "", min: "", max: "", category: "", page: 1 }, products: [expected], total: 1, collectionTotal: 1, inStock: 1, outOfStock: 1, highestPrice: 25000, limit: 24, published: true, mode: "preview", checkoutEnabled: false });
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 1, content: defaultStorefrontContent });
    if (url.pathname === "/api/products") return Response.json({ products: [product], total: 1, page: 1, limit: 50, mode: "preview", checkoutEnabled: false });
    if (url.pathname.startsWith("/api/products/")) {
      const handle = decodeURIComponent(url.pathname.split("/").at(-1)!);
      return Response.json({ ...product, id: handle === "detail-chair" ? "detail" : product.id, handle });
    }
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
test("collection ships only card display data while facets retain full catalogue pricing and availability", async () => {
  await withCatalogue(async () => {
    const page = await Collection({ params: Promise.resolve({ handle: "all" }), searchParams: Promise.resolve({}) });
    const listing = find(page, CollectionListing)[0]!;
    assert.ok(listing);
    assert.equal(listing.props.highestPrice, 25000);
    assert.equal(listing.props.inStock, 1);
    assert.equal(listing.props.outOfStock, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(listing.props.products)), [expected]);
  });
});
test("category rails ship display summaries rather than detailed catalogue models", async () => {
  await withCatalogue(async () => {
    const cards = await railCards(await CategoryProducts({ handles: [product.handle], heading: "Chairs" }));
    assert.deepEqual(JSON.parse(JSON.stringify(cards)), [expected]);
  });
});
test("related cards exclude product details while the main detail page retains them", async () => {
  await withCatalogue(async () => {
    const page = await ProductPage({ params: Promise.resolve({ handle: "detail-chair" }), searchParams: Promise.resolve({}) });
    const detail = find(page, ProductDetail)[0]!;
    assert.deepEqual((detail.props.product as Product).variants, product.variants);
    assert.equal((detail.props.product as Product).description, product.description);
    assert.deepEqual(JSON.parse(JSON.stringify(await railCards(page))), [expected]);
  });
});
test("homepage rails omit descriptions, galleries, source metadata and variants from every card", async () => {
  await withCatalogue(async () => {
    const cards = await railCards(await Home());
    assert.ok(cards.length > 1, "exercise both published homepage product rails");
    for (const card of cards) {
      const data = card as { handle: string };
      assert.deepEqual(JSON.parse(JSON.stringify(card)), { ...expected, handle: data.handle });
    }
  });
});
test("legacy chair landing preserves compact live-catalogue cards at its carousel boundary", async () => {
  const cards = await railCards(LegacyChairs({ products: [expected] }));
  assert.ok(cards.length > 0);
  for (const card of cards) assert.deepEqual(JSON.parse(JSON.stringify(card)), expected);
});
