import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DesktopNavigation, MobileNavigation } from "../components/navigation";
import { navigationHref } from "../lib/navigation";
const dom = new JSDOM(
  "<!doctype html><div id='root'></div><button id='outside'>Outside</button>",
  { url: "http://localhost:3000" },
);
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
test("menu destinations stay local and avoid dead source anchors", () => {
  assert.equal(navigationHref("/pages/sofas", "Sofas"), "/pages/sofas");
  assert.equal(
    navigationHref("/collections/arm-chair", "Arm Chairs"),
    "/collections/arm-chair",
  );
  assert.equal(
    navigationHref("/collections/recliners", "Recliners"),
    "/collections/recliners",
  );
  assert.equal(navigationHref("#", "Dining Table"), "/collections/dining");
  assert.match(navigationHref("#", "Kids Beds"), /^\/pages\/contact\?product=/);
});
test("desktop menu switches full groups, closes on outside click and Escape, and restores focus", async () => {
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<DesktopNavigation />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === label,
      )!;
    await act(async () => button("Living Room").click());
    assert.equal(button("Living Room").getAttribute("aria-expanded"), "true");
    assert.equal(document.querySelectorAll(".maple-mega-column").length, 4);
    assert.ok(document.querySelector('a[href="/collections/dining-chair"]'));
    await act(async () => button("Bedroom").click());
    assert.equal(button("Living Room").getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelectorAll(".maple-mega-column").length, 3);
    await act(async () =>
      document.querySelector(".maple-mega a")!.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      ),
    );
    assert.equal(button("Bedroom").getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, button("Bedroom"));
    await act(async () => button("Living Room").click());
    await act(async () =>
      document
        .getElementById("outside")!
        .dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })),
    );
    assert.equal(button("Living Room").getAttribute("aria-expanded"), "false");
  } finally {
    await act(async () => root.unmount());
  }
});
test("mobile drawer drills down, goes back, closes on Escape and restores scrolling", async () => {
  const root = createRoot(document.getElementById("root")!);
  Object.assign(dom.window, {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  Object.assign(globalThis, {
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 0;
    },
  });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  let closed = false;
  try {
    await act(async () =>
      root.render(
        <MobileNavigation
          open
          onClose={() => {
            closed = true;
          }}
        />,
      ),
    );
    assert.equal(document.body.style.overflow, "hidden");
    const button = (text: string) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === text,
      )!;
    await act(async () => button("Living Room").click());
    assert.equal(document.querySelectorAll(".maple-drawer-group").length, 4);
    assert.equal(document.querySelectorAll(".maple-menu-product").length, 2);
    await act(async () =>
      document.querySelector<HTMLButtonElement>(".maple-drawer-back")!.click(),
    );
    assert.equal(document.querySelectorAll(".maple-drawer-main > *").length, 5);
    assert.equal(document.querySelectorAll(".maple-menu-product").length, 4);
    assert.ok(
      document.querySelector('dialog a[href="/favourites"]'),
      "saved furniture must remain reachable on mobile",
    );
    assert.ok(
      document.querySelector(
        'dialog a[aria-label="Enquire about custom furniture"]',
      ),
    );
    await act(async () =>
      document
        .querySelector("dialog")!
        .dispatchEvent(new dom.window.Event("cancel", { cancelable: true })),
    );
    assert.equal(closed, true);
  } finally {
    await act(async () => root.unmount());
    assert.equal(document.body.style.overflow, "");
  }
});
test("desktop menu includes visual discovery and a working custom furniture enquiry", async () => {
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<DesktopNavigation />));
    const living = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Living Room",
    )!;
    await act(async () => living.click());
    const panel = document.querySelector(".maple-mega")!;
    assert.ok(
      panel.querySelector("img"),
      "menu should include a real furniture discovery image",
    );
    const custom = panel.querySelector<HTMLAnchorElement>(
      'a[aria-label="Enquire about custom furniture"]',
    );
    assert.ok(custom, "menu should expose custom furniture enquiries");
    assert.match(custom.href, /\/pages\/contact/);
    assert.ok(panel.querySelector('a[href="/collections/all"]'));
  } finally {
    await act(async () => root.unmount());
  }
});
