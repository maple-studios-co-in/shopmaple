import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { CategoryVideo } from "../components/category-controls";

async function withVideo(
  options: { reduced?: boolean; autoPlay?: boolean },
  check: (video: HTMLVideoElement, button: HTMLButtonElement, reduce: (value: boolean) => Promise<void>) => Promise<void>,
) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const globals = { self: dom.window, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  let reduced = options.reduced ?? false;
  const motion = new dom.window.EventTarget();
  Object.defineProperty(motion, "matches", { get: () => reduced });
  const viewport = new dom.window.EventTarget();
  Object.defineProperty(viewport, "matches", { value: false });
  Object.defineProperty(dom.window, "matchMedia", {
    value: (query: string) => query === "(prefers-reduced-motion: reduce)" ? motion : viewport,
  });
  // JSDOM has no media playback engine. Model only the browser media boundary;
  // the real component must update playback and its accessible control itself.
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLMediaElement) {
      paused.set(this, false);
      this.dispatchEvent(new dom.window.Event("play"));
      return Promise.resolve();
    } },
    pause: { value(this: HTMLMediaElement) {
      if (this.paused) return;
      paused.set(this, true);
      this.dispatchEvent(new dom.window.Event("pause"));
    } },
  });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(
      <CategoryVideo
        label="Nimbus collection film"
        desktop={{ src: "/desktop.mp4", poster: "/desktop.jpg" }}
        autoPlay={options.autoPlay ?? true}
      />,
    ));
    await check(document.querySelector("video")!, document.querySelector("button")!, async (value) => {
      await act(async () => {
        reduced = value;
        motion.dispatchEvent(new dom.window.Event("change"));
      });
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
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
