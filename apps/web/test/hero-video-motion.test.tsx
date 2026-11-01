import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Hero } from "../components/hero";

type Options = { reduced?: boolean; visible?: boolean; intersecting?: boolean | null; observer?: boolean; matchMedia?: boolean; pendingPlay?: boolean; rejectPlay?: boolean };
async function withVideo(
  options: Options,
  check: (video: HTMLVideoElement, button: HTMLButtonElement, reduce: (value: boolean) => Promise<void>, browser: {
    intersect(value: boolean): Promise<void>; intersectBatch(values: boolean[]): Promise<void>; visibility(value: boolean): Promise<void>;
    native(event: string, isPaused: boolean): Promise<void>; ratio(value: number): Promise<void>; settle(reject?: boolean): Promise<void>; unmount(): Promise<void>; attempts: string[];
    listeners: Set<EventListenerOrEventListenerObject>; observed: Set<Element>;
  }) => Promise<void>,
) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const globals = { self: dom.window, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  let reduced = options.reduced ?? false, visible = options.visible ?? true;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const track = (target: EventTarget) => {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, opts) => { if (listener && (target !== document || type === "visibilitychange")) listeners.add(listener); add(type, listener, opts); };
    target.removeEventListener = (type, listener, opts) => { if (listener && (target !== document || type === "visibilitychange")) listeners.delete(listener); remove(type, listener, opts); };
    return target;
  };
  track(document);
  const motion = track(new dom.window.EventTarget());
  Object.defineProperty(motion, "matches", { get: () => reduced });
  if (options.matchMedia !== false) Object.defineProperty(dom.window, "matchMedia", {
    value: () => motion,
  });
  Object.defineProperties(document, { visibilityState: { get: () => visible ? "visible" : "hidden" }, hidden: { get: () => !visible } });
  const observed = new Set<Element>();
  let intersection: IntersectionObserverCallback | undefined;
  if (options.observer !== false) Object.defineProperty(dom.window, "IntersectionObserver", { value: class {
    constructor(callback: IntersectionObserverCallback) { intersection = callback; }
    observe(target: Element) { observed.add(target); }
    disconnect() { observed.clear(); }
    unobserve(target: Element) { observed.delete(target); }
  } });
  // Only browser media/query/observer boundaries are simulated; the component is real.
  const attempts: string[] = [], paused = new WeakMap<HTMLMediaElement, boolean>();
  const pending: { resolve(): void; reject(error: Error): void; media: HTMLMediaElement }[] = [];
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLMediaElement) {
      attempts.push(this.getAttribute("src") ?? "");
      if (options.rejectPlay) { options.rejectPlay = false; return Promise.reject(new Error("Playback denied")); }
      if (options.pendingPlay) return new Promise<void>((resolve, reject) => pending.push({ resolve, reject, media: this }));
      paused.set(this, false); this.dispatchEvent(new dom.window.Event("play")); return Promise.resolve();
    } },
    pause: { value(this: HTMLMediaElement) {
      if (this.paused) return;
      paused.set(this, true); this.dispatchEvent(new dom.window.Event("pause"));
    } },
  });
  const root = createRoot(document.getElementById("root")!);
  let mounted = true;
  const unmount = async () => { if (mounted) { await act(async () => root.unmount()); mounted = false; } };
  const intersectBatch = async (values: boolean[]) => act(async () => {
    const target = observed.values().next().value;
    if (target) intersection?.(values.map((value, time) => ({ target, time, isIntersecting: value, intersectionRatio: value ? 1 : 0 } as IntersectionObserverEntry)), {} as IntersectionObserver);
  });
  const intersect = (value: boolean) => intersectBatch([value]);
  try {
    await act(async () => root.render(<Hero />));
    // null: the observer has not reported yet.
    if (options.intersecting !== null) await intersect(options.intersecting ?? true);
    await check(document.querySelector("video")!, document.querySelector<HTMLButtonElement>("[data-video-control]")!, async (value) => {
      await act(async () => { reduced = value; motion.dispatchEvent(new dom.window.Event("change")); });
    }, {
      intersect, intersectBatch, unmount, attempts, listeners, observed,
      native: async (event, isPaused) => act(async () => {
        const video = document.querySelector("video")!;
        paused.set(video, isPaused); video.dispatchEvent(new dom.window.Event(event));
      }),
      ratio: async (value) => act(async () => {
        const target = observed.values().next().value;
        if (target) intersection?.([{ target, time: 1, isIntersecting: value >= 0, intersectionRatio: Math.max(0, value) } as IntersectionObserverEntry], {} as IntersectionObserver);
      }),
      visibility: async (value) => act(async () => { visible = value; document.dispatchEvent(new dom.window.Event("visibilitychange")); }),
      settle: async (reject = false) => act(async () => {
        const request = pending.shift(); assert.ok(request, "component play request must be pending");
        if (reject) request.reject(new Error("Playback denied"));
        else { paused.set(request.media, false); request.media.dispatchEvent(new dom.window.Event("play")); request.resolve(); }
      }),
    });
  } finally {
    await unmount(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

// The film live on shop.maplefurnishers.com's hero, 1 November 2026.
const film = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0";
const PAUSE = "Pause hero film", PLAY = "Play hero film";

test("server rendering shows the film's poster and leaves the video unloaded, so script-free thumbnails draw the still", () => {
  const dom = new JSDOM(renderToStaticMarkup(<Hero />));
  const video = dom.window.document.querySelector("video")!;
  assert.equal(video.getAttribute("src"), null);
  assert.equal(video.hasAttribute("autoplay"), false, "Reduced-motion visitors must not get a film before the page can check their preference");
  assert.ok(video.hasAttribute("loop") && video.hasAttribute("playsinline"));
  assert.match(dom.window.document.querySelector("[data-hero-film] img")!.getAttribute("src") ?? "", /f9239e922cef45df9972f1dac1b89e0a\.thumbnail/);
  dom.window.close();
});

test("the hero film plays on its own, muted and looping, and the control pauses and resumes it", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    assert.equal(video.getAttribute("src"), film); assert.equal(browser.attempts.length, 1);
    assert.equal(video.muted, true); assert.equal(video.loop, true);
    assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), PAUSE);
    await act(async () => button.click()); assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), PLAY);
    await act(async () => button.click()); assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), PAUSE);
  });
});

for (const boundary of ["offscreen", "hidden"] as const) {
  test(`the hero film pauses when ${boundary} and plays again on return`, async () => {
    await withVideo({}, async (video, button, _reduce, browser) => {
      if (boundary === "offscreen") await browser.intersect(false); else await browser.visibility(false);
      assert.equal(video.paused, true, `${boundary} film must stop`);
      assert.equal(button.getAttribute("aria-label"), PLAY);
      await browser.intersect(true); await browser.visibility(true);
      assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), PAUSE);
    });
  });
}

test("a film the shopper paused stays paused when it scrolls away and back", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await act(async () => button.click());
    await browser.intersect(false); await browser.intersect(true); await browser.visibility(false); await browser.visibility(true);
    assert.equal(video.paused, true); assert.equal(browser.attempts.length, 1);
  });
});

test("the film waits until it is on screen and the tab is visible", async () => {
  await withVideo({ intersecting: false }, async (video, _button, _reduce, browser) => {
    assert.equal(video.paused, true);
    await browser.intersect(true); assert.equal(video.paused, false);
  });
  await withVideo({ visible: false }, async (video, _button, _reduce, browser) => {
    assert.equal(browser.attempts.length, 0);
    await browser.visibility(true); assert.equal(video.paused, false);
  });
});

test("the film does not load until the observer says the hero is on screen", async () => {
  await withVideo({ intersecting: null }, async (video, _button, _reduce, browser) => {
    assert.equal(video.getAttribute("src"), null, "A page opened scrolled away from the hero downloads nothing");
    assert.equal(browser.attempts.length, 0);
    await browser.intersect(true); assert.equal(video.paused, false);
  });
});

test("latest batched intersection observation decides whether the film plays", async () => {
  await withVideo({}, async (video, _button, _reduce, browser) => {
    await browser.intersectBatch([false, true]); assert.equal(video.paused, false);
    await browser.intersectBatch([true, false]); assert.equal(video.paused, true);
  });
});

test("reduced motion keeps the film still until the shopper presses Play, and turning it on stops a film that started by itself", async () => {
  await withVideo({ reduced: true }, async (video, button, reduce) => {
    assert.equal(video.getAttribute("src"), null); assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), PLAY);
    await act(async () => button.click()); assert.equal(video.paused, false, "An explicit Play is honoured");
    await reduce(false); await reduce(true); assert.equal(video.paused, false, "A shopper's own Play survives preference changes");
  });
  await withVideo({}, async (video, button, reduce) => {
    await reduce(true); assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), PLAY);
    await reduce(false); assert.equal(video.paused, false, "Automatic playback returns when the preference allows it");
  });
});

test("a refused autoplay leaves the poster and a Play control, and does not retry on its own", async () => {
  await withVideo({ rejectPlay: true }, async (video, button, _reduce, browser) => {
    assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), PLAY);
    await browser.intersect(false); await browser.intersect(true); await browser.visibility(false); await browser.visibility(true);
    assert.equal(browser.attempts.length, 1);
    await act(async () => button.click()); assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), PAUSE);
  });
});

for (const boundary of ["pause", "offscreen", "hidden", "unmount", "reduced motion"] as const) {
  test(`a late film start cannot override ${boundary}`, async () => {
    await withVideo({ pendingPlay: true }, async (video, button, reduce, browser) => {
      assert.equal(button.getAttribute("aria-label"), PAUSE, "A starting film offers Pause");
      if (boundary === "pause") await act(async () => button.click());
      if (boundary === "offscreen") await browser.intersect(false);
      if (boundary === "hidden") await browser.visibility(false);
      if (boundary === "unmount") await browser.unmount();
      if (boundary === "reduced motion") await reduce(true);
      await browser.settle();
      assert.equal(video.paused, true, `late play must stay stopped after ${boundary}`);
      if (boundary !== "unmount") assert.equal(button.getAttribute("aria-label"), PLAY);
    });
  });
}

for (const event of ["ended", "error"]) {
  test(`native ${event} returns the control to Play and permits a retry`, async () => {
    await withVideo({}, async (video, button, _reduce, browser) => {
      await browser.native(event, true); assert.equal(button.getAttribute("aria-label"), PLAY);
      await act(async () => button.click()); assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), PAUSE);
    });
  });
}

test("unmount stops the film and disconnects listeners and observer", async () => {
  await withVideo({}, async (video, _button, _reduce, browser) => {
    assert.ok(browser.listeners.size > 0); assert.equal(browser.observed.size, 1);
    await browser.unmount();
    assert.equal(video.paused, true); assert.equal(browser.listeners.size, 0); assert.equal(browser.observed.size, 0);
  });
});
