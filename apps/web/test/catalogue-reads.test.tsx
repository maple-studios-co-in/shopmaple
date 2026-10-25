import assert from "node:assert/strict";
import { test } from "node:test";
import { getProducts, getProduct } from "../lib/catalog";

test("actual public catalogue reads coalesce and malformed responses are never retained", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const payload = { products: [], total: 0, page: 1, limit: 50, mode: "preview", checkoutEnabled: false };
  globalThis.fetch = async () => { calls++; return Response.json(payload); };
  try {
    await Promise.all(Array.from({ length: 20 }, () => getProducts({ page: "137", limit: "50" })));
    assert.equal(calls, 1, "Twenty visitors need one public catalogue request");
    globalThis.fetch = async () => { calls++; return Response.json({ total: 9 }); };
    await assert.rejects(getProducts({ page: "138", limit: "50" }));
    globalThis.fetch = async () => { calls++; return Response.json(payload); };
    assert.equal((await getProducts({ page: "138", limit: "50" })).total, 0);
    assert.equal(calls, 3, "Invalid payloads must not poison future reads");
    globalThis.fetch = async () => { calls++; return new Response(null, { status: 404 }); };
    assert.equal(await getProduct("missing-cache-test-product"), null);
  } finally { globalThis.fetch = originalFetch; }
});
