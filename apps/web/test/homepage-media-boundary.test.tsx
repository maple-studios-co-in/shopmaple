import assert from "node:assert/strict";
import test from "node:test";
import React, { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { TemplateMedia } from "@shopmaple/contracts";
import Home from "../app/page";
import { Hero } from "../components/hero";
import { HomeNimbus } from "../components/home-nimbus";
import { defaultStorefrontContent } from "../lib/content-defaults";

const files = "https://shop.maplefurnishers.com/cdn/shop/files/";
const partial: TemplateMedia = [
  { key: "home-hero-chairs", image: "/media/custom-chair.webp", alt: "Custom chair" },
  { key: "home-nimbus", image: "/media/nimbus-wide.webp", mobileImage: "/media/nimbus-small.webp", alt: "Custom Nimbus" },
  { key: "story-hero", image: "/media/story-only.webp", alt: "Story only" },
];

// Catches lost defaults, wrong key selection and applying a different slot's override.
test("homepage islands retain exact default art and resolve partial overrides by slot", () => {
  for (const media of [undefined, partial]) {
    const doc = new JSDOM(renderToStaticMarkup(<><Hero media={media} /><HomeNimbus media={media} /></>)).window.document;
    assert.equal(doc.querySelector(".hero-film img")?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/files/preview_images/f9239e922cef45df9972f1dac1b89e0a.thumbnail.0000000000.jpg?v=1792990295&width=1600");
    assert.equal(doc.querySelector(".hero-film img")?.getAttribute("alt"), "Arranging flowers on a Maple sideboard beside a floral armchair");
    // The latest shop film plays on its own; only its metadata loads before playback (owner, 2026-11-01).
    assert.equal(doc.querySelector(".hero-film video")?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0");
    assert.equal(doc.querySelector(".hero-film video")?.getAttribute("preload"), "metadata");
    assert.deepEqual([...doc.querySelectorAll(".category-tile img")].map(node => node.getAttribute("src")), [
      "/media/home/hero-sofas.webp", media ? "/media/custom-chair.webp" : "/media/home/hero-chairs.webp",
      "/media/home/hero-tables.webp", "/media/home/hero-beds.webp",
    ]);
    assert.equal(doc.querySelector('.category-tile[href="/pages/chairs"] img')?.getAttribute("alt"), media ? "Custom chair" : "");
    assert.equal(doc.querySelector(".home-nimbus-media img")?.getAttribute("src"), media ? "/media/nimbus-wide.webp" : "/media/home/nimbus-clouds.webp");
    assert.equal(doc.querySelector(".home-nimbus-media source")?.getAttribute("srcset"), media ? "/media/nimbus-small.webp" : "/media/home/nimbus-clouds.webp");
    assert.equal(doc.querySelector(".home-nimbus-media img")?.getAttribute("alt"), media ? "Custom Nimbus" : "The Nimbus Collection — cloud-like upholstered furniture");
    assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Explore Collection");
    assert.equal(doc.querySelector(".home-nimbus h2")?.textContent, "The Nimbus Collection");
    assert.equal(doc.querySelector(".home-nimbus-content a")?.getAttribute("href"), "/pages/nimbus-collection");
  }
});

function islandProps(node: ReactNode, component: unknown): { media?: TemplateMedia } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; media?: TemplateMedia }>(child)) continue;
    if (child.type === component) return child.props;
    const found = islandProps(child.props.children, component);
    if (found) return found;
  }
}

// This is the server/client prop boundary serialized by Next, not source import structure.
test("published homepage sends each interactive island only its own media overrides", async () => {
  const content = structuredClone(defaultStorefrontContent);
  content.templateMedia = partial;
  content.homeSections = [{ key: "hero", enabled: true }, { key: "nimbus", enabled: true }];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).endsWith("/api/content/storefront"), "Only the public published endpoint is read");
    assert.equal(init?.cache, "no-store");
    return Response.json({ version: 11, content });
  };
  try {
    const page = await Home();
    const hero = islandProps(page, Hero);
    const nimbus = islandProps(page, HomeNimbus);
    assert.ok(hero);
    assert.ok(nimbus);
    assert.deepEqual(hero.media, [{ key: "home-hero-chairs", image: "/media/custom-chair.webp", alt: "Custom chair" }]);
    assert.deepEqual(nimbus.media, [{ key: "home-nimbus", image: "/media/nimbus-wide.webp", mobileImage: "/media/nimbus-small.webp", alt: "Custom Nimbus" }]);
  } finally { globalThis.fetch = previous; }
});
