import assert from "node:assert/strict";
import { test } from "node:test";
import { productSchema } from "@shopmaple/contracts";
import { adaptShopifyCatalogue } from "../src/shopify-catalogue.js";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

import { tree, pdpFixture } from "./fixtures/product-pdp.js";
const expected = { source: "shopify-metafields", sourceProductId: "gid://shopify/Product/101", capturedAt: "2026-10-25T10:00:00Z", details: tree, materialsCare: null, shippingReturns: null };

test("legacy Shopify description, identity, variant and enquiry policy stay unchanged without PDP capture", () => {
  const p = adaptShopifyCatalogue(shopifyFixture()).products[0]!;
  assert.equal(p.description, "Actual description");
  assert.equal(p.id, "preview-101");
  assert.equal(p.variants[0]!.id, "preview-201");
  assert.equal(p.variants[0]!.pricePaise, null);
  assert.equal(p.variants[0]!.available, false);
});
test("public product contract preserves verified native PDP trees and explicit null sections", () => {
  const p = adaptShopifyCatalogue(shopifyFixture()).products[0]!;
  assert.deepEqual((productSchema.parse({ ...p, pdpContent: expected }) as any).pdpContent, expected);
});
test("exact Shopify metafield capture imports native content with provenance and authoritative nulls", () => {
  let result: ReturnType<typeof adaptShopifyCatalogue> | undefined;
  assert.doesNotThrow(() => { result = adaptShopifyCatalogue(pdpFixture()); });
  assert.deepEqual((result!.products[0] as any).pdpContent, expected);
});
test("PDP capture rejects duplicate, missing, foreign IDs, incomplete fields and invalid timestamps", () => {
  const mutations: Array<(x: any) => void> = [
    x => x.pdpMetafields.products.push(x.pdpMetafields.products[0]),
    x => x.pdpMetafields.products = [],
    x => x.pdpMetafields.products[0].id = "gid://shopify/Product/999",
    x => delete x.pdpMetafields.products[0].materialsCare,
    x => x.pdpMetafields.complete = false,
    x => x.pdpMetafields.capturedAt = "invalid",
    x => x.pdpMetafields.capturedAt = "2026-10-24T10:00:00Z",
    x => x.pdpMetafields.capturedAt = new Date(Date.now() + 120000).toISOString(),
  ];
  for (const mutate of mutations) { const x = pdpFixture(); mutate(x); assert.throws(() => adaptShopifyCatalogue(x)); }
});
test("public PDP validation rejects unsafe links, unknown fields, malformed and excessive rich text", () => {
  const p = adaptShopifyCatalogue(shopifyFixture()).products[0]!;
  const bad: unknown[] = [
    { type: "root", children: [{ type: "script", value: "unsafe" }] },
    { type: "root", children: [{ type: "text", value: "x", onclick: "unsafe" }] },
    ...["javascript:alert(1)", "data:text/html,x", "//evil.test", "/\\evil.test", "https://a.test/\nx"].map(url => ({ type: "root", children: [{ type: "paragraph", children: [{ type: "link", url, children: [{ type: "text", value: "link" }] }] }] })),
    { type: "root", children: [{ type: "heading", level: 9, children: [] }] },
    { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "x".repeat(50001) }] }] },
    { type: "root", children: Array.from({ length: 501 }, () => ({ type: "paragraph", children: [] })) },
  ];
  let deep: any = { type: "text", value: "x" };
  for (let n = 0; n < 20; n++) deep = { type: "list", listType: "unordered", children: [{ type: "list-item", children: [deep] }] };
  bad.push({ type: "root", children: [deep] });
  for (const details of bad) assert.equal(productSchema.safeParse({ ...p, pdpContent: { ...expected, details } }).success, false);
});
test("union keeps Shopify PDP copy only on exact merged source and clears prior copy when source is absent", () => {
  const k = v2Fixture(); k.publicMedia = []; k.models[0]!.variants[0]!.sku = "CHAIR-OAK";
  let plan: ReturnType<typeof planCatalogueUnion> | undefined;
  assert.doesNotThrow(() => { plan = planCatalogueUnion(pdpFixture(), k, "maple"); });
  assert.equal(plan!.products.length, 1);
  assert.deepEqual((plan!.products[0] as any).pdpContent, expected);
  const next = planCatalogueUnion(shopifyFixture(), k, "maple", plan!);
  assert.equal((next.products[0] as any).pdpContent ?? null, null);
  k.models[0]!.variants[0]!.sku = "UNMATCHED";
  const separate = planCatalogueUnion(pdpFixture(), k, "maple");
  assert.equal(separate.products.length, 2);
  assert.equal((separate.products.find(p => p.source.startsWith("keeri:")) as any).pdpContent ?? null, null);
});
test("native headings, lists and links with nullable Shopify target/title preserve formatting", () => {
  const p = adaptShopifyCatalogue(shopifyFixture()).products[0]!;
  const details = { type: "root", children: [
    { type: "heading", level: 3, children: [{ type: "text", value: "Care", italic: true }] },
    { type: "list", listType: "unordered", children: [{ type: "list-item", children: [{ type: "text", value: "Dust gently" }] }] },
    { type: "paragraph", children: [{ type: "link", url: "https://docs.google.com/spreadsheets/d/example", title: null, target: null, children: [{ type: "text", value: "Dimensions" }] }] },
  ] };
  assert.equal(productSchema.safeParse({ ...p, pdpContent: { ...expected, details } }).success, true);
});
