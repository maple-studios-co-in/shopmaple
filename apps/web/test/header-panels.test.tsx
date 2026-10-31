import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { Header } from "../components/header";
import { ShopProvider } from "../components/shop-provider";
const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost:3003",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.assign(dom.window.HTMLElement.prototype, {
  attachEvent() {},
  detachEvent() {},
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
test("header wishlist opens a working drawer and the account menu never hands off to Shopify", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      items: [],
      itemCount: 0,
      subtotalPaise: 0,
      currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 },
      checkoutEnabled: false,
      mode: "preview",
    });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(
        <ShopProvider>
          <Header />
        </ShopProvider>,
      ),
    );
    const saved = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Saved furniture (0)"]',
    );
    assert.ok(saved, "wishlist should open a drawer");
    await act(async () => saved.click());
    const panel = document.querySelector("dialog[open]")!;
    assert.ok(panel);
    // The wishlist list is loaded on demand; wait for it to arrive.
    for (let tries = 0; tries < 40 && !panel.querySelector('a[href="/collections/all"]'); tries++)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    assert.ok(panel.querySelector('a[href="/collections/all"]'));
    assert.match(panel.textContent!, /this browser/);
    await act(async () =>
      panel
        .querySelector<HTMLButtonElement>('button[aria-label^="Close"]')!
        .click(),
    );
    assert.equal(document.querySelector("dialog[open]"), null);
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Your account"]')!
        .click(),
    );
    const account = document.querySelector("[data-account-menu]")!;
    assert.equal(
      document
        .querySelector('button[aria-label="Your account"]')!
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.ok(account.querySelector('a[href="/account"]'));
    assert.equal(
      account.querySelector('a[href*="shop.maplefurnishers.com"]'),
      null,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
