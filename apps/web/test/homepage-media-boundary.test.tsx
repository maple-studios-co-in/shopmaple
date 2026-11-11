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

const keeri = (id: string) => `https://store.maplefurnishers.com/media/keeri/${id}.webp`;
// Keeri product photos standing in for the default hero's four stills (no film: it was on Shopify).
const photos = new Map([["arbor-sofa", keeri("arbor")], ["aurevo", keeri("aurevo")], ["altura-table", keeri("altura")], ["meridian-table", keeri("meridian")]]);
const partial: TemplateMedia = [
  { key: "home-hero-chairs", image: "/media/custom-chair.webp", alt: "Custom chair" },
  { key: "home-nimbus", image: "/media/nimbus-wide.webp", mobileImage: "/media/nimbus-small.webp", alt: "Custom Nimbus" },
  { key: "story-hero", image: "/media/story-only.webp", alt: "Story only" },
];

// Catches lost defaults, wrong key selection and applying a different slot's override.
test("homepage islands retain exact default art and resolve partial overrides by slot", () => {
  for (const media of [undefined, partial]) {
    const doc = new JSDOM(renderToStaticMarkup(<><Hero media={media} photos={photos} /><HomeNimbus media={media} /></>)).window.document;
    assert.deepEqual([...doc.querySelectorAll(".hero-film [data-hero-slide] img")].map(node => node.getAttribute("src")), [keeri("arbor"), keeri("aurevo"), keeri("altura"), keeri("meridian")]);
    assert.equal(doc.querySelector(".hero-film img")?.getAttribute("alt"), "Maple furniture");
    assert.equal(doc.querySelector(".hero-film video"), null, "no default film");
    assert.deepEqual([...doc.querySelectorAll(".category-tile img")].map(node => node.getAttribute("src")), [
      "/media/home/hero-sofas.webp", media ? "/media/custom-chair.webp" : "/media/home/hero-chairs.webp",
      "/media/home/hero-tables.webp", "/media/home/hero-beds.webp",
    ]);
    assert.equal(doc.querySelector('.category-tile[href="/chairs"] img')?.getAttribute("alt"), media ? "Custom chair" : "");
    assert.equal(doc.querySelector(".nimbus-stage-media img")?.getAttribute("src"), media ? "/media/nimbus-wide.webp" : "/media/home/nimbus-clouds.webp");
    assert.equal(doc.querySelector(".nimbus-stage-media source")?.getAttribute("srcset"), media ? "/media/nimbus-small.webp" : "/media/home/nimbus-clouds.webp");
    assert.equal(doc.querySelector(".nimbus-stage-media img")?.getAttribute("alt"), media ? "Custom Nimbus" : "The Nimbus Collection — cloud-like upholstered furniture");
    assert.equal(doc.querySelector(".hero-cta")?.textContent?.trim(), "Explore Collection");
    assert.equal(doc.querySelector("[data-nimbus-heading]")?.textContent, "The Nimbus Collection");
    assert.equal(doc.querySelector("[data-nimbus-explore]")?.getAttribute("href"), "/nimbus-collection");
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
    // The public published content, and the catalogue cards whose photos stand in for the hero's stills.
    if (new URL(String(input)).pathname === "/api/catalogue/cards") return Response.json({ products: [], published: true });
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
