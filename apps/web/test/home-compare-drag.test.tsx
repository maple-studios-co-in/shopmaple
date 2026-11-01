import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { attachCompare } from "../components/compare-drag";
import { CompareIsland } from "../components/compare-island";

// The divider of "Find your feel": dragged by pointer, moved by keyboard, 0 to 100 percent.
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost:3000/" });
const { document, MouseEvent, KeyboardEvent } = dom.window;
Object.assign(globalThis, { window: dom.window, document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

/** The card as the server draws it: a custom property for the divider and a slider grip. */
function drawCard() {
  const host = document.createElement("div");
  host.innerHTML = `<div data-compare-card style="--compare-pos: 50%"><div data-compare-divider><span role="slider" aria-label="Compare Aera and Caro" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></span></div><span data-compare-host></span></div>`;
  document.body.append(host);
  const card = host.querySelector<HTMLElement>("[data-compare-card]")!;
  card.getBoundingClientRect = () => ({ left: 100, right: 500, width: 400, top: 0, bottom: 300, height: 300, x: 100, y: 0, toJSON: () => ({}) });
  return { host, card, grip: card.querySelector<HTMLElement>('[role="slider"]')! };
}
const position = (card: HTMLElement) => card.style.getPropertyValue("--compare-pos").trim();
const pointer = (target: Element, type: string, clientX: number) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 }));
const key = (target: Element, name: string) => {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

test("dragging across the card moves the divider to the pointer and the slider value with it", () => {
  const { card, grip } = drawCard();
  const detach = attachCompare(card);
  pointer(grip, "pointerdown", 200);
  assert.equal(position(card), "25%", "100px into a 400px card");
  assert.equal(grip.getAttribute("aria-valuenow"), "25");
  pointer(card, "pointermove", 460);
  assert.equal(position(card), "90%");
  pointer(card, "pointermove", 900);
  assert.equal(position(card), "100%", "the divider stops at the edge");
  pointer(card, "pointermove", -300);
  assert.equal(position(card), "0%");
  assert.equal(grip.getAttribute("aria-valuenow"), "0");
  pointer(card, "pointerup", 300);
  pointer(card, "pointermove", 400);
  assert.equal(position(card), "0%", "once released, moving the pointer does nothing");
  detach();
});

test("a pointer that is not pressed does not move the divider; pressing anywhere on the card jumps there", () => {
  const { card } = drawCard();
  const detach = attachCompare(card);
  pointer(card, "pointermove", 300);
  assert.equal(position(card), "50%");
  pointer(card, "pointerdown", 400);
  assert.equal(position(card), "75%");
  pointer(card, "pointercancel", 400);
  pointer(card, "pointermove", 140);
  assert.equal(position(card), "75%", "a cancelled touch stops the drag");
  detach();
});

test("the grip takes the arrow keys in steps of five, Home and End to the ends", () => {
  const { card, grip } = drawCard();
  const detach = attachCompare(card);
  assert.equal(grip.getAttribute("tabindex"), "0", "the grip can be tabbed to once the script is here");
  assert.equal(key(grip, "ArrowRight").defaultPrevented, true);
  assert.equal(grip.getAttribute("aria-valuenow"), "55");
  key(grip, "ArrowLeft"); key(grip, "ArrowLeft");
  assert.equal(grip.getAttribute("aria-valuenow"), "45");
  assert.equal(position(card), "45%");
  key(grip, "End");
  assert.equal(grip.getAttribute("aria-valuenow"), "100");
  key(grip, "ArrowRight");
  assert.equal(grip.getAttribute("aria-valuenow"), "100", "no further than the end");
  key(grip, "Home");
  assert.equal(grip.getAttribute("aria-valuenow"), "0");
  key(grip, "ArrowLeft");
  assert.equal(position(card), "0%");
  assert.equal(key(grip, "a").defaultPrevented, false, "other keys are left alone");
  detach();
});

test("detaching hands the card back: no tab stop and no response", () => {
  const { card, grip } = drawCard();
  attachCompare(card)();
  assert.equal(grip.hasAttribute("tabindex"), false);
  pointer(card, "pointerdown", 200);
  key(grip, "ArrowRight");
  assert.equal(position(card), "50%");
});

test("the lazy island arrives after the page and makes a server-drawn card draggable", async () => {
  const { host, card, grip } = drawCard();
  const root = createRoot(host.querySelector("[data-compare-host]")!);
  await act(async () => root.render(<CompareIsland />));
  const started = Date.now();
  while (!grip.hasAttribute("tabindex")) {
    if (Date.now() - started > 4000) assert.fail("the drag script never attached");
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  key(grip, "ArrowRight");
  assert.equal(grip.getAttribute("aria-valuenow"), "55");
  pointer(card, "pointerdown", 300);
  assert.equal(position(card), "50%", "200px of 400px: the pointer wins over the earlier key press");
  await act(async () => root.unmount());
  assert.equal(grip.hasAttribute("tabindex"), false, "and leaves the card as it found it");
});
