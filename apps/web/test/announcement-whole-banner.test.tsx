import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import { storefrontContentSchema } from "@shopmaple/contracts";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { campaignArtworkDisplay } from "../lib/campaign-artwork";
import { previewReadyContent } from "../lib/draft-pictures";

// Owner, 19 Nov 2026: a finished banner uploaded for the homepage announcement never showed as made. The announcement is a
// "strip" built around a photo: it cut the picture off after its left half, faded it, and wrote the campaign's words a second
// time beside it, and it never used the phone banner. A banner staff upload now shows whole, at its own proportions, with
// the phone banner on phones; the theme's own strip and every other banner are unchanged.

const desktop = `/media/uploads/${"a".repeat(64)}.webp`, phone = `/media/uploads/${"b".repeat(64)}.webp`;
type Content = typeof defaultStorefrontContent;
const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: `https://store.maplefurnishers.com/media/keeri/${handle}.webp`, pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });

async function renderHome(edit?: (content: Content) => void) {
  const content = structuredClone(defaultStorefrontContent);
  edit?.(content);
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content });
    if (url.pathname.endsWith("/api/catalogue/cards")) return Response.json({ products: (url.searchParams.get("handles") ?? "").split(",").map(card), published: true });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous;
  }
}
const section = (doc: Document, key: string) => doc.querySelector(`[data-home-section="${key}"]`)!;
const announcement = (content: Content) => content.campaigns.find((campaign) => campaign.key === "landing-announcement")!;
/** The live campaign as published on 18 Nov 2026: the owner's own Diwali banner, words and button drawn into the picture. */
const owners = (display?: "banner" | "photo") => (content: Content) => Object.assign(announcement(content), {
  label: "", headline: ["Decked for Diwali"], supporting: "", offer: ["Up to 40% off selected furniture"], eligibility: "", cta: "Shop the Diwali Sale", href: "/collections/all",
  artwork: { desktopImage: desktop, mobileImage: phone, alt: "Decked for Diwali", ...(display ? { display } : {}) },
});

test("an uploaded banner is the whole announcement: uncropped, the phone banner on phones, one link, no words written over or beside it", async () => {
  const doc = await renderHome(owners());
  const strip = section(doc, "announcement").querySelector<HTMLElement>('[data-campaign="landing-announcement"]')!;
  assert.ok(strip.hasAttribute("data-campaign-whole"), "shown as the whole banner");
  assert.equal(strip.getAttribute("data-campaign-layout"), "strip", "still the announcement's strip, inside its band");
  const link = strip.querySelector<HTMLAnchorElement>("a.campaign-whole-link")!;
  assert.equal(link.getAttribute("href"), "/collections/all");
  assert.equal(link.getAttribute("data-picture-target"), "campaign:landing-announcement", "a click in the live preview still opens its picture chooser");
  const picture = link.querySelector("picture")!;
  assert.equal(picture.querySelector("source")?.getAttribute("media"), "(max-width: 749px)");
  assert.equal(picture.querySelector("source")?.getAttribute("srcset"), phone, "the phone banner on phones");
  const image = picture.querySelector("img")!;
  assert.deepEqual([image.getAttribute("src"), image.getAttribute("alt"), image.getAttribute("loading")], [desktop, "Decked for Diwali", "eager"]);
  assert.equal(image.hasAttribute("srcset"), false, "the banner itself, not a resized crop");
  assert.equal(strip.querySelector(".campaign-copy, h2, .campaign-art-desktop, .campaign-art-mobile, .campaign-art-tile, [data-campaign-ornament]"), null,
    "no strip design: no copy, ornament, photo layers or slices");
  assert.equal(link.querySelector(".sr-only")?.textContent, "Shop the Diwali Sale", "the button's words are still read to screen readers");
});

test("the strip's photo design stays for the theme's own photo and for a picture staff mark as a photo", async () => {
  for (const doc of [await renderHome(), await renderHome(owners("photo"))]) {
    const strip = section(doc, "announcement").querySelector<HTMLElement>('[data-campaign="landing-announcement"]')!;
    assert.equal(strip.hasAttribute("data-campaign-whole"), false);
    assert.ok(strip.querySelector("[data-campaign-ornament]") && strip.querySelector(".campaign-copy h2") && strip.querySelector(".campaign-art-desktop img"));
  }
});

test("every other banner is drawn exactly as before, whatever their pictures", async () => {
  const withUploads = (content: Content) => {
    owners()(content);
    for (const campaign of content.campaigns) if (campaign.key !== "landing-announcement") campaign.artwork = { desktopImage: desktop, mobileImage: phone, alt: campaign.headline.join(" ") || "Banner" };
  };
  const [before, after] = [await renderHome(), await renderHome(withUploads)];
  for (const key of ["dining-banner", "seating-banner", "promos"]) {
    for (const doc of [before, after]) assert.equal(section(doc, key).querySelector("[data-campaign-whole]"), null, `${key} is never a whole-banner strip`);
    const banner = section(after, key).querySelector(".campaign-banner")!;
    assert.ok(banner.querySelector(".campaign-copy h2") && banner.querySelector(".campaign-art-desktop img"), `${key} keeps its words over its picture`);
  }
});

test("how the announcement shows its picture: staff's choice, else a library picture is a banner and the theme's photo a photo", () => {
  assert.equal(campaignArtworkDisplay({ desktopImage: desktop }), "banner");
  assert.equal(campaignArtworkDisplay({ desktopImage: `/api/admin/media/${"a".repeat(64)}/preview` }), "banner", "the same picture in the staff preview");
  assert.equal(campaignArtworkDisplay({ desktopImage: "" }), "banner", "a replacement whose picture is still being chosen");
  assert.equal(campaignArtworkDisplay({ desktopImage: "/media/home/strip-always-together.webp" }), "photo", "the theme's Always Together photo");
  assert.equal(campaignArtworkDisplay({ desktopImage: desktop, display: "photo" }), "photo");
  assert.equal(campaignArtworkDisplay({ desktopImage: "/media/home/strip-always-together.webp", display: "banner" }), "banner");
});

test("the choice is saved with the artwork, kept by the live preview's save, and nothing else is accepted", () => {
  const content = structuredClone(defaultStorefrontContent);
  owners("photo")(content);
  assert.ok(storefrontContentSchema.safeParse(content).success);
  assert.equal(announcement(previewReadyContent(content).content).artwork?.display, "photo");
  // The live preview completes a half-chosen picture in its own copy; the choice survives that too.
  Object.assign(announcement(content).artwork!, { mobileImage: "" });
  assert.equal(announcement(previewReadyContent(content).content).artwork?.display, "photo");
  Object.assign(announcement(content).artwork!, { mobileImage: phone, display: "full" });
  assert.equal(storefrontContentSchema.safeParse(content).success, false);
});

test("the whole banner keeps its own shape at every width, with the strip's corners and none of its photo styling", () => {
  const css = readFileSync(new URL("../styles/home-impact.css", import.meta.url), "utf8");
  const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
  assert.match(rule('[data-campaign-layout="strip"][data-campaign-whole] .campaign-scene'), /aspect-ratio: auto;[\s\S]*height: auto;[\s\S]*background: none;/);
  assert.match(rule('[data-campaign-layout="strip"][data-campaign-whole] .campaign-scene::after'), /content: none;/, "no line-art flowers over the banner");
  assert.match(css, /\[data-campaign-whole\] \.campaign-whole-picture img \{\s*height: auto;\s*aspect-ratio: auto 1900 \/ 350;/, "laid out as a 1900 × 350 banner until it loads, then at its own shape");
  assert.match(css, /@media \(max-width: 749px\) \{\s*\[data-campaign-whole\] \.campaign-whole-picture img \{\s*aspect-ratio: auto 1 \/ 1;/, "the phone banner is square until it loads");
});
