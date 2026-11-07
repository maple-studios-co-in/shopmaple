import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page";
import { CampaignBanner } from "../components/campaign-banner";
import { HomeNimbus } from "../components/home-nimbus";
import { HomeValues } from "../components/home-sections";
import { ShopProvider } from "../components/shop-provider";
import { ProductReviews } from "../components/store/product-reviews";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { coverScale, fillButtonSelector, magnetOffset, mountButtonEffects } from "../lib/button-effects";

// The owner's reference (3 November 2026), the Athora theme's Add to cart: on hover a circle in a tone of the
// button's colour grows, on a spring, from the point where the pointer came in until it covers the button,
// shrinks back there when the pointer leaves, and the button leans a few pixels toward the pointer.

test("the circle grows from the entry point just far enough to cover the farthest corner", () => {
  // The circle is 20px across, so its scale is the farthest corner's distance over its 10px radius.
  assert.equal(coverScale({ width: 273, height: 50 }, 33, 25), Math.hypot(240, 25) / 10);
  assert.equal(coverScale({ width: 200, height: 50 }, 100, 25), Math.hypot(100, 25) / 10, "from the middle, any corner");
  assert.equal(coverScale({ width: 200, height: 50 }, 0, 0), Math.hypot(200, 50) / 10, "from a corner, the opposite one");
});

test("the button leans toward the pointer, 6px at most each way", () => {
  const box = { left: 100, top: 200, width: 200, height: 50 };
  assert.deepEqual(magnetOffset(box, 200, 225), { x: 0, y: 0 }, "still at the centre");
  assert.deepEqual(magnetOffset(box, 300, 200), { x: 6, y: -6 }, "at the top-right corner");
  assert.deepEqual(magnetOffset(box, 150, 237.5), { x: -3, y: 3 });
  assert.deepEqual(magnetOffset(box, 900, 900), { x: 6, y: 6 }, "never further than 6px");
});

function page(markup: string) {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  return dom.window.document;
}
/** A pointer event; jsdom has no PointerEvent, so a mouse event carries the pointer type. */
function pointer(type: string, target: Element, init: { x: number; y: number; related?: Element | null; pointerType?: string }) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: init.x, clientY: init.y, relatedTarget: init.related ?? null });
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
  target.dispatchEvent(event);
}
function place(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height }),
  });
}

test("a mouse coming into a button starts the circle where it came in and sizes it to cover; leaving lets it shrink back", () => {
  const doc = page('<a class="button" href="/x"><span>Shop now</span></a><button type="button" data-fill-button>Add to cart</button>');
  const link = doc.querySelector<HTMLElement>(".button")!;
  const add = doc.querySelector<HTMLElement>("[data-fill-button]")!;
  place(link, { left: 100, top: 200, width: 200, height: 50 });
  const stop = mountButtonEffects(doc, false);
  assert.equal(doc.documentElement.getAttribute("data-button-fill"), "", "the page knows the effect is live");
  pointer("pointerover", link.querySelector("span")!, { x: 130, y: 210, related: doc.body });
  assert.ok(link.hasAttribute("data-fill-on"));
  assert.deepEqual(["--fill-x", "--fill-y", "--fill-scale"].map((name) => link.style.getPropertyValue(name)),
    ["30px", "10px", (Math.hypot(170, 40) / 10).toFixed(3)]);
  pointer("pointerover", link, { x: 140, y: 220, related: link.querySelector("span") });
  assert.equal(link.style.getPropertyValue("--fill-x"), "30px", "moving about inside the button keeps the entry point");
  pointer("pointermove", link, { x: 300, y: 200 });
  assert.deepEqual([link.style.getPropertyValue("--magnet-x"), link.style.getPropertyValue("--magnet-y")], ["6px", "-6px"]);
  pointer("pointerout", link, { x: 310, y: 190, related: doc.body });
  assert.ok(!link.hasAttribute("data-fill-on"), "the circle shrinks back where it came in");
  assert.deepEqual([link.style.getPropertyValue("--magnet-x"), link.style.getPropertyValue("--magnet-y")], ["0px", "0px"], "and the button settles");
  pointer("pointerover", add, { x: 10, y: 10, related: doc.body, pointerType: "touch" });
  assert.ok(!add.hasAttribute("data-fill-on"), "a finger is left alone");
  stop();
  assert.ok(!doc.documentElement.hasAttribute("data-button-fill"));
  pointer("pointerover", link, { x: 130, y: 210, related: doc.body });
  assert.ok(!link.hasAttribute("data-fill-on"), "and nothing listens once stopped");
});

test("a disabled button stays still, and reduced motion leaves every button to its plain hover colour", () => {
  const doc = page('<button type="button" class="button" disabled>Updating cart…</button>');
  const button = doc.querySelector<HTMLButtonElement>("button")!;
  place(button, { left: 0, top: 0, width: 100, height: 40 });
  let stop = mountButtonEffects(doc, false);
  pointer("pointerover", button, { x: 10, y: 10, related: doc.body });
  assert.ok(!button.hasAttribute("data-fill-on"));
  stop();
  stop = mountButtonEffects(doc, true);
  assert.ok(!doc.documentElement.hasAttribute("data-button-fill"));
  button.disabled = false;
  pointer("pointerover", button, { x: 10, y: 10, related: doc.body });
  assert.ok(!button.hasAttribute("data-fill-on"));
  stop();
});

test("the storefront's call-to-action buttons take part, each with the fill that suits its colour", async () => {
  const fills = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(fillButtonSelector)];
  const nimbus = new JSDOM(renderToStaticMarkup(<HomeNimbus content={defaultHomeDetails.nimbus} />)).window.document;
  assert.ok(nimbus.querySelectorAll("[data-nimbus-explore]").length > 0);
  assert.ok([...nimbus.querySelectorAll("[data-nimbus-explore]")].every((cta) => fills(nimbus).includes(cta as HTMLElement)), "Explore");
  const values = new JSDOM(renderToStaticMarkup(<HomeValues watermark />)).window.document;
  assert.ok(fills(values).includes(values.querySelector<HTMLElement>("[data-values-cta]")!), "Experience Maple");
  const reviews = new JSDOM(renderToStaticMarkup(<ProductReviews rating={null} writeHref="/pages/contact" />)).window.document;
  assert.equal(reviews.querySelector("[data-write-review]")?.getAttribute("data-fill-button"), "light", "Write a review, white on burgundy");
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    const banner = new JSDOM(await new Response(await renderToReadableStream(<CampaignBanner campaign="beds-hero" />)).text()).window.document;
    assert.ok(fills(banner).some((cta) => cta.closest("[data-campaign]")), "campaign banners' buttons");
  } finally {
    globalThis.fetch = previous;
  }
});

test("on the homepage the hero, announcement, rails and closing buttons all fill", async () => {
  const content = structuredClone(defaultStorefrontContent);
  const card = (handle: string) => ({ id: handle, handle, title: `Chair ${handle}`, image: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.jpg", pricePaise: 2500000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1, category: null, optionNames: [] as string[] });
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/content/storefront")) return Response.json({ version: 2, content });
    if (url.pathname.endsWith("/api/catalogue/cards")) return Response.json({ products: (url.searchParams.get("handles") ?? "").split(",").map(card), published: true });
    return new Response(null, { status: 404 });
  };
  try {
    const doc = new JSDOM(await new Response(await renderToReadableStream(<ShopProvider><Home /></ShopProvider>)).text()).window.document;
    const filling = new Set(doc.querySelectorAll(fillButtonSelector));
    for (const [what, selector] of [["hero", ".hero-cta"], ["announcement", '[data-campaign-layout="strip"] .campaign-cta'], ["rails", "[data-rail-viewall]"], ["closing", "[data-values-cta]"], ["Nimbus", "[data-nimbus-explore]"]] as const) {
      const buttons = [...doc.querySelectorAll(selector)];
      assert.ok(buttons.length > 0 && buttons.every((button) => filling.has(button)), what);
    }
    assert.equal(doc.querySelector("[data-rail-viewall]")?.getAttribute("data-fill-button"), "outline", "the white View all buttons fill like an outline button");
  } finally {
    globalThis.fetch = previous;
  }
});
