import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProductFaq } from "../components/store/product-faq";
import { ProductFeatures, type Feature } from "../components/store/product-features";

// The owner's note (6 Nov 2026): on the product page every "+" that opens something becomes an arrow pointing up, which
// turns to point down once open, and the cards lose their numbers: only the arrow stands in that corner.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/products/nola" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const features: Feature[] = [
  { key: "about", title: "About Product", icon: "detail-finish", body: "A generously cushioned seat. ".repeat(8).trim(), link: { label: "Explore finishes with Maple", href: "/pages/contact" } },
  { key: "materials", title: "Materials", icon: "detail-material", rows: [["Frame", "Oak"], ["Seat", "Bouclé"]], link: { label: "Explore materials with Maple", href: "/pages/contact" } },
  { key: "specification", title: "Specifications", icon: "detail-spec", rows: [["Width", "71 cm"], ["Depth", "61 cm"], ["Warranty", "36 Months"]] },
  { key: "care", title: "Material Care", icon: "detail-care", body: "Dust weekly." },
];

async function mount(element: React.ReactNode, run: (root: HTMLElement) => Promise<void> | void) {
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  await act(async () => root.render(<AppRouterContext.Provider value={router as never}>{element}</AppRouterContext.Provider>));
  try { await run(host); } finally { await act(async () => root.unmount()); }
}

const isUpArrow = (svg: Element | null | undefined) => Boolean(svg?.classList.contains("lucide-arrow-up"));

test("the cards carry an arrow where their numbers were, up when closed and down once open", async () => {
  await mount(<ProductFeatures features={features} title="Nola Accent Chair" tagline="Your choice of finish." photo="https://example.com/nola.jpg" />, async (host) => {
    const cards = [...host.querySelectorAll<HTMLElement>("[data-feature]")];
    assert.equal(cards.length, 4);
    assert.equal(host.querySelector("[data-feature-number]"), null, "no card shows a number");
    for (const card of cards) assert.doesNotMatch(card.textContent ?? "", /\b0[1-4]\b/, `${card.dataset.feature} still reads like a numbered card`);
    assert.equal(host.querySelector(".lucide-plus"), null, "no plus icon is left on a card");
    const arrows = cards.map((card) => card.querySelector<HTMLElement>("[data-feature-arrow]"));
    assert.deepEqual(arrows.map((arrow) => isUpArrow(arrow?.querySelector("svg"))), [true, true, true, false], "the arrow points up, and a card with nothing more to show has none");
    for (const arrow of arrows.slice(0, 3)) {
      assert.match(arrow!.className, /group-aria-expanded\/toggle:rotate-180/, "it turns to point down once the card is open");
      assert.doesNotMatch(arrow!.className, /rotate-45/, "the plus's quarter turn is gone");
      assert.ok(arrow!.closest("button[data-feature-toggle]"), "the arrow belongs to the card's toggle, so it opens the card");
    }
    // The toggle is still named by the card's title alone: the arrow is decoration for screen readers.
    assert.equal(arrows[0]!.getAttribute("aria-hidden"), "true");
    const toggle = cards[0]!.querySelector<HTMLButtonElement>("h3 button[data-feature-toggle]")!;
    assert.equal(toggle.textContent, "About Product");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    await act(async () => toggle.click());
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
  });
});

// The owner's later note (9 Nov 2026): the hotspots are a plus again, dark on a light disc, while the cards keep their arrows.
test("the hotspots on the photo are a dark plus on a light disc that turns to a cross while open", async () => {
  await mount(<ProductFeatures features={features} highlights={["Hand-woven seat", "Solid oak frame"]} title="Nola Accent Chair" tagline="Your choice of finish." photo="https://example.com/nola.jpg" />, async (host) => {
    const spots = [...host.querySelectorAll<HTMLButtonElement>("button[data-highlight-spot]")];
    assert.equal(spots.length, 2);
    for (const spot of spots) {
      assert.equal(spot.textContent, "", "the plus is drawn, not typed");
      const plus = spot.querySelector<HTMLElement>("[data-highlight-plus]")!;
      assert.ok(plus.querySelector("svg")?.classList.contains("lucide-plus"));
      assert.match(plus.className, /bg-\[#f6e8e5\]/);
      assert.match(plus.className, /text-maple/);
      assert.match(plus.className, /group-aria-expanded\/spot:rotate-45/);
      assert.equal(spot.querySelector("[data-highlight-arrow]"), null);
    }
    await act(async () => spots[0]!.click());
    assert.equal(spots[0]!.getAttribute("aria-expanded"), "true");
    assert.equal(spots[0]!.parentElement!.querySelector<HTMLElement>("[data-highlight-chip]")!.hidden, false, "it still opens its chip");
  });
});

test("the questions use the same arrow instead of a drawn plus, down when the answer shows", async () => {
  await mount(<ProductFaq />, (host) => {
    const items = [...host.querySelectorAll<HTMLDetailsElement>("details[data-faq-item]")];
    assert.ok(items.length >= 6);
    for (const item of items) {
      const arrow = item.querySelector<HTMLElement>("summary [data-faq-arrow]")!;
      assert.ok(isUpArrow(arrow.querySelector("svg")), "each question opens from an up arrow");
      assert.match(arrow.className, /group-open:rotate-180/, "and it turns down once the answer shows");
      assert.doesNotMatch(arrow.className, /before:|after:/, "the plus and minus were drawn with pseudo-elements");
    }
  });
});
