import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Footer } from "../components/footer";
import { navigation, navigationHref } from "../lib/navigation";
import { collectionTitles, collectionMembers } from "../lib/collections";
import { landingCollectionHref } from "../components/category-landing";
test("every menu collection opens an implemented internal catalogue route", () => {
  const links = navigation.flatMap((group) => [
    group,
    ...group.columns.flatMap((column) => column.links),
  ]);
  for (const link of links) {
    const href = navigationHref(link.href, link.title);
    assert.ok(href.startsWith("/"), `${link.title} must stay on this store`);
    if (href.startsWith("/collections/"))
      assert.ok(
        Object.hasOwn(collectionTitles, href.split("/")[2]!),
        `${href} must resolve`,
      );
  }
  assert.equal(
    navigationHref("/collections/outdoor-furnitures", "Outdoors"),
    "/collections/outdoor-furnitures",
  );
  assert.equal(
    landingCollectionHref("/collections/rocking-chair"),
    "/collections/rocking-chair",
  );
});
test("footer policies, editorial content and returns stay on this storefront", () => {
  const doc = new JSDOM(renderToStaticMarkup(<Footer />)).window.document;
  const links = [...doc.querySelectorAll("a")];
  assert.deepEqual(
    links
      .filter((a) => /shop\.maplefurnishers\.com|shopify\.com/.test(a.href))
      .map((a) => a.href),
    [],
  );
  for (const href of [
    "/policies/privacy-policy",
    "/policies/refund-policy",
    "/blogs/recent-stories",
    "/pages/returns",
  ])
    assert.ok(doc.querySelector(`a[href="${href}"]`), href);
});
test("specialist collection membership follows source handles without hiding uncategorized products", () => {
  const outdoor = {
    id: "outdoor",
    handle: "arvon-rocking-chair",
    title: "Arvon",
    description: "",
    category: null,
    images: [],
    published: true,
    source: "shopify-preview",
    sourceUpdatedAt: "2026-10-26T00:00:00Z",
    variants: [],
  };
  assert.deepEqual(
    collectionMembers([outdoor], "rocking-chair").map((p) => p.id),
    ["outdoor"],
  );
});
test("Sofas & Chairs combines both live categories and excludes unrelated or unknown models", () => {
  const base = {
    id: "a",
    handle: "a",
    title: "A",
    description: "",
    images: [],
    published: true,
    source: "keeri",
    sourceUpdatedAt: "2026-10-26T00:00:00Z",
    variants: [],
  };
  const models = [
    { ...base, id: "sofa", category: "sofas" as const },
    { ...base, id: "chair", category: "chairs" as const },
    { ...base, id: "table", category: "tables" as const },
    { ...base, id: "unknown", category: null },
  ];
  assert.equal(collectionTitles["sofas-and-chairs"], "Sofas & Chairs");
  assert.deepEqual(
    collectionMembers(models, "sofas-and-chairs").map((p) => p.id),
    ["sofa", "chair"],
  );
});
