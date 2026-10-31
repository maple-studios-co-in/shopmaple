import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cardEnvelope } from "./support/catalogue-fixtures";
import { Header } from "../components/header";
import { ShopProvider } from "../components/shop-provider";
import { FavouritesPage } from "../components/store/favourites-page";
import { AccountOverview } from "../components/store/account-overview";

const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: "http://localhost:3000" });
Object.assign(globalThis, {
  window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
});
Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
dom.window.HTMLDialogElement.prototype.close = function () {
  if (!this.hasAttribute("open")) return;
  this.removeAttribute("open");
  this.dispatchEvent(new dom.window.Event("close"));
};
const cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };

async function mount(saved: string[], node: React.ReactNode, check: () => Promise<void>) {
  localStorage.clear();
  localStorage.setItem("maple-favourites", JSON.stringify(saved));
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/cart") return Response.json(cart);
    return Response.json(cardEnvelope(decodeURIComponent(url.split("/").at(-1)!)));
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider>{node}</ShopProvider>));
    await check();
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const heart = () => document.querySelector<HTMLButtonElement>('button[aria-label^="Saved furniture ("]')!;
const accountButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="Your account"]')!;
const drawer = () => document.querySelector<HTMLDialogElement>("dialog[data-wishlist-drawer]")!;
const key = (target: Element, name: string) =>
  act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true })); });

test("before hydration the heart and account icons are plain links to their pages", () => {
  localStorage.clear();
  const html = renderToString(<ShopProvider><Header /></ShopProvider>);
  const doc = new JSDOM(html).window.document;
  const saved = doc.querySelector('a[aria-label="Saved furniture (0)"]');
  assert.equal(saved?.getAttribute("href"), "/favourites", "the heart works without the drawer");
  assert.equal(doc.querySelector('a[aria-label="Your account"]')?.getAttribute("href"), "/account");
  assert.equal(doc.querySelector('button[aria-label^="Saved furniture"]'), null);
});

test("the heart shows a count badge and opens a left wishlist drawer that lists saved furniture", async () => {
  await mount(["alpha"], <Header />, async () => {
    assert.equal(heart().getAttribute("aria-label"), "Saved furniture (1)");
    assert.equal(heart().querySelector("[data-wishlist-count]")?.textContent, "1");
    assert.equal(heart().getAttribute("aria-haspopup"), "dialog");
    heart().focus();
    await act(async () => heart().click());
    assert.ok(drawer().hasAttribute("open"));
    assert.ok(drawer().hasAttribute("data-store"));
    assert.equal(drawer().querySelector("h2")?.textContent, "My Wishlist (1)");
    assert.ok(drawer().contains(document.activeElement), "focus moves into the drawer");
    const item = drawer().querySelector("[data-wishlist-item]")!;
    assert.ok(item, "saved product row");
    assert.equal(item.querySelector("[data-wishlist-item-name]")?.textContent, "alpha Chair");
    assert.equal(item.querySelector("[data-wishlist-item-name]")?.getAttribute("href"), "/products/alpha");
    assert.ok(item.querySelector('a[href="/products/alpha"] [role="img"], a[href="/products/alpha"] img'), "thumbnail links to the product");
    assert.match(item.querySelector("[data-wishlist-item-price]")?.textContent ?? "", /Rs\.|Price on request/);
    const view = drawer().querySelector<HTMLAnchorElement>("a[data-wishlist-view]");
    assert.equal(view?.getAttribute("href"), "/favourites");
    assert.equal(view?.textContent, "View Wishlist");
    assert.doesNotMatch(drawer().textContent!, /My Lists|Create new list|Saved for later/);
    assert.equal(drawer().querySelector('input[type="checkbox"]'), null);
  });
});

test("removing the last piece in the drawer shows the empty state and keeps focus on Explore Collections", async () => {
  await mount(["alpha"], <Header />, async () => {
    await act(async () => heart().click());
    const remove = drawer().querySelector<HTMLButtonElement>('button[aria-label="Remove alpha Chair from wishlist"]')!;
    assert.ok(remove, "each row has a remove control");
    remove.focus();
    await act(async () => remove.click());
    assert.equal(localStorage.getItem("maple-favourites"), "[]");
    assert.equal(drawer().querySelector("h2")?.textContent, "My Wishlist (0)");
    assert.equal(heart().querySelector("[data-wishlist-count]"), null, "no badge without saved items");
    const empty = drawer().querySelector("[data-wishlist-empty]")!;
    assert.match(empty.textContent!, /Your wishlist is empty/);
    assert.match(empty.textContent!, /Browse our collections and add your favourite pieces\./);
    const explore = empty.querySelector<HTMLAnchorElement>('a[href="/collections/all"]')!;
    assert.equal(explore.textContent, "Explore Collections");
    assert.equal(document.activeElement, explore);
    assert.equal(drawer().querySelector("a[data-wishlist-view]"), null, "nothing to view when empty");
  });
});

test("Escape and the close button close the drawer, restore scrolling and return focus to the heart", async () => {
  await mount([], <Header />, async () => {
    heart().focus();
    await act(async () => heart().click());
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(heart().getAttribute("aria-expanded"), "true");
    await act(async () => { drawer().dispatchEvent(new dom.window.Event("cancel", { cancelable: true })); });
    assert.equal(drawer().hasAttribute("open"), false);
    assert.equal(document.body.style.overflow, "");
    assert.equal(document.activeElement, heart());
    await act(async () => heart().click());
    await act(async () => drawer().querySelector<HTMLButtonElement>('button[aria-label="Close wishlist"]')!.click());
    assert.equal(drawer().hasAttribute("open"), false);
    assert.equal(document.activeElement, heart());
  });
});

test("following a link in the drawer closes it", async () => {
  await mount(["alpha"], <Header />, async () => {
    await act(async () => heart().click());
    const view = drawer().querySelector<HTMLAnchorElement>("a[data-wishlist-view]")!;
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await act(async () => { view.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    assert.equal(drawer().hasAttribute("open"), false);
  });
});

test("the account icon is a disclosure with only the entries the shop really has", async () => {
  await mount(["alpha", "bravo"], <Header />, async () => {
    const button = accountButton();
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelector("[data-account-menu]"), null);
    button.focus();
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-expanded"), "true");
    const menu = document.querySelector<HTMLElement>("[data-account-menu]")!;
    assert.equal(button.getAttribute("aria-controls"), menu.id);
    assert.equal(menu.querySelector("h2")?.textContent, "Account");
    assert.match(menu.textContent!, /accounts arrive with online checkout/i);
    const saved = menu.querySelector<HTMLAnchorElement>('a[href="/favourites"]')!;
    assert.match(saved.textContent!, /Saved furniture/);
    assert.equal(saved.querySelector("[data-account-saved-count]")?.textContent, "2");
    assert.ok(menu.querySelector('a[href^="/pages/contact"]'), "contact our team");
    assert.ok(menu.querySelector('a[href="/account"]'));
    assert.doesNotMatch(menu.textContent!, /Orders|Profile|Addresses|Log out|Sign in/);
    assert.equal(menu.querySelector('a[href*="shop.maplefurnishers.com"], a[href*="shopify"]'), null);
    await key(saved, "Escape");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelector("[data-account-menu]"), null);
    assert.equal(document.activeElement, button, "Escape returns focus to the account icon");
    await act(async () => button.click());
    await act(async () => { document.getElementById("outside")!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })); });
    assert.equal(button.getAttribute("aria-expanded"), "false", "outside click closes the menu");
    await act(async () => button.click());
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-expanded"), "false", "the button toggles");
    await act(async () => button.click());
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await act(async () => { document.querySelector('[data-account-menu] a[href="/favourites"]')!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector("[data-account-menu]"), null, "choosing an entry closes the menu");
  });
});

test("the favourites page shows a heading, a count and the new product cards", async () => {
  await mount(["alpha", "bravo"], <FavouritesPage />, async () => {
    const page = document.querySelector("[data-favourites-page]")!;
    assert.ok(page.hasAttribute("data-store"));
    assert.equal(page.querySelector("h1")?.textContent, "Saved furniture");
    assert.equal(page.querySelector("[data-saved-count]")?.textContent, "2 pieces");
    assert.equal(page.querySelectorAll("[data-saved-grid] [data-product-card]").length, 2);
  });
  await mount([], <FavouritesPage />, async () => {
    assert.equal(document.querySelector("[data-saved-count]")?.textContent, "0 pieces");
    assert.match(document.querySelector("[data-wishlist-empty]")?.textContent ?? "", /Browse our collections and add your favourite pieces\./);
  });
});

test("the account page describes what is available today and nothing that does not exist", async () => {
  await mount(["alpha"], <AccountOverview />, async () => {
    const page = document.querySelector("[data-account-page]")!;
    assert.ok(page.hasAttribute("data-store"));
    assert.equal(page.querySelector("h1")?.textContent, "Account");
    assert.match(page.textContent!, /accounts arrive with online checkout/i);
    assert.equal(page.querySelector('a[href="/favourites"] [data-account-saved-count]')?.textContent, "1");
    assert.ok(page.querySelector('a[href="/pages/contact?product=Order%20support"]'));
    assert.ok(page.querySelector('a[href="/pages/contact?product=Account%20support"]'));
    assert.doesNotMatch(page.textContent!, /\bOrders\b|Profile|Addresses|Log out|Sign in with/);
  });
});
