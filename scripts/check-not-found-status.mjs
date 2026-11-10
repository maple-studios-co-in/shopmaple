import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

// Unknown addresses must answer HTTP 404, not a 200 that shows "We couldn't find that page" (search engines call that
// a soft 404). A loading.tsx above a page's notFound() streams first and fixes the status at 200, which this catches.
//
// Run from the repository root after `npm run build`: it starts the built store against a small stand-in API.
// STORE_URL=https://store.example npm run test:not-found-status checks a running store instead.

const missing = [
  "/collections/zzz-missing",
  "/products/zzz-missing",
  "/policies/zzz-missing",
  "/blogs/zzz-missing",
  "/blogs/news/zzz-missing",
  "/pages/zzz-missing",
  "/zzz-missing",
  "/orders/zzz-missing",
];
const present = ["/", "/collections/all", "/policies/privacy-policy", "/blogs/news", "/pages/contact"];
const product = {
  id: "status-chair", handle: "status-chair", title: "Status Chair", description: "A chair", category: "chairs", images: [],
  published: true, source: "keeri", sourceUpdatedAt: "2026-11-10T00:00:00Z",
  variants: [{ id: "v", title: "Standard", sku: "S", pricePaise: 100000, compareAtPaise: null, available: true, stockPolicy: "stocked" }],
};

/** Answers only what the checked pages read; the content falls back to the bundled copy. */
function standInApi() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://api");
    const json = (status, body) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/api/content/storefront") return json(404, { code: "CONTENT_NOT_PUBLISHED" });
    if (url.pathname === "/api/instagram/feed") return json(200, { posts: [] });
    if (url.pathname === "/api/products/status-chair") return json(200, product);
    if (url.pathname.startsWith("/api/products/")) return json(404, { code: "PRODUCT_NOT_FOUND" });
    if (url.pathname === "/api/catalogue/related") return json(200, { category: url.searchParams.get("category"), products: [], published: true });
    if (url.pathname.startsWith("/api/catalogue/collections/")) {
      // An empty listing that echoes the request, as the store checks.
      const handle = decodeURIComponent(url.pathname.split("/").pop());
      const query = { q: "", sort: "featured", availability: "", min: "", max: "", category: "", material: "", colour: "", wmin: "", wmax: "", dmin: "", dmax: "" };
      for (const [key, value] of url.searchParams) if (Object.hasOwn(query, key)) query[key] = value;
      return json(200, { handle, query: { ...query, page: 1 }, products: [], total: 0, collectionTotal: 0, inStock: 0, outOfStock: 0,
        highestPrice: null, limit: 24, published: true, mode: "preview", checkoutEnabled: false });
    }
    return json(503, { code: "UNAVAILABLE" });
  });
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startStore() {
  const api = standInApi();
  const apiPort = await listen(api);
  const port = await freePort();
  const next = createRequire(new URL("../apps/web/package.json", import.meta.url)).resolve("next/dist/bin/next");
  const web = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: "apps/web",
    env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}`, SEO_INDEXING: "off", NODE_ENV: "production" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (web.exitCode !== null) throw new Error(`next start exited with ${web.exitCode}`);
    try { await fetch(base + "/robots.txt"); return { base, stop: () => { web.kill(); api.close(); } }; } catch { await delay(250); }
  }
  web.kill(); api.close();
  throw new Error("The store did not start within 30 seconds");
}

const external = process.env.STORE_URL?.replace(/\/$/, "");
const store = external ? { base: external, stop() {} } : await startStore();
try {
  const paths = [...missing.map(path => [path, 404]), ...present.map(path => [path, 200]), ...(external ? [] : [["/products/status-chair", 200]])];
  const results = [];
  // Old addresses may redirect first (/pages/<slug> moves to /<slug>); the status that counts is the final one.
  for (const [path, expected] of paths) results.push({ path, expected, status: (await fetch(store.base + path, { redirect: "follow" })).status });
  console.table(results);
  assert.deepEqual(results.filter(result => result.status !== result.expected), [], "Every unknown address answers 404 and every known one 200");
} finally {
  store.stop();
}
