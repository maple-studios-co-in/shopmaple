import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { LegacyChairs } from "../components/legacy-chairs";

test("room rail arrows move the product viewport and respect reduced motion", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost",
  });
  Object.assign(globalThis, {
    self: dom.window,
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<LegacyChairs products={[]} />));
    const room = document.querySelector('section[aria-label="Living Room"]')!;
    const next = room.querySelector<HTMLButtonElement>(
      'button[aria-label="Next Living Room featured products"]',
    );
    assert.ok(next, "Room products must offer a Next control");
    const rail = document.getElementById(next.getAttribute("aria-controls")!)!;
    Object.defineProperties(rail, {
      clientWidth: { value: 500 },
      scrollWidth: { value: 1600 },
    });
    const moves: ScrollToOptions[] = [];
    rail.scrollBy = (options) => moves.push(options as ScrollToOptions);
    await act(async () => next.click());
    await act(async () =>
      room
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Previous Living Room featured products"]',
        )!
        .click(),
    );
    assert.deepEqual(moves, [
      { left: 500, behavior: "instant" },
      { left: -500, behavior: "instant" },
    ]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
