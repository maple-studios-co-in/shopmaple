import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { cardEnvelope, cardFixture } from "./support/catalogue-fixtures";
import { Header } from "../components/header";
import { ShopProvider } from "../components/shop-provider";
import { FavouritesPage } from "../components/store/favourites-page";
import { AccountOverview } from "../components/store/account-overview";
import { waitFor } from "./support/wait-for";

/*
 * "Maple / PDF Review": the wishlist drawer ("Wishlist empty" 1045:85, "Wishlist with items" 1045:129),
 * the account menu ("Account menu" 1045:185) and the pages they lead to. There is no customer sign-in,
 * so the frames' sign-in, orders, profile, addresses, log-out, wishlist lists and saved-for-later are
 * left out; these tests hold the honest subset.
 */
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
const absent = /Sign in|Create an account|\bOrders\b|Profile|Addresses|Log out|My lists|Create new list|Saved for later|My favourite picks/;

async function mount(saved: string[], node: React.ReactNode, check: () => Promise<void>, respond = (handle: string) => Response.json(cardEnvelope(handle))) {
  localStorage.clear();
  localStorage.setItem("maple-favourites", JSON.stringify(saved));
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/cart") return Response.json(cart);
    return respond(decodeURIComponent(url.split("/").at(-1)!));
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
const drawer = () => document.querySelector<HTMLDialogElement>("dialog[data-wishlist-drawer]")!;
async function openDrawer() {
  await act(async () => heart().click());
  await waitFor(() => document.querySelector("dialog[data-wishlist-drawer]"));
}

test("the empty drawer is the frame's guidance card with Explore collections and no invented lists", async () => {
  await mount([], <Header />, async () => {
    await openDrawer();
    assert.equal(drawer().getAttribute("data-wishlist-state"), "empty");
    assert.equal(drawer().querySelector("h2")?.textContent, "My wishlist", "no count beside an empty wishlist");
    await waitFor(() => drawer().querySelector("[data-wishlist-empty]"));
    const empty = drawer().querySelector("[data-wishlist-empty]")!;
    assert.equal(empty.querySelector("h3")?.textContent, "Your next favourite is waiting.");
    assert.match(empty.textContent!, /Save the pieces you love and return to them whenever inspiration strikes\./);
    const explore = empty.querySelector<HTMLAnchorElement>('a[href="/collections/all"]')!;
    assert.equal(explore.textContent, "Explore collections →");
    assert.match(drawer().textContent!, /Saved furniture stays in this browser\./);
    assert.equal(drawer().querySelector("a[data-wishlist-view]"), null);
    assert.doesNotMatch(drawer().textContent!, absent);
  });
});

test("saved pieces are rows with price, an availability enquiry and a Remove link, then View wishlist", async () => {
  await mount(["alpha", "bravo"], <Header />, async () => {
    await openDrawer();
    assert.equal(drawer().getAttribute("data-wishlist-state"), "saved");
    assert.equal(drawer().querySelector("h2")?.textContent, "My wishlist (2)");
    await waitFor(() => drawer().querySelectorAll("[data-wishlist-item]").length === 2 || null);
    const row = drawer().querySelector("[data-wishlist-item]")!;
    assert.equal(row.querySelector("[data-wishlist-item-name]")?.textContent, "alpha Chair");
    assert.equal(row.querySelector("[data-wishlist-item-price]")?.textContent, "Rs. 1,234.00");
    const enquire = row.querySelector<HTMLAnchorElement>("a[data-wishlist-availability]")!;
    assert.equal(enquire.textContent, "Check availability");
    assert.equal(enquire.getAttribute("href"), "/pages/contact?product=alpha%20Chair");
    const remove = row.querySelector<HTMLButtonElement>("button[data-remove-saved]")!;
    assert.equal(remove.textContent, "Remove");
    assert.equal(remove.getAttribute("aria-label"), "Remove alpha Chair from wishlist");
    const view = drawer().querySelector<HTMLAnchorElement>("a[data-wishlist-view]")!;
    assert.equal(view.getAttribute("href"), "/favourites");
    assert.equal(view.textContent, "View wishlist →");
    assert.match(drawer().textContent!, /Keep all your favourites together\./);
    assert.doesNotMatch(drawer().textContent!, absent);
    remove.focus();
    await act(async () => remove.click());
    assert.equal(localStorage.getItem("maple-favourites"), '["bravo"]');
    assert.equal(drawer().querySelector("h2")?.textContent, "My wishlist (1)");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Remove bravo Chair from wishlist", "focus moves to the next Remove");
  });
});

test("the drawer still mounts only on first open", async () => {
  await mount(["alpha"], <Header />, async () => {
    assert.equal(document.querySelector("dialog[data-wishlist-drawer]"), null);
    await openDrawer();
    assert.ok(drawer().hasAttribute("open"));
  });
});

test("a renamed product address is followed in the drawer and the saved list keeps the new handle", async () => {
  // The catalogue answers an old address by redirecting to the product's current one.
  const renamed = (handle: string) => {
    const response = Response.json({ product: cardFixture("alpha"), published: true });
    if (handle !== "old-alpha") return response;
    Object.defineProperties(response, { redirected: { value: true }, url: { value: "http://localhost:3000/api/catalogue/cards/alpha" } });
    return response;
  };
  await mount(["old-alpha"], <Header />, async () => {
    await openDrawer();
    await waitFor(() => drawer().querySelector("[data-wishlist-item]"));
    assert.equal(drawer().querySelector("[data-wishlist-item-name]")?.getAttribute("href"), "/products/alpha");
    assert.equal(localStorage.getItem("maple-favourites"), '["alpha"]');
  }, renamed);
});

test("the account menu is the frame's dropdown with only what works without sign-in", async () => {
  await mount(["alpha", "bravo"], <Header />, async () => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Your account"]')!;
    await act(async () => button.click());
    const menu = document.querySelector<HTMLElement>("[data-account-menu]")!;
    assert.equal(menu.querySelector("h2")?.textContent, "Your account");
    assert.match(menu.querySelector("[data-account-note]")?.textContent ?? "", /Sign-in arrives with online checkout/);
    const entries = [...menu.querySelectorAll<HTMLAnchorElement>("a[data-account-entry]")];
    assert.deepEqual(entries.map((entry) => entry.getAttribute("href")), ["/favourites", "/pages/contact"]);
    assert.equal(entries[0]!.querySelector("[data-account-entry-title]")?.textContent, "Wishlist");
    assert.match(entries[0]!.textContent!, /Return to saved pieces/);
    assert.equal(entries[0]!.querySelector("[data-account-saved-count]")?.textContent, "2");
    assert.equal(entries[1]!.querySelector("[data-account-entry-title]")?.textContent, "Help Center");
    const more = menu.querySelector<HTMLAnchorElement>('a[data-account-more][href="/account"]')!;
    assert.equal(more.textContent, "How accounts work today");
    assert.doesNotMatch(menu.textContent!, absent);
  });
});

test("/favourites names the wishlist, counts pieces after hydration and shows the guidance card when empty", async () => {
  const server = new JSDOM(renderToStaticMarkup(<ShopProvider><FavouritesPage /></ShopProvider>)).window.document;
  assert.equal(server.querySelector("[data-saved-count]")?.textContent, "", "no count before the browser reads the saved list");
  await mount(["alpha", "bravo"], <FavouritesPage />, async () => {
    const page = document.querySelector("[data-favourites-page]")!;
    assert.equal(page.querySelector("[data-section-eyebrow]")?.textContent, "Saved furniture");
    assert.equal(page.querySelector("h1")?.textContent, "My wishlist");
    assert.equal(page.querySelector("[data-saved-count]")?.textContent, "2 pieces");
    await waitFor(() => page.querySelectorAll("[data-saved-grid] [data-product-card]").length === 2 || null);
  });
  await mount([], <FavouritesPage />, async () => {
    const empty = document.querySelector("[data-wishlist-empty]")!;
    assert.equal(empty.querySelector("h2")?.textContent, "Your next favourite is waiting.");
    assert.equal(empty.querySelector('a[href="/collections/all"]')?.textContent, "Explore collections →");
    assert.doesNotMatch(document.body.textContent!, absent);
  });
});

test("/account is titled Your account and lists only real routes, with a blank count before hydration", async () => {
  const server = new JSDOM(renderToStaticMarkup(<ShopProvider><AccountOverview /></ShopProvider>)).window.document;
  assert.equal(server.querySelector("[data-account-saved-count]")?.textContent, "");
  await mount(["alpha"], <AccountOverview />, async () => {
    const page = document.querySelector("[data-account-page]")!;
    assert.equal(page.querySelector("h1")?.textContent, "Your account");
    assert.match(page.querySelector("[data-account-note]")?.textContent ?? "", /Sign-in arrives with online checkout/);
    const entries = [...page.querySelectorAll<HTMLAnchorElement>("a[data-account-entry]")];
    assert.deepEqual(entries.map((entry) => entry.getAttribute("href")), [
      "/favourites",
      "/pages/contact?product=Order%20support",
      "/pages/contact?product=Account%20support",
    ]);
    assert.deepEqual(entries.map((entry) => entry.querySelector("[data-account-entry-title]")?.textContent), ["Wishlist", "Help with an order", "Update your details"]);
    assert.equal(entries[0]!.querySelector("[data-account-saved-count]")?.textContent, "1");
    assert.doesNotMatch(page.textContent!, absent);
  });
});
