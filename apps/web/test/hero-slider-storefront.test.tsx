import assert from "node:assert/strict";
import { mock, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { homeDetailsSchema, heroSlideSchema, type HeroSlide, type HomeDetails } from "@shopmaple/contracts";
import { Hero, heroArtworkProducts } from "../components/hero";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { resizeHeroSlides, slideFromStill } from "../lib/hero-slides";
import { inBrowser } from "./support/slider-harness";

// Owner, 19 Nov 2026: the hero's slider takes as many slides as staff choose, each a picture or a video with its own words,
// placed and styled as they choose. These are the storefront's side of it: what each slide draws.

const keeri = (id: string) => `https://store.maplefurnishers.com/media/keeri/${id}.webp`;
const photos = new Map([["arbor-sofa", keeri("arbor")], ["aurevo", keeri("aurevo")], ["altura-table", keeri("altura")], ["meridian-table", keeri("meridian")]]);
const upload = (letter: string) => "/media/uploads/" + letter.repeat(64) + ".webp";
const film = "/media/uploads/" + "f".repeat(64) + ".mp4";
const content = (slides?: HeroSlide[]): HomeDetails["hero"] => ({ ...defaultHomeDetails.hero, ...(slides ? { slides } : {}) });
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const all = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const look = (slide: Element) => ["position", "tone", "shade", "size"].map(key => slide.getAttribute(`data-caption-${key}`));
const words = { headline: "Timeless Craftsmanship for Modern Living", intro: "Handcrafted furniture.", cta: "Explore Collection", labels: { nimbus: "The Nimbus Collection", terra: "The Terra Collection" } };

test("every slide says where its words sit and how they read; Maple's default slides keep the theme's own look", () => {
  const defaults = doc(<Hero content={content()} photos={photos} />);
  assert.equal(all(defaults, "[data-hero-slide]").length, 6);
  for (const slide of all(defaults, "[data-hero-slide]")) assert.deepEqual(look(slide), ["left", "light", "strong", "medium"]);
  const page = doc(<Hero content={content([
    { kind: "image", src: upload("b"), headline: "Sale", caption: { position: "top-right", tone: "dark", shade: "soft", size: "large" } },
    { kind: "image", src: upload("c"), headline: "As the theme has it" },
    { kind: "image", src: upload("d"), button: null },
  ])} />);
  const slides = all(page, "[data-hero-slide]");
  assert.deepEqual(look(slides[0]!), ["top-right", "dark", "soft", "large"]);
  assert.deepEqual(look(slides[1]!), ["left", "light", "strong", "medium"], "a slide without a look of its own has the theme's");
  assert.equal(slides[2]!.querySelector(".hero-introduction"), null, "a slide without words draws no words");
  assert.equal(slides[2]!.getAttribute("data-caption-shade"), "none", "and no shade over its picture");
});

test("a slide's words are its own: a small label, the headline, a line and a button to its page, each optional", () => {
  const page = doc(<Hero content={content([
    { kind: "image", src: upload("b"), eyebrow: "New season", headline: "The Diwali edit", intro: "Up to 30% off.", button: { label: "Shop the sale", href: "/collections/all" } },
    { kind: "image", src: upload("c"), headline: "Only a headline", button: null },
    { kind: "image", src: upload("d"), headline: "From before buttons were their own" },
  ])} />);
  const [first, second, third] = all(page, "[data-hero-slide]");
  assert.equal(first!.querySelector(".hero-eyebrow")?.textContent, "New season");
  assert.equal(first!.querySelector("[data-hero-headline]")?.textContent, "The Diwali edit");
  assert.equal(first!.querySelector("[data-hero-intro]")?.textContent, "Up to 30% off.");
  assert.equal(first!.querySelector<HTMLAnchorElement>("a.hero-cta")?.getAttribute("href"), "/collections/all");
  assert.equal(first!.querySelector("a.hero-cta")?.textContent?.trim(), "Shop the sale");
  assert.equal(second!.querySelector(".hero-eyebrow"), null);
  assert.equal(second!.querySelector("[data-hero-intro]"), null);
  assert.equal(second!.querySelector("a.hero-cta"), null, "no button at all");
  assert.equal(third!.querySelector("a.hero-cta")?.textContent?.trim(), "Explore Collection", "an older slide keeps the hero's button");
  assert.equal(third!.querySelector("a.hero-cta")?.getAttribute("href"), "/nimbus-collection");
  // A click on the words in the live preview types into that slide's own field, however many slides say the same.
  assert.deepEqual(all(first!, "[data-edit-field]").map(node => node.getAttribute("data-edit-field")),
    ["hero-slide:0:eyebrow", "hero-slide:0:headline", "hero-slide:0:intro", "hero-slide:0:button"]);
  assert.equal(all(doc(<Hero content={content()} photos={photos} />), "[data-edit-field]").length, 0, "the default slides' words are found by their words");
});

test("an image slide without its own picture shows Maple's photo it names, else the one for its place, and asks for that Keeri photo", () => {
  const slides: HeroSlide[] = [{ kind: "image", headline: "A" }, { kind: "image", still: "terra-hero", headline: "B" }, { kind: "image", headline: "C" }, { kind: "image", src: upload("b"), headline: "D" }];
  const page = doc(<Hero content={content(slides)} photos={photos} />);
  const pictures = all(page, "[data-hero-slide] img").map(image => image.getAttribute("src") ?? "");
  assert.equal(pictures[0], keeri("arbor"), "slide 1 shows the opening still, a Keeri photo until Maple uploads one");
  assert.match(pictures[1]!, /terra-collection(?:%2F|\/)hero\.webp/, "slide 2 shows the photo it names");
  assert.match(pictures[2]!, /terra-collection(?:%2F|\/)hero\.webp/, "slide 3 shows the photo for its place");
  assert.ok(pictures[3]!.includes("b".repeat(64)));
  assert.deepEqual(heroArtworkProducts(content(slides)), ["arbor-sofa"], "only the Keeri photo shown is fetched");
  assert.deepEqual(heroArtworkProducts(content()), ["arbor-sofa", "aurevo", "altura-table", "meridian-table"], "the default slides need theirs");
  for (const [index, slide] of all(page, "[data-hero-slide]").entries()) {
    assert.equal(slide.getAttribute("data-picture-target"), `hero-slide:${index}`, "a click on the slide opens that slide in the editor");
    assert.equal(slide.querySelector("[data-media-slot]"), null, "never the Artwork placement its photo comes from");
  }
});

test("slides made from the default ones draw exactly what the default slides drew", () => {
  const before = doc(<Hero content={{ ...content(), headline: words.headline, intro: words.intro }} photos={photos} />);
  const made = resizeHeroSlides(undefined, 6, words);
  assert.equal(made.every(slide => heroSlideSchema.safeParse(slide).success), true);
  const after = doc(<Hero content={content(made)} photos={photos} />);
  const draw = (page: Document) => all(page, "[data-hero-slide]").map(slide => ({
    picture: slide.querySelector("img")?.getAttribute("src"),
    label: slide.querySelector(".hero-eyebrow")?.textContent, headline: slide.querySelector("[data-hero-headline]")?.textContent,
    intro: slide.querySelector("[data-hero-intro]")?.textContent, href: slide.querySelector("a.hero-cta")?.getAttribute("href"),
    button: slide.querySelector("a.hero-cta")?.textContent?.trim(), look: look(slide).join(" "),
  }));
  assert.deepEqual(draw(after), draw(before));
  assert.deepEqual(slideFromStill(6, words), slideFromStill(0, words), "a seventh slide starts again at the first photo");
});

test("a phone picture is one phones load instead; a video without a cover shows the film itself; a video without its film is left out", () => {
  const page = doc(<Hero content={content([
    { kind: "image", src: upload("b"), mobileImage: upload("e"), headline: "Wide and tall" },
    { kind: "video", src: film, headline: "No cover yet" },
    { kind: "video", headline: "Not finished" } as HeroSlide,
  ])} />);
  const slides = all(page, "[data-hero-slide]");
  assert.equal(slides.length, 2, "the video slide without its film is left out");
  const source = slides[0]!.querySelector("picture > source");
  assert.equal(source?.getAttribute("media"), "(max-width: 749px)");
  assert.ok(source?.getAttribute("srcset")?.includes("e".repeat(64)), "phones load the phone picture");
  assert.ok(slides[0]!.querySelector("picture > img")?.getAttribute("src")?.includes("b".repeat(64)), "larger screens the wide one");
  const video = slides[1]!.querySelector("video")!;
  assert.equal(slides[1]!.querySelector("img"), null, "no cover");
  assert.equal(video.getAttribute("data-hero-poster"), "none", "so the film shows at every time");
  assert.equal(video.getAttribute("preload"), "metadata", "and its first frame loads");
});

test("the hero takes up to eight slides; a slide's rules keep films, phone pictures and Maple's photos where they belong", () => {
  const eight = Array.from({ length: 8 }, (_, index) => slideFromStill(index, words));
  const details = (slides: HeroSlide[]) => homeDetailsSchema.safeParse({ ...defaultHomeDetails, hero: { ...defaultHomeDetails.hero, slides } }).success;
  assert.equal(details(eight), true);
  assert.equal(details([...eight, slideFromStill(8, words)]), false, "nine is too many");
  assert.equal(heroSlideSchema.safeParse({ kind: "video", headline: "x" }).success, false, "a video needs its film");
  assert.equal(heroSlideSchema.safeParse({ kind: "video", src: film }).success, true, "a video without words or a cover is fine");
  assert.equal(heroSlideSchema.safeParse({ kind: "video", src: film, mobileImage: upload("b") }).success, false, "a phone picture is for picture slides");
  assert.equal(heroSlideSchema.safeParse({ kind: "video", src: film, still: "terra-hero" }).success, false, "Maple's photos are for picture slides");
  assert.equal(heroSlideSchema.safeParse({ kind: "image", mobileSrc: film }).success, false, "a phone film is for video slides");
  assert.equal(heroSlideSchema.safeParse({ kind: "image", still: "home-hero-sofas" }).success, false, "only the default slides' photos");
  assert.equal(heroSlideSchema.safeParse({ kind: "image", headline: "" }).success, false, "words have letters, or are absent");
  assert.equal(heroSlideSchema.safeParse({ kind: "image", button: { label: "Go", href: "https://example.com" } }).success, false, "a button opens a store page");
  assert.equal(heroSlideSchema.safeParse({ kind: "image", caption: { position: "middle", tone: "light", shade: "soft", size: "small" } }).success, false);
  assert.equal(heroSlideSchema.safeParse({ kind: "image", caption: { position: "bottom-right", tone: "dark", shade: "none", size: "small" }, button: null }).success, true);
});

test("attached again after the preview redrew the slides in place, the slider carries on from the slide in view", async () => {
  const { mountSlider } = await import("../lib/slider-behaviour");
  const dom = new JSDOM(renderToStaticMarkup(<Hero content={content([{ kind: "image", src: upload("b") }, { kind: "image", src: upload("c") }, { kind: "image", src: upload("d") }])} />));
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  try {
    const document = dom.window.document;
    const track = document.querySelector<HTMLElement>("[data-slider-track]")!;
    Object.defineProperty(track, "clientWidth", { configurable: true, value: 600 });
    track.scrollTo = () => {};
    track.scrollLeft = 1200;
    const stop = mountSlider(document.querySelector<HTMLElement>("[data-slider]")!);
    assert.deepEqual(all(document, "[data-slider-dot]").map(dot => dot.getAttribute("aria-current")), [null, null, "true"]);
    assert.deepEqual(all(document, "[data-hero-slide]").map(slide => slide.hasAttribute("data-active")), [false, false, true]);
    stop();
  } finally { Object.assign(globalThis, previous); dom.window.close(); }
});

test("the slide being edited in the live preview is shown and held there until it is let go", async () => {
  const slides: HeroSlide[] = [{ kind: "image", src: upload("b") }, { kind: "image", src: upload("c") }, { kind: "image", src: upload("d") }];
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await inBrowser(<Hero content={content(slides)} />, { island: "hero" }, async (browser, document) => {
      const root = document.querySelector<HTMLElement>("[data-slider]")!;
      const track = root.querySelector<HTMLElement>("[data-slider-track]")!;
      const scrolls = browser.layout(track, 600);
      const current = () => all(document, "[data-slider-dot]").map(dot => dot.getAttribute("aria-current"));
      const pin = (index: number | null) => {
        if (index === null) root.removeAttribute("data-slider-pin"); else root.setAttribute("data-slider-pin", String(index));
        return browser.fire(root, "slider:pin");
      };
      await pin(2);
      assert.deepEqual(current(), [null, null, "true"], "the slide being edited shows");
      assert.deepEqual(scrolls.at(-1), { left: 1200 });
      mock.timers.tick(30000);
      assert.deepEqual(current(), [null, null, "true"], "and stays while it is edited");
      await pin(9);
      assert.deepEqual(current(), [null, null, "true"], "a slide past the end shows the last");
      await pin(null);
      mock.timers.tick(6000);
      assert.deepEqual(current(), ["true", null, null], "let go, the slider runs again");
    });
  } finally { mock.timers.reset(); }
});
