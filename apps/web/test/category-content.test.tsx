import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import { CategoryLanding } from "../components/category-landing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { ShopProvider } from "../components/shop-provider";
import { storefrontContentSchema } from "@shopmaple/contracts";

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
async function render(
  slug: "sofas" | "tables" | "chairs",
  content: unknown = defaultStorefrontContent,
) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/content/storefront"))
      return Response.json({ version: 3, content });
    if (new URL(String(url)).pathname === "/api/catalogue/cards")
      return Response.json({ products: [], published: true });
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
test("category defaults preserve original copy, artwork, local collection links, and enquiry-only source products", async () => {
  const doc = await render("sofas");
  assert.equal(doc.querySelector("h1")?.textContent, "Sofas");
  assert.deepEqual(
    [...doc.querySelectorAll("[data-category-rail] h2")].map((n) => n.textContent),
    ["Best Sellers", "Sofas", "Bedrooms", "Living", "Paired Together"],
  );
  assert.equal(
    doc.querySelector(
      '[data-category-tile][href="/collections/wooden-sofas"] [data-tile-label]',
    )?.textContent,
    "Wooden Sofas",
  );
  assert.match(
    doc.querySelector("[data-value-card] [data-value-body]")?.textContent ?? "",
    /Where nature begins the story/,
  );
  assert.ok(
    [...doc.querySelectorAll("[data-room-card] img")].some((n) =>
      n.getAttribute("src")?.includes("2_-_Sofa_Mobile_banner_Outdoor"),
    ),
  );
  assert.ok(
    doc.querySelector(
      '[data-source-product] a[href^="/pages/contact?product="]',
    ),
  );
  assert.equal(
    doc.querySelector('[data-source-product] a[href^="/products/"]'),
    null,
  );
});
test("only published category overrides change the selected page while preserving artwork and destinations", async () => {
  const content = {
    ...structuredClone(defaultStorefrontContent),
    landingPages: [override],
  };
  const doc = await render("sofas", content);
  assert.equal(
    doc.querySelector("h1")?.textContent,
    "Sofas for everyday living",
  );
  assert.match(
    doc.querySelector("[data-category-intro] p")?.textContent ?? "",
    /Made for your family and your home/,
  );
  assert.equal(
    doc.querySelector(
      '[data-category-tile][href="/collections/wooden-sofas"] [data-tile-label]',
    )?.textContent,
    "Solid wood seating",
  );
  assert.deepEqual(
    [...doc.querySelectorAll("[data-category-rail] h2")].map((n) => n.textContent),
    ["Customer favourites", "Sofas", "Living", "Paired Together"],
  );
  assert.equal(
    doc.querySelector("[data-category-values] h2")?.textContent,
    "Make it yours",
  );
  assert.equal(
    doc.querySelector("[data-category-values] [data-section-eyebrow]")?.textContent,
    "Made by Maple",
  );
  assert.equal(
    doc.querySelector("[data-value-card] strong")?.textContent,
    "Natural grain",
  );
  assert.equal(
    doc.querySelector("[data-value-card] [data-value-body]")?.textContent,
    "Every grain tells its own story.",
  );
  assert.ok(
    [...doc.querySelectorAll("[data-room-card] img")].some((n) =>
      n.getAttribute("src")?.includes("2_-_Sofa_Mobile_banner_Outdoor"),
    ),
  );
  const tables = await render("tables", content);
  assert.equal(tables.querySelector("h1")?.textContent, "Tables");
  assert.equal(
    tables.querySelector("[data-category-rail] h2")?.textContent,
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
