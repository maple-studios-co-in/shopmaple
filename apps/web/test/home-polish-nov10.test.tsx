import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { InstagramRail } from "../components/motion-rail";
import { mountMarquee } from "../lib/home-effects";
import instagramPosts from "../data/instagram-posts.json";

// The owner's homepage notes of 10 Nov 2026: the Social Proof row held by the pointer instead of a pause button,
// the cities panel without its grainy texture, and every section holding together at 100% and 125% zoom.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** A stylesheet's rules without its comments, so a note about what was removed does not count as the thing itself. */
const styles = (path: string) => source(path).replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} is styled`);
  return css.slice(at, css.indexOf("}", at) + 1);
};

test("the cities panel is a clean warm surface: no dotted map or any other texture behind the arches", () => {
  const css = styles("../styles/home-cities.css");
  const panel = rule(css, ".home-cities.home-container");
  assert.match(panel, /linear-gradient\(180deg, #f0ebe6 0%, #f5f1ec 100%\)/, "the warm panel stays");
  assert.doesNotMatch(css, /url\(/, "no picture is laid under the panel");
  assert.doesNotMatch(css, /dotted-world|noise|grain/);
});

// ---- Our Social Proof: no pause button; the pointer or keyboard focus holds the row, and it eases to a stop and back ----

const posts = instagramPosts.slice(0, 4);

test("the Social Proof row has no pause button: the cards themselves are all there is", () => {
  const page = new JSDOM(renderToStaticMarkup(<InstagramRail posts={posts} />)).window.document;
  const row = page.querySelector<HTMLElement>("[data-marquee]")!;
  assert.ok(row, "the row drifts");
  assert.equal(row.querySelectorAll("input, label, button, [data-marquee-toggle], [data-marquee-pause]").length, 0, "no switch over the row");
  assert.equal(row.querySelectorAll("[data-marquee-track]").length, 1, "the drifting track is marked for the eased hold");
  assert.equal(page.querySelectorAll("[data-marquee-group]:not([data-marquee-copy]) a").length, posts.length);
  const css = styles("../styles/home-impact.css");
  assert.doesNotMatch(css, /home-marquee-toggle|data-marquee-pause/, "and no styles left for one");
  // Before the homepage's script arrives the stylesheet holds the row at once; once it has, the row eases instead.
  assert.match(css, /\.home-marquee:not\(\[data-marquee-eased\]\):is\(:hover, :focus-within\) \.home-marquee-track \{ animation-play-state: paused; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.home-marquee-track \{ animation: none; \}/, "with less motion asked for, it does not drift at all");
});

/** The Social Proof row in a page of its own, with a frame clock the test turns by hand and a stand-in for its CSS drift. */
function marqueeDom() {
  const dom = new JSDOM(`<!doctype html><body>${renderToStaticMarkup(<InstagramRail posts={posts} />)}<a href="/next">Next</a></body>`);
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0, now = 1000;
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (handle: number) => { frames.delete(handle); },
  });
  const root = dom.window.document.querySelector<HTMLElement>("[data-marquee]")!;
  const drift = { playbackRate: 1 };
  Object.assign(root.querySelector("[data-marquee-track]")!, { getAnimations: () => [drift] });
  /** Runs `count` frames of 16 ms and returns the row's speed after each. */
  const run = (count: number) => Array.from({ length: count }, () => {
    now += 16;
    const due = [...frames.values()];
    frames.clear();
    due.forEach((callback) => callback(now));
    return drift.playbackRate;
  });
  const pointer = (type: "pointerenter" | "pointerleave", pointerType = "mouse") => {
    const event = new dom.window.Event(type);
    Object.defineProperty(event, "pointerType", { value: pointerType });
    root.dispatchEvent(event);
  };
  return { dom, root, drift, run, pointer, pending: () => frames.size };
}

const steps = (rates: number[], from: number) => rates.map((rate, i) => rate - (i ? rates[i - 1]! : from));

test("under the mouse the row eases to a stop, and eases back into its drift when the mouse leaves, never jumping", () => {
  const { root, drift, run, pointer, pending } = marqueeDom();
  const stop = mountMarquee(root, false);
  assert.ok(root.hasAttribute("data-marquee-eased"), "the stylesheet's instant hold steps aside");
  pointer("pointerenter");
  const slowing = run(60);
  assert.equal(drift.playbackRate, 0, "it comes to rest under the pointer");
  assert.ok(steps(slowing, 1).every((step) => step <= 0 && step > -0.12), "slowing a little each frame, never backwards, never at once");
  assert.ok(slowing.findIndex((rate) => rate < 0.1) <= 25, "and all but still within about 0.4 s");
  assert.equal(pending(), 0, "at rest it asks for no more frames");
  pointer("pointerleave");
  const gathering = run(90);
  assert.equal(drift.playbackRate, 1, "back to its full drift");
  assert.ok(steps(gathering, 0).every((step) => step >= 0 && step < 0.05), "gathering speed gently");
  // A change of mind halfway picks up from the speed the row has, not from a standstill or full speed.
  pointer("pointerenter");
  const halfway = run(5).at(-1)!;
  pointer("pointerleave");
  assert.ok(Math.abs(run(1)[0]! - halfway) < 0.05);
  run(90);
  assert.equal(drift.playbackRate, 1);
  stop();
  assert.ok(!root.hasAttribute("data-marquee-eased"));
});

test("keyboard focus inside the row holds it too; a finger is left alone, as the row is swiped past", () => {
  const { dom, root, drift, run, pointer } = marqueeDom();
  const stop = mountMarquee(root, false);
  pointer("pointerenter", "touch");
  run(30);
  assert.equal(drift.playbackRate, 1, "touching the row on the way down the page does not stall it");
  const card = root.querySelector<HTMLAnchorElement>("[data-marquee-group]:not([data-marquee-copy]) a")!;
  card.focus();
  card.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  run(60);
  assert.equal(drift.playbackRate, 0, "a card in focus holds the row");
  const next = dom.window.document.querySelector<HTMLAnchorElement>('a[href="/next"]')!;
  next.focus();
  card.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true, relatedTarget: next }));
  run(90);
  assert.equal(drift.playbackRate, 1, "and lets it go when focus moves on");
  stop();
});

test("with less motion asked for, or no drift to ease, the row is left alone", () => {
  const { root, drift, run, pointer } = marqueeDom();
  mountMarquee(root, true);
  pointer("pointerenter");
  run(30);
  assert.equal(drift.playbackRate, 1);
  assert.ok(!root.hasAttribute("data-marquee-eased"));
  Object.assign(root.querySelector("[data-marquee-track]")!, { getAnimations: () => [] });
  const stop = mountMarquee(root, false);
  assert.ok(!root.hasAttribute("data-marquee-eased"), "the stylesheet's hold stays in charge");
  stop();
});

// ---- Every section at 100% and 125% zoom (1536px and 1229px laptops), tablets and phones ----

test("the closing wordmark stays on one line at every width, sized from the row beneath it", () => {
  const css = styles("../styles/home-impact.css");
  // At 1229px (125% on a 1536px laptop) it broke into "Maple" over "Furnishers", two giant lines.
  assert.match(css, /\[data-home-section="values"\] \.home-values \{ container-type: inline-size; \}/);
  const marks = [...css.matchAll(/\[data-home-section="values"\] \.home-values \.home-values-watermark \{[^}]*\}/g)].map((match) => match[0]);
  const last = marks.at(-1)!;
  assert.match(last, /white-space: nowrap;/);
  assert.match(last, /font: 500 min\(150px, 13cqw\) \/ 1\.28 var\(--font-heading\);/, "the name is 7.25 times as wide as it is tall, so 13% of the row always fits");
});

// The owner preferred the photos at their earlier size (10 Nov 2026): the section is held to 1226px again below 1600px.
test("Pull up a chair keeps its earlier size, held to 1226px, with its photos fetched at the sizes they are shown", () => {
  const css = styles("../styles/home-editorial.css");
  assert.match(rule(css, '[data-home-section="editorial"] [data-editorial]'), /max-width: 1226px;/);
  const editorial = source("../components/home-editorial.tsx");
  assert.match(editorial, /\(min-width:1265px\) 386px, 32vw/, "the square photo");
  assert.match(editorial, /\(min-width:1265px\) 720px, 60vw/, "the large photo");
});

test("the hero's Explore button lines up under its headline, as in the frame", () => {
  // The legacy absolute button's corner offsets (left and bottom 20px) nudged the in-flow button right and up.
  assert.match(rule(styles("../styles/home-impact.css"), '[data-home-section="hero"] .hero-cta'), /position: relative;\s*inset: auto;/);
});

test("the announcement strip's copy is never hidden under its line-art flowers, and its photo slices show no seams", () => {
  const css = styles("../styles/home-impact.css");
  assert.match(rule(css, '[data-campaign-layout="strip"] .campaign-copy'), /z-index: 1;/, "at 768px the flowers covered the end of the headline");
  assert.match(rule(css, '[data-campaign-layout="strip"] .campaign-art-tile'), /box-sizing: content-box;\s*padding-right: 1px;/, "each slice reaches under the next");
});

test("tablets get layouts of their own: the enquiry stacks, the offers pair up and the promos become a row to swipe", () => {
  const css = styles("../styles/home-impact.css");
  const tablet = css.slice(css.indexOf("@media (min-width: 750px) and (max-width: 899px) {"));
  assert.ok(tablet.length > 0);
  assert.match(tablet, /\[data-home-section="offers"\] \.home-offer-tiles \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(tablet, /\[data-home-section="promos"\] \.campaign-promo-grid \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;/);
  assert.match(css, /@media \(max-width: 899px\) \{\s*\[data-home-section="project"\] \.home-project \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  // On a phone the promos' first card snapped flush to the screen's edge; the snap now keeps the 16px margin.
  assert.match(css, /\[data-home-section="promos"\] \.campaign-promo-grid \{ padding-inline: 16px; scroll-padding-inline: 16px; \}/);
});

test("on a phone the city arrows sit under the arches instead of over their photos", () => {
  const css = styles("../styles/home-cities.css");
  const phone = css.slice(css.indexOf("@media (max-width: 639px) {"));
  assert.match(phone, /\.home-cities-rail \{[^}]*flex-wrap: wrap;[^}]*justify-content: center;/);
  assert.match(phone, /\.home-city-track \{\s*order: -1;\s*flex: 0 0 100%;/, "the arches take the whole first line");
  assert.doesNotMatch(phone.slice(0, phone.indexOf("@media (prefers-reduced-motion")), /position: absolute;/, "no arrow is laid over a picture");
});

test("the newsletter's promise breaks without leaving one word on its own line", () => {
  assert.match(rule(styles("../styles/home-newsletter.css"), ".home-newsletter-row > div > p"), /text-wrap: pretty;/);
});

test("the home page's banners keep their offer words readable on a small laptop or tablet, inside the artwork", () => {
  const css = styles("../styles/home-impact.css");
  // Scaled with the artwork, the dining and sofa banners' offer fell to 9px at 1024px, the promo cards' to 9px.
  const wide = css.slice(css.indexOf("@container (min-width: 750px) {"));
  assert.match(wide, /\.campaign-supporting,[^{]*\.campaign-offer \{\s*font-size: max\(12px, 0\.947368cqw\);\s*line-height: max\(16px, 1\.315789cqw\);/);
  assert.match(wide, /\.campaign-label,[^{]*\.campaign-eligibility \{\s*font-size: max\(10px, 0\.631579cqw\);/);
  assert.match(css, /\[data-home-section="promos"\] \.campaign-copy \.campaign-supporting,\s*\[data-home-section="promos"\] \.campaign-copy \.campaign-offer \{\s*font-size: max\(12px, 3cqw\);/);
});

// "It is custom-built" was set in italic until the 6 Nov type change gave the accent a font shorthand, which resets the
// slant to upright. The owner asked for the italic back (10 Nov 2026); DM Sans's own italic is already loaded.
test("the statement band's closing word is in italic again, in the heading face's own italic", () => {
  const accent = rule(styles("../styles/home-impact.css"), '[data-home-section="ticker"] .home-statement em');
  assert.match(accent, /font: italic 500 1em \/ 1 var\(--font-heading\);/);
  assert.match(source("../app/layout.tsx"), /@fontsource-variable\/dm-sans\/opsz-italic\.css/, "the italic face is loaded");
});
