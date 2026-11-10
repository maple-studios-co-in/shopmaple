import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { hotspotNote } from "../lib/product-hotspots";
import { labelledRows } from "../lib/product-detail-text";

// The owner asked for a white-background photo with hotspots about fabric and material that changes with the finish
// (2026-11-01). Cut-outs and hotspot positions are presentation data; every note is read from the product's own text.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const materials = "• Frame & Legs: Solid wood, dark walnut and natural oak finishes\n • Upholstery: Velvet and Boucle over high-resilience foam\n \n The Beauty of Natural Materials\n Slight variations are part of its character.";
const dimensions = '• Width: 22" (≈ 56 cm)\n • Depth: 24" (≈ 61 cm)\n • Height: 34" (≈ 86 cm)';
const aero: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A dining chair.", category: "chairs", published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  images: ["https://example.com/p-1.jpg", "https://example.com/p-2.jpg"],
  sourceDetails: { details: "Details.", materials, dimensions, careInstructions: null, warranty: null },
  variants: [
    { id: "ivory", title: "Nordic Ivory", sku: "A", pricePaise: 2_400_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: ["https://example.com/ivory-1.jpg", "https://example.com/ivory-2.jpg"], slug: "nordic-ivory" },
    { id: "atlantic", title: "Deep Atlantic", sku: "B", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order", images: ["https://example.com/atlantic-1.jpg"], slug: "deep-atlantic" },
    { id: "plain", title: "Plain", sku: "C", pricePaise: 2_500_000, compareAtPaise: null, available: false, stockPolicy: "unverified", slug: "plain" },
  ],
};
const spots = [
  { x: 0.5, y: 0.5, label: "Upholstery", from: "materials", line: "Upholstery" },
  { x: 0.3, y: 0.75, label: "Frame & legs", from: "materials", line: "Frame & Legs" },
  { x: 0.5, y: 0.1, label: "Size", from: "dimensions" },
];
const cutouts = {
  "deep-atlantic": { image: "/product-page/cutouts/aero-dining-chair/deep-atlantic.jpg", hotspots: spots },
  "nordic-ivory": { image: "/product-page/cutouts/aero-dining-chair/nordic-ivory.jpg", hotspots: [{ ...spots[0], x: 0.4 }] },
};
async function mount(check: (doc: Document) => void | Promise<void>, value: Product = aero, presentation: object | undefined = { variantImages: {}, reviewLabel: null, cutouts }) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  window.history.replaceState(null, "", "/products/aero-dining-chair");
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ShopProvider><ProductDetail product={value} presentation={presentation as never} /></ShopProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const mainSrc = (doc: Document) => decodeURIComponent(doc.querySelector("[data-main-image] img")!.getAttribute("src")!);
const markers = (doc: Document) => [...doc.querySelectorAll<HTMLButtonElement>("[data-hotspots] button[data-hotspot]")];

test("the chosen finish opens on its white-background photo, also the first thumbnail, with no hotspots on it (owner, 4 Nov 2026)", async () => {
  await mount((doc) => {
    assert.match(mainSrc(doc), /cutouts\/aero-dining-chair\/deep-atlantic\.jpg/);
    assert.match(decodeURIComponent(doc.querySelector("[data-thumbnails] button img")!.getAttribute("src")!), /deep-atlantic\.jpg/);
    assert.match(decodeURIComponent(doc.querySelectorAll("[data-thumbnails] button img")[1]!.getAttribute("src")!), /atlantic-1\.jpg/, "then the finish's own photos");
    assert.equal(doc.querySelector("[data-hotspots]"), null, "the hero photo carries no hotspots");
    assert.equal(markers(doc).length, 0);
    assert.match(doc.querySelector("[data-main-image] img")!.className, /object-contain/, "drawn whole, not cropped");
  });
});

test("changing the finish swaps the white-background photo, and a finish without one shows its normal photo", async () => {
  await mount(async (doc) => {
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="ivory"]')!.click());
    assert.match(mainSrc(doc), /nordic-ivory\.jpg/);
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="plain"]')!.click());
    assert.doesNotMatch(mainSrc(doc), /cutouts/);
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="atlantic"]')!.click());
    assert.match(mainSrc(doc), /deep-atlantic\.jpg/);
    assert.equal(markers(doc).length, 0, "and never a hotspot on any of them");
  });
});

test("products without cut-out data behave as before", async () => {
  await mount((doc) => {
    assert.equal(markers(doc).length, 0);
    assert.doesNotMatch(mainSrc(doc), /cutouts/);
    assert.match(mainSrc(doc), /atlantic-1\.jpg/, "the finish's own first photo, as before");
  }, aero, { variantImages: {}, reviewLabel: null });
});

test("a tap on the white-background photo zooms at once: there is no note to dismiss first", async () => {
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await mount(async (doc) => {
    const photo = doc.querySelector<HTMLButtonElement>("button[data-main-image]")!;
    await act(async () => { photo.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })); photo.click(); });
    assert.equal(doc.querySelector("dialog")?.open, true);
  });
});

test("a finish whose only photo is the white-background one does not claim its photo is unavailable", async () => {
  await mount(async (doc) => {
    await act(async () => doc.querySelector<HTMLInputElement>('input[value="plain"]')!.click());
    assert.equal(doc.querySelector("p[role=status]"), null);
    assert.match(mainSrc(doc), /plain\.jpg/);
  }, aero,
  { variantImages: {}, reviewLabel: null, cutouts: { plain: { image: "/product-page/cutouts/plain.jpg", hotspots: [] } } });
});

// ---- "Precision in Every Detail" (owner, 10 Nov 2026): a card opens a floating chip popup; the card itself stays put ----
const features = (doc: Document) => doc.querySelector<HTMLElement>("[data-features]")!;
const card = (doc: Document, key: string) => doc.querySelector<HTMLElement>(`[data-feature="${key}"]`)!;
const toggleOf = (doc: Document, key: string) => card(doc, key).querySelector<HTMLButtonElement>("button[data-feature-toggle]")!;
const popOf = (doc: Document, key: string) => doc.getElementById(toggleOf(doc, key).getAttribute("aria-controls")!)!;
// The card as drawn, apart from its arrow's open state.
const drawn = (doc: Document, key: string) => card(doc, key).querySelector("[data-feature-surface]")!.outerHTML.replace(/ aria-expanded="(true|false)"/, "");
/** A window of the given width: from 1024px a popup floats beside its card, towards the photo; below, it is a bottom sheet. */
async function sized(run: () => Promise<void>, { width = 1280 } = {}) {
  const view = dom.window as unknown as { matchMedia?: unknown };
  const previous = view.matchMedia;
  view.matchMedia = (query: string) => {
    const min = /min-width: (\d+)px/.exec(query);
    return { matches: min ? width >= Number(min[1]) : false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
  try { await run(); } finally { view.matchMedia = previous; }
}

// The owner turned down a photo set inside a blurred copy of itself ("card inside card", 10 Nov 2026): a photograph
// fills its frame, as the product page's Figma draws it; only a white-background cut-out is shown whole on the page.
test("the section's photograph fills its frame, and no photo on the page sits inside a blurred copy of itself", async () => {
  await mount((doc) => {
    const frame = features(doc).querySelector("[data-feature-photo-frame]")!;
    const images = [...frame.querySelectorAll<HTMLImageElement>("img")];
    assert.equal(images.length, 1, "one photo, no second copy of it on the page");
    assert.match(images[0]!.getAttribute("alt")!, /detail view/);
    assert.match(frame.className, /\[&_img\]:object-cover/, "the photograph fills its frame");
    assert.equal(doc.querySelector("[data-photo-ambient]"), null, "no card inside a card anywhere on the page");
    for (const thumbnail of doc.querySelectorAll("[data-thumbnails] button")) assert.match(thumbnail.className, /\[&_img\]:object-cover/, "thumbnails fill their tiles");
  });
});

test("under the photo only the piece's name, set bolder: no line beneath it, for any piece (owner, 10 Nov 2026)", async () => {
  for (const materials of [aero.sourceDetails!.materials, "Frame: Solid sheesham wood\nTop: Marble"]) {
    await mount((doc) => {
      const caption = features(doc).querySelector("[data-features-caption]")!;
      assert.deepEqual([...caption.children].map(text), ["Aero Dining Chair"]);
      assert.match(caption.firstElementChild!.className, /\bfont-bold\b/, "the name is set bolder");
      assert.doesNotMatch(text(features(doc))!, /Your choice of/, "no fabric-and-finish line under it");
    }, { ...aero, sourceDetails: { ...aero.sourceDetails!, materials } });
  }
});

test("a card stays exactly as it is when opened: its whole story floats in a chip popup beside it, towards the photo (owner, 10 Nov 2026)", async () => {
  await sized(async () => {
    await mount(async (doc) => {
      const keys = [...features(doc).querySelectorAll<HTMLElement>("[data-feature]")].map((element) => element.dataset.feature!);
      assert.deepEqual(keys, ["about", "materials", "specification", "delivery"]);
      const before = keys.map((key) => drawn(doc, key));
      const pop = popOf(doc, "about");
      assert.ok(pop.hasAttribute("data-feature-pop"));
      assert.equal(pop.hidden, true, "closed until asked for");
      await act(async () => toggleOf(doc, "about").click());
      assert.equal(toggleOf(doc, "about").getAttribute("aria-expanded"), "true");
      assert.equal(card(doc, "about").dataset.open, "true");
      assert.equal(pop.hidden, false, "the popup opens");
      assert.deepEqual(keys.map((key) => drawn(doc, key)), before, "and every card, the opened one included, is drawn exactly as before");
      assert.equal(pop.getAttribute("role"), "dialog");
      assert.equal(text(doc.getElementById(pop.getAttribute("aria-labelledby")!)), "About Product", "named by its card's title");
      assert.equal(pop.dataset.mode, "beside", "beside its card on a desktop");
      assert.equal(pop.dataset.side, "right", "the first card stands left of the photo, so its popup opens to its right, over the photo");
      assert.ok(pop.querySelector("[data-pop-caret]"), "a caret points back to its card");
      assert.equal(text(pop.querySelector("[data-pop-body]")), "Details.", "About Product is told as text");
      assert.equal(text(pop.querySelector("a[data-pop-link]")), "Explore finishes with Maple");
      assert.ok(pop.querySelector("button[data-pop-close]"), "with a close button");
      await act(async () => toggleOf(doc, "materials").click());
      assert.equal(popOf(doc, "materials").dataset.side, "left", "a card right of the photo opens its popup to its left");
    });
  });
});

test("the popup is chips: Specifications as pills, materials and care as pill rows, the rest as text", async () => {
  await sized(async () => {
    await mount(async (doc) => {
      await act(async () => toggleOf(doc, "specification").click());
      const spec = popOf(doc, "specification");
      const chips = [...spec.querySelectorAll<HTMLElement>("[data-pop-chip]")];
      assert.deepEqual(chips.map((chip) => [...chip.children].map(text)), [["Width", '22" (≈ 56 cm)'], ["Depth", '24" (≈ 61 cm)'], ["Height", '34" (≈ 86 cm)']], "every measurement, the bullets kept out of the labels");
      for (const chip of chips) assert.match(chip.className, /\brounded-full\b/, "each one a pill");
      const rows = () => [...card(doc, "specification").querySelectorAll<HTMLElement>("[data-feature-row]")];
      assert.deepEqual(rows().map((row) => row.hidden), [false, false, true], "the card keeps its two-row preview");
      await act(async () => toggleOf(doc, "materials").click());
      const materials = popOf(doc, "materials");
      assert.deepEqual([...materials.querySelectorAll("[data-pop-row]")].map((row) => [...row.children].map(text)),
        [["Frame & Legs", "Solid wood, dark walnut and natural oak finishes"], ["Upholstery", "Velvet and Boucle over high-resilience foam"]], "each bullet a pill row, its label set apart");
      assert.equal(text(materials.querySelector("[data-pop-heading]")), "The Beauty of Natural Materials");
      assert.equal(text(materials.querySelector("[data-pop-text]")), "Slight variations are part of its character.");
      await act(async () => toggleOf(doc, "delivery").click());
      assert.deepEqual([...popOf(doc, "delivery").querySelectorAll("[data-pop-row]")].map((row) => [...row.children].map(text)),
        [["Delivery", "Across India"], ["Covered", "Defects and transit damage"], ["Warranty", "36 months"]]);
    });
  });
});

test("one popup at a time; its close button, Escape or a click outside closes it, back to the card's arrow", async () => {
  await sized(async () => {
    await mount(async (doc) => {
      await act(async () => toggleOf(doc, "about").click());
      await act(async () => toggleOf(doc, "specification").click());
      assert.equal(popOf(doc, "about").hidden, true, "one at a time");
      assert.equal(toggleOf(doc, "about").getAttribute("aria-expanded"), "false");
      await act(async () => popOf(doc, "specification").querySelector<HTMLButtonElement>("button[data-pop-close]")!.click());
      assert.equal(popOf(doc, "specification").hidden, true, "the close button closes it");
      assert.ok(doc.activeElement === toggleOf(doc, "specification"), "and returns to its arrow");
      await act(async () => toggleOf(doc, "materials").click());
      await act(async () => { doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      assert.equal(popOf(doc, "materials").hidden, true, "Escape closes it");
      assert.ok(doc.activeElement === toggleOf(doc, "materials"));
      await act(async () => toggleOf(doc, "delivery").click());
      await act(async () => popOf(doc, "delivery").querySelector<HTMLElement>("[data-pop-content]")!.click());
      assert.equal(popOf(doc, "delivery").hidden, false, "a click inside the popup leaves it open");
      await act(async () => { doc.body.click(); });
      assert.equal(popOf(doc, "delivery").hidden, true, "a click anywhere else closes it");
      assert.ok(doc.activeElement === toggleOf(doc, "delivery"));
    });
  });
});

test("below 1024px the popup is a bottom sheet over a soft backdrop, so no card is ever pushed", async () => {
  for (const width of [390, 768]) {
    await sized(async () => {
      await mount(async (doc) => {
        const before = drawn(doc, "about");
        await act(async () => toggleOf(doc, "about").click());
        const sheet = popOf(doc, "about");
        assert.equal(sheet.dataset.mode, "sheet", `${width}px`);
        assert.equal(sheet.getAttribute("aria-modal"), "true");
        assert.equal(drawn(doc, "about"), before, "the card stays as it is");
        const backdrop = card(doc, "about").closest("[data-feature-slot]")!.querySelector<HTMLElement>("[data-pop-backdrop]")!;
        assert.equal(backdrop.hidden, false);
        await act(async () => backdrop.click());
        assert.equal(sheet.hidden, true, "a tap on the backdrop closes it");
      });
    }, { width });
  }
});

test("the popup pops on the calm curve, and everything keeps still for reduced motion", () => {
  const css = readFileSync(new URL("../styles/product-parity.css", import.meta.url), "utf8");
  assert.match(css, /@starting-style \{\s*\[data-features\] \[data-feature-pop\]/, "the popup fades and rises in rather than appearing");
  assert.match(css, /\[data-features\] \[data-feature-pop\]\[data-mode="beside"\] \{[^}]*border-radius: 20px;/, "a 20px panel");
  assert.match(css, /@starting-style \{\s*\[data-features\] \[data-highlight-chip\]/, "a hotspot's line fades in too");
  assert.match(css, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.doesNotMatch(css, /data-floating|data-feature-surface\]\[data-floating/, "no card grows or floats any more");
  const still = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css.slice(css.indexOf("[data-features]")))?.[1] ?? "";
  for (const part of ["[data-feature-pop]", "[data-pop-backdrop]", "[data-highlight-chip]", "[data-highlight-plus]::before"])
    assert.ok(still.includes(part), `${part} keeps still for reduced motion`);
});

test("Keeri's one-line measurements become one chip each, as the colon lines do", () => {
  assert.deepEqual(labelledRows("Width (in) - 25 | Depth (in) - 24 | Height (in) - 32"), [["Width (in)", "25"], ["Depth (in)", "24"], ["Height (in)", "32"]]);
  assert.deepEqual(labelledRows(' • Width: 22" (≈ 56 cm)\n • Depth: 24" (≈ 61 cm)'), [["Width", '22" (≈ 56 cm)'], ["Depth", '24" (≈ 61 cm)']]);
  assert.equal(labelledRows("Made by hand in Delhi, with care"), null, "prose stays prose");
});

test("hotspot notes keep to the labelled facts: no headings, hyphenated labels kept, bullets on one line split, a label with no value hidden", () => {
  const details = (materials: string | null, dimensions: string | null) => ({ details: null, materials, dimensions, careInstructions: null, warranty: null });
  const note = (spec: Parameters<typeof hotspotNote>[0], d: ReturnType<typeof details>) => hotspotNote(spec, d);
  assert.equal(note({ x: 0, y: 0, label: "Size", from: "dimensions" }, details(null, 'Dimensions\n• Width: 22" (≈ 56 cm)\n• Seat-Height: 18"\n• Weight (kg): 5')), 'Width 22" (≈ 56 cm) · Seat-Height 18" · Weight (kg) 5');
  assert.equal(note({ x: 0, y: 0, label: "Frame & legs", from: "materials", line: "Frame & Legs" }, details("• Frame & Legs: Oak • Upholstery: Velvet", null)), "Oak");
  assert.equal(note({ x: 0, y: 0, label: "Upholstery", from: "materials" }, details("• Frame & Legs: Oak • Upholstery: Velvet", null)), "Velvet");
  assert.equal(note({ x: 0, y: 0, label: "Upholstery", from: "materials" }, details("Upholstery:\n", null)), undefined);
  assert.equal(note({ x: 0, y: 0, label: "Size", from: "dimensions" }, details(null, "Made by hand")), undefined);
});
