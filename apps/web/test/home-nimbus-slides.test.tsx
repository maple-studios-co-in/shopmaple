import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { HomeDetails } from "@shopmaple/contracts";
import { HomeNimbus } from "../components/home-nimbus";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { mountStage } from "../lib/home-effects";

// The collections stage: the Nimbus card, driven by the Nimbus fields as before, then up to five extra
// collections the staff add (Terra or any other theme). Server markup holds every collection stacked;
// the lazy effects fade one into the next when the ring round its number closes.
const extras: NonNullable<HomeDetails["nimbus"]["slides"]> = [
  { heading: "The Terra Collection", tagline: "Earthy and warm", features: ["Warm tones", "Grounded forms", "Natural fibres", "Calm rooms"], cta: "Shop Terra", href: "/collections/terra", image: "/media/uploads/" + "d".repeat(64) + ".webp", mobileImage: "/media/uploads/" + "e".repeat(64) + ".webp", alt: "Terra sofa" },
  { heading: "The Olive Collection", tagline: "Quietly green", features: ["Soft green", "Deep seats", "Easy care", "Light frames"], cta: "Shop Olive", href: "/pages/olive", image: "/media/uploads/" + "f".repeat(64) + ".webp", alt: "Olive armchair" },
];
const content = (slides?: HomeDetails["nimbus"]["slides"]): HomeDetails["nimbus"] => ({ ...defaultHomeDetails.nimbus, slides });
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const all = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const cards = (root: ParentNode) => all(root, "[data-nimbus-slide]");

test("without extra slides it is the single Nimbus card, with no numbers", () => {
  const page = doc(<HomeNimbus content={content(undefined)} />);
  assert.equal(cards(page).length, 1);
  assert.equal(page.querySelector("[data-nimbus-heading]")?.textContent, "The Nimbus Collection");
  assert.equal(page.querySelector("[data-nimbus-word]")?.textContent, "Nimbus");
  assert.equal(page.querySelector("[data-nimbus-lead]")?.textContent, "Soft presence. Strong craftsmanship.");
  assert.equal(page.querySelector("[data-nimbus-explore]")?.getAttribute("href"), "/pages/nimbus-collection");
  assert.equal(all(page, "[data-stage-dot]").length, 0);
  assert.equal(page.querySelector("section")?.getAttribute("aria-label"), "The Nimbus Collection");
});

test("extra collections follow the base card, each with its own words, artwork and links", () => {
  const page = doc(<HomeNimbus content={content(extras)} />);
  const rendered = cards(page);
  assert.equal(rendered.length, 3);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-heading]")?.textContent), ["The Nimbus Collection", "The Terra Collection", "The Olive Collection"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-word]")?.textContent), ["Nimbus", "Terra", "Olive"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-lead]")?.textContent), ["Soft presence. Strong craftsmanship.", "Earthy and warm", "Quietly green"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-explore]")?.getAttribute("href")), ["/pages/nimbus-collection", "/collections/terra", "/pages/olive"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-explore]")?.textContent), ["Explore", "Shop Terra", "Shop Olive"]);
  const terra = rendered[1]!.querySelector("picture")!;
  assert.equal(terra.querySelector("img")?.getAttribute("src"), extras[0]!.image);
  assert.equal(terra.querySelector("img")?.getAttribute("alt"), "Terra sofa");
  assert.equal(terra.querySelector("source")?.getAttribute("srcset"), extras[0]!.mobileImage);
  assert.equal(rendered[2]!.querySelector("picture source"), null, "mobile artwork is optional");
  assert.equal(rendered[2]!.querySelector("picture img")?.getAttribute("alt"), "Olive armchair");
  assert.equal(rendered[0]!.querySelector("picture img")?.getAttribute("alt"), "The Nimbus Collection — cloud-like upholstered furniture", "the base card keeps its template artwork");
  assert.deepEqual(all(page, "[data-stage-backdrop]").map(image => image.getAttribute("src")), rendered.map(card => card.querySelector("picture img")?.getAttribute("src")),
    "each collection's photo also fills the band behind the card");
});

test("the arrow steps through every collection in turn, and a single card has none", () => {
  const dom = new JSDOM(renderToStaticMarkup(<HomeNimbus content={content(extras)} />));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const root = dom.window.document.querySelector<HTMLElement>("[data-stage]")!;
  const stop = mountStage(root, false);
  const shown = () => cards(root).findIndex(card => card.hasAttribute("data-active"));
  const next = root.querySelector<HTMLButtonElement>("[data-stage-next]")!;
  assert.deepEqual([1, 2, 3].map(() => { next.click(); return shown(); }), [1, 2, 0]);
  stop();
  assert.equal(doc(<HomeNimbus content={content(undefined)} />).querySelector("[data-stage-next]"), null);
});

test("several collections get numbered ring buttons, the first current, the rest inert until shown", () => {
  const page = doc(<HomeNimbus content={content(extras)} />);
  const dots = all(page, "[data-stage-dot]");
  assert.deepEqual(dots.map(dot => dot.tagName), ["BUTTON", "BUTTON", "BUTTON"]);
  assert.deepEqual(dots.map(dot => dot.textContent), ["1", "2", "3"]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("aria-label")), ["Show The Nimbus Collection", "Show The Terra Collection", "Show The Olive Collection"]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("aria-current")), ["true", null, null]);
  assert.deepEqual(cards(page).map(card => card.hasAttribute("data-active")), [true, false, false]);
  assert.deepEqual(cards(page).map(card => card.hasAttribute("inert")), [false, true, true]);
});

test("an extra slide with no artwork yet is left out of a draft", () => {
  assert.equal(cards(doc(<HomeNimbus content={content([extras[0]!, { ...extras[1]!, image: "" }])} />)).length, 2);
});

test("a number shows its collection and the others step back", () => {
  const dom = new JSDOM(renderToStaticMarkup(<HomeNimbus content={content(extras)} />));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const root = dom.window.document.querySelector<HTMLElement>("[data-stage]")!;
  const stop = mountStage(root, false);
  all(root, "[data-stage-dot]")[2]!.click();
  assert.deepEqual(all(root, "[data-stage-dot]").map(dot => dot.getAttribute("aria-current")), [null, null, "true"]);
  assert.deepEqual(cards(root).map(card => card.hasAttribute("data-active")), [false, false, true]);
  assert.deepEqual(cards(root).map(card => card.getAttribute("aria-hidden")), ["true", "true", null]);
  stop();
});

test("staff artwork that carries its own lettering gets no live word on top, only a heading for readers", () => {
  const page = doc(<HomeNimbus content={content(undefined)} media={[{ key: "home-nimbus", image: "https://shop.maplefurnishers.com/cdn/shop/files/custom-nimbus.webp", alt: "Staff artwork" }]} />);
  assert.equal(page.querySelector("[data-nimbus-word]"), null);
  assert.equal(page.querySelector("[data-nimbus-title]"), null);
  assert.equal(page.querySelector("h2.sr-only[data-nimbus-heading]")?.textContent, "The Nimbus Collection");
});
