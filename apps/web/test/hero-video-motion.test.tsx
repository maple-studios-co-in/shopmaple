import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Hero } from "../components/hero";

type Options = { reduced?: boolean; visible?: boolean; intersecting?: boolean; observer?: boolean; matchMedia?: boolean; pendingPlay?: boolean; rejectPlay?: boolean };
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
    await intersect(options.intersecting ?? true);
    await check(document.querySelector("video")!, document.querySelector<HTMLButtonElement>(".video-control")!, async (value) => {
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

test("server rendering keeps the workshop poster and leaves the video unloaded", () => {
  const dom = new JSDOM(renderToStaticMarkup(<Hero />));
  assert.equal(dom.window.document.querySelector("video")!.getAttribute("src"), null);
  assert.ok(dom.window.document.querySelector(".hero-film img")!.getAttribute("src"));
  dom.window.close();
});

test("workshop video loads only on explicit Play and supports explicit Pause", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await browser.visibility(false); await browser.visibility(true); await browser.intersect(false); await browser.intersect(true);
    assert.equal(video.getAttribute("src"), null); assert.equal(browser.attempts.length, 0);
    await act(async () => button.click()); assert.equal(video.getAttribute("src"), "/media/workshop.mp4");
    assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), "Pause workshop video");
    await act(async () => button.click()); assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), "Play workshop video");
  });
});

for (const boundary of ["offscreen", "hidden"] as const) {
  test(`workshop video pauses when ${boundary} and requires explicit Play on return`, async () => {
    await withVideo({}, async (video, button, _reduce, browser) => {
      await act(async () => button.click());
      if (boundary === "offscreen") await browser.intersect(false); else await browser.visibility(false);
      assert.equal(video.paused, true, `${boundary} workshop video must stop`);
      assert.equal(button.getAttribute("aria-label"), "Play workshop video");
      await browser.intersect(true); await browser.visibility(true);
      assert.equal(video.paused, true); assert.equal(browser.attempts.length, 1);
      await act(async () => button.click()); assert.equal(video.paused, false);
    });
  });
}

test("latest batched intersection observation determines whether playback stops", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await act(async () => button.click()); await browser.intersectBatch([false, true]); assert.equal(video.paused, false);
    await browser.intersectBatch([true, false]); assert.equal(video.paused, true);
  });
});

for (const boundary of ["pause", "offscreen", "hidden", "unmount", "reduced motion"] as const) {
  test(`late workshop playback cannot restart after ${boundary}`, async () => {
    await withVideo({ pendingPlay: true }, async (video, button, reduce, browser) => {
      await act(async () => button.click());
      if (boundary === "pause") await act(async () => button.click());
      if (boundary === "offscreen") await browser.intersect(false);
      if (boundary === "hidden") await browser.visibility(false);
      if (boundary === "unmount") await browser.unmount();
      if (boundary === "reduced motion") await reduce(true);
      await browser.settle();
      assert.equal(video.paused, true, `late play must remain cancelled after ${boundary}`);
      if (boundary !== "unmount") assert.equal(button.getAttribute("aria-label"), "Play workshop video");
    });
  });
}

test("pending workshop playback has an honest cancel control and rapid cancel does not request another play", async () => {
  await withVideo({ pendingPlay: true }, async (video, button, _reduce, browser) => {
    await act(async () => button.click()); assert.equal(button.getAttribute("aria-label"), "Cancel workshop video playback");
    await act(async () => button.click()); assert.equal(browser.attempts.length, 1); assert.equal(button.getAttribute("aria-label"), "Play workshop video");
    await browser.settle(); assert.equal(video.paused, true);
  });
});

test("failed workshop playback remains retryable without showing Pause", async () => {
  await withVideo({ rejectPlay: true }, async (video, button) => {
    await act(async () => button.click()); assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), "Play workshop video");
    await act(async () => button.click()); assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), "Pause workshop video");
  });
});

for (const event of ["pause", "ended", "error"]) {
  test(`native workshop ${event} returns the control to Play and permits retry`, async () => {
    await withVideo({}, async (video, button, _reduce, browser) => {
      await act(async () => button.click());
      await browser.native(event, true);
      assert.equal(button.getAttribute("aria-label"), "Play workshop video");
      await act(async () => button.click()); assert.equal(video.paused, false);
    });
  });
}

test("queued native pause does not mislabel media that is currently playing", async () => {
  await withVideo({}, async (video, button) => {
    await act(async () => button.click()); await act(async () => video.dispatchEvent(new window.Event("pause")));
    assert.equal(button.getAttribute("aria-label"), "Pause workshop video");
  });
});

test("reduced motion permits manual Play and preference changes pause without automatic resume", async () => {
  await withVideo({ reduced: true }, async (video, button, reduce, browser) => {
    assert.equal(video.getAttribute("src"), null);
    await act(async () => button.click()); assert.equal(video.paused, false);
    await reduce(false); await reduce(true); assert.equal(video.paused, true);
    await reduce(false); await browser.intersect(false); await browser.intersect(true); assert.equal(video.paused, true);
    await act(async () => button.click()); assert.equal(video.paused, false);
  });
});

for (const options of [{ observer: false }, { matchMedia: false }]) {
  test(`manual workshop Play and hidden pause survive ${JSON.stringify(options)}`, async () => {
    await withVideo(options, async (video, button, _reduce, browser) => {
      assert.equal(video.getAttribute("src"), null); assert.equal(browser.attempts.length, 0);
      await act(async () => button.click()); assert.equal(video.paused, false);
      await browser.visibility(false); assert.equal(video.paused, true);
      await browser.visibility(true); assert.equal(video.paused, true);
    });
  });
}

for (const reject of [true, false]) {
test(`an obsolete play ${reject ? "rejection" : "resolution"} cannot cancel a newer explicit Play`, async () => {
  await withVideo({ pendingPlay: true }, async (video, button, _reduce, browser) => {
    await act(async () => button.click()); await act(async () => button.click()); await act(async () => button.click());
    assert.equal(browser.attempts.length, 2, "the middle click cancels the first pending request");
    await browser.settle(reject); await browser.settle();
    assert.equal(video.paused, false); assert.equal(button.getAttribute("aria-label"), "Pause workshop video");
  });
});

}

test("unmount stops active workshop playback and disconnects listeners and observer", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await act(async () => button.click()); await browser.unmount();
    assert.equal(video.paused, true); assert.equal(browser.observed.size, 0); assert.equal(browser.listeners.size, 0);
  });
});


test("partially visible workshop playback continues until fully outside the viewport", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await act(async () => button.click()); await browser.ratio(0.001); assert.equal(video.paused, false);
    await browser.ratio(-1); assert.equal(video.paused, true);
  });
});

for (const boundary of ["offscreen", "hidden"] as const) {
  test(`returning from ${boundary} before an old Play resolves does not restore playback`, async () => {
    await withVideo({ pendingPlay: true }, async (video, button, _reduce, browser) => {
      await act(async () => button.click());
      if (boundary === "offscreen") { await browser.intersect(false); await browser.intersect(true); }
      else { await browser.visibility(false); await browser.visibility(true); }
      await browser.settle(); assert.equal(video.paused, true);
      assert.equal(button.getAttribute("aria-label"), "Play workshop video");
    });
  });
}
