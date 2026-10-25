import { shopifyFixture } from "./shopify-admin.js";
export const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Solid oak", bold: true }] }] };
export function pdpFixture() {
  return { ...shopifyFixture(), pdpMetafields: {
    source: "shopify-admin-metafields", capturedAt: "2026-10-25T10:00:00Z", complete: true,
    products: [{ id: "gid://shopify/Product/101", details: { type: "rich_text_field", jsonValue: structuredClone(tree) }, materialsCare: null, shippingReturns: null }],
  } };
}
