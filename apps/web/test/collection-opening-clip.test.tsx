import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { TemplateFilms } from "@shopmaple/contracts";
import { CollectionLandingView } from "../components/collection-landing";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { resolveNimbusLanding } from "../lib/nimbus-content-defaults";
import { resolveTerraLanding } from "../lib/terra-content-defaults";
import { installUiDom } from "./support/ui-dom";

// The openings' clips (owner, 12 Nov 2026): a short, silent, single-shot clip loops muted over the opening photo. It is the
// page's own, apart from the collection film staff choose in Artwork, which may carry titles and the logo and opens from
// its link. Terra loops its lobby; Nimbus its film of fabric and soft forms.
const clip = { src: "/media/terra-collection/opening.mp4", mobileSrc: "/media/terra-collection/opening-portrait.mp4" };
const nimbusClip = { src: "/media/nimbus-collection/opening.mp4", mobileSrc: "/media/nimbus-collection/opening-portrait.mp4" };
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const site = () => structuredClone(defaultStorefrontContent);

test("each page opens with its own clip, whatever film staff chose for the link", () => {
  assert.deepEqual(resolveTerraLanding(site()).hero.clip, clip);
  assert.deepEqual(resolveNimbusLanding(site()).hero.clip, nimbusClip);
  const films: TemplateFilms = [{ key: "terra-hero", src: `/media/uploads/${"d".repeat(64)}.mp4`, durationMs: 13_084 }];
  const terra = resolveTerraLanding({ ...site(), templateFilms: films });
  assert.deepEqual(terra.hero.clip, clip, "the clip stays the page's own");
  assert.equal(terra.hero.film?.src, films[0]!.src, "the film link opens staff's film");
  assert.equal(terra.hero.film?.duration, "00:13");
});

test("the clip lies over the opening photo, silent and decorative, and loads nothing before script chooses its cut", () => {
  const terra = resolveTerraLanding(site());
  const page = doc(<CollectionLandingView page={terra} />);
  const media = page.querySelector(".collection-hero-media")!;
  assert.ok(media.querySelector("img"), "the opening photo stays beneath as the still");
  const video = media.querySelector("video[data-collection-clip]")!;
  assert.ok(video, "the clip lies over it");
  assert.equal(video.previousElementSibling?.tagName, "PICTURE", "after the photo, so it covers it once playing");
  for (const attribute of ["loop", "playsinline", "disablepictureinpicture"]) assert.ok(video.hasAttribute(attribute), attribute);
  assert.equal(video.getAttribute("preload"), "metadata");
  assert.equal(video.getAttribute("aria-hidden"), "true", "decorative: the photo's description says what it shows");
  assert.equal(video.getAttribute("tabindex"), "-1");
  assert.equal(video.hasAttribute("src"), false);
  assert.equal(page.querySelectorAll("video").length, 1, "no film chosen: the clip alone");
  const nimbus = doc(<CollectionLandingView page={resolveNimbusLanding(site())} />);
  assert.equal(nimbus.querySelectorAll(".collection-hero-media video[data-collection-clip]").length, 1, "Nimbus loops its own clip too");
});

test("the clip plays muted once in view, its portrait cut on a phone, and never for visitors who ask for reduced motion", async () => {
  const { CollectionOpeningClip } = await import("../components/collection-landing-client");
  const saved = globalThis.IntersectionObserver;
  try {
    for (const [phone, reduced] of [[false, false], [true, false], [false, true]] as const) {
      const dom = installUiDom("http://localhost:3000/terra-collection");
      Object.defineProperty(dom.window, "matchMedia", { configurable: true, value: (query: string) =>
        ({ matches: query.includes("max-width") ? phone : reduced, media: query, addEventListener() {}, removeEventListener() {} }) });
      const observers: Array<{ callback: IntersectionObserverCallback }> = [];
      class Observer { constructor(public callback: IntersectionObserverCallback) { observers.push(this); } observe() {} disconnect() {} }
      Object.assign(globalThis, { IntersectionObserver: Observer });
      const played: string[] = [];
      Object.assign(dom.window.HTMLMediaElement.prototype, {
        play(this: HTMLMediaElement) { played.push(this.getAttribute("src") ?? ""); this.dispatchEvent(new dom.window.Event("playing")); return Promise.resolve(); },
        pause() {},
        load() {},
      });
      const root = createRoot(dom.window.document.getElementById("root")!);
      try {
        await act(async () => root.render(<CollectionOpeningClip clip={clip} />));
        const video = dom.window.document.querySelector<HTMLVideoElement>("video[data-collection-clip]")!;
        const cut = phone ? clip.mobileSrc : clip.src;
        assert.equal(video.getAttribute("src"), cut, `phone ${phone}`);
        assert.deepEqual(played, [], "nothing plays before the opening is in view");
        await act(async () => observers[0]!.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], observers[0] as unknown as IntersectionObserver));
        assert.deepEqual(played, reduced ? [] : [cut], reduced ? "reduced motion keeps the photo" : "it plays once in view");
        assert.equal(video.muted, true);
        assert.equal(video.hasAttribute("data-playing"), !reduced, "the clip shows over the photo only once it plays");
        await act(async () => video.dispatchEvent(new dom.window.Event("emptied")));
        assert.equal(video.hasAttribute("data-playing"), false, "the photo returns when the clip is reset");
      } finally { await act(async () => root.unmount()); }
    }
  } finally { Object.assign(globalThis, { IntersectionObserver: saved }); }
});

test("the clips are web-safe: H.264 in MP4 with no sound, starting while they download, within their size budget", () => {
  for (const page of ["terra", "nimbus"]) for (const [file, budget] of [["opening.mp4", 5_000_000], ["opening-portrait.mp4", 2_000_000]] as const) {
    const bytes = readFileSync(new URL(`../public/media/${page}-collection/${file}`, import.meta.url));
    assert.ok(!bytes.includes("soun"), `${page} ${file}: no sound track, as it only ever plays muted`);
    assert.equal(bytes.toString("latin1", 4, 8), "ftyp", `${file}: an MP4`);
    assert.ok(bytes.length < budget, `${file}: ${bytes.length} bytes`);
    assert.ok(bytes.includes("avc1"), `${file}: H.264, which every browser plays`);
    assert.ok(!bytes.includes("hvc1") && !bytes.includes("hev1"), `${file}: not HEVC, which Firefox and many Windows PCs cannot play`);
    assert.ok(bytes.indexOf("moov") < bytes.indexOf("mdat"), `${file}: its index comes first, so it plays while it downloads`);
  }
});

test("the clip's styles: it fills the opening under the shade and fades in only once playing", () => {
  const css = readFileSync(new URL("../styles/collection-landing.css", import.meta.url), "utf8");
  assert.match(css, /\.collection-hero-clip \{[^}]*position: absolute;[^}]*object-fit: cover;[^}]*opacity: 0;/);
  assert.match(css, /\.collection-hero-clip\[data-playing\] \{\s*opacity: 1;/);
});
