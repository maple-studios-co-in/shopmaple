import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import ProductPage from "../app/products/[handle]/page";
import { ShopProvider } from "../components/shop-provider";

test("an uncategorized model detail loads without sending an invalid related-category request", async () => {
  const previous = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.pathname + url.search);
    return url.pathname === "/api/products/model"
      ? Response.json({ id: "model", handle: "model", title: "Uncategorized Model", description: "", category: null, images: [], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] })
      : new Response(null, { status: 400 });
  };
  try {
    const page = await ProductPage({ params: Promise.resolve({ handle: "model" }), searchParams: Promise.resolve({}) });
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
    const stream = await renderToReadableStream(<AppRouterContext.Provider value={router}><ShopProvider>{page}</ShopProvider></AppRouterContext.Provider>);
    const html = await new Response(stream).text();
    assert.match(html, /Uncategorized Model/);
    assert.match(html, /Price on request/);
    assert.deepEqual(requests, ["/api/products/model"]);
  } finally {
    globalThis.fetch = previous;
  }
});
