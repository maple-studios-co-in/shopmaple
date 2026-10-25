import test from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@shopmaple/contracts";
import {
  collectionQuery,
  collectionMembers,
  filterCollection,
  collectionHref,
} from "../lib/collections";
const makeProduct = (
  handle: string,
  prices: number[],
  availability: boolean[] = prices.map(() => true),
): Product => ({
  id: handle,
  handle,
  title: handle,
  description: "",
  category: "chairs",
  images: ["https://example.com/chair.jpg"],
  published: true,
  source: "shopify-preview",
  sourceUpdatedAt: "2026-10-25T00:00:00Z",
  variants: prices.map((pricePaise, i) => ({
    id: handle + i,
    title: String(i),
    sku: null,
    pricePaise,
    compareAtPaise: null,
    available: availability[i]!,
    stockPolicy: "stocked",
  })),
});
test("price and availability must match the same variant", () => {
  const products = [
    makeProduct("mixed", [10000, 30000], [false, true]),
    makeProduct("matching", [15000], [true]),
  ];
  assert.deepEqual(
    filterCollection(
      products,
      collectionQuery({ availability: "in", max: "200" }),
    ).map((p) => p.handle),
    ["matching"],
  );
});
test("collection aliases preserve exact public membership, not category guesses", () => {
  const products = [
    makeProduct("caro", [10000]),
    makeProduct("not-in-public-collection", [10000]),
  ];
  assert.deepEqual(
    collectionMembers(products, "accent-chair").map((p) => p.handle),
    ["caro"],
  );
});
test("filters reject malformed query values and preserve valid zero prices", () => {
  const query = collectionQuery({
    q: ["chair"],
    sort: "unknown",
    page: "-1",
    min: "0",
    max: "NaN",
    category: "invalid",
    availability: "anything",
  });
  assert.equal(query.q, "");
  assert.equal(query.sort, "title");
  assert.equal(query.page, 1);
  assert.equal(query.min, "0");
  assert.equal(query.max, "");
  assert.equal(query.category, "");
  assert.equal(query.availability, "");
});
test("price sorting uses the cheapest variant without mutating the supplied list", () => {
  const products = [
    makeProduct("expensive", [20000]),
    makeProduct("cheap", [30000, 10000]),
  ];
  assert.deepEqual(
    filterCollection(
      products,
      collectionQuery({ sort_by: "price-ascending" }),
    ).map((p) => p.handle),
    ["cheap", "expensive"],
  );
  assert.equal(products[0]?.handle, "expensive");
});
test("pagination preserves active filters and escapes a search term", () => {
  const href = collectionHref(
    "all",
    collectionQuery({
      q: "chair & table",
      min: "100",
      availability: "in",
      sort: "price-asc",
    }),
    2,
  );
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("q"), "chair & table");
  assert.equal(url.searchParams.get("min"), "100");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("availability"), "in");
});
