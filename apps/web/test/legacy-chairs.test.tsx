import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import type { Product } from "@shopmaple/contracts";
import Collection from "../app/collections/[handle]/page";
import ChairsPage from "../app/pages/chairs/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
const products: Product[] = Array.from({ length: 26 }, (_, i) => ({
  id: `chair-${i}`,
  handle: `independent-chair-${i}`,
  title: `Chair ${String(i).padStart(2, "0")}`,
  description: "Chair outside chair-collection",
  category: "chairs",
  images: ["https://example.com/chair.jpg"],
  published: true,
  source: "shopify-preview",
  sourceUpdatedAt: "2026-10-25T00:00:00Z",
  variants: [
    {
      id: `variant-${i}`,
      title: "Standard",
      sku: null,
      pricePaise: (i + 1) * 10000,
      compareAtPaise: null,
      available: true,
      stockPolicy: "stocked",
    },
  ],
}));
products.push({
  ...products[0]!,
  id: "table",
  handle: "not-a-chair",
  title: "Chair matching table",
  category: "tables",
});
let requestId = 0;
async function render(
  query: Record<string, string | string[] | undefined> = {},
  page = false,
  handle = "chairs",
) {
  const previousFetch = globalThis.fetch,
    previousApi = process.env.API_URL;
  process.env.API_URL = `http://legacy-chairs-test-${++requestId}.invalid`;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/products?"))
      return Response.json({
        products,
        total: products.length,
        page: 1,
        limit: 50,
        mode: "preview",
        checkoutEnabled: false,
      });
    if (String(url).endsWith("/api/content/storefront"))
      return Response.json({ version: 1, content: defaultStorefrontContent });
    throw new Error(`Unexpected transport: ${String(url)}`);
  };
  try {
    const tree = page ? (
      <ChairsPage />
    ) : (
      await Collection({
        params: Promise.resolve({ handle }),
        searchParams: Promise.resolve(query),
      })
    );
    return new JSDOM(
      await new Response(
        await renderToReadableStream(<ShopProvider>{tree}</ShopProvider>),
      ).text(),
      { url: "http://localhost/collections/chairs" },
    ).window.document;
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApi === undefined) delete process.env.API_URL;
    else process.env.API_URL = previousApi;
  }
}
const cards = (doc: Document) =>
  [...doc.querySelectorAll(".product-card-name")].map(
    (node) => node.textContent,
  );
test("query-driven chairs retain category membership, filters, sort and pagination", async () => {
  const first = await render({ sort: "title" });
  assert.equal(first.querySelector("h1")?.textContent, "Chairs");
  assert.equal(cards(first).length, 24);
  assert.equal(cards(first)[0], "Chair 00");
  assert.ok(!cards(first).includes("Chair matching table"));
  assert.deepEqual(cards(await render({ sort: "title", page: "2" })), [
    "Chair 24",
    "Chair 25",
  ]);
  const filtered = await render({
    q: "Chair",
    sort_by: "price-descending",
    availability: "in",
    min: "200",
    max: "400",
  });
  assert.deepEqual(cards(filtered), ["Chair 03", "Chair 02", "Chair 01"]);
  for (const [key, value] of Object.entries({
    q: "Chair",
    min: "200",
    max: "400",
  }))
    assert.equal(
      filtered.querySelector<HTMLInputElement>(`input[name="${key}"]`)?.value,
      value,
    );
  assert.equal(
    filtered.querySelector<HTMLSelectElement>('select[name="sort"]')?.value,
    "price-desc",
  );
});
test("separate Chairs page retains six categories and Best Sellers destination", async () => {
  const doc = await render({}, true);
  assert.equal(doc.querySelector("h1")?.textContent, "Chairs");
  assert.equal(doc.querySelectorAll(".landing-categories a").length, 6);
  assert.equal(
    doc.querySelector(".landing-products header a")?.getAttribute("href"),
    "/collections/chair-collection",
  );
});
test("bare Chairs collection restores source editorial sequence and honest local destinations", async () => {
  const doc = await render();
  assert.equal(doc.querySelector("h1")?.textContent, "Our Newest Arrivals");
  assert.deepEqual(
    [...doc.querySelectorAll(".legacy-chairs-categories h2")].map(
      (n) => n.textContent,
    ),
    [
      "Designer Sofa Sets",
      "Wooden Sofas",
      "Fabric Sofas",
      "L Shape Sofa",
      "Sofa Cum Beds",
      "Recliners",
      "Chesterfield Sofas",
      "3 Seater Sofas",
      "2 Seater Sofas",
      "Sofas",
    ],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".legacy-chairs-room h2")].map(
      (n) => n.textContent,
    ),
    ["Bed Room", "Living Room"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".landing-values h3")].map((n) => n.textContent),
    ["Grain", "Edge", "Fabric", "Polish"],
  );
  const content = doc.body.textContent ?? "";
  const sectionLabels = [
    ...doc.querySelectorAll(
      "h1, h2, .legacy-chairs-rhythm-track > span:not([aria-hidden]), .landing-values h3",
    ),
  ].map((node) => node.textContent);
  let previous = -1;
  for (const text of [
    "Our Newest Arrivals",
    "Best Sellers",
    "Grab before they are gone!",
    "Where Every Room Finds Its Rhythm🍁",
    "Bed Room",
    "Living Room",
    "Our signature product.",
    "Bentley Chair",
    "Accent Chair",
    "Frequently asked questions",
    "Grain",
  ]) {
    const position = sectionLabels.indexOf(text);
    assert.ok(position > previous, `${text} must follow previous section`);
    previous = position;
  }
  assert.match(content, /This offer has ended/);
  assert.match(
    content,
    /No products are currently available in this collection/,
  );
  assert.doesNotMatch(content, /Next, select a collection|Collection name/);
  assert.equal(doc.querySelectorAll(".legacy-chairs-offers a").length, 4);
  assert.equal(doc.querySelectorAll(".legacy-chairs-faq details").length, 5);
  assert.equal(
    doc.querySelectorAll(".legacy-chairs-faq details[open]").length,
    0,
  );
  assert.match(
    doc.querySelector(".legacy-chairs-faq")?.textContent ?? "",
    /checkout is disabled/i,
  );
  for (const link of doc.querySelectorAll<HTMLAnchorElement>("a")) {
    assert.equal(link.origin, "http://localhost");
    assert.notEqual(
      link.getAttribute("href"),
      "/collections/chairs",
      "Editorial CTA must not loop back",
    );
  }
  assert.ok(doc.querySelector('a[href="/collections/all?category=chairs"]'));
  const first = doc.querySelector<HTMLDetailsElement>(
    ".legacy-chairs-faq details",
  )!;
  first.querySelector<HTMLElement>("summary")!.click();
  assert.equal(first.open, true);
  assert.equal(
    doc.querySelectorAll(".legacy-chairs-faq details[open]").length,
    1,
  );
  first.querySelector<HTMLElement>("summary")!.click();
  assert.equal(first.open, false);
});

test("each explicit browsing parameter retains the grid while campaign tracking keeps the editorial page", async () => {
  for (const query of [
    { q: "" },
    { q: ["Chair"] },
    { sort: "unknown" },
    { sort_by: "manual" },
    { availability: "out" },
    { min: "0" },
    { max: "bad" },
    { category: "chairs" },
    { page: "1" },
  ]) {
    const doc = await render(query);
    assert.equal(
      doc.querySelector("h1")?.textContent,
      "Chairs",
      JSON.stringify(query),
    );
  }
  assert.equal(
    (await render({ utm_source: "campaign" })).querySelector("h1")?.textContent,
    "Our Newest Arrivals",
  );
});

test("all chair reset controls keep the unfiltered chair grid and other collection resets stay unchanged", async () => {
  for (const query of [
    { q: "Chair", min: "200" },
    { q: "no-matching-products" },
  ]) {
    const doc = await render(query);
    const resets = [...doc.querySelectorAll<HTMLAnchorElement>("a")].filter(
      (link) =>
        /^(Clear all|Clear filters)$/.test(link.textContent?.trim() ?? ""),
    );
    assert.ok(resets.length >= 2);
    for (const reset of resets) {
      assert.equal(reset.getAttribute("href"), "/collections/chairs?page=1");
      const url = new URL(reset.href);
      const restored = await render(
        Object.fromEntries(url.searchParams),
        false,
        url.pathname.split("/").at(-1),
      );
      assert.equal(restored.querySelector("h1")?.textContent, "Chairs");
      assert.equal(cards(restored).length, 24);
      assert.equal(cards(restored)[0], "Chair 00");
      assert.ok(!cards(restored).includes("Chair matching table"));
      assert.equal(
        restored.querySelector<HTMLInputElement>('input[name="q"]')?.value,
        "",
      );
      assert.equal(
        restored.querySelector<HTMLInputElement>('input[name="min"]')?.value,
        "",
      );
    }
  }
  const other = await render({ q: "no-matching-products" }, false, "all");
  for (const reset of other.querySelectorAll<HTMLAnchorElement>("a"))
    if (/^(Clear all|Clear filters)$/.test(reset.textContent?.trim() ?? ""))
      assert.equal(reset.getAttribute("href"), "/collections/all");
});

test("rooms retain their source product cards as honest enquiries when the owned catalogue lacks them", async () => {
  const doc = await render();
  const rooms = [...doc.querySelectorAll(".legacy-chairs-room")];
  assert.deepEqual(
    rooms.map((room) => room.querySelectorAll(".product-card").length),
    [1, 6],
  );
  assert.equal(
    rooms[0]?.querySelector(".product-card-name")?.textContent,
    "Lira Barrel Accent Chair – Charcoal & Gold Finish",
  );
  for (const room of rooms)
    for (const card of room.querySelectorAll(".product-card")) {
      assert.match(
        card.querySelector(".product-card-name")?.getAttribute("href") ?? "",
        /^\/pages\/contact\?product=/,
      );
      assert.equal(
        card.querySelector(".product-card-price")?.textContent,
        "Price on request",
      );
    }
});

test("room product browsing exposes labelled previous and next navigation", async () => {
  const doc = await render();
  for (const title of ["Bed Room", "Living Room"]) {
    const room = doc.querySelector(`section[aria-label="${title}"]`)!;
    assert.ok(
      room.querySelector(
        `button[aria-label="Next ${title} featured products"]`,
      ),
      "A visitor must be able to navigate the room product rail",
    );
    assert.ok(
      room.querySelector(
        `button[aria-label="Previous ${title} featured products"]`,
      ),
    );
  }
});
