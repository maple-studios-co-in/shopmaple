import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MobileNavigation } from "../components/navigation";
import { cardEnvelope } from "./support/catalogue-fixtures";

// The site chrome at laptop zoom levels and on tablets (owner, 10 Nov 2026: "at 125% or 100% ... all sections are
// breaking"). The layout itself is proven by screenshots; these cover the behaviour that goes with it.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000" });
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = async (input) => {
    const handle = String(input).split("/").at(-1)!;
    return Response.json(cardEnvelope(handle, handle));
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("the menu drawer stays open for as long as the header shows its menu button, and closes once the full menu fits", async () => {
  // A window whose width can change under the open drawer, as a phone turned sideways or a tablet's split view does.
  const lists = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
  Object.assign(dom.window, {
    matchMedia: (query: string) => {
      const list = lists.get(query) ?? { matches: false, listeners: new Set<() => void>() };
      lists.set(query, list);
      return {
        media: query,
        get matches() { return list.matches; },
        addEventListener: (_type: string, listener: () => void) => list.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => list.listeners.delete(listener),
      };
    },
  });
  Object.assign(globalThis, { requestAnimationFrame: (callback: () => void) => { callback(); return 0; } });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const root = createRoot(document.getElementById("root")!);
  let closed = 0;
  try {
    await act(async () => root.render(<MobileNavigation open onClose={() => { closed += 1; }} />));
    // The header swaps its menu button for the full menu at 1100px (styles/header-menu.css): a phone turned sideways
    // (844px) or a tablet (768px to 1099px) still has only the button, so its drawer must stay open.
    assert.deepEqual([...lists.keys()], ["(min-width: 1100px)"], "the drawer listens for the width at which the full menu appears");
    const wide = lists.get("(min-width: 1100px)")!;
    wide.matches = true;
    await act(async () => wide.listeners.forEach((listener) => listener()));
    assert.equal(closed, 1, "the drawer closes once the window is wide enough for the full menu");
  } finally {
    await act(async () => root.unmount());
  }
});
