import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { collectionHeroKeys, collectionHeroPages, storefrontContentSchema } from "@shopmaple/contracts";
import { collectionTitles } from "@shopmaple/contracts/catalogue-registry";
import { CollectionHero, type HeroCover } from "../components/store/collection-hero";
import { collectionIntro } from "../lib/collection-intro";
import { resolveTemplateMedia, templateMediaSlots } from "../lib/template-media-defaults";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Owner, 19 Nov 2026: the Tables, Collections and Beds pages' pictures could not be changed from the live preview. The big
// photo at the top of every collection page was the collection's first product photo, picked by the page, with nothing to
// edit. Each collection page now has a hero placement on the Artwork screen; until staff upload one, the photo is as before.

const cover: HeroCover = { image: "https://store.maplefurnishers.com/media/keeri/aster-bed.webp", title: "Aster Bed", handle: "aster-bed", pricePaise: 18500000 };
const upload = `/api/admin/media/${"a".repeat(64)}/preview`;
const draw = (props: Partial<React.ComponentProps<typeof CollectionHero>>) =>
  new JSDOM(renderToStaticMarkup(<CollectionHero title="Beds" crumb="Beds" intro={collectionIntro("beds")} cover={cover} slot="collection-hero-beds" {...props} />)).window.document;

test("every collection page has a hero placement, named as the catalogue names the collection", () => {
  assert.deepEqual(collectionHeroPages.map(([handle]) => handle).sort(), Object.keys(collectionTitles).sort(), "a collection added to the catalogue needs its hero placement too");
  for (const [handle, title] of collectionHeroPages) assert.equal(title, collectionTitles[handle], handle);
  assert.equal(collectionHeroKeys.length, collectionHeroPages.length);
  assert.ok(collectionHeroKeys.includes("collection-hero-tables") && collectionHeroKeys.includes("collection-hero-beds") && collectionHeroKeys.includes("collection-hero-all"));
});

test("a hero with a chosen photo draws it across the width and names its placement; the featured piece stays", () => {
  const doc = draw({ picture: upload });
  const hero = doc.querySelector<HTMLElement>("[data-collection-hero]")!;
  assert.equal(hero.getAttribute("data-media-slot-area"), "collection-hero-beds", "a click anywhere on the hero opens its picture");
  const photo = hero.querySelector("[data-hero-photo]")!;
  assert.equal(photo.getAttribute("data-media-slot"), "collection-hero-beds", "the live preview swaps the chosen picture in here");
  assert.equal(photo.querySelector("img")?.getAttribute("src"), upload);
  assert.match(photo.getAttribute("class") ?? "", /\binset-0\b/, "across the whole width, not kept to the product photo's size");
  assert.match(decodeURIComponent(hero.querySelector("[data-featured-product] img")?.getAttribute("src") ?? ""), /aster-bed/, "the featured piece keeps its own photo");
});

test("until staff choose one, the hero keeps the collection's first product photo, and it still opens the placement", () => {
  const doc = draw({});
  const photo = doc.querySelector("[data-collection-hero] [data-hero-photo]")!;
  assert.equal(photo.getAttribute("data-media-slot"), "collection-hero-beds");
  assert.match(decodeURIComponent(photo.querySelector("img")?.getAttribute("src") ?? ""), /aster-bed/);
  const empty = draw({ cover: null });
  assert.equal(empty.querySelector("[data-collection-hero]")?.getAttribute("data-media-slot-area"), "collection-hero-beds", "an empty collection's hero can be given a photo too");
});

test("the Artwork screen lists every collection hero, says what shows meanwhile, and a hero photo is a valid draft", () => {
  const heroes = templateMediaSlots.filter((slot) => slot.group === "Collection pages");
  assert.equal(heroes.length, collectionHeroPages.length);
  const beds = heroes.find((slot) => slot.key === "collection-hero-beds")!;
  assert.equal(beds.label, "Beds (/collections/beds)");
  assert.equal(beds.standIn, "the collection's first product photo");
  assert.deepEqual(Object.keys(resolveTemplateMedia("collection-hero-beds")).sort(), ["alt", "image", "key"], "staff-facing notes never reach the draft");
  const content = { ...structuredClone(defaultStorefrontContent), templateMedia: [{ key: "collection-hero-beds" as const, image: `/media/uploads/${"a".repeat(64)}.webp`, alt: "" }] };
  assert.ok(storefrontContentSchema.safeParse(content).success, "a hero photo may go without a description: the page title speaks for it");
});
