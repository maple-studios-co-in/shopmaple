import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { DesktopNavigation, MobileNavigation } from "../components/navigation";
import { cardEnvelope } from "./support/catalogue-fixtures";
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
const originalFetch = globalThis.fetch;
beforeEach(() => {
  // Only the public catalogue transport is replaced; menus resolve real contracts.
  globalThis.fetch = async input => {
    const url = String(input);
    assert.match(url, /^\/api\/catalogue\/cards\/[a-z0-9-]+$/);
    const handle = url.split("/").at(-1)!;
    return Response.json(cardEnvelope(handle, handle));
  };
});
afterEach(() => { globalThis.fetch = originalFetch; });
function configureMobileBrowser() {
  Object.assign(dom.window, {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  Object.assign(globalThis, {
    requestAnimationFrame: (fn: () => void) => { fn(); return 0; },
  });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
}
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
    assert.equal(document.querySelectorAll("[data-mega-column]").length, 4);
    assert.ok(document.querySelector('a[href="/collections/dining-chair"]'));
    await act(async () => button("Bedroom").click());
    assert.equal(button("Living Room").getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelectorAll("[data-mega-column]").length, 3);
    await act(async () =>
      document.querySelector("[data-mega] a")!.dispatchEvent(
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
  configureMobileBrowser();
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
    assert.equal(document.querySelectorAll("[data-drawer-group]").length, 4);
    assert.equal(document.querySelectorAll("[data-menu-product]").length, 2);
    await act(async () =>
      document.querySelector<HTMLButtonElement>("[data-drawer-back]")!.click(),
    );
    assert.equal(document.querySelectorAll("[data-drawer-main] > *").length, 5);
    assert.equal(document.querySelectorAll("[data-menu-product]").length, 4);
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
    const panel = document.querySelector("[data-mega]")!;
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

async function leaveWithMouse(element: Element) {
  const event = new dom.window.MouseEvent("pointerout", {
    bubbles: true,
    relatedTarget: document.getElementById("outside"),
  });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  await act(async () => { element.dispatchEvent(event); });
}

async function withControlledDrawer(check: () => Promise<void>) {
  configureMobileBrowser();
  const root = createRoot(document.getElementById("root")!);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "scroll";
  function Drawer() {
    const [open, setOpen] = useState(true);
    return <MobileNavigation open={open} onClose={() => setOpen(false)} />;
  }
  try {
    await act(async () => root.render(<Drawer />));
    assert.equal(document.querySelector("dialog")!.open, true);
    assert.equal(document.body.style.overflow, "hidden");
    await check();
  } finally {
    await act(async () => root.unmount());
    document.body.style.overflow = previousOverflow;
  }
}

async function activateLink(link: HTMLAnchorElement, modified = false) {
  let preventedByMenu = false;
  // Let the real Link and menu handlers run, then suppress only JSDOM's
  // unavailable page navigation at the document boundary.
  const preventPageNavigation = (event: Event) => {
    preventedByMenu = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", preventPageNavigation);
  try {
    await act(async () => { link.dispatchEvent(new dom.window.MouseEvent("click", {
      bubbles: true, cancelable: true, metaKey: modified,
    })); });
    assert.equal(preventedByMenu, false, "menu must preserve native link activation");
  } finally { document.removeEventListener("click", preventPageNavigation); }
}

test("controlled mobile category navigation closes the drawer and restores prior scrolling", async () => {
  await withControlledDrawer(async () => {
    await activateLink(document.querySelector<HTMLAnchorElement>('dialog a[href="/favourites"]')!);
    assert.equal(document.querySelector("dialog")!.open, false);
    assert.equal(document.body.style.overflow, "scroll");
  });
});

test("desktop mouse-only departure and focus outside still dismiss the menu", async () => {
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<DesktopNavigation />));
    const trigger = [...document.querySelectorAll("button")].find(button => button.textContent === "Living Room")!;
    await act(async () => trigger.click());
    await leaveWithMouse(document.querySelector("nav")!);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    await act(async () => trigger.click());
    await act(async () => document.querySelector<HTMLAnchorElement>("[data-mega] a")!.focus());
    await act(async () => document.getElementById("outside")!.focus());
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, document.getElementById("outside"));
  } finally { await act(async () => root.unmount()); }
});

for (const living of [false, true]) {
  test(`mobile ${living ? "Living Room" : "main"} featured-product activation closes the drawer`, async () => {
    await withControlledDrawer(async () => {
      if (living) {
        const trigger = [...document.querySelectorAll("button")].find(button => button.textContent === "Living Room")!;
        await act(async () => trigger.click());
      }
      const product = document.querySelector<HTMLAnchorElement>("[data-menu-product]")!;
      assert.equal(product.getAttribute("href"), living ? "/products/morik-media-unit" : "/products/veyra-chest-of-drawers");
      await activateLink(product);
      assert.equal(document.querySelector("dialog")!.open, false, "selected product must not remain covered by the drawer");
      assert.equal(document.body.style.overflow, "scroll");
    });
  });
}

test("modified featured-product clicks preserve native link behavior while closing the drawer", async () => {
  await withControlledDrawer(async () => {
    const product = document.querySelector<HTMLAnchorElement>("[data-menu-product]")!;
    await activateLink(product, true);
    assert.equal(document.querySelector("dialog")!.open, false);
    assert.equal(document.body.style.overflow, "scroll");
  });
});

test("desktop mouse departure preserves the focused submenu until Escape", async () => {
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<DesktopNavigation />));
    const trigger = [...document.querySelectorAll("button")].find(button => button.textContent === "Living Room")!;
    await act(async () => trigger.click());
    const link = document.querySelector<HTMLAnchorElement>("[data-mega] a")!;
    await act(async () => link.focus());
    await leaveWithMouse(document.querySelector("nav")!);
    assert.equal(trigger.getAttribute("aria-expanded"), "true", "mouse departure must preserve the focused panel");
    assert.equal(link.isConnected, true);
    assert.equal(document.activeElement, link);
    await act(async () => { link.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Escape", bubbles: true})); });
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, trigger);
  } finally { await act(async () => root.unmount()); }
});
