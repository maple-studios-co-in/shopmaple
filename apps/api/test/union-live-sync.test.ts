import assert from "node:assert/strict";
import { test } from "node:test";
import { pullCatalogueUnion } from "../src/union-live-sync.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";
import { shopifyFixture } from "./fixtures/shopify-admin.js";
function options() {
  const k = v2Fixture();
  k.publicMedia = [];
  return {
    origin: "https://keeri.example",
    token: "synthetic-only",
    tenantId: "maple",
    shopify: shopifyFixture(),
    now: new Date(k.capturedAt),
    fetch: async (input: URL | RequestInfo) => {
      assert.equal(
        String(input),
        "https://keeri.example/api/storefront/catalogue/v2",
      );
      return new Response(JSON.stringify(k), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}
test("live V2 union defaults to dry-run and reports pinned Shopify freshness separately", async () => {
  const result = await pullCatalogueUnion(options());
  assert.equal(result.totalProducts, 2);
  assert.equal(result.dryRun, true);
  assert.equal(result.shopifyRefreshMode, "pinned-snapshot");
  assert.equal(result.checkoutEnabled, false);
});
test("live union rejects unsafe DB before sending credentials and rejects stale snapshots", async () => {
  await assert.rejects(
    pullCatalogueUnion({
      ...options(),
      apply: true,
      databaseUrl: "postgresql://localhost/production",
    }),
    /ISOLATED_DATABASE/,
  );
  await assert.rejects(
    pullCatalogueUnion({ ...options(), now: new Date("2026-10-26T00:00:00Z") }),
    /STALE/,
  );
});
