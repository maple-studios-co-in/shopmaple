import assert from "node:assert/strict";
import { mock, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { HomeDetails } from "@shopmaple/contracts";
import { Hero } from "../components/hero";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { inBrowser } from "./support/slider-harness";

// The hero tile is a slider of slides. With no `slides` it shows six stills (the shop film was on Shopify and left the
// store on 11 Nov 2026): each placement's upload, else a Keeri product's photo. With slides the staff author each
// slide's media and words. Slides are server markup (a scroll-snap track that works without script); a lazy island adds
// dots, autoplay and video control.
const keeri = (id: string) => `https://store.maplefurnishers.com/media/keeri/${id}.webp`;
const photos = new Map([["arbor-sofa", keeri("arbor")], ["aurevo", keeri("aurevo")], ["altura-table", keeri("altura")], ["meridian-table", keeri("meridian")]]);
const slides: NonNullable<HomeDetails["hero"]["slides"]> = [
  { kind: "video", src: "/media/films/craft.mp4", poster: "/media/uploads/" + "a".repeat(64) + ".webp", alt: "Craftsmen at work", headline: "Made by hand", intro: "In our Delhi workshop." },
  { kind: "image", src: "/media/uploads/" + "b".repeat(64) + ".webp", alt: "A walnut sofa", headline: "Sofas that last", intro: "Built to be lived in." },
  { kind: "image", src: "/media/uploads/" + "c".repeat(64) + ".webp", alt: "A dining set", headline: "Gather round", intro: "Tables for every home." },
];
const content = (next?: HomeDetails["hero"]["slides"]): HomeDetails["hero"] => ({ ...defaultHomeDetails.hero, slides: next });
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const all = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];

const terra = /terra-collection(?:%2F|\/)(hero|room-lobby)\.webp/;

// QA report, 16 Nov 2026: every slide spoke for Nimbus. The opening still now leads the two collections in turn, each
// photo naming its collection over the headline and opening that collection's page; arrows step through them.
test("without slides the hero is six stills: the opening one, then Nimbus and Terra in turn, each naming and opening its collection", () => {
  const page = doc(<Hero photos={photos} />);
  const rendered = all(page, "[data-hero-slide]");
  assert.deepEqual(rendered.map(slide => slide.getAttribute("data-hero-slide-kind")), Array(6).fill("image"));
  const sources = rendered.map(slide => slide.querySelector("img")?.getAttribute("src") ?? "");
  assert.deepEqual([sources[0], sources[1], sources[3], sources[5]], [keeri("arbor"), keeri("aurevo"), keeri("altura"), keeri("meridian")]);
  assert.deepEqual([sources[2], sources[4]].map(source => (source ?? "").match(terra)?.[1]), ["hero", "room-lobby"], "Terra's own page photos");
  assert.equal(page.querySelector("video"), null);
  for (const slide of rendered) {
    assert.equal(slide.querySelector("[data-hero-headline]")?.textContent, "Timeless Craftsmanship for Modern Living");
    assert.equal(slide.querySelector("[data-hero-intro]")?.textContent, "Handcrafted furniture that brings elegance to every corner of your home.");
  }
  assert.deepEqual(rendered.map(slide => slide.querySelector("[data-hero-eyebrow]")?.textContent ?? null),
    [null, "The Nimbus Collection", "The Terra Collection", "The Nimbus Collection", "The Terra Collection", "The Nimbus Collection"]);
  assert.deepEqual(rendered.map(slide => slide.querySelector(".hero-cta")?.getAttribute("href")),
    ["/nimbus-collection", "/nimbus-collection", "/terra-collection", "/nimbus-collection", "/terra-collection", "/nimbus-collection"]);
  assert.equal(all(page, "[data-slider-dot]").length, 6);
  assert.deepEqual(all(page, "[data-hero-arrows] button").map(button => [button.getAttribute("type"), button.getAttribute("aria-label")]),
    [["button", "Previous slide"], ["button", "Next slide"]]);
  assert.equal(page.querySelector(".hero-film button:not([data-slider-dot], [data-slider-prev], [data-slider-next])"), null, "no play or pause control");
});

test("an uploaded still wins over its Keeri photo, and a still without either is left out", () => {
  const page = doc(<Hero photos={new Map([["aurevo", keeri("aurevo")]])} media={[{ key: "home-workshop-poster", image: "/media/uploads/" + "d".repeat(64) + ".webp", alt: "Our workshop" }]} />);
  const rendered = all(page, "[data-hero-slide]");
  assert.deepEqual(rendered.slice(0, 2).map(slide => slide.querySelector("img")?.getAttribute("alt")), ["Our workshop", "Living room"]);
  assert.ok(rendered[0]!.querySelector("img")?.getAttribute("src")?.includes("d".repeat(64)));
  assert.equal(rendered[1]!.querySelector("img")?.getAttribute("src"), keeri("aurevo"));
  assert.deepEqual(rendered.slice(2).map(slide => slide.querySelector("[data-hero-eyebrow]")?.getAttribute("data-hero-eyebrow")), ["terra", "terra"],
    "the Nimbus bedroom and dining stills, with no photo, are left out; Terra's photos stay");
});

test("with no upload and no Keeri photo the hero still shows Terra's own photos, never a broken picture", () => {
  const page = doc(<Hero />);
  const rendered = all(page, "[data-hero-slide]");
  assert.equal(rendered.length, 2);
  assert.ok(rendered.every(slide => terra.test(slide.querySelector("img")?.getAttribute("src") ?? "")));
  assert.equal(rendered[0]!.querySelector("[data-hero-headline]")?.textContent, "Timeless Craftsmanship for Modern Living");
  assert.equal(all(page, "[data-slider-dot]").length, 2);
});

test("a single authored film slide is the one shop film with no dots", () => {
  const page = doc(<Hero content={content([slides[0]!])} />);
  assert.equal(all(page, "[data-hero-slide]").length, 1);
  assert.equal(all(page, "[data-slider-dot]").length, 0, "one slide needs no dots");
});

test("authored slides render as server markup: media, words and the button in every slide", () => {
  const page = doc(<Hero content={content(slides)} />);
  const rendered = all(page, "[data-hero-slide]");
  assert.equal(rendered.length, 3);
  assert.deepEqual(rendered.map(slide => slide.getAttribute("data-hero-slide-kind")), ["video", "image", "image"]);
  assert.deepEqual(rendered.map(slide => slide.querySelector("[data-hero-headline]")?.textContent), ["Made by hand", "Sofas that last", "Gather round"]);
  assert.deepEqual(rendered.map(slide => slide.querySelector("[data-hero-intro]")?.textContent), ["In our Delhi workshop.", "Built to be lived in.", "Tables for every home."]);
  assert.deepEqual(rendered.map(slide => slide.querySelector(".hero-cta")?.textContent?.trim()), Array(3).fill("Explore Collection"));
  const video = rendered[0]!.querySelector("video")!;
  assert.equal(video.getAttribute("src"), slides[0]!.src);
  for (const attribute of ["muted", "loop", "playsinline"]) assert.ok(video.hasAttribute(attribute), attribute);
  for (const attribute of ["autoplay", "controls"]) assert.equal(video.hasAttribute(attribute), false, `no ${attribute}`);
  assert.equal(rendered[0]!.querySelector("img")?.getAttribute("src")?.includes("a".repeat(64)), true, "the poster shows under the video");
  assert.equal(rendered[0]!.querySelector("img")?.getAttribute("alt"), "Craftsmen at work");
  assert.equal(rendered[1]!.querySelector("video"), null, "an image slide has no video");
  assert.equal(rendered[1]!.querySelector("img")?.getAttribute("alt"), "A walnut sofa");
  assert.equal(rendered[1]!.querySelector("img")?.getAttribute("src")?.includes("b".repeat(64)), true);
  assert.equal(video.getAttribute("aria-hidden"), "true", "the video is decoration; the poster carries the description");
});

test("with several slides the first is active and each dot is a real button naming its slide", () => {
  const page = doc(<Hero content={content(slides)} />);
  assert.deepEqual(all(page, "[data-hero-slide]").map(slide => slide.hasAttribute("data-active")), [true, false, false]);
  const dots = all(page, "[data-slider-dot]");
  assert.deepEqual(dots.map(dot => dot.tagName), ["BUTTON", "BUTTON", "BUTTON"]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("aria-label")), ["Show slide 1", "Show slide 2", "Show slide 3"]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("aria-current")), ["true", null, null]);
  assert.deepEqual(dots.map(dot => dot.getAttribute("type")), ["button", "button", "button"]);
});

test("a draft slide that is not finished yet is left out; none left means the default stills", () => {
  const blank = { ...slides[1]!, src: "" };
  assert.equal(all(doc(<Hero content={content([slides[1]!, blank])} />), "[data-hero-slide]").length, 1);
  const none = doc(<Hero content={content([blank])} photos={photos} />);
  assert.equal(none.querySelector("video"), null);
  assert.equal(all(none, "[data-hero-slide] img").length, 6);
  const noPoster = { ...slides[0]!, poster: undefined };
  const fallback = doc(<Hero content={content([noPoster])} photos={photos} />);
  assert.equal(fallback.querySelector("video"), null, "a film without a poster is unfinished, so the stills show");
  assert.equal(all(fallback, "[data-hero-slide] img")[0]!.getAttribute("src"), keeri("arbor"));
});

const mountHero = (check: Parameters<typeof inBrowser>[2], options: { reduced?: boolean } = {}, many = slides) =>
  inBrowser(<Hero content={content(many)} />, { ...options, island: "hero" }, check);
const rails = (document: Document) => ({
  track: (() => {
    const found = document.querySelector<HTMLElement>("[data-hero-film] [data-slider-track]");
    assert.ok(found, "the film tile has a slide track");
    return found;
  })(),
  slides: [...document.querySelectorAll<HTMLElement>("[data-hero-slide]")],
  dots: [...document.querySelectorAll<HTMLElement>("[data-slider-dot]")],
  current: () => [...document.querySelectorAll("[data-slider-dot]")].map(dot => dot.getAttribute("aria-current")),
  active: () => [...document.querySelectorAll("[data-hero-slide]")].map(slide => slide.hasAttribute("data-active")),
});
const videos = (document: Document) => [...document.querySelectorAll<HTMLVideoElement>("[data-hero-slide] video")];

test("a dot shows its slide: the slide scrolls into view, the dot is current, only that slide's video plays", async () => {
  await mountHero(async (browser, document) => {
    const { track, dots, current, active } = rails(document);
    const scrolls = browser.layout(track, 600);
    assert.equal(videos(document)[0]!.paused, false, "the first slide's video plays");
    await browser.click(dots[1]!);
    assert.deepEqual(current(), [null, "true", null]);
    assert.deepEqual(active(), [false, true, false]);
    assert.deepEqual(scrolls.at(-1), { left: 600 });
    assert.equal(videos(document)[0]!.paused, true, "a video that is off screen pauses");
    await browser.click(dots[0]!);
    assert.deepEqual(current(), ["true", null, null]);
    assert.deepEqual(scrolls.at(-1), { left: 0 });
    assert.equal(videos(document)[0]!.paused, false, "coming back to a video slide plays it again");
  });
});

test("swiping the track moves the current dot with it", async () => {
  await mountHero(async (browser, document) => {
    const { track, current } = rails(document);
    browser.layout(track, 600);
    await browser.scrollTo(track, 1200);
    assert.deepEqual(current(), [null, null, "true"]);
    await browser.scrollTo(track, 650);
    assert.deepEqual(current(), [null, "true", null], "a slide counts once it is mostly in view");
    await browser.scrollTo(track, 0);
    assert.equal(videos(document)[0]!.paused, false);
  });
});

test("focusing a slide's button brings that slide into view", async () => {
  await mountHero(async (browser, document) => {
    const { track, slides: rendered, current } = rails(document);
    const scrolls = browser.layout(track, 600);
    await browser.focus(rendered[2]!.querySelector<HTMLElement>(".hero-cta")!);
    assert.deepEqual(current(), [null, null, "true"]);
    assert.deepEqual(scrolls.at(-1), { left: 1200 });
  });
});

test("slides advance about every six seconds, wrapping round, and stop while the shopper hovers or focuses", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await mountHero(async (browser, document) => {
      const { track, current, dots } = rails(document);
      const root = document.querySelector("[data-hero-film]")!;
      browser.layout(track, 600);
      mock.timers.tick(5900);
      assert.deepEqual(current(), ["true", null, null], "not yet");
      await Promise.resolve(); mock.timers.tick(200);
      assert.deepEqual(current(), [null, "true", null]);
      mock.timers.tick(6000); mock.timers.tick(6000);
      assert.deepEqual(current(), ["true", null, null], "after the last slide it starts over");
      await browser.fire(root, "pointerenter");
      mock.timers.tick(30000);
      assert.deepEqual(current(), ["true", null, null], "hovering holds the slide");
      await browser.fire(root, "pointerleave");
      mock.timers.tick(6000);
      assert.deepEqual(current(), [null, "true", null], "leaving lets it move again");
      await browser.focus(dots[1]!);
      mock.timers.tick(30000);
      assert.deepEqual(current(), [null, "true", null], "keyboard focus holds the slide too");
      await browser.fire(dots[1]!, "focusout", { relatedTarget: document.body } as EventInit);
      mock.timers.tick(6000);
      assert.deepEqual(current(), [null, null, "true"]);
      await browser.click(dots[0]!);
      mock.timers.tick(5000);
      assert.deepEqual(current(), ["true", null, null], "choosing a slide restarts the wait");
    });
  } finally { mock.timers.reset(); }
});

test("reduced motion: nothing advances, no video plays, and turning it off starts both", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await mountHero(async (browser, document) => {
      const { track, current } = rails(document);
      browser.layout(track, 600);
      assert.equal(videos(document)[0]!.paused, true, "the video shows its poster");
      assert.equal(browser.playing().length, 0);
      mock.timers.tick(20000);
      assert.deepEqual(current(), ["true", null, null]);
      await browser.reduce(false);
      assert.equal(videos(document)[0]!.paused, false);
      mock.timers.tick(6000);
      assert.deepEqual(current(), [null, "true", null], "autoplay begins");
      assert.equal(videos(document)[0]!.paused, true);
      await browser.reduce(true);
      mock.timers.tick(30000);
      assert.deepEqual(current(), [null, "true", null], "and stops again");
    }, { reduced: true });
  } finally { mock.timers.reset(); }
});

test("one slide never advances; leaving the page removes the listener and the timer", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await inBrowser(<Hero content={content([slides[0]!])} />, { island: "hero" }, async (browser, document) => {
      assert.equal(browser.motionListeners(), 1);
      mock.timers.tick(60000);
      assert.equal(document.querySelectorAll("[data-hero-slide]").length, 1);
      await browser.unmount();
      assert.equal(browser.motionListeners(), 0);
    });
    await mountHero(async (browser) => {
      assert.equal(browser.motionListeners(), 1);
      await browser.unmount();
      assert.equal(browser.motionListeners(), 0);
      mock.timers.tick(60000);
    });
  } finally { mock.timers.reset(); }
});

test("a slide's film covers its poster only while it plays, so reduced motion and paused slides show the poster", async () => {
  await mountHero(async (browser, document) => {
    const film = videos(document)[0]!;
    assert.equal(film.hasAttribute("data-playing"), false, "nothing plays under reduced motion: the poster shows");
    await browser.reduce(false);
    await browser.fire(film, "playing");
    assert.equal(film.hasAttribute("data-playing"), true, "a playing film covers its poster");
    await browser.fire(film, "pause");
    assert.equal(film.hasAttribute("data-playing"), false, "a paused film uncovers it");
  }, { reduced: true });
});

test("the arrows step one slide back or on, wrapping round at either end", async () => {
  await mountHero(async (browser, document) => {
    const { track, current } = rails(document);
    const scrolls = browser.layout(track, 600);
    const [previous, next] = all(document, "[data-hero-arrows] button");
    await browser.click(next!);
    assert.deepEqual(current(), [null, "true", null]);
    assert.deepEqual(scrolls.at(-1), { left: 600 });
    await browser.click(next!); await browser.click(next!);
    assert.deepEqual(current(), ["true", null, null], "after the last slide comes the first");
    await browser.click(previous!);
    assert.deepEqual(current(), [null, null, "true"], "and before the first, the last");
    assert.deepEqual(scrolls.at(-1), { left: 1200 });
  });
});
