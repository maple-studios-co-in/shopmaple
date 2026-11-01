import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Hero } from "../components/hero";

// The owner's choice (2026-11-01): the latest shop film plays on its own, muted and looping, with
// no play or pause control. A shopper who asks for reduced motion sees the still poster.
const film = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0";

async function withHero(reducedAtStart: boolean, check: (video: HTMLVideoElement, browser: { plays: number; reduce(value: boolean): Promise<void>; unmount(): Promise<void>; listeners: () => number }) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const globals = { self: dom.window, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  let reduced = reducedAtStart, listeners = 0;
  const motion = new dom.window.EventTarget();
  const add = motion.addEventListener.bind(motion), remove = motion.removeEventListener.bind(motion);
  motion.addEventListener = (...args: Parameters<EventTarget["addEventListener"]>) => { listeners += 1; add(...args); };
  motion.removeEventListener = (...args: Parameters<EventTarget["removeEventListener"]>) => { listeners -= 1; remove(...args); };
  Object.defineProperty(motion, "matches", { get: () => reduced });
  Object.defineProperty(dom.window, "matchMedia", { value: () => motion });
  // Only the browser's media boundary is simulated; the component is real.
  const state = { plays: 0 };
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLMediaElement) { state.plays += 1; paused.set(this, false); return Promise.resolve(); } },
    pause: { value(this: HTMLMediaElement) { paused.set(this, true); } },
  });
  const root = createRoot(document.getElementById("root")!);
  let mounted = true;
  try {
    await act(async () => root.render(<Hero />));
    await check(document.querySelector("video")!, {
      get plays() { return state.plays; },
      reduce: async (value) => act(async () => { reduced = value; motion.dispatchEvent(new dom.window.Event("change")); }),
      unmount: async () => { await act(async () => root.unmount()); mounted = false; },
      listeners: () => listeners,
    });
  } finally {
    if (mounted) await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

test("server rendering shows the poster and the latest film, set to play on its own with no controls", () => {
  const doc = new JSDOM(renderToStaticMarkup(<Hero />)).window.document;
  assert.ok(doc.querySelector(".hero-film img")?.getAttribute("src"), "the poster shows until the film plays");
  const video = doc.querySelector(".hero-film video")!;
  assert.equal(video.getAttribute("src"), film);
  for (const attribute of ["autoplay", "muted", "loop", "playsinline"]) assert.ok(video.hasAttribute(attribute), attribute);
  assert.equal(video.getAttribute("aria-hidden"), "true", "the film is decoration");
  assert.equal(doc.querySelectorAll("button").length, 0, "no play or pause control");
});

test("the film starts muted as soon as the hero appears", async () => {
  await withHero(false, async (video, browser) => {
    assert.equal(video.muted, true);
    assert.equal(video.paused, false);
    assert.ok(browser.plays >= 1);
  });
});

test("reduced motion keeps the still poster and follows the shopper's preference as it changes", async () => {
  await withHero(true, async (video, browser) => {
    assert.equal(video.paused, true, "a shopper who asked for reduced motion sees the poster");
    assert.equal(browser.plays, 0);
    await browser.reduce(false);
    assert.equal(video.paused, false, "turning reduced motion off starts the film");
    await browser.reduce(true);
    assert.equal(video.paused, true, "turning it back on stops the film");
  });
});

test("leaving the page stops listening for motion preference changes", async () => {
  await withHero(false, async (_video, browser) => {
    assert.equal(browser.listeners(), 1);
    await browser.unmount();
    assert.equal(browser.listeners(), 0);
  });
});
