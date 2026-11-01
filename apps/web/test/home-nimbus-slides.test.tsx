import assert from "node:assert/strict";
import { mock, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { HomeDetails } from "@shopmaple/contracts";
import { HomeNimbus } from "../components/home-nimbus";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { inBrowser } from "./support/slider-harness";

// The Nimbus card is a slider: the base card, driven by the Nimbus fields as before, then up to five
// extra collections the staff add (Terra or any other theme). Server markup holds every slide in a
// scroll-snap row; a lazy island adds the dots and the hover/toggle panel.
const extras: NonNullable<HomeDetails["nimbus"]["slides"]> = [
  { heading: "The Terra Collection", tagline: "Earthy and warm", features: ["Warm tones", "Grounded forms", "Natural fibres", "Calm rooms"], cta: "Shop Terra", href: "/collections/terra", image: "/media/uploads/" + "d".repeat(64) + ".webp", mobileImage: "/media/uploads/" + "e".repeat(64) + ".webp", alt: "Terra sofa" },
  { heading: "The Olive Collection", tagline: "Quietly green", features: ["Soft green", "Deep seats", "Easy care", "Light frames"], cta: "Shop Olive", href: "/pages/olive", image: "/media/uploads/" + "f".repeat(64) + ".webp", alt: "Olive armchair" },
];
const content = (slides?: HomeDetails["nimbus"]["slides"]): HomeDetails["nimbus"] => ({ ...defaultHomeDetails.nimbus, slides });
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const all = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const cards = (root: ParentNode) => all(root, "[data-nimbus-slide]");

test("without extra slides it is the single Nimbus card, with no dots", () => {
  const page = doc(<HomeNimbus />);
  assert.equal(cards(page).length, 1);
  assert.equal(page.querySelector("h2")?.textContent, "The Nimbus Collection");
  assert.equal(page.querySelector("[data-nimbus-lead]")?.textContent, "Comfort Shaped Like Clouds");
  assert.equal(page.querySelector("[data-nimbus-explore]")?.getAttribute("href"), "/pages/nimbus-collection");
  assert.equal(all(page, "[data-slider-dot]").length, 0);
  const toggle = page.querySelector("[data-slider-toggle]")!;
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "Explore the Nimbus Collection");
  assert.equal(page.getElementById(toggle.getAttribute("aria-controls")!)?.querySelector("h2")?.textContent, "The Nimbus Collection");
});

test("extra collections follow the base card, each with its own words, artwork and links", () => {
  const page = doc(<HomeNimbus content={content(extras)} />);
  const rendered = cards(page);
  assert.equal(rendered.length, 3);
  assert.deepEqual(rendered.map(card => card.querySelector("h2")?.textContent), ["The Nimbus Collection", "The Terra Collection", "The Olive Collection"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-lead]")?.textContent), ["Comfort Shaped Like Clouds", "Earthy and warm", "Quietly green"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-explore]")?.getAttribute("href")), ["/pages/nimbus-collection", "/collections/terra", "/pages/olive"]);
  assert.deepEqual(rendered.map(card => card.querySelector("[data-nimbus-explore]")?.textContent), ["Shop Now", "Shop Terra", "Shop Olive"]);
  assert.deepEqual(rendered.map(card => card.querySelector(".home-nimbus-content a")?.getAttribute("href")), ["/pages/nimbus-collection", "/collections/terra", "/pages/olive"]);
  assert.deepEqual(all(rendered[1]!, ".home-nimbus-icons span").map(span => span.textContent), extras[0]!.features);
  const terra = rendered[1]!.querySelector("picture")!;
  assert.equal(terra.querySelector("img")?.getAttribute("src"), extras[0]!.image);
  assert.equal(terra.querySelector("img")?.getAttribute("alt"), "Terra sofa");
  assert.equal(terra.querySelector("source")?.getAttribute("srcset"), extras[0]!.mobileImage);
  assert.equal(rendered[2]!.querySelector("picture source"), null, "mobile artwork is optional");
  assert.equal(rendered[2]!.querySelector("picture img")?.getAttribute("alt"), "Olive armchair");
  assert.equal(rendered[0]!.querySelector("picture img")?.getAttribute("alt"), "The Nimbus Collection — cloud-like upholstered furniture", "the base card keeps its template artwork");
  const controls = all(page, "[data-slider-toggle]").map(toggle => toggle.getAttribute("aria-controls"));
  assert.equal(new Set(controls).size, 3, "each panel has its own id");
  for (const id of controls) assert.ok(page.getElementById(id!), `panel ${id} exists`);
});

test("several slides get dots: real buttons, the first current", () => {
  const page = doc(<HomeNimbus content={content(extras)} />);
  const dots = all(page, "[data-slider-dot]");
  assert.deepEqual(dots.map(dot => dot.tagName), ["BUTTON", "BUTTON", "BUTTON"]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("aria-label")), ["Show slide 1", "Show slide 2", "Show slide 3"]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("aria-current")), ["true", null, null]);
  assert.deepEqual(cards(page).map(card => card.hasAttribute("data-active")), [true, false, false]);
});

test("an extra slide with no artwork yet is left out of a draft", () => {
  assert.equal(cards(doc(<HomeNimbus content={content([extras[0]!, { ...extras[1]!, image: "" }])} />)).length, 2);
});

const mountNimbus = (check: Parameters<typeof inBrowser>[2], many = extras) => inBrowser(<HomeNimbus content={content(many)} />, { island: "nimbus" }, check);
const current = (document: Document) => all(document, "[data-slider-dot]").map(dot => dot.getAttribute("aria-current"));
const track = (document: Document) => {
  const found = document.querySelector<HTMLElement>("[data-slider='nimbus'] [data-slider-track]");
  assert.ok(found, "the Nimbus card has a slide track");
  return found;
};

test("a dot shows its collection, and swiping moves the current dot", async () => {
  await mountNimbus(async (browser, document) => {
    const scrolls = browser.layout(track(document), 800);
    await browser.click(all(document, "[data-slider-dot]")[2]!);
    assert.deepEqual(current(document), [null, null, "true"]);
    assert.deepEqual(scrolls.at(-1), { left: 1600 });
    await browser.fire(track(document), "pointerdown");
    await browser.scrollTo(track(document), 800);
    assert.deepEqual(current(document), [null, "true", null], "grabbing the row mid-scroll hands control back to the shopper");
  });
});

test("the panel button opens and closes only its own card and says what it will do", async () => {
  await mountNimbus(async (browser, document) => {
    const toggles = all(document, "[data-slider-toggle]");
    assert.equal(toggles.length, 3, "every card has a panel button");
    const [base, terra] = toggles as [HTMLElement, HTMLElement];
    await browser.click(terra);
    assert.equal(terra.getAttribute("aria-expanded"), "true");
    assert.equal(terra.getAttribute("aria-label"), "Close Nimbus collection details");
    assert.equal(base.getAttribute("aria-expanded"), "false", "the other card stays closed");
    assert.equal(terra.closest("[data-nimbus-slide]")?.hasAttribute("data-open"), true);
    assert.equal(base.closest("[data-nimbus-slide]")?.hasAttribute("data-open"), false);
    await browser.click(terra);
    assert.equal(terra.getAttribute("aria-expanded"), "false");
    assert.equal(terra.getAttribute("aria-label"), "Explore the Nimbus Collection");
  });
});

test("focusing the button inside a panel opens that panel and brings its slide into view", async () => {
  await mountNimbus(async (browser, document) => {
    const scrolls = browser.layout(track(document), 800);
    const button = all(document, ".home-nimbus-content a")[1];
    assert.ok(button, "the Terra panel has a button");
    await browser.focus(button);
    const card = button.closest("[data-nimbus-slide]")!;
    assert.equal(card.querySelector("[data-slider-toggle]")?.getAttribute("aria-expanded"), "true");
    assert.deepEqual(current(document), [null, "true", null]);
    assert.deepEqual(scrolls.at(-1), { left: 800 });
  });
});

test("Nimbus never advances by itself, and the single card still opens its panel", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await mountNimbus(async (browser, document) => {
      mock.timers.tick(120000);
      assert.deepEqual(current(document), ["true", null, null]);
      await browser.unmount();
    });
    await inBrowser(<HomeNimbus />, { island: "nimbus" }, async (browser, document) => {
      const toggle = document.querySelector<HTMLElement>("[data-slider-toggle]")!;
      await browser.click(toggle);
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
    });
  } finally { mock.timers.reset(); }
});
