import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { HomeTicker } from "../components/home-ticker";

const text = "Thoughtfully designed. Beautifully made. Made for your home.";
const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Outside</button>', { url: "http://localhost" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
let reduced = false;
let hidden = false;
const mediaListeners = new Set<() => void>();
const mediaQuery = () => ({ get matches() { return reduced; }, addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener), removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener) });
Object.defineProperty(window, "matchMedia", { configurable: true, value: mediaQuery });
Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
let notify: IntersectionObserverCallback | undefined;
let target: Element | undefined;
let disconnected = false;
class Observer {
  constructor(callback: IntersectionObserverCallback) { notify = callback; }
  observe(element: Element) { target = element; }
  disconnect() { disconnected = true; notify = undefined; target = undefined; }
}
Object.assign(globalThis, { IntersectionObserver: Observer });
function observation(visible: boolean, time = 0, ratio = visible ? 1 : 0): IntersectionObserverEntry {
  return { target, isIntersecting: visible, intersectionRatio: ratio, time } as IntersectionObserverEntry;
}
async function mount(props: { text?: string; autoplay?: boolean } = {}) {
  reduced = false; hidden = false; disconnected = false;
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  await act(async () => root.render(<HomeTicker text={text} {...props} />));
  return {
    host,
    ticker: () => host.querySelector<HTMLElement>("[data-home-ticker]")!,
    track: () => host.querySelector<HTMLElement>("[data-ticker-track]"),
    button: () => host.querySelector<HTMLButtonElement>("button"),
    observe: async (entries = [observation(true)]) => act(async () => notify?.(entries, {} as IntersectionObserver)),
    render: async (next: { text?: string; autoplay?: boolean }) => act(async () => root.render(<HomeTicker text={text} {...next} />)),
    unmount: async () => act(async () => root.unmount()),
  };
}
function running(h: Awaited<ReturnType<typeof mount>>) { return h.track()?.style.animationPlayState === "running" && !h.track()?.hidden; }
async function motionPreference(value: boolean) { reduced = value; await act(async () => mediaListeners.forEach(listener => listener())); }
async function visibility(value: boolean) { hidden = !value; await act(async () => document.dispatchEvent(new dom.window.Event("visibilitychange"))); }

test("server output retains the complete original copy without JavaScript", () => {
  const document = new JSDOM(renderToStaticMarkup(<HomeTicker text={text} />)).window.document;
  const visibleCopy = [...document.querySelectorAll("p")].filter(element => !element.closest('[aria-hidden="true"], [hidden]'));
  assert.deepEqual(visibleCopy.map(element => element.textContent), [text]);
  assert.equal(document.querySelector("button:not([hidden])"), null);
});

test("ticker starts only after visible observation and its pause control survives lifecycle and content changes", async () => {
  const h = await mount();
  try {
    assert.equal(running(h), false);
    await h.observe();
    assert.equal(running(h), true, "Visible hydrated ticker must animate when motion is allowed");
    assert.equal(h.button()?.getAttribute("aria-label"), "Pause scrolling text");
    await act(async () => h.button()!.click());
    assert.equal(running(h), false);
    assert.equal(h.button()?.getAttribute("aria-label"), "Resume scrolling text");
    await visibility(false); await visibility(true);
    await h.observe([observation(false)]); await h.observe();
    await motionPreference(true); await motionPreference(false);
    await h.render({ text: "A different original slogan", autoplay: false });
    await h.render({ text: "A different original slogan", autoplay: true });
    assert.equal(running(h), false, "Only an explicit Resume may clear visitor pause");
    await act(async () => h.button()!.click());
    assert.equal(running(h), true);
    const accessibleCopy = [...h.host.querySelectorAll("p")].filter(element => !element.closest('[aria-hidden="true"]'));
    assert.deepEqual(accessibleCopy.map(element => element.textContent), ["A different original slogan"]);
    assert.equal(h.host.querySelector('[aria-hidden="true"] a, [aria-hidden="true"] button, [aria-hidden="true"] [tabindex]'), null);
  } finally { await h.unmount(); }
});

test("hover, focus, background tabs and offscreen states suspend motion without losing the pause choice", async () => {
  const h = await mount();
  try {
    await h.observe(); assert.equal(running(h), true);
    await act(async () => h.ticker().dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })));
    assert.equal(running(h), false);
    await act(async () => h.ticker().dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
    assert.equal(running(h), true);
    await act(async () => h.button()!.focus());
    assert.equal(document.activeElement, h.button()); assert.equal(running(h), false);
    await act(async () => h.button()!.click());
    await act(async () => document.getElementById("outside")!.focus());
    assert.equal(running(h), false, "A keyboard Pause remains in effect after leaving");
    await act(async () => h.button()!.focus()); await act(async () => h.button()!.click());
    assert.equal(document.activeElement, h.button()); assert.equal(running(h), false, "Focus temporarily suspends explicit resume");
    await act(async () => document.getElementById("outside")!.focus());
    assert.equal(running(h), true);
    await visibility(false); assert.equal(running(h), false);
    await visibility(true); assert.equal(running(h), true);
    await h.observe([observation(false)]); assert.equal(running(h), false);
    await h.observe(); assert.equal(running(h), true);
  } finally { await h.unmount(); }
});

test("reduced motion and disabled autoplay retain static original copy and hide repeated visuals", async () => {
  const h = await mount();
  try {
    await h.observe();
    await motionPreference(true);
    assert.equal(running(h), false);
    assert.ok(h.track()?.hidden, "Repeated animation visuals must not replace static full text");
    assert.equal(h.ticker().classList.contains("home-ticker-animated"), false);
    assert.equal(h.button()?.hidden, true);
    assert.equal(h.host.querySelector("p:not([aria-hidden])")?.textContent, text);
    await motionPreference(false);
    await h.render({ autoplay: false });
    assert.equal(running(h), false); assert.equal(h.track()?.hidden, true);
    assert.equal(h.ticker().classList.contains("home-ticker-animated"), false);
  } finally { await h.unmount(); }
});

test("latest matching observation and visibility threshold govern motion", async () => {
  const h = await mount();
  try {
    await h.observe([observation(true, 1, 0.05)]); assert.equal(running(h), false);
    await h.observe([observation(true, 2, 0.15)]); assert.equal(running(h), true);
    await h.observe([observation(false, 4), observation(true, 3)]); assert.equal(running(h), false);
    await h.observe([{ ...observation(true, 5), target: document.body }]); assert.equal(running(h), false);
    await h.observe([observation(false, 6), observation(true, 7)]); assert.equal(running(h), true);
  } finally { await h.unmount(); }
});

for (const missing of ["media", "observer"] as const) {
  test(`missing ${missing} browser capability leaves a readable static slogan`, async () => {
    if (missing === "media") Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    else Object.assign(globalThis, { IntersectionObserver: undefined });
    const h = await mount();
    try {
      await h.observe(); assert.equal(running(h), false);
      assert.equal(h.ticker().classList.contains("home-ticker-animated"), false);
      assert.equal(h.button()?.hidden, true);
      assert.equal(h.host.querySelector("p:not([aria-hidden])")?.textContent, text);
    } finally {
      await h.unmount();
      Object.defineProperty(window, "matchMedia", { configurable: true, value: mediaQuery });
      Object.assign(globalThis, { IntersectionObserver: Observer });
    }
  });
}

test("unmount releases observer and motion listeners", async () => {
  const h = await mount(); await h.observe();
  assert.equal(running(h), true);
  await h.unmount();
  assert.equal(disconnected, true); assert.equal(mediaListeners.size, 0);
  await visibility(false); await motionPreference(true);
  assert.equal(h.host.childNodes.length, 0);
});
