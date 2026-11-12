import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { storefrontContentSchema, templateFilmsSchema, type TemplateFilms } from "@shopmaple/contracts";
import { HomeTestimonial } from "../components/home-sections";
import { AmbientFilm } from "../components/ambient-film";
import { mountAmbientFilm } from "../lib/home-effects";
import { CollectionLandingView } from "../components/collection-landing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { resolveNimbusLanding } from "../lib/nimbus-content-defaults";
import { resolveTerraLanding } from "../lib/terra-content-defaults";
import { previewMediaContent } from "../lib/draft-preview";
import { filmDuration } from "../lib/template-films";

// Films (owner, 12 Nov 2026): staff choose a film from the media library for the testimonial and the Nimbus and Terra
// pages. Without a film nothing film-shaped renders.
const film = (letter: string, extension = "mp4") => `/media/uploads/${letter.repeat(64)}.${extension}`;
const poster = `/media/uploads/${"b".repeat(64)}.webp`;
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;

test("the testimonial plays its film muted and looping over its poster, and without a film keeps the still", () => {
  const media = [{ key: "home-testimonial-poster" as const, image: poster, alt: "Our customer's living room" }];
  const films: TemplateFilms = [{ key: "home-testimonial", src: film("a"), durationMs: 21_000 }];
  const withFilm = doc(<HomeTestimonial media={media} films={films} />);
  const video = withFilm.querySelector<HTMLVideoElement>(".home-testimonial > video")!;
  assert.ok(video, "the film renders in the poster's place");
  assert.equal(video.getAttribute("src"), film("a"));
  for (const attribute of ["muted", "loop", "playsinline"]) assert.equal(video.hasAttribute(attribute), true, attribute);
  assert.equal(video.getAttribute("preload"), "metadata", "only the film's opening bytes load before it is seen");
  assert.equal(video.hasAttribute("autoplay"), false, "it starts from script, so reduced-motion visitors never see it move");
  assert.equal(video.getAttribute("aria-label"), "Our customer's living room");
  assert.deepEqual([video.getAttribute("width"), video.getAttribute("height")], ["720", "1280"], "fixed proportions: nothing moves when it loads");
  assert.equal(withFilm.querySelector(".home-testimonial-still"), null);
  const still = doc(<HomeTestimonial media={media} />);
  assert.equal(still.querySelector("video"), null);
  assert.ok(still.querySelector("img.home-testimonial-still"));
  assert.equal(video.getAttribute("poster"), still.querySelector("img")!.getAttribute("src"), "the poster is the still, through the image optimiser");
  assert.equal(doc(<HomeTestimonial />).querySelector("video, .home-testimonial-still"), null, "neither film nor poster: the words stand alone");
});

test("an ambient film plays only while on screen and never for visitors who ask for reduced motion", async () => {
  for (const reduced of [false, true]) {
    const dom = new JSDOM(renderToStaticMarkup(<AmbientFilm src={film("a")} label="Film" width={720} height={1280} />), { url: "http://localhost/" });
    const observers: { callback: IntersectionObserverCallback; disconnected: boolean }[] = [];
    class Observer { constructor(public callback: IntersectionObserverCallback) { observers.push(this as unknown as { callback: IntersectionObserverCallback; disconnected: boolean }); } observe() {} disconnect() { (this as unknown as { disconnected: boolean }).disconnected = true; } }
    const played: string[] = [], paused: string[] = [];
    let playing = false;
    Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
      paused: { get: () => !playing },
      play: { value() { playing = true; played.push("play"); return Promise.resolve(); } },
      pause: { value() { playing = false; paused.push("pause"); } },
      load: { value() {} },
    });
    Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }) });
    const saved = { window: globalThis.window, document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver };
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IntersectionObserver: Observer });
    const video = dom.window.document.querySelector<HTMLVideoElement>("video[data-ambient-film]")!;
    assert.equal(video.getAttribute("preload"), "metadata", "server markup: only the opening bytes load before it plays");
    try {
      const stop = mountAmbientFilm(video);
      assert.deepEqual(played, [], "nothing plays before it is scrolled to");
      const seen = async (isIntersecting: boolean) => observers[0]!.callback([{ isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as IntersectionObserverEntry], observers[0] as unknown as IntersectionObserver);
      await seen(true);
      assert.deepEqual(played, reduced ? [] : ["play"], reduced ? "reduced motion keeps the poster" : "it plays once on screen");
      await seen(false);
      assert.deepEqual(paused, reduced ? [] : ["pause"], "and pauses off screen");
      stop();
      assert.equal(observers[0]!.disconnected, true);
    } finally { Object.assign(globalThis, saved); dom.window.close(); }
  }
});

test("Nimbus and Terra show the chosen film's link with its running time, and none without a film", () => {
  const films: TemplateFilms = [{ key: "nimbus-hero", src: film("c"), durationMs: 25_400 }, { key: "terra-hero", src: film("d", "webm") }];
  const site = { ...structuredClone(defaultStorefrontContent), templateFilms: films };
  const nimbus = resolveNimbusLanding(site);
  assert.deepEqual(nimbus.hero.film, { label: "Watch collection film", title: "The Nimbus Collection film", src: film("c"), poster: nimbus.hero.media.src, duration: "00:25" });
  const terra = resolveTerraLanding(site);
  assert.deepEqual(terra.hero.film, { label: "Watch collection film", title: `${terra.title} film`, src: film("d", "webm"), poster: terra.hero.media.src }, "a film without a known running time has none");
  const link = doc(<CollectionLandingView page={nimbus} />).querySelector("[data-collection-film]");
  assert.equal(link?.textContent?.replace(/\s+/g, " ").trim(), "Watch collection film / 00:25");
  assert.equal(doc(<CollectionLandingView page={terra} />).querySelector("[data-collection-film]")?.textContent?.trim(), "Watch collection film", "no slash without a time");
  const none = { ...structuredClone(defaultStorefrontContent) };
  assert.equal("film" in resolveNimbusLanding(none).hero, false);
  assert.equal("film" in resolveTerraLanding(none).hero, false);
  // Each opening keeps its own clip (collection-opening-clip.test.tsx); without a film there is no link and no player.
  for (const page of [resolveTerraLanding(none), resolveNimbusLanding(none)])
    assert.equal(doc(<CollectionLandingView page={page} />).querySelector("[data-collection-film], video:not([data-collection-clip])"), null, page.key);
  // One page's film never shows on the other.
  assert.equal("film" in resolveTerraLanding({ ...none, templateFilms: [films[0]!] }).hero, false);
});

test("running times read as the film link shows them", () => {
  assert.equal(filmDuration(8_000), "00:08");
  assert.equal(filmDuration(135_400), "02:15");
  assert.equal(filmDuration(3_723_000), "1:02:03");
  assert.equal(filmDuration(undefined), undefined);
});

test("the staff preview plays unpublished films through the private route; prose and other text stay as written", () => {
  const sha = "e".repeat(64);
  const draft = previewMediaContent({
    templateFilms: [{ key: "home-testimonial", src: `/media/uploads/${sha}.mp4` }],
    homeDetails: { hero: { slides: [{ kind: "video", src: `/media/uploads/${sha}.webm`, poster: `/media/uploads/${sha}.webp` }] } },
    homeCopy: { ticker: `/media/uploads/${sha}.mp4` },
  });
  assert.equal(draft.templateFilms[0]!.src, `/api/admin/media/${sha}/preview`);
  assert.equal(draft.homeDetails.hero.slides[0]!.src, `/api/admin/media/${sha}/preview`);
  assert.equal(draft.homeDetails.hero.slides[0]!.poster, `/api/admin/media/${sha}/preview`);
  assert.equal(draft.homeCopy.ticker, `/media/uploads/${sha}.mp4`);
});

test("film choices are library films, one per place, and documents without them stay valid", () => {
  assert.equal(templateFilmsSchema.safeParse([{ key: "home-testimonial", src: film("a"), durationMs: 1000 }, { key: "terra-hero", src: film("b", "webm") }]).success, true);
  for (const bad of [
    [{ key: "home-testimonial", src: poster }],
    [{ key: "home-testimonial", src: "/media/films/bundled.mp4" }],
    [{ key: "home-testimonial", src: `${film("a")}?x=1` }],
    [{ key: "home-testimonial", src: "https://cdn.shopify.com/videos/a.mp4" }],
    [{ key: "home-hero", src: film("a") }],
    [{ key: "nimbus-hero", src: film("a") }, { key: "nimbus-hero", src: film("b") }],
    [{ key: "nimbus-hero", src: film("a"), durationMs: 0 }],
    [{ key: "nimbus-hero", src: film("a"), title: "extra" }],
  ]) assert.equal(templateFilmsSchema.safeParse(bad).success, false, JSON.stringify(bad));
  assert.equal(storefrontContentSchema.safeParse(defaultStorefrontContent).success, true);
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, templateFilms: [{ key: "nimbus-hero", src: film("a") }] }).success, true);
});
