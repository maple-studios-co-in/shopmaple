import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CategoryVideo } from "../components/category-controls";

type Options = { reduced?: boolean; autoPlay?: boolean; small?: boolean; visible?: boolean; intersecting?: boolean; observer?: boolean; matchMedia?: boolean; pendingPlay?: boolean; rejectPlay?: boolean };
async function withVideo(
  options: Options,
  check: (video: HTMLVideoElement, button: HTMLButtonElement, reduce: (value: boolean) => Promise<void>, browser: {
    intersect(value: boolean): Promise<void>; intersectBatch(values: boolean[]): Promise<void>; crossViewportEdge(): Promise<void>; visibility(value: boolean): Promise<void>; resize(value: boolean): Promise<void>;
    settle(reject?: boolean): Promise<void>; unmount(): Promise<void>; attempts: string[]; sources: string[];
    listeners: Set<EventListenerOrEventListenerObject>; observed: Set<Element>;
  }) => Promise<void>,
) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const globals = { self: dom.window, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  let reduced = options.reduced ?? false, small = options.small ?? false, visible = options.visible ?? true;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const track = (target: EventTarget) => {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, opts) => { if (listener && (target !== document || type === "visibilitychange")) listeners.add(listener); add(type, listener, opts); };
    target.removeEventListener = (type, listener, opts) => { if (listener && (target !== document || type === "visibilitychange")) listeners.delete(listener); remove(type, listener, opts); };
    return target;
  };
  track(document);
  const motion = track(new dom.window.EventTarget()), viewport = track(new dom.window.EventTarget());
  Object.defineProperty(motion, "matches", { get: () => reduced });
  Object.defineProperty(viewport, "matches", { get: () => small });
  if (options.matchMedia !== false) Object.defineProperty(dom.window, "matchMedia", {
    value: (query: string) => query === "(prefers-reduced-motion: reduce)" ? motion : viewport,
  });
  Object.defineProperties(document, { visibilityState: { get: () => visible ? "visible" : "hidden" }, hidden: { get: () => !visible } });
  const observed = new Set<Element>();
  let intersection: IntersectionObserverCallback | undefined;
  let thresholds: number[] = [0];
  if (options.observer !== false) Object.defineProperty(dom.window, "IntersectionObserver", { value: class {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      intersection = callback;
      thresholds = Array.isArray(options?.threshold) ? options.threshold : [options?.threshold ?? 0];
    }
    observe(target: Element) { observed.add(target); }
    disconnect() { observed.clear(); }
    unobserve(target: Element) { observed.delete(target); }
  } });
  // Only browser media/query/observer boundaries are simulated; the component is real.
  const sources: string[] = [];
  const setAttribute = dom.window.Element.prototype.setAttribute;
  dom.window.Element.prototype.setAttribute = function (name, value) {
    if (this.tagName === "VIDEO" && name === "src") sources.push(value);
    setAttribute.call(this, name, value);
  };
  const source = Object.getOwnPropertyDescriptor(dom.window.HTMLMediaElement.prototype, "src")!;
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, "src", {
    ...source, set(this: HTMLMediaElement, value: string) { sources.push(value); source.set!.call(this, value); },
  });
  const attempts: string[] = [], paused = new WeakMap<HTMLMediaElement, boolean>();
  const pending: { resolve(): void; reject(error: Error): void; media: HTMLMediaElement }[] = [];
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLMediaElement) {
      attempts.push(this.getAttribute("src") ?? "");
      if (options.rejectPlay) return Promise.reject(new Error("Playback denied"));
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
    await act(async () => root.render(<CategoryVideo label="Nimbus collection film" desktop={{ src: "/desktop.mp4", poster: "/desktop.jpg" }} mobile={{ src: "/mobile.mp4", poster: "/mobile.jpg" }} autoPlay={options.autoPlay ?? true} />));
    await intersect(options.intersecting ?? true);
    await check(document.querySelector("video")!, document.querySelector("button")!, async (value) => {
      await act(async () => { reduced = value; motion.dispatchEvent(new dom.window.Event("change")); });
    }, {
      intersect, intersectBatch, unmount, attempts, sources, listeners, observed,
      crossViewportEdge: async () => {
        const target = observed.values().next().value;
        assert.ok(target);
        // Browser threshold-zero observers notify when the edges first touch.
        // A later positive ratio is delivered only if a positive threshold crosses.
        await act(async () => intersection?.([{ target, time: 1, isIntersecting: true, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver));
        if (thresholds.some((threshold) => threshold > 0 && threshold <= 0.01)) {
          await act(async () => intersection?.([{ target, time: 2, isIntersecting: true, intersectionRatio: 0.01 } as IntersectionObserverEntry], {} as IntersectionObserver));
        }
      },
      visibility: async (value) => act(async () => { visible = value; document.dispatchEvent(new dom.window.Event("visibilitychange")); }),
      resize: async (value) => act(async () => { small = value; viewport.dispatchEvent(new dom.window.Event("change")); }),
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

test("decorative video autoplays and its named control pauses and resumes playback", async () => {
  await withVideo({}, async (video, button) => {
    assert.equal(video.paused, false);
    assert.equal(button.getAttribute("aria-label"), "Pause Nimbus collection film");
    await act(async () => button.click());
    assert.equal(video.paused, true);
    assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
    await act(async () => button.click());
    assert.equal(video.paused, false);
    assert.equal(button.getAttribute("aria-label"), "Pause Nimbus collection film");
  });
});

test("initial reduced motion and explicit non-autoplay keep video still until the user plays", async () => {
  for (const options of [{ reduced: true }, { autoPlay: false }]) {
    await withVideo(options, async (video, button) => {
      assert.equal(video.paused, true);
      assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
      await act(async () => button.click());
      assert.equal(video.paused, false);
      assert.equal(button.getAttribute("aria-label"), "Pause Nimbus collection film");
    });
  }
});

test("enabling reduced motion pauses an already playing decorative video immediately", async () => {
  await withVideo({}, async (video, button, reduce) => {
    assert.equal(video.paused, false);
    await reduce(true);
    assert.equal(video.paused, true, "turning on reduced motion must stop existing autoplay");
    assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
    await reduce(false);
    assert.equal(video.paused, true, "a preference change must not silently restart playback");
    await act(async () => button.click());
    assert.equal(video.paused, false, "the user can deliberately resume playback");
    await reduce(true);
    assert.equal(video.paused, true, "the listener remains active for later preference changes");
  });
});

test("disabling reduced motion never overrides a user's earlier pause", async () => {
  await withVideo({}, async (video, button, reduce) => {
    await act(async () => button.click());
    assert.equal(video.paused, true);
    await reduce(true);
    await reduce(false);
    assert.equal(video.paused, true);
    assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
  });
});


test("offscreen automatic film keeps its poster without an MP4 until intersection", async () => {
  await withVideo({ intersecting: false }, async (video, _button, _reduce, browser) => {
    assert.equal(video.getAttribute("src"), null, "offscreen film must not request its MP4");
    assert.equal(video.getAttribute("poster"), "/desktop.jpg");
    assert.deepEqual(browser.attempts, []);
    await browser.intersect(true);
    assert.equal(video.getAttribute("src"), "/desktop.mp4"); assert.equal(video.paused, false);
  });
});

test("initial hidden page defers video source until visible", async () => {
  await withVideo({ visible: false }, async (video, _button, _reduce, browser) => {
    assert.equal(video.getAttribute("src"), null, "background film must not request its MP4");
    assert.deepEqual(browser.attempts, []);
    await browser.visibility(true);
    assert.equal(video.getAttribute("src"), "/desktop.mp4"); assert.equal(video.paused, false);
  });
});

test("manual and reduced-motion films defer their source until explicit Play", async () => {
  for (const options of [{ autoPlay: false }, { reduced: true }]) {
    await withVideo(options, async (video, button, _reduce, browser) => {
      assert.equal(video.getAttribute("src"), null, "still poster must not request its MP4"); assert.deepEqual(browser.attempts, []);
      await act(async () => button.click());
      assert.equal(video.getAttribute("src"), "/desktop.mp4"); assert.equal(video.paused, false);
    });
  }
});

test("mobile initial playback never attempts the desktop film", async () => {
  await withVideo({ small: true }, async (video, _button, _reduce, browser) => {
    assert.equal(video.getAttribute("src"), "/mobile.mp4"); assert.equal(video.getAttribute("poster"), "/mobile.jpg");
    assert.deepEqual(browser.attempts, ["/mobile.mp4"], "first play must use the resolved mobile source");
    assert.deepEqual(browser.sources, ["/mobile.mp4"], "desktop MP4 must never attach during mobile startup");
  });
});

test("hidden and offscreen videos pause and resume when intent permits", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await browser.visibility(false); assert.equal(video.paused, true, "hidden document pauses media");
    assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
    await browser.visibility(true); assert.equal(video.paused, false);
    await browser.intersect(false); assert.equal(video.paused, true, "offscreen video pauses media");
    await browser.intersect(true); assert.equal(video.paused, false);
  });
});

test("explicit pause survives breakpoint changes and visibility round trips", async () => {
  await withVideo({}, async (video, button, _reduce, browser) => {
    await act(async () => button.click()); await browser.resize(true);
    assert.equal(video.paused, true, "responsive source selection must not discard explicit pause");
    await browser.visibility(false); await browser.visibility(true); await browser.intersect(false); await browser.intersect(true);
    assert.equal(video.paused, true);
    await act(async () => button.click());
    assert.equal(video.getAttribute("src"), "/mobile.mp4"); assert.equal(video.paused, false);
  });
});

test("playing video switches to its responsive source without losing playback", async () => {
  await withVideo({}, async (video, _button, _reduce, browser) => {
    await browser.resize(true); assert.equal(video.getAttribute("src"), "/mobile.mp4"); assert.equal(video.paused, false);
    assert.deepEqual(browser.attempts, ["/desktop.mp4", "/mobile.mp4"]);
  });
});

test("missing motion or intersection APIs leave a still poster and usable manual Play", async () => {
  for (const options of [{ observer: false }, { matchMedia: false }]) {
    await withVideo(options, async (video, button, _reduce, browser) => {
      assert.equal(video.getAttribute("src"), null); assert.equal(video.paused, true); assert.deepEqual(browser.attempts, []);
      await act(async () => button.click()); assert.equal(video.getAttribute("src"), "/desktop.mp4"); assert.equal(video.paused, false);
      await browser.visibility(false); assert.equal(video.paused, true);
    });
  }
});

test("rejected playback keeps the accessible control in Play state", async () => {
  await withVideo({ rejectPlay: true }, async (video, button, _reduce, browser) => {
    assert.equal(video.paused, true); assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
    await act(async () => button.click()); assert.equal(video.paused, true); assert.equal(browser.attempts.length, 2);
  });
});

test("late playback resolution cannot restart an offscreen film", async () => {
  await withVideo({ pendingPlay: true }, async (video, button, _reduce, browser) => {
    await browser.intersect(false); await browser.settle();
    assert.equal(video.paused, true, "late play must be cancelled while offscreen");
    assert.equal(button.getAttribute("aria-label"), "Play Nimbus collection film");
  });
});

test("unmount removes listeners and observers and cancels late playback", async () => {
  await withVideo({ pendingPlay: true }, async (video, _button, _reduce, browser) => {
    await browser.unmount(); assert.equal(browser.listeners.size, 0); assert.equal(browser.observed.size, 0);
    await browser.settle(); assert.equal(video.paused, true, "unmounted media must not resume from a pending promise");
  });
});


test("server rendering preserves the poster but attaches no MP4 before browser eligibility is known", () => {
  const markup = renderToStaticMarkup(<CategoryVideo label="Film" desktop={{ src: "/desktop.mp4", poster: "/desktop.jpg" }} />);
  const dom = new JSDOM(markup);
  assert.equal(dom.window.document.querySelector("video")!.getAttribute("src"), null);
  assert.equal(dom.window.document.querySelector("video")!.getAttribute("poster"), "/desktop.jpg");
  dom.window.close();
});


test("manual films stay unloaded through visibility and breakpoint changes until explicit Play", async () => {
  await withVideo({ autoPlay: false }, async (video, button, _reduce, browser) => {
    await browser.resize(true); await browser.visibility(false); await browser.visibility(true);
    await browser.intersect(false); await browser.intersect(true);
    assert.equal(video.getAttribute("src"), null); assert.deepEqual(browser.attempts, []);
    await act(async () => button.click()); assert.equal(video.getAttribute("src"), "/mobile.mp4");
    await browser.intersect(false); assert.equal(video.paused, true);
    await browser.intersect(true); assert.equal(video.paused, false);
  });
});

test("motion changes pause an explicitly started manual film without silently resuming it", async () => {
  await withVideo({ autoPlay: false }, async (video, button, reduce, browser) => {
    await act(async () => button.click()); await reduce(true); assert.equal(video.paused, true);
    await reduce(false); await browser.resize(true); await browser.intersect(false); await browser.intersect(true);
    assert.equal(video.paused, true);
    await act(async () => button.click()); assert.equal(video.paused, false);
  });
});

test("stale playback rejection cannot clear or restart newer responsive playback", async () => {
  await withVideo({ pendingPlay: true }, async (video, button, _reduce, browser) => {
    await browser.resize(true);
    assert.deepEqual(browser.attempts, ["/desktop.mp4", "/mobile.mp4"]);
    await browser.settle(true); assert.equal(video.paused, true);
    await browser.settle(); assert.equal(video.paused, false);
    assert.equal(button.getAttribute("aria-label"), "Pause Nimbus collection film");
    await act(async () => button.click()); await browser.visibility(false); await browser.visibility(true);
    assert.equal(video.paused, true); assert.equal(browser.attempts.length, 2);
  });
});

test("late native pause events keep the control consistent with current playback", async () => {
  await withVideo({}, async (video, button) => {
    assert.equal(video.paused, false);
    await act(async () => video.dispatchEvent(new window.Event("pause")));
    assert.equal(button.getAttribute("aria-label"), "Pause Nimbus collection film", "queued events must reflect the current media state");
  });
});


test("batched visible then offscreen observations leave the film unloaded", async () => {
  await withVideo({ intersecting: false }, async (video, _button, _reduce, browser) => {
    await browser.intersectBatch([true, false]);
    assert.equal(video.getAttribute("src"), null, "the latest offscreen observation must prevent MP4 attachment");
    assert.equal(video.paused, true);
    assert.deepEqual(browser.attempts, []);
  });
});

test("batched offscreen then visible observations start the eligible film", async () => {
  await withVideo({ intersecting: false }, async (video, _button, _reduce, browser) => {
    await browser.intersectBatch([false, true]);
    assert.equal(video.getAttribute("src"), "/desktop.mp4", "the latest visible observation must allow MP4 playback");
    assert.equal(video.paused, false);
    assert.deepEqual(browser.attempts, ["/desktop.mp4"]);
  });
});


test("moving from edge contact into the viewport starts a previously offscreen film", async () => {
  await withVideo({ intersecting: false }, async (video, _button, _reduce, browser) => {
    await browser.crossViewportEdge();
    assert.equal(video.getAttribute("src"), "/desktop.mp4", "a positive viewport crossing must notify and start eligible playback");
    assert.equal(video.paused, false);
  });
});
