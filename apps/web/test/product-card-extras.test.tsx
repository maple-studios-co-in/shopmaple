import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { ProductHighlights } from "@shopmaple/contracts";
import { CollectionListing } from "../components/collection-listing";
import { ProductCard } from "../components/product-card";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { collectionQuery } from "../lib/collections";
import { toProductCard } from "../lib/product-card-model";

type Option = { title: string; price?: number; compare?: number | null; images?: string[]; slug?: string | null };
const product = (options: Option[], extra: { images?: string[] } = {}) => toProductCard({
  id: "sofa", handle: "cloud-sofa", title: "Cloud Sofa", category: "sofas", images: extra.images ?? ["https://cdn.example.com/hero.jpg"],
  variants: options.map(option => ({ pricePaise: option.price ?? 100000, compareAtPaise: option.compare ?? null, title: option.title, images: option.images, slug: option.slug })),
});
const photo = (name: string) => `https://cdn.example.com/${name}.jpg`;
const coloured = (names: string[]): Option[] => names.map(name => ({ title: name, images: [photo(name)], slug: name.toLowerCase() }));

async function render(node: (cards: typeof ProductCard) => React.ReactNode, check: (document: Document) => void | Promise<void>, highlights?: ProductHighlights) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000/collections/sofas" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR",
    mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><ProductHighlightsProvider value={highlights}>{node(ProductCard)}</ProductHighlightsProvider></ShopProvider>));
    await check(document);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.close(); }
}
const q = (document: Document, selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

// ---- Discount chip --------------------------------------------------------------------------
for (const [price, compare, label] of [[90000, 100000, "10% OFF"], [25000, 30000, "17% OFF"], [99950, 100000, null], [1, 3, "67% OFF"]] as const) {
  test(`discount chip for ${price} against ${compare}: ${label ?? "hidden because it rounds to under 1%"}`, async () => {
    const card = product([{ title: "Only", price, compare }]);
    assert.equal(card.compareAtPaise, compare);
    await render(() => <ProductCard product={card} />, document => {
      const chip = document.querySelector("[data-card-discount]");
      assert.equal(chip?.textContent?.trim() ?? null, label);
      if (chip) {
        assert.ok(chip.closest("[data-card-price]"), "the chip sits in the price line, beside the struck-through price");
        assert.equal(chip.previousElementSibling?.tagName, "DEL");
      }
    });
  });
}
test("no discount chip without a compare-at price", async () => {
  await render(() => <ProductCard product={product([{ title: "Only", price: 90000 }])} />, document => {
    assert.equal(document.querySelector("[data-card-discount]"), null);
  });
});
test("the chip shows beside 'From' prices too, because the card's saving is the cheapest option's", async () => {
  const card = product([{ title: "A", price: 80000, compare: 100000 }, { title: "B", price: 120000 }]);
  assert.equal(card.priceFrom, true);
  await render(() => <ProductCard product={card} />, document => {
    assert.equal(document.querySelector("[data-card-discount]")?.textContent?.trim(), "20% OFF");
  });
});

// ---- Option thumbnails ----------------------------------------------------------------------
test("options render as round thumbnails of their own photos, each linking to that variant, instead of 'N options'", async () => {
  const card = product(coloured(["Walnut", "Oak", "Ash"]));
  await render(() => <ProductCard product={card} />, document => {
    const thumbs = q(document, "[data-card-option-thumbs] [data-card-option-thumb]");
    assert.equal(thumbs.length, 3);
    assert.deepEqual(thumbs.map(thumb => thumb.querySelector("a")?.getAttribute("href")),
      ["/products/cloud-sofa?variant=walnut", "/products/cloud-sofa?variant=oak", "/products/cloud-sofa?variant=ash"]);
    assert.deepEqual(thumbs.map(thumb => thumb.querySelector("img")?.getAttribute("src")), [photo("Walnut"), photo("Oak"), photo("Ash")]);
    assert.deepEqual(thumbs.map(thumb => thumb.querySelector("a")?.getAttribute("aria-label")), ["Walnut", "Oak", "Ash"]);
    assert.equal(document.querySelector("[data-card-option-thumbs]")?.getAttribute("aria-label"), "Options for Cloud Sofa");
    assert.equal(document.querySelector("a[data-card-options]"), null, "the text link is replaced");
    assert.equal(document.querySelector("[data-card-options-more]"), null);
  });
});
test("at most five thumbnails show, then '+N' for the rest", async () => {
  const card = product(coloured(["A1", "B2", "C3", "D4", "E5", "F6", "G7"]));
  await render(() => <ProductCard product={card} />, document => {
    assert.equal(q(document, "[data-card-option-thumb]").length, 5);
    assert.equal(document.querySelector("[data-card-options-more]")?.textContent?.trim(), "+2");
    assert.equal(document.querySelector("a[data-card-options]"), null);
  });
});
test("an option without an address links to the product itself", async () => {
  const card = product([{ title: "Walnut", images: [photo("w")], slug: null }, { title: "Oak", images: [photo("o")], slug: "oak" }, { title: "Ash" }]);
  await render(() => <ProductCard product={card} />, document => {
    assert.deepEqual(q(document, "[data-card-option-thumb] a").map(link => link.getAttribute("href")), ["/products/cloud-sofa", "/products/cloud-sofa?variant=oak"]);
  });
});
test("an option with no photo of its own falls back to its colour swatch when staff entered one, else it is left out", async () => {
  const card = product([{ title: "Walnut", images: [photo("w")], slug: "walnut" }, { title: "Teal", images: [], slug: "teal" }, { title: "Mystery", images: [], slug: "mystery" }]);
  const highlights: ProductHighlights = { swatches: [{ name: "teal", hex: "#008080" }], products: [] };
  await render(() => <ProductCard product={card} />, document => {
    const thumbs = q(document, "[data-card-option-thumb]");
    assert.deepEqual(thumbs.map(thumb => thumb.querySelector("a")?.getAttribute("aria-label")), ["Walnut", "Teal"]);
    assert.equal(thumbs[0]!.querySelector("img")?.getAttribute("src"), photo("w"));
    assert.equal(thumbs[1]!.querySelector("img"), null);
    assert.equal(thumbs[1]!.querySelector<HTMLElement>("[data-swatch]")?.style.backgroundColor, "rgb(0, 128, 128)");
    assert.equal(thumbs[1]!.querySelector("a")?.getAttribute("href"), "/products/cloud-sofa?variant=teal");
  }, highlights);
});
test("without any option photos the card keeps the 'N options' text link", async () => {
  const card = product([{ title: "Walnut", slug: "walnut" }, { title: "Oak" }, { title: "Ash" }]);
  await render(() => <ProductCard product={card} />, document => {
    assert.equal(document.querySelector("[data-card-option-thumbs]"), null);
    assert.equal(document.querySelector("a[data-card-options]")?.textContent?.trim(), "3 options");
    assert.equal(document.querySelector("a[data-card-options]")?.getAttribute("href"), "/products/cloud-sofa");
  });
});
test("an older payload without the thumbnails field renders the text link", async () => {
  const { optionThumbs: _omit, ...older } = product(coloured(["Walnut", "Oak"]));
  await render(() => <ProductCard product={older as never} />, document => {
    assert.equal(document.querySelector("[data-card-option-thumbs]"), null);
    assert.equal(document.querySelector("a[data-card-options]")?.textContent?.trim(), "2 options");
  });
});

// ---- Collection page layout -----------------------------------------------------------------
test("on a collection page the thumbnails and discount chip render and the old text link still serves cards without photos", async () => {
  const withPhotos = product([...coloured(["Walnut", "Oak"]).map(option => ({ ...option, compare: 150000 })), ]);
  const plain = { ...product([{ title: "Walnut" }, { title: "Oak" }]), id: "plain", handle: "plain-sofa", title: "Plain Sofa" };
  await render(() => <CollectionListing handle="sofas" title="Sofas" query={collectionQuery({})} products={[withPhotos, plain]} total={2} collectionTotal={2} limit={24} inStock={2} outOfStock={0} highestPrice={100000} />, document => {
    const cards = q(document, ".collection-products [data-product-card]");
    assert.equal(cards.length, 2);
    assert.equal(cards[0]!.querySelectorAll("[data-card-option-thumb]").length, 2);
    assert.equal(cards[0]!.querySelector("[data-card-discount]")?.textContent?.trim(), "33% OFF");
    assert.equal(cards[0]!.querySelector("a[data-card-options]"), null);
    assert.equal(cards[1]!.querySelectorAll("[data-card-option-thumb]").length, 0);
    assert.equal(cards[1]!.querySelector("a[data-card-options]")?.textContent?.trim(), "2 options");
    assert.equal(cards[1]!.querySelector("[data-card-discount]"), null);
  });
});

// ---- White card body ------------------------------------------------------------------------
test("no stylesheet repaints the product card, except the homepage rails, which draw it without a box as the Impact Layout frame does", () => {
  const dir = new URL("../styles/", import.meta.url);
  const offenders: string[] = [];
  for (const file of readdirSync(dir).filter(name => name.endsWith(".css"))) {
    const css = readFileSync(new URL(file, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, body] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!/\[data-product-card\]|\[data-card-[a-z-]+\]/.test(selector!) || !/background/.test(body!)) continue;
      // The one allowed rule: the homepage rails (under a homepage section) make the card transparent.
      const homepageRail = /^\s*\[data-home-section\] \.home-products \[data-product-card\]\s*$/.test(selector!) && /background:\s*transparent/.test(body!);
      if (!homepageRail) offenders.push(`${file}: ${selector!.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("'+N' counts every option the thumbnails do not show, not just those beyond the capped list", async () => {
  const card = product(coloured(["A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8", "I9", "J10", "K11", "L12"]));
  assert.equal(card.optionCount, 12);
  await render(() => <ProductCard product={card} />, document => {
    assert.equal(q(document, "[data-card-option-thumb]").length, 5);
    assert.equal(document.querySelector("[data-card-options-more]")?.textContent?.trim(), "+7");
  });
});
