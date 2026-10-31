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
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
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
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    const stream = await renderToReadableStream(
      <ShopProvider>
        <Home />
      </ShopProvider>,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    const posts = [
      ...doc.querySelectorAll<HTMLAnchorElement>('[aria-label="Instagram posts"] a'),
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
        .querySelector("[data-home-testimonial]")
        ?.textContent?.includes(
          "Getting our sofa made by Maple was a completely hassle-free experience.",
        ),
    );
    assert.ok(
      doc.querySelector("[data-home-testimonial] video source")?.getAttribute("src"),
    );
    const poster = doc
      .querySelector("[data-home-testimonial] video")
      ?.getAttribute("poster");
    assert.ok(
      poster && !poster.includes("_small.jpg") && poster.includes("width=960"),
      "Customer video needs the verified full-resolution poster",
    );
    assert.ok(doc.querySelector("[data-home-values]"));
    assert.ok(doc.querySelector("[data-home-cities]"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("category campaigns target the product grid from their explicit default content", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
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
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    const stream = await renderToReadableStream(
      <ShopProvider>
        <Home />
      </ShopProvider>,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    assert.equal(
      doc.querySelector("[data-ticker-copy]")?.textContent,
      "Elegance isn't found. At Maple, it is custom-built.",
    );
    assert.deepEqual(
      [...doc.querySelectorAll("[data-home-offers] a")].map((a) =>
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

test("published responsive campaign artwork replaces default layers while preserving copy and destination", async () => {
  const { defaultStorefrontContent } = await import("../lib/content-defaults");
  const content = structuredClone(defaultStorefrontContent);
  const campaign = content.campaigns.find((c) => c.key === "sofas-hero")!;
  campaign.artwork = {
    desktopImage: "/media/uploads/" + "a".repeat(64) + ".webp",
    mobileImage: "/media/uploads/" + "b".repeat(64) + ".webp",
    alt: "Approved Maple artwork",
  };
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ version: 4, content });
  try {
    const stream = await renderToReadableStream(
      <CampaignBanner campaign="sofas-hero" />,
    );
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    assert.equal(
      doc.querySelector('[data-artwork="desktop"] img')?.getAttribute("src"),
      campaign.artwork.desktopImage,
    );
    assert.equal(
      doc.querySelector('[data-artwork="mobile"] img')?.getAttribute("src"),
      campaign.artwork.mobileImage,
    );
    assert.equal(doc.querySelectorAll("[data-figma-node]").length, 0);
    assert.equal(doc.querySelector("a")?.getAttribute("href"), campaign.href);
    assert.ok(doc.body.textContent?.includes(campaign.headline[0]!));
  } finally {
    globalThis.fetch = previous;
  }
});
