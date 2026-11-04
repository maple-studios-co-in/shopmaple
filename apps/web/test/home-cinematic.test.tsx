import assert from "node:assert/strict";
import { mock, test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { ProductHighlights } from "@shopmaple/contracts";
import { HomeNimbus } from "../components/home-nimbus";
import { HomeStatementBand, HomeCities } from "../components/home-sections";
import { HomeEditorial, editorialFlipFrames } from "../components/home-editorial";
import { HomeMarquee } from "../components/home-marquee";
import { ProductCard } from "../components/product-card";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { CardRating, sampleRating } from "../components/store/card-highlights";
import { countAt, flipIntervalMs, mountFlipbook, mountStage, typedSlice } from "../lib/home-effects";
import { countTarget, homeStats } from "../lib/home-stats";
import { statementParts } from "../lib/home-statement";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeDetails, resolveHomeDetails } from "../lib/home-details-defaults";
import { toProductCard } from "../lib/product-card-model";

// The owner's homepage notes of 2 November 2026: the typed statement, the counting figures, the
// Nimbus/Terra stage with its ring, the editorial flipbook, the drifting rows, the card tags and the
// shorter page. Server markup is checked as rendered; the lazy effects are driven in a DOM.
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const all = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];

test("the statement band types the clause after the last comma, with the last word as the script accent", () => {
  assert.deepEqual(statementParts("Elegance isn’t found. At Maple, it is custom-built."),
    { lead: "Elegance isn’t found. At Maple, ", before: "it is ", accent: "custom-built", after: "." });
  assert.deepEqual(statementParts("Made to last for years"), { lead: "Made to ", before: "last for ", accent: "years", after: "" });
  const page = doc(<HomeStatementBand text="Elegance isn’t found. At Maple, it is custom-built." />);
  assert.equal(page.querySelector(".sr-only")?.textContent, "Elegance isn’t found. At Maple, it is custom-built.", "readers get the whole line");
  const typed = page.querySelector<HTMLElement>("[data-typed]")!;
  assert.deepEqual([typed.dataset.typedBefore, typed.dataset.typedAccent, typed.dataset.typedAfter], ["it is ", "custom-built", "."]);
  assert.equal(page.querySelector("[data-typed-live]")?.textContent, "it is custom-built.", "without script the clause is complete");
  assert.equal(page.querySelector("[data-typed-live] em")?.textContent, "custom-built");
});

test("typing shows the clause a character at a time across its plain words, accent and stop", () => {
  const runs = { before: "it is ", accent: "custom-built", after: "." };
  assert.deepEqual(typedSlice(runs, 0), { before: "", accent: "", after: "" });
  assert.deepEqual(typedSlice(runs, 4), { before: "it i", accent: "", after: "" });
  assert.deepEqual(typedSlice(runs, 9), { before: "it is ", accent: "cus", after: "" });
  assert.deepEqual(typedSlice(runs, 19), runs);
  assert.deepEqual(typedSlice(runs, 99), runs);
});

test("the figures count up from zero and land exactly on the number the admin wrote", () => {
  assert.equal(countAt(36, 0), 0);
  assert.equal(countAt(36, 1800), 36);
  assert.equal(countAt(36, 9999), 36);
  const steps = [0, 300, 600, 900, 1200, 1500, 1800].map((ms) => countAt(20, ms));
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), "never counts backwards");
  assert.deepEqual(countTarget("20+"), { to: 20, suffix: "+" });
  assert.deepEqual(countTarget("36"), { to: 36, suffix: "" });
  assert.equal(countTarget("Twenty"), null);
  assert.deepEqual(homeStats(["36-Month Warranty"], "20+ Cities"), [
    { value: "36", label: "Month warranty", description: "Built with lasting structure and care." },
    { value: "20+", label: "Cities served", description: "Delivery across India." },
  ]);
  assert.equal(homeStats([], "12 Cities served")[0]!.label, "Cities served", "a heading that already says served is kept");
});

test("the numbers band keeps the finished figure for readers and counts a hidden copy", () => {
  const page = doc(<HomeCities stats={homeStats(["36-Month Warranty"], "20+ Cities")} />);
  const figures = all(page, "[data-stat-value]");
  assert.deepEqual(figures.map((figure) => figure.querySelector(".sr-only")?.textContent), ["36", "20+"]);
  assert.deepEqual(all(page, "[data-count-to]").map((figure) => [figure.dataset.countTo, figure.dataset.countSuffix, figure.getAttribute("aria-hidden")]),
    [["36", "", "true"], ["20", "+", "true"]]);
  assert.deepEqual(all(page, "[data-stat-description]").map((line) => line.textContent), ["Built with lasting structure and care.", "Delivery across India."]);
});

test("the stage shows Nimbus then Terra by default: one live slide, the other inert, a numbered ring each", () => {
  const page = doc(<HomeNimbus content={defaultHomeDetails.nimbus} />);
  const slides = all(page, "[data-stage-slide]");
  assert.equal(slides.length, 2);
  assert.deepEqual(slides.map((slide) => slide.querySelector("[data-nimbus-title] [aria-hidden]")?.textContent), ["Nimbus", "Terra"]);
  assert.deepEqual(slides.map((slide) => slide.querySelector("[data-nimbus-title] .sr-only")?.textContent), ["The Nimbus Collection", "The Terra Collection"]);
  assert.deepEqual(slides.map((slide) => slide.hasAttribute("data-active")), [true, false]);
  assert.deepEqual(slides.map((slide) => slide.hasAttribute("inert")), [false, true]);
  assert.deepEqual(slides.map((slide) => slide.querySelector("[data-nimbus-explore]")?.getAttribute("href")), ["/pages/nimbus-collection", "/collections/sofas"]);
  assert.deepEqual(slides.map((slide) => slide.querySelector("[data-nimbus-explore]")?.textContent), ["Explore", "Explore"]);
  const dots = all(page, "[data-stage-dot]");
  assert.deepEqual(dots.map((dot) => [dot.tagName, dot.textContent, dot.getAttribute("aria-current")]), [["BUTTON", "1", "true"], ["BUTTON", "2", null]]);
  assert.equal(all(page, "[data-stage-dot] [data-ring-progress]").length, 2);
  assert.match(page.querySelector<HTMLElement>("[data-stage]")!.getAttribute("style") ?? "", /--stage-interval:\s*\d+ms/);
  const single = doc(<HomeNimbus content={{ ...defaultHomeDetails.nimbus, slides: undefined }} />);
  assert.equal(single.querySelectorAll("[data-stage-dot]").length, 0, "one collection has no numbers");
  assert.equal(single.querySelector("[data-stage-next]"), null, "and no arrow");
});

test("the stage has an arrow whose ring fills with the collection's time, on a band of the collection's own photo", () => {
  const page = doc(<HomeNimbus content={defaultHomeDetails.nimbus} />);
  const next = page.querySelector<HTMLElement>("[data-stage-frame] [data-stage-next]")!;
  assert.equal(next.tagName, "BUTTON");
  assert.equal(next.getAttribute("type"), "button");
  assert.equal(next.getAttribute("aria-label"), "Next collection");
  assert.equal(next.querySelectorAll("[data-next-progress][data-ring-progress]").length, 1, "the arrow's ring fills like the number's");
  const backdrops = all(page, "[data-stage-backdrop]");
  assert.deepEqual(backdrops.map((image) => image.getAttribute("src")), all(page, "[data-stage-slide] picture img").map((image) => image.getAttribute("src")),
    "each collection's photo also fills the band round the card, as in the frame");
  assert.ok(backdrops.every((image) => image.getAttribute("alt") === "" && image.closest("[aria-hidden='true']")), "as decoration");
  assert.deepEqual(backdrops.map((image) => image.hasAttribute("data-active")), [true, false]);
});

function stageDom() {
  const dom = new JSDOM(renderToStaticMarkup(<HomeNimbus content={defaultHomeDetails.nimbus} />));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const root = dom.window.document.querySelector<HTMLElement>("[data-stage]")!;
  const ringEnd = (dot: Element) => {
    const event = new dom.window.Event("animationend", { bubbles: true });
    Object.defineProperty(event, "animationName", { value: "stage-ring" });
    dot.querySelector("[data-ring-progress]")!.dispatchEvent(event);
  };
  const state = () => ({
    active: all(root, "[data-stage-slide]").findIndex((slide) => slide.hasAttribute("data-active")),
    current: all(root, "[data-stage-dot]").findIndex((dot) => dot.getAttribute("aria-current") === "true"),
    backdrop: all(root, "[data-stage-backdrop]").findIndex((image) => image.hasAttribute("data-active")),
  });
  const next = () => root.querySelector<HTMLButtonElement>("[data-stage-next]")!;
  return { root, ringEnd, state, next, dots: () => all(root, "[data-stage-dot]") };
}

test("when the ring round the current number closes, the next collection takes the stage, then the first again", () => {
  const { root, ringEnd, state, dots } = stageDom();
  const stop = mountStage(root, false);
  assert.ok(root.hasAttribute("data-stage-ready"));
  ringEnd(dots()[0]!);
  assert.deepEqual(state(), { active: 1, current: 1, backdrop: 1 });
  assert.ok(all(root, "[data-stage-slide]")[0]!.hasAttribute("inert"), "the hidden slide's link leaves the tab order");
  ringEnd(dots()[0]!);
  assert.deepEqual(state(), { active: 1, current: 1, backdrop: 1 }, "a ring that is not the current one changes nothing");
  ringEnd(dots()[1]!);
  assert.deepEqual(state(), { active: 0, current: 0, backdrop: 0 });
  dots()[1]!.click();
  assert.deepEqual(state(), { active: 1, current: 1, backdrop: 1 }, "a number shows its collection");
  stop();
  assert.ok(!root.hasAttribute("data-stage-ready"));
});

test("the arrow moves on to the next collection, round to the first, and its own ring closing does not skip one", () => {
  const { root, ringEnd, state, next } = stageDom();
  const stop = mountStage(root, false);
  next().click();
  assert.deepEqual(state(), { active: 1, current: 1, backdrop: 1 });
  next().click();
  assert.deepEqual(state(), { active: 0, current: 0, backdrop: 0 }, "after the last collection comes the first");
  ringEnd(next());
  assert.deepEqual(state(), { active: 0, current: 0, backdrop: 0 }, "only the current number's ring moves the stage on");
  stop();
});

/** A pointer moving over `target` at (x, y); jsdom has no PointerEvent, so a mouse event carries the pointer type. */
function pointerMove(target: Element, x: number, y: number, pointerType = "mouse") {
  const event = new window.MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
}

test("with a mouse the arrow is the pointer over the photo: it shows right under it, and goes when the mouse does", () => {
  const { root, state, next } = stageDom();
  const stop = mountStage(root, false);
  const frame = root.querySelector<HTMLElement>("[data-stage-frame]")!;
  pointerMove(frame, 300, 200, "touch");
  assert.ok(!frame.hasAttribute("data-pointer-in"), "a finger is left alone: there the arrow is a plain button");
  pointerMove(frame, 300, 200);
  assert.ok(frame.hasAttribute("data-pointer-in") && frame.hasAttribute("data-following"));
  assert.deepEqual([next().style.getPropertyValue("--next-x"), next().style.getPropertyValue("--next-y")], ["300px", "200px"], "it appears right under the pointer");
  pointerMove(root.querySelector("[data-stage-slide][data-active] [data-nimbus-explore]")!, 320, 210);
  assert.ok(frame.hasAttribute("data-next-aside"), "it steps aside over the Explore button");
  frame.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(state().active, 1, "a press on the photo is a press on the arrow");
  frame.dispatchEvent(new window.Event("pointerleave"));
  assert.ok(!frame.hasAttribute("data-pointer-in") && !frame.hasAttribute("data-next-aside"), "it fades out when the mouse leaves");
  stop();
  assert.ok(!frame.hasAttribute("data-following"));
});

test("under reduced motion the numbers and the arrow still switch collections but nothing advances on its own", () => {
  const { root, ringEnd, state, dots, next } = stageDom();
  mountStage(root, true);
  assert.ok(root.hasAttribute("data-stage-paused"));
  ringEnd(dots()[0]!);
  assert.deepEqual(state(), { active: 0, current: 0, backdrop: 0 });
  dots()[1]!.click();
  assert.deepEqual(state(), { active: 1, current: 1, backdrop: 1 });
  next().click();
  assert.deepEqual(state(), { active: 0, current: 0, backdrop: 0 });
  pointerMove(root.querySelector("[data-stage-frame]")!, 300, 200);
  assert.ok(!root.querySelector("[data-stage-frame]")!.hasAttribute("data-pointer-in"), "and the arrow stays put rather than chase the mouse");
});

test("the editorial photo cuts through Maple's dining pieces every 800 ms on and on while in view, pointed at or not", () => {
  assert.ok(!editorialFlipFrames.some((src) => src.includes("arden")), "no sideboard: it is no place to pull up a chair (owner)");
  const content = resolveHomeDetails().editorial;
  const dom = new JSDOM(renderToStaticMarkup(<HomeEditorial content={content} />));
  // A stand-in for IntersectionObserver, so the test says when the photo is in view.
  let report: (seen: boolean) => void = () => {};
  class Observer {
    constructor(callback: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) {
      report = (seen) => callback([{ isIntersecting: seen, intersectionRatio: seen ? 1 : 0 }]);
    }
    observe() {}
    disconnect() {}
  }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IntersectionObserver: Observer });
  const book = dom.window.document.querySelector<HTMLElement>("[data-flipbook]")!;
  const frames = all(book, "[data-flip-frame]");
  assert.equal(frames.length, 1 + editorialFlipFrames.length);
  assert.equal(frames[0]!.querySelector("img")?.getAttribute("alt"), content.leftAlt);
  assert.ok(frames.slice(1).every((frame) => frame.getAttribute("aria-hidden") === "true" && frame.querySelector("img")?.getAttribute("alt") === ""));
  const active = () => frames.findIndex((frame) => frame.hasAttribute("data-active"));
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const stop = mountFlipbook(book);
    mock.timers.tick(flipIntervalMs * 2);
    assert.equal(active(), 0, "nothing moves before the photo is in view");
    report(true);
    assert.equal(active(), 0, "the first cut waits a full beat");
    mock.timers.tick(flipIntervalMs);
    assert.equal(active(), 1);
    book.dispatchEvent(new dom.window.Event("pointerleave"));
    mock.timers.tick(flipIntervalMs * 2);
    assert.equal(active(), 3, "the pointer has nothing to do with it");
    mock.timers.tick(flipIntervalMs * (frames.length - 3));
    assert.equal(active(), 0, "after the last piece the staff's own photo comes round again");
    report(false);
    mock.timers.tick(flipIntervalMs * 4);
    assert.equal(active(), 0, "it rests while scrolled out of view");
    report(true);
    mock.timers.tick(flipIntervalMs);
    assert.equal(active(), 1, "and carries on when back");
    stop();
    assert.equal(active(), 0);
  } finally {
    mock.timers.reset();
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  }
});

test("a drifting row draws its items twice, the second pass hidden and out of the tab order, with a pause switch", () => {
  const items = (copy: boolean) => <a href="/x" tabIndex={copy ? -1 : undefined}>Post</a>;
  const page = doc(<HomeMarquee label="Instagram posts" seconds={30} items={items} />);
  const groups = all(page, "[data-marquee-group]");
  assert.equal(groups.length, 2);
  assert.equal(groups[1]!.getAttribute("aria-hidden"), "true");
  assert.equal(groups[1]!.querySelector("a")?.getAttribute("tabindex"), "-1");
  assert.equal(groups[0]!.querySelector("a")?.hasAttribute("tabindex"), false);
  assert.ok(page.querySelector("[data-marquee-toggle] input[type=checkbox]"));
  const still = doc(<HomeMarquee label="Instagram posts" seconds={30} autoplay={false} items={items} />);
  assert.equal(still.querySelectorAll("[data-marquee-group]").length, 1, "without motion there is one plain row");
  assert.equal(still.querySelector("[data-marquee-toggle]"), null);
});

test("the homepage closes on the enquiry form and the wordmark: testimonial and newsletter are off but still in the builder", () => {
  const sections = defaultStorefrontContent.homeSections;
  assert.deepEqual(sections.filter((section) => !section.enabled).map((section) => section.key), ["testimonial", "newsletter"]);
  assert.deepEqual(sections.filter((section) => section.enabled).slice(-5).map((section) => section.key), ["editorial", "cities", "compare", "project", "values"]);
  assert.equal(defaultStorefrontContent.homeCopy.ticker, "Elegance isn’t found. At Maple, it is custom-built.");
});

test("the starting card tags mark some pieces New or Limited and never invent a rating", () => {
  const tagged = defaultStorefrontContent.productHighlights!.products;
  assert.ok(tagged.some((product) => product.isNew) && tagged.some((product) => product.isLimited));
  assert.ok(tagged.every((product) => product.rating === null));
});

test("a card stacks Sale, New and Limited, and shows the rating to the right of the name", async () => {
  const card = toProductCard({
    id: "chair", handle: "cloud-chair", title: "Cloud Chair", category: "chairs", images: ["https://cdn.example.com/chair.jpg"],
    variants: [{ pricePaise: 90000, compareAtPaise: 120000 }],
  });
  const highlights: ProductHighlights = { swatches: [], products: [{ handle: "cloud-chair", isNew: true, isLimited: true, rating: { value: 4.6, count: 12 } }] };
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000/" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR",
    mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const unrated = toProductCard({
    id: "stool", handle: "oak-stool", title: "Oak Stool", category: "chairs", images: ["https://cdn.example.com/stool.jpg"],
    variants: [{ pricePaise: 50000, compareAtPaise: null }],
  });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider><ProductHighlightsProvider value={highlights}><ProductCard product={card} /><ProductCard product={unrated} /></ProductHighlightsProvider></ShopProvider>));
    const [rated, plain] = all(document, "[data-product-card]");
    const badges = rated!.querySelector("[data-card-badges]")!;
    assert.deepEqual([...badges.children].map((badge) => badge.textContent), ["Sale", "New", "Limited"]);
    const heading = rated!.querySelector("[data-card-heading]")!;
    assert.equal(heading.querySelector("[data-card-name]")?.textContent?.trim(), "Cloud Chair");
    const rating = heading.querySelector("[data-card-rating]")!;
    assert.equal(rating.getAttribute("aria-label"), "Rated 4.6 out of 5 from 12 reviews");
    assert.equal(rating.textContent, "4.6", "the score and one gold star, as in the owner's reference");
    assert.equal(rating.querySelectorAll("svg").length, 1);
    assert.equal(document.querySelectorAll("[data-card-swatches]").length, 0, "no colour dots: the option photos stay");
    const empty = plain!.querySelector("[data-card-heading] [data-card-rating]")!;
    assert.ok(empty.hasAttribute("data-card-rating-empty"), "a piece with no reviews still has its rating place");
    assert.equal(empty.getAttribute("aria-label"), "No reviews yet");
    assert.equal(empty.textContent, "–", "a dash where the score would be: no invented score");
    assert.equal(empty.querySelectorAll("svg").length, 1, "and one empty star, in the rated cards' place");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("sample ratings fill in for a design review only on a local preview that asks for them, and say so", () => {
  const env = process.env as Record<string, string | undefined>;
  const before = { flag: env.NEXT_PUBLIC_SAMPLE_RATINGS, mode: env.NODE_ENV };
  const rated: ProductHighlights = { swatches: [], products: [{ handle: "cloud-chair", isNew: false, rating: { value: 4.6, count: 12 } }] };
  const rating = (handle: string) => doc(<ProductHighlightsProvider value={rated}><CardRating handle={handle} /></ProductHighlightsProvider>).querySelector("[data-card-rating]")!;
  try {
    delete env.NEXT_PUBLIC_SAMPLE_RATINGS;
    assert.equal(sampleRating("aero-dining-chair"), null, "off unless the local .env asks for it");
    env.NEXT_PUBLIC_SAMPLE_RATINGS = "1";
    const sample = sampleRating("aero-dining-chair")!;
    assert.ok(sample.value >= 4.3 && sample.value <= 4.9);
    assert.deepEqual(sampleRating("aero-dining-chair"), sample, "the same product always gets the same score");
    assert.ok(rating("aero-dining-chair").hasAttribute("data-card-rating-sample"));
    assert.equal(rating("aero-dining-chair").getAttribute("aria-label"), `Sample rating ${sample.value.toFixed(1)} out of 5, local preview only`);
    assert.equal(rating("cloud-chair").getAttribute("aria-label"), "Rated 4.6 out of 5 from 12 reviews", "a real rating always wins");
    env.NODE_ENV = "production";
    assert.equal(sampleRating("aero-dining-chair"), null, "a production build never shows one");
    assert.ok(rating("aero-dining-chair").hasAttribute("data-card-rating-empty"));
  } finally {
    if (before.flag === undefined) delete env.NEXT_PUBLIC_SAMPLE_RATINGS; else env.NEXT_PUBLIC_SAMPLE_RATINGS = before.flag;
    if (before.mode === undefined) delete env.NODE_ENV; else env.NODE_ENV = before.mode;
  }
});
