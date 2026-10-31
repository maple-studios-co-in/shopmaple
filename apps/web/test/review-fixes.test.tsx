import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { storefrontContentSchema, toProductCard, type Product } from "@shopmaple/contracts";
import { StoreChromeView } from "../components/admin/store-chrome";
import { ShopProvider } from "../components/shop-provider";
import { CardRating } from "../components/store/card-highlights";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { ProductCard } from "../components/store/product-card";
import { AccountOverview } from "../components/store/account-overview";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { contactCategories } from "../app/pages/contact-content";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const doc = (markup: string) => new JSDOM(markup).window.document;

test("overlays mount only once first opened, so a plain visit never downloads their code", () => {
  // A lazily loaded component that is rendered at all is still fetched during hydration.
  assert.match(source("../components/admin/store-chrome.tsx"), /cartOpened && <CartDrawer \/>/);
  const header = source("../components/store/site-header.tsx");
  assert.match(header, /wishlistOpened && \(\s*<WishlistDrawer/);
  assert.match(header, /mobileOpened && \(\s*<MobileNavigation/);
  assert.match(header, /\{search && <SearchDialog/);
});

test("a card rating is announced: the label sits on an image role", () => {
  const rating = doc(renderToStaticMarkup(<ProductHighlightsProvider value={{ swatches: [], products: [{ handle: "aero", isNew: false, rating: { value: 4.6, count: 12 } }] }}><CardRating handle="aero" /></ProductHighlightsProvider>)).querySelector("[data-card-rating]")!;
  assert.equal(rating.getAttribute("role"), "img");
});

test("colourless option names such as Standard are not offered as colours", () => {
  const product = { id: "p", handle: "p", title: "P", images: [], category: "chairs", variants: [{ pricePaise: 1000, compareAtPaise: null, title: "Standard" }] };
  assert.deepEqual(toProductCard(product).optionNames, []);
});

test("a discount under 1% shows no chip rather than 0% off", () => {
  const product: Product = { id: "p", handle: "p", title: "P", description: "", category: "chairs", images: [], published: true, source: "test", sourceUpdatedAt: "2026-10-26T00:00:00Z",
    variants: [{ id: "v", title: "One", sku: null, pricePaise: 100_000, compareAtPaise: 100_001, available: true, stockPolicy: "stocked" }] };
  const card = doc(renderToStaticMarkup(<ShopProvider><ProductCard product={toProductCard(product)} /></ShopProvider>));
  assert.equal(card.querySelector("[data-card-discount]"), null);
});

test("a whitespace-only colour name is refused by the content contract", () => {
  const result = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, productHighlights: { swatches: [{ name: "   ", hex: "#112233" }], products: [] } });
  assert.equal(result.success, false);
});

test("the Help Center no longer tells customers to open an account that does not exist", () => {
  const answers = JSON.stringify(contactCategories);
  assert.doesNotMatch(answers, /My Orders|in your Maple Furnishers account/);
});

test("small promise-strip text meets 4.5:1 on cream", () => {
  assert.doesNotMatch(source("../components/store/promise-strip.tsx"), /text-taupe/);
});

test("the map embed does not send the visitor's page address (with product and pincode) to Google", () => {
  const help = source("../components/store/help-center.tsx");
  assert.doesNotMatch(help, /no-referrer-when-downgrade/);
  assert.match(help, /referrerPolicy="no-referrer"/);
});

test("the staff preview frame shows the draft's own card highlights on every page", () => {
  assert.match(source("../app/admin/preview-frame/[...page]/page.tsx"), /<ProductHighlightsProvider value=\{content\.productHighlights\}>/);
});

test("saved counts render nothing before the browser has read the saved list", () => {
  const account = doc(renderToStaticMarkup(<ShopProvider><AccountOverview /></ShopProvider>));
  assert.equal(account.querySelector("[data-account-saved-count]")?.textContent ?? "", "");
});

test("ArrowDown on a menu opens it and moves focus into the panel, even while the panel's code loads", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000/" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) });
  const { DesktopNavigation } = await import("../components/store/site-navigation");
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<DesktopNavigation />));
    const trigger = dom.window.document.querySelector<HTMLButtonElement>("[data-menu-trigger]")!;
    trigger.focus();
    await act(async () => trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    for (let i = 0; i < 200 && !dom.window.document.activeElement?.closest("[data-mega]"); i++)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.ok(dom.window.document.activeElement?.closest("[data-mega]"), "Focus lands on the first link in the panel");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
