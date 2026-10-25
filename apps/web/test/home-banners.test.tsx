import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import Home from "../app/page";
import { CampaignBanner } from "../components/campaign-banner";
import { ShopProvider } from "../components/shop-provider";

test("homepage places six linked Diwali campaigns in the corresponding Shopify sections", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(
      <ShopProvider>
        <Home />
      </ShopProvider>,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    const banners = [...doc.querySelectorAll<HTMLElement>("[data-campaign]")];
    assert.deepEqual(
      banners.map((b) => b.dataset.campaign),
      [
        "landing-announcement",
        "landing-dining-table",
        "landing-sofa-accent-chair",
        "landing-dining",
        "landing-storage",
        "landing-consoles",
      ],
    );
    assert.deepEqual(
      banners.map((b) => b.querySelector("a")?.getAttribute("href")),
      [
        "/collections/all",
        "/collections/dining",
        "/collections/sofas-and-chairs",
        "/collections/dinings",
        "/collections/storage",
        "/collections/console-tables",
      ],
    );
    for (const banner of banners) {
      assert.ok(banner.querySelector('[data-artwork="desktop"] img'));
      assert.ok(banner.querySelector('[data-artwork="mobile"] img'));
      assert.ok(banner.querySelector("a")?.textContent?.includes("Shop"));
    }
    assert.ok(doc.body.textContent?.includes("Shop By Category"));
    assert.ok(doc.body.textContent?.includes("Bestsellers"));
    assert.ok(doc.body.textContent?.includes("Starting from ₹25,000"));
    assert.ok(!doc.body.textContent?.includes("Made for the way you live."));
    assert.ok(
      [...doc.querySelectorAll("a")].every(
        (a) =>
          !/^https?:\/\/([^/]*\.)?(shop\.maplefurnishers\.com|myshopify\.com)/.test(
            a.href,
          ),
      ),
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("homepage includes source Instagram posts and the original customer testimonial", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(
      <ShopProvider>
        <Home />
      </ShopProvider>,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    const posts = [
      ...doc.querySelectorAll<HTMLAnchorElement>(".home-instagram-posts a"),
    ];
    assert.equal(
      posts.length,
      24,
      "Original Instagram post cards must appear, not just a profile link",
    );
    assert.ok(
      posts.every(
        (p) =>
          p.href.startsWith("https://www.instagram.com/") &&
          p.querySelector("img"),
      ),
    );
    assert.ok(
      doc
        .querySelector(".home-testimonial")
        ?.textContent?.includes(
          "Getting our sofa made by Maple was a completely hassle-free experience.",
        ),
    );
    assert.ok(
      doc.querySelector(".home-testimonial video source")?.getAttribute("src"),
    );
    const poster = doc
      .querySelector(".home-testimonial video")
      ?.getAttribute("poster");
    assert.ok(
      poster && !poster.includes("_small.jpg") && poster.includes("width=960"),
      "Customer video needs the verified full-resolution poster",
    );
    assert.ok(doc.querySelector(".home-values"));
    assert.ok(doc.querySelector(".home-cities"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("category campaigns target the product grid from their explicit default content", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(
      <CampaignBanner campaign="beds-hero" />,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    assert.equal(
      doc.querySelector("a")?.getAttribute("href"),
      "/collections/beds#collection-products",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("homepage preserves the original brand ticker and four offer collections", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    const stream = await renderToReadableStream(
      <ShopProvider>
        <Home />
      </ShopProvider>,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    assert.equal(
      doc.querySelector(".home-ticker")?.textContent,
      "Elegance isn't found. At Maple, it is custom-built.",
    );
    assert.deepEqual(
      [...doc.querySelectorAll(".home-offers a")].map((a) =>
        a.getAttribute("href"),
      ),
      [
        "/collections/clearance-sale",
        "/collections/minimum-60-off",
        "/collections/best-buy-under-rs-50-000",
        "/collections/furniture-store-under-rs-25-000",
      ],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
