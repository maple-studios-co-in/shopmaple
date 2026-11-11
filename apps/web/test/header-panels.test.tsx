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
test("header wishlist opens a working drawer and the account icon opens /account without asking who is signed in", async () => {
  const previous = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = async (input) => {
    asked.push(new URL(String(input), "http://localhost:3003").pathname);
    return Response.json({
      items: [],
      itemCount: 0,
      subtotalPaise: 0,
      currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 },
      checkoutEnabled: false,
      mode: "preview",
    });
  };
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
    // The account icon is a plain link (owner's spec, 10 Nov 2026): /account shows sign-in, the account or the
    // not-available page by the API's flag, so the header never fetches the session or loads account code.
    const account = document.querySelector<HTMLAnchorElement>('a[aria-label="Your account"]');
    assert.equal(account?.getAttribute("href"), "/account");
    assert.equal(document.querySelector('button[aria-label="Your account"]'), null, "no modal saying accounts do not exist");
    assert.equal(document.querySelector('a[href*="shop.maplefurnishers.com"]'), null);
    assert.deepEqual(asked.filter((path) => path.startsWith("/api/account")), [], "the header never asks who is signed in");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
