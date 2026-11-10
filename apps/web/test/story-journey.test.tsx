import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { StoryJourneySlider } from "../components/story-journey";

// The Maple journey's timeline slider (Figma 293:1434): the years and arrows choose a chapter; keys, swipes and drags move.
const dom = new JSDOM('<!doctype html><button id="before">Before</button><div id="root"></div>', { url: "http://localhost:3100/our-story" });
const { window } = dom;
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
let reduced = false;
Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: reduced && query.includes("reduce"), addEventListener() {}, removeEventListener() {} }) });
let reveal: (() => void) | undefined;
class Observer {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) { reveal = () => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  disconnect() { reveal = undefined; }
}
Object.assign(globalThis, { IntersectionObserver: Observer });

const years = ["2015", "2015–2022", "2023", "2024", "2026", "Today", "Tomorrow"];
async function mount() {
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  await act(async () => root.render(
    <StoryJourneySlider label="The Maple journey" markers={years.map((year, i) => ({ key: `chapter-${i + 1}`, label: year }))}>
      {years.map((year, i) => (
        <article key={year} className="story-chapter">
          <div className="story-chapter-media"><img src={`/media/our-story/chapter-${i + 1}.webp`} alt="" loading="lazy" /></div>
          <div className="story-chapter-copy"><h3>Chapter {year}</h3></div>
        </article>
      ))}
    </StoryJourneySlider>,
  ));
  const slider = host.querySelector<HTMLElement>(".story-timeline")!;
  const viewport = slider.querySelector<HTMLElement>(".story-timeline-viewport")!;
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 600 });
  const tabs = () => [...slider.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = () => [...slider.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  return {
    slider, viewport, tabs, panels,
    arrow: (name: "Previous" | "Next") => slider.querySelector<HTMLButtonElement>(`button[aria-label="${name} chapter"]`)!,
    /** The chapter in view, by every account: the selected year, the one panel left open, and the track's position. */
    current() {
      const selected = tabs().findIndex(tab => tab.getAttribute("aria-selected") === "true");
      const open = panels().filter(panel => !panel.hasAttribute("inert")).map(panel => panels().indexOf(panel));
      assert.deepEqual(open, [selected], "exactly the selected chapter is open to readers and focus");
      assert.equal(slider.style.getPropertyValue("--story-index"), String(selected));
      return selected;
    },
    unmount: () => act(async () => root.unmount()),
  };
}
const key = (target: Element, name: string) => act(async () => {
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
});
/** A pointer event as a touch screen, pen or mouse sends it (jsdom has no PointerEvent class of its own). */
const pointer = (target: Element, type: string, x: number, time: number, kind = "touch", y = 200) => act(async () => {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: kind }, isPrimary: { value: true }, timeStamp: { value: time } });
  target.dispatchEvent(event);
});

test("the first chapter opens the journey; the arrows and the years choose another", async () => {
  const h = await mount();
  try {
    assert.equal(h.slider.getAttribute("aria-roledescription"), "carousel");
    assert.equal(h.slider.getAttribute("aria-label"), "The Maple journey");
    assert.deepEqual(h.tabs().map(tab => tab.textContent), years);
    assert.equal(h.current(), 0);
    assert.deepEqual(h.panels().map(panel => panel.getAttribute("aria-hidden")), [null, "true", "true", "true", "true", "true", "true"]);
    assert.equal(h.panels()[0]!.getAttribute("aria-labelledby"), h.tabs()[0]!.id);
    assert.equal(h.tabs()[0]!.getAttribute("aria-controls"), h.panels()[0]!.id);
    assert.equal(h.viewport.getAttribute("aria-live"), "polite");
    assert.equal(h.arrow("Previous").getAttribute("aria-disabled"), "true");
    const next = h.arrow("Next");
    next.focus();
    await act(async () => next.click());
    assert.equal(h.current(), 1);
    assert.equal(document.activeElement, next, "the arrow keeps focus");
    assert.equal(h.arrow("Previous").getAttribute("aria-disabled"), "false");
    await act(async () => h.tabs()[3]!.click());
    assert.equal(h.current(), 3);
    assert.equal(h.slider.style.getPropertyValue("--story-distance"), "2", "a longer jump takes a little longer");
    await act(async () => h.arrow("Previous").click());
    assert.equal(h.current(), 2);
    await act(async () => h.tabs()[6]!.click());
    assert.equal(h.arrow("Next").getAttribute("aria-disabled"), "true");
    h.arrow("Next").focus();
    await act(async () => h.arrow("Next").click());
    assert.equal(h.current(), 6, "the last chapter has nothing after it");
    assert.equal(document.activeElement, h.arrow("Next"), "a spent arrow keeps focus rather than dropping it");
  } finally { await h.unmount(); }
});

test("the years are one tab stop, moved through with the arrow, Home and End keys", async () => {
  const h = await mount();
  try {
    assert.deepEqual(h.tabs().map(tab => tab.tabIndex), [0, -1, -1, -1, -1, -1, -1]);
    h.tabs()[0]!.focus();
    await key(h.tabs()[0]!, "ArrowRight");
    assert.equal(h.current(), 1);
    assert.equal(document.activeElement, h.tabs()[1], "focus follows the chosen year");
    assert.deepEqual(h.tabs().map(tab => tab.tabIndex), [-1, 0, -1, -1, -1, -1, -1]);
    await key(h.tabs()[1]!, "End");
    assert.equal(h.current(), 6);
    assert.equal(document.activeElement, h.tabs()[6]);
    await key(h.tabs()[6]!, "ArrowRight");
    assert.equal(h.current(), 6, "no wrapping past the last year");
    await key(h.tabs()[6]!, "Home");
    assert.equal(h.current(), 0);
    assert.equal(document.activeElement, h.tabs()[0]);
    await key(h.tabs()[0]!, "ArrowLeft");
    assert.equal(h.current(), 0);
    // Elsewhere in the slider the left and right keys step through too, leaving focus where it is.
    const next = h.arrow("Next");
    next.focus();
    await key(next, "ArrowRight");
    await key(next, "ArrowRight");
    assert.equal(h.current(), 2);
    assert.equal(document.activeElement, next);
    await key(next, "ArrowLeft");
    assert.equal(h.current(), 1);
  } finally { await h.unmount(); }
});

test("a swipe or a quick flick turns the chapter; a short slow drag, a scroll or a pull past either end springs back", async () => {
  const h = await mount();
  try {
    const media = h.slider.querySelector(".story-chapter-media")!;
    // A swipe across a third of the slider, the track following the finger as it goes.
    await pointer(media, "pointerdown", 400, 1000);
    await pointer(media, "pointermove", 300, 1100);
    assert.equal(h.slider.hasAttribute("data-dragging"), true);
    assert.equal(h.viewport.querySelector<HTMLElement>(".story-timeline-track")!.style.getPropertyValue("--story-drag"), "-100px");
    await pointer(media, "pointermove", 200, 1200);
    await pointer(media, "pointerup", 200, 1250);
    assert.equal(h.current(), 1);
    assert.equal(h.slider.hasAttribute("data-dragging"), false);
    assert.equal(h.viewport.querySelector<HTMLElement>(".story-timeline-track")!.style.getPropertyValue("--story-drag"), "0px");
    // A short, slow drag is not a swipe.
    await pointer(media, "pointerdown", 300, 2000);
    await pointer(media, "pointermove", 260, 2200);
    await pointer(media, "pointerup", 250, 2600);
    assert.equal(h.current(), 1);
    // A short flick is.
    await pointer(media, "pointerdown", 300, 3000);
    await pointer(media, "pointermove", 280, 3040);
    await pointer(media, "pointerup", 250, 3080);
    assert.equal(h.current(), 2);
    // Back the other way.
    await pointer(media, "pointerdown", 100, 4000);
    await pointer(media, "pointermove", 220, 4100);
    await pointer(media, "pointerup", 300, 4200);
    assert.equal(h.current(), 1);
    // Mostly downward is the page scrolling, not the slider.
    await pointer(media, "pointerdown", 300, 5000, "touch", 100);
    await pointer(media, "pointermove", 296, 5050, "touch", 180);
    await pointer(media, "pointermove", 200, 5100, "touch", 300);
    await pointer(media, "pointerup", 200, 5150, "touch", 300);
    assert.equal(h.current(), 1);
    assert.equal(h.slider.hasAttribute("data-dragging"), false);
    // A cancelled touch springs back.
    await pointer(media, "pointerdown", 400, 6000);
    await pointer(media, "pointermove", 200, 6100);
    await pointer(media, "pointercancel", 200, 6100);
    assert.equal(h.current(), 1);
    // Before the first chapter the track gives a little, then returns.
    await act(async () => h.tabs()[0]!.click());
    await pointer(media, "pointerdown", 100, 7000);
    await pointer(media, "pointermove", 300, 7100);
    const pulled = parseFloat(h.viewport.querySelector<HTMLElement>(".story-timeline-track")!.style.getPropertyValue("--story-drag"));
    assert.ok(pulled > 0 && pulled < 200, `resisted pull, got ${pulled}px`);
    await pointer(media, "pointerup", 300, 7150);
    assert.equal(h.current(), 0);
  } finally { await h.unmount(); }
});

test("a mouse drags the photo but leaves the story's text free to select", async () => {
  const h = await mount();
  try {
    const copy = h.slider.querySelector(".story-chapter-copy")!;
    await pointer(copy, "pointerdown", 400, 1000, "mouse");
    await pointer(copy, "pointermove", 150, 1100, "mouse");
    await pointer(copy, "pointerup", 150, 1150, "mouse");
    assert.equal(h.current(), 0);
    const media = h.slider.querySelector(".story-chapter-media")!;
    await pointer(media, "pointerdown", 400, 2000, "mouse");
    await pointer(media, "pointermove", 150, 2100, "mouse");
    await pointer(media, "pointerup", 150, 2150, "mouse");
    assert.equal(h.current(), 1);
  } finally { await h.unmount(); }
});

test("chapter photos load before they slide in, once the journey nears the screen", async () => {
  const h = await mount();
  try {
    const loading = () => [...h.slider.querySelectorAll(".story-chapter-media img")].map(img => img.getAttribute("loading"));
    assert.deepEqual(loading(), Array(7).fill("lazy"));
    await act(async () => reveal?.());
    assert.deepEqual(loading(), Array(7).fill("eager"));
  } finally { await h.unmount(); }
});

test("on a narrow screen the chosen year scrolls into the strip, without motion when motion is reduced", async () => {
  for (const reduce of [false, true]) {
    reduced = reduce;
    const h = await mount();
    try {
      const strip = h.slider.querySelector<HTMLElement>('[role="tablist"]')!;
      Object.defineProperties(strip, { clientWidth: { configurable: true, value: 300 }, scrollWidth: { configurable: true, value: 700 } });
      h.tabs().forEach((tab, i) => Object.defineProperties(tab, { offsetLeft: { configurable: true, value: i * 100 }, offsetWidth: { configurable: true, value: 100 } }));
      const calls: ScrollToOptions[] = [];
      strip.scrollTo = ((options: ScrollToOptions) => { calls.push(options); }) as typeof strip.scrollTo;
      await act(async () => h.tabs()[4]!.click());
      assert.deepEqual(calls.at(-1), { left: 300, behavior: reduce ? "auto" : "smooth" }, "the 2026 marker is centred in the strip");
    } finally { await h.unmount(); }
  }
  reduced = false;
});
