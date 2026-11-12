import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { homeDetailsSchema, storefrontContentSchema, templateFilmsSchema, type TemplateFilms } from "@shopmaple/contracts";
import { HomeTestimonial } from "../components/home-sections";
import { Hero } from "../components/hero";
import { CollectionFilm } from "../components/collection-landing-client";
import { mountAmbientFilm } from "../lib/home-effects";
import { mountSlider } from "../lib/slider-behaviour";
import { chooseFilmSource, phoneFilmQuery } from "../lib/film-source";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { resolveNimbusLanding } from "../lib/nimbus-content-defaults";
import { resolveTerraLanding } from "../lib/terra-content-defaults";
import { previewMediaContent } from "../lib/draft-preview";

// Phone films (owner, 12 Nov 2026): every film slot may carry a phone cut beside its film, such as the Diwali film's
// 9:16 version of its square cut. Screens up to 749px wide play the phone cut; without one, nothing changes.
const film = (letter: string, extension = "mp4") => `/media/uploads/${letter.repeat(64)}.${extension}`;
const square = film("1"), portrait = film("2");
const poster = `/media/uploads/${"b".repeat(64)}.webp`;
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;

/**
 * A browser of a given width and motion preference: only the media boundary (matchMedia, play, pause, IntersectionObserver)
 * is simulated, as in the other film tests; the components and behaviour are real.
 */
function browser(markup: string, { phone, reduced = false }: { phone: boolean; reduced?: boolean }) {
  const dom = new JSDOM(markup, { url: "http://localhost/" });
  const plays: string[] = [];
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLMediaElement) { plays.push(this.getAttribute("src") ?? ""); paused.set(this, false); return Promise.resolve(); } },
    pause: { value(this: HTMLMediaElement) { paused.set(this, true); } },
    load: { value() {} },
  });
  const queries: string[] = [];
  Object.defineProperty(dom.window, "matchMedia", { value: (query: string) => {
    queries.push(query);
    return { matches: query === phoneFilmQuery ? phone : query.includes("reduced-motion") ? reduced : false, media: query, addEventListener() {}, removeEventListener() {} };
  } });
  class Observer { constructor(private callback: IntersectionObserverCallback) { observers.push(this); } observe() {} disconnect() {}
    see() { this.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver); } }
  const observers: Observer[] = [];
  const saved = { window: globalThis.window, document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IntersectionObserver: Observer });
  return { document: dom.window.document, plays, queries, observers, close() { Object.assign(globalThis, saved); dom.window.close(); } };
}

test("each film slot's phone film is a library film, only a video slide has one, and documents without one stay valid", () => {
  assert.equal(templateFilmsSchema.safeParse([{ key: "home-testimonial", src: square, mobileSrc: portrait, durationMs: 15_000 }]).success, true);
  assert.equal(templateFilmsSchema.safeParse([{ key: "nimbus-hero", src: square }]).success, true, "the phone film is optional");
  for (const mobileSrc of [poster, "/media/films/bundled.mp4", `${portrait}?x=1`, "https://cdn.example.com/a.mp4", ""])
    assert.equal(templateFilmsSchema.safeParse([{ key: "terra-hero", src: square, mobileSrc }]).success, false, mobileSrc);
  const slide = { kind: "video", src: square, mobileSrc: portrait, poster, alt: "Diwali at home", headline: "Decked for Diwali", intro: "Up to 40% off" };
  const hero = (slides: unknown[]) => homeDetailsSchema.safeParse({ ...defaultHomeDetails, hero: { ...defaultHomeDetails.hero, slides } }).success;
  assert.equal(hero([slide]), true);
  assert.equal(hero([{ ...slide, mobileSrc: poster }]), false, "a picture is not a phone film");
  assert.equal(hero([{ ...slide, kind: "image", src: poster }]), false, "an image slide has no phone film");
  const { mobileSrc: _none, ...withoutPhone } = slide;
  assert.equal(hero([withoutPhone]), true);
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, templateFilms: [{ key: "home-testimonial", src: square, mobileSrc: portrait }] }).success, true);
});

test("without a phone film the markup is as before: the film's address is in src", () => {
  const testimonial = doc(<HomeTestimonial films={[{ key: "home-testimonial", src: square }]} />).querySelector("video")!;
  assert.equal(testimonial.getAttribute("src"), square);
  assert.equal(testimonial.hasAttribute("data-film-mobile-src"), false);
  const hero = { ...defaultHomeDetails.hero, slides: [{ kind: "video" as const, src: square, poster, alt: "Diwali", headline: "Decked for Diwali", intro: "Up to 40% off" }] };
  assert.equal(doc(<Hero content={hero} />).querySelector("video")!.getAttribute("src"), square);
});

test("with a phone film neither cut loads from markup: script picks one, so a phone never starts on the wide film", () => {
  const testimonial = doc(<HomeTestimonial films={[{ key: "home-testimonial", src: square, mobileSrc: portrait }]} />).querySelector("video")!;
  assert.equal(testimonial.hasAttribute("src"), false);
  assert.equal(testimonial.getAttribute("data-film-src"), square);
  assert.equal(testimonial.getAttribute("data-film-mobile-src"), portrait);
  const hero = { ...defaultHomeDetails.hero, slides: [{ kind: "video" as const, src: square, mobileSrc: portrait, poster, alt: "Diwali", headline: "Decked for Diwali", intro: "Up to 40% off" }] };
  const slide = doc(<Hero content={hero} />);
  const video = slide.querySelector("video")!;
  assert.equal(video.hasAttribute("src"), false);
  assert.deepEqual([video.getAttribute("data-film-src"), video.getAttribute("data-film-mobile-src")], [square, portrait]);
  assert.ok(slide.querySelector(".hero-film img"), "the poster shows until the film plays, and without script");
});

test("the testimonial plays the phone film up to 749px and the film above that, and never under reduced motion", async () => {
  const markup = renderToStaticMarkup(<HomeTestimonial films={[{ key: "home-testimonial", src: square, mobileSrc: portrait }]} />);
  for (const [phone, reduced] of [[true, false], [false, false], [true, true]] as const) {
    const page = browser(markup, { phone, reduced });
    try {
      const video = page.document.querySelector<HTMLVideoElement>("video[data-ambient-film]")!;
      const stop = mountAmbientFilm(video);
      assert.equal(video.getAttribute("src"), phone ? portrait : square, `phone ${phone}`);
      page.observers[0]!.see();
      await Promise.resolve();
      assert.deepEqual(page.plays, reduced ? [] : [phone ? portrait : square], reduced ? "reduced motion keeps the poster" : "plays its cut once in view");
      stop();
    } finally { page.close(); }
  }
});

test("a hero video slide plays its phone film on a phone and its film on wider screens", () => {
  const hero = { ...defaultHomeDetails.hero, slides: [{ kind: "video" as const, src: square, mobileSrc: portrait, poster, alt: "Diwali", headline: "Decked for Diwali", intro: "Up to 40% off" }] };
  const markup = renderToStaticMarkup(<Hero content={hero} />);
  for (const [phone, reduced] of [[true, false], [false, false], [true, true]] as const) {
    const page = browser(markup, { phone, reduced });
    try {
      const stop = mountSlider(page.document.querySelector<HTMLElement>("[data-slider]")!);
      assert.equal(page.document.querySelector("video")!.getAttribute("src"), phone ? portrait : square, `phone ${phone}`);
      assert.deepEqual(page.plays, reduced ? [] : [phone ? portrait : square]);
      stop();
    } finally { page.close(); }
  }
});

test("a film with only src is left alone when it is attached", () => {
  const page = browser(`<video src="${square}"></video>`, { phone: true });
  try {
    const video = page.document.querySelector("video")!;
    chooseFilmSource(video);
    assert.equal(video.getAttribute("src"), square);
    assert.deepEqual(page.queries, [], "no screen check without a phone film");
  } finally { page.close(); }
});

test("Nimbus and Terra pass the phone film to the film link, which opens it on a phone and the film elsewhere", async () => {
  const films: TemplateFilms = [{ key: "nimbus-hero", src: square, mobileSrc: portrait, durationMs: 25_400 }, { key: "terra-hero", src: square }];
  const site = { ...structuredClone(defaultStorefrontContent), templateFilms: films };
  const nimbus = resolveNimbusLanding(site).hero.film!;
  assert.equal(nimbus.src, square);
  assert.equal(nimbus.mobileSrc, portrait);
  assert.equal("mobileSrc" in resolveTerraLanding(site).hero.film!, false, "no phone film: none passed on");
  for (const phone of [true, false]) {
    const page = browser('<div id="root"></div>', { phone, reduced: true });
    Object.assign(globalThis, { HTMLElement: page.document.defaultView!.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(page.document.defaultView!.HTMLDialogElement.prototype, "showModal", { value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    const root = createRoot(page.document.getElementById("root")!);
    try {
      await act(async () => root.render(<CollectionFilm film={nimbus} />));
      const video = page.document.querySelector("dialog video")!;
      assert.equal(video.hasAttribute("src"), false, "nothing loads until the link is used");
      await act(async () => page.document.querySelector<HTMLButtonElement>("[data-collection-film]")!.click());
      assert.equal(video.getAttribute("src"), phone ? portrait : square, `phone ${phone}`);
      assert.deepEqual(page.plays, [], "under reduced motion the film waits for the visitor's play");
    } finally { await act(async () => root.unmount()); page.close(); }
  }
});

test("the staff preview plays unpublished phone films through the private route", () => {
  const sha = "e".repeat(64), other = "d".repeat(64);
  const draft = previewMediaContent({
    templateFilms: [{ key: "terra-hero", src: `/media/uploads/${sha}.mp4`, mobileSrc: `/media/uploads/${other}.mp4` }],
    homeDetails: { hero: { slides: [{ kind: "video", src: `/media/uploads/${sha}.mp4`, mobileSrc: `/media/uploads/${other}.webm`, poster }] } },
  });
  assert.equal(draft.templateFilms[0]!.mobileSrc, `/api/admin/media/${other}/preview`);
  assert.equal(draft.homeDetails.hero.slides[0]!.mobileSrc, `/api/admin/media/${other}/preview`);
});
