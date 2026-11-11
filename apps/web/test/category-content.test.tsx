import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import { CategoryLanding } from "../components/category-landing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { ShopProvider } from "../components/shop-provider";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { cardFixture } from "./support/catalogue-fixtures";

const override = {
  slug: "sofas",
  title: "Sofas for everyday living",
  introduction: "Made for your family and your home.",
  sections: [
    { key: "sale", enabled: true },
    { key: "hero", enabled: true },
    {
      key: "categories",
      enabled: true,
      items: [{ key: "wooden-sofas", title: "Solid wood seating" }],
    },
    { key: "bestsellers", enabled: true, heading: "Customer favourites" },
    {
      key: "difference-heading",
      enabled: true,
      eyebrow: "Made by Maple",
      heading: "Make it yours",
    },
    {
      key: "values",
      enabled: true,
      items: [
        {
          key: "grain",
          title: "Natural grain",
          body: "Every grain tells its own story.",
        },
      ],
    },
    { key: "bedroom-products", enabled: false },
  ],
};
const keeriPhoto = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle}-photo.webp`;
/** The catalogue's cards for the handles asked for that it lists (`listed`), each with its own Keeri photo. */
async function render(
  slug: "sofas" | "tables" | "chairs",
  content: unknown = defaultStorefrontContent,
  listed: ReadonlySet<string> | "all" = new Set(),
) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/content/storefront"))
      return Response.json({ version: 3, content });
    const address = new URL(String(url));
    if (address.pathname === "/api/catalogue/cards") {
      const handles = (address.searchParams.get("handles") ?? "").split(",").filter((handle) => listed === "all" || listed.has(handle));
      return Response.json({ products: handles.map((handle) => ({ ...cardFixture(handle), image: keeriPhoto(handle) })), published: true });
    }
    throw new Error(`Unexpected network request: ${String(url)}`);
  };
  try {
    return new JSDOM(
      await new Response(
        await renderToReadableStream(
          <ShopProvider>
            <CategoryLanding slug={slug} />
          </ShopProvider>,
        ),
      ).text(),
    ).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}
test("category defaults keep their copy and local collection links; banners and circles show Keeri photos, rails only listed pieces", async () => {
  // The catalogue lists the outdoor banner's sofa (casaba), one circle's (atrio-sofa) and two rail pieces (sora, nysa).
  const doc = await render("sofas", defaultStorefrontContent, new Set(["casaba", "atrio-sofa", "sora", "nysa"]));
  assert.equal(doc.querySelector("h1")?.textContent, "Sofas");
  assert.deepEqual(
    [...doc.querySelectorAll(".landing-products h2")].map((n) => n.textContent),
    ["Best Sellers", "Sofas", "Bedrooms", "Living", "Paired Together"],
  );
  const wooden = doc.querySelector('.landing-categories a[href="/collections/wooden-sofas"]');
  assert.equal(wooden?.querySelector("h2")?.textContent, "Wooden Sofas");
  assert.ok(decodeURIComponent(wooden?.querySelector("img")?.getAttribute("src") ?? "").includes(keeriPhoto("atrio-sofa")), "a circle shows its Keeri product's photo");
  const recliners = doc.querySelector('.landing-categories a[href="/collections/recliners"]');
  assert.equal(recliners?.querySelector("h2")?.textContent, "Recliners", "a circle without a listed photo keeps its title and link");
  assert.equal(recliners?.querySelector("img"), null, "and draws no broken picture");
  assert.match(doc.querySelector(".landing-values p")?.textContent ?? "", /Where nature begins the story/);
  assert.equal(doc.querySelector(".landing-values img"), null, "the values read as words: their icons were Shopify files");
  const banners = [...doc.querySelectorAll(".landing-banner img")].map((n) => decodeURIComponent(n.getAttribute("src") ?? ""));
  assert.equal(banners.length, 1, "only the banner whose Keeri product is listed is drawn");
  assert.ok(banners[0]!.includes(keeriPhoto("casaba")));
  assert.equal(doc.querySelector(".landing-source-product"), null, "no fallback cards from older data");
  assert.deepEqual(
    [...doc.querySelectorAll(".landing-products [data-product-card] a[href^='/products/']")].map((n) => n.getAttribute("href")).filter((href, i, all) => all.indexOf(href) === i),
    ["/products/sora", "/products/nysa"],
    "rails show only what the catalogue lists",
  );
  assert.doesNotMatch(doc.body.innerHTML, /shopify|\/cdn\/shop\//i);
});
test("only published category overrides change the selected page while preserving artwork and destinations", async () => {
  const content = {
    ...structuredClone(defaultStorefrontContent),
    landingPages: [override],
  };
  const doc = await render("sofas", content, new Set(["casaba"]));
  assert.equal(
    doc.querySelector("h1")?.textContent,
    "Sofas for everyday living",
  );
  assert.match(
    doc.querySelector(".landing-intro p")?.textContent ?? "",
    /Made for your family and your home/,
  );
  assert.equal(
    doc.querySelector(
      '.landing-categories a[href="/collections/wooden-sofas"] h2',
    )?.textContent,
    "Solid wood seating",
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".landing-products h2")].map((n) => n.textContent),
    ["Customer favourites", "Sofas", "Living", "Paired Together"],
  );
  assert.equal(
    doc.querySelector(".landing-difference h2")?.textContent,
    "Make it yours",
  );
  assert.equal(
    doc.querySelector(".landing-difference p")?.textContent,
    "Made by Maple",
  );
  assert.equal(
    doc.querySelector(".landing-values h3")?.textContent,
    "Natural grain",
  );
  assert.equal(
    doc.querySelector(".landing-values p")?.textContent,
    "Every grain tells its own story.",
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".landing-banner img")].map((n) => decodeURIComponent(n.getAttribute("src") ?? "").includes(keeriPhoto("casaba"))),
    [true],
    "overrides keep the banner's artwork",
  );
  const tables = await render("tables", content);
  assert.equal(tables.querySelector("h1")?.textContent, "Tables");
  assert.equal(
    tables.querySelector(".landing-products h2")?.textContent,
    "Best Sellers",
  );
  const unpublished = await render("sofas");
  assert.equal(unpublished.querySelector("h1")?.textContent, "Sofas");
});
test("reordering or hiding banners preserves each campaign's identity and leaves the introduction visible", async () => {
  const content = {
    ...structuredClone(defaultStorefrontContent),
    landingPages: [override],
  };
  const reordered = await render("sofas", content);
  assert.deepEqual(
    [...reordered.querySelectorAll("[data-campaign]")].map((n) =>
      n.getAttribute("data-campaign"),
    ),
    ["sofas-sale", "sofas-hero"],
  );
  content.landingPages[0] = {
    ...override,
    sections: [
      { key: "hero", enabled: false },
      { key: "sale", enabled: true },
    ],
  };
  const hidden = await render("sofas", content);
  assert.deepEqual(
    [...hidden.querySelectorAll("[data-campaign]")].map((n) =>
      n.getAttribute("data-campaign"),
    ),
    ["sofas-sale"],
  );
  assert.equal(
    hidden.querySelector("h1")?.textContent,
    "Sofas for everyday living",
  );
});
test("category contract accepts bounded overrides and rejects unknown or duplicate page, section, and item identities", () => {
  const content = {
    ...structuredClone(defaultStorefrontContent),
    landingPages: [override],
  };
  assert.equal(storefrontContentSchema.safeParse(content).success, true);
  for (const landingPages of [
    [override, override],
    [{ ...override, slug: "checkout" }],
    [{ ...override, sections: [{ key: "unknown", enabled: true }] }],
    [{ ...override, sections: [{ key: "consoles", enabled: true }] }],
    [
      {
        ...override,
        sections: [
          { key: "hero", enabled: true },
          { key: "hero", enabled: false },
        ],
      },
    ],
    [
      {
        ...override,
        sections: [
          {
            key: "categories",
            enabled: true,
            items: [{ key: "unknown", title: "Wrong tile" }],
          },
        ],
      },
    ],
    [
      {
        ...override,
        sections: [
          {
            key: "categories",
            enabled: true,
            items: [
              { key: "wooden-sofas", title: "One" },
              { key: "wooden-sofas", title: "Two" },
            ],
          },
        ],
      },
    ],
    [
      {
        ...override,
        sections: [
          {
            key: "categories",
            enabled: true,
            items: [
              {
                key: "wooden-sofas",
                title: "One",
                href: "https://evil.example",
              },
            ],
          },
        ],
      },
    ],
    [{ ...override, title: "\u0000" }],
  ])
    assert.equal(
      storefrontContentSchema.safeParse({ ...content, landingPages }).success,
      false,
    );
});
