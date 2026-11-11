import assert from "node:assert/strict";
import { test } from "node:test";
import { productSchema } from "@shopmaple/contracts";
import { planCatalogueUnion } from "../src/catalogue-union.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
import { tree } from "./fixtures/product-pdp.js";

// Copy blocks a former Shopify listing stored (pdpContent) stay readable by the product contract, so rows saved before
// the store left Shopify still parse; the Keeri sync no longer writes any.
const expected = { source: "shopify-metafields", sourceProductId: "gid://shopify/Product/101", capturedAt: "2026-10-25T10:00:00Z", details: tree, materialsCare: null, shippingReturns: null };
const product = () => productSchema.parse({
  id: "preview-101", handle: "real-chair", title: "Real chair", description: "Actual description", category: "chairs", images: [], published: true,
  source: "shopify-preview", sourceUpdatedAt: "2026-10-25T09:00:00Z",
  variants: [{ id: "preview-201", title: "Oak", sku: null, pricePaise: null, compareAtPaise: null, available: false, stockPolicy: "unverified" }],
});

test("public product contract preserves stored native PDP trees and explicit null sections", () => {
  assert.deepEqual((productSchema.parse({ ...product(), pdpContent: expected }) as any).pdpContent, expected);
});
test("public PDP validation rejects unsafe links, unknown fields, malformed and excessive rich text", () => {
  const p = product();
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
test("the Keeri catalogue writes no copy blocks, also on a former Shopify listing that held some", () => {
  const k = v2Fixture(); k.publicMedia = [];
  assert.equal(planCatalogueUnion(k, "maple").products[0]!.pdpContent, null);
  const plan = planCatalogueUnion(k, "maple", {
    products: [{ ...product(), pdpContent: expected } as never],
    productBindings: [{ source: "keeri:maple", externalId: "keeri:maple:model1", targetId: "preview-101" }],
    variantBindings: [{ source: "keeri:maple", externalId: "keeri:maple:variant1", targetId: "preview-201" }],
  });
  assert.equal(plan.products[0]!.id, "preview-101");
  assert.equal(plan.products[0]!.pdpContent, null);
});
test("native headings, lists and links with nullable target/title preserve formatting", () => {
  const details = { type: "root", children: [
    { type: "heading", level: 3, children: [{ type: "text", value: "Care", italic: true }] },
    { type: "list", listType: "unordered", children: [{ type: "list-item", children: [{ type: "text", value: "Dust gently" }] }] },
    { type: "paragraph", children: [{ type: "link", url: "https://docs.google.com/spreadsheets/d/example", title: null, target: null, children: [{ type: "text", value: "Dimensions" }] }] },
  ] };
  assert.equal(productSchema.safeParse({ ...product(), pdpContent: { ...expected, details } }).success, true);
});
