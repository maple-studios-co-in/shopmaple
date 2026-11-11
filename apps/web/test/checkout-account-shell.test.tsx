import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteChrome } from "@shopmaple/contracts";
import { StoreChromeView } from "../components/admin/store-chrome";
import { CheckoutChrome } from "../components/store/checkout-chrome";
import { ShopProvider } from "../components/shop-provider";
import { customChrome } from "./support/site-chrome-fixture";

// The checkout and account shell (owner, 10 Nov 2026; frames 392:1255 and 394:1310): /checkout, /account and /orders get
// a minimal header and a small policies footer instead of the full site header, footer, cart drawer and Contact button.
// Each section's own layout draws it (app/checkout, app/account, app/orders), so the store chrome every page loads
// carries none of it (11 Nov 2026: a lazy copy inside the store chrome had added 440 gzip bytes to every page).
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = (kind: "checkout" | "account", siteChrome?: SiteChrome) =>
  new JSDOM(renderToStaticMarkup(<CheckoutChrome kind={kind} siteChrome={siteChrome}><h1>Page</h1></CheckoutChrome>)).window.document;
const storeChrome = (path: string) => new JSDOM(renderToStaticMarkup(
  <ShopProvider><StoreChromeView path={path}><h1>Page</h1></StoreChromeView></ShopProvider>)).window.document;

test("checkout gets the minimal header: Continue shopping, the logo home, and Secure checkout", () => {
  const doc = shell("checkout");
  assert.ok(doc.querySelector('[data-checkout-chrome="checkout"]'), "the minimal shell is drawn");
  const header = doc.querySelector("header")!;
  const back = [...header.querySelectorAll("a")].find((a) => a.textContent?.includes("Continue shopping"));
  assert.equal(back?.getAttribute("href"), "/collections/all");
  assert.equal(header.querySelector('a[aria-label="Maple Furnishers home"]')?.getAttribute("href"), "/");
  assert.equal(header.querySelector('img[alt="Maple Furnishers"]')?.getAttribute("src"), "/media/footer/maple-logo.webp");
  assert.match(header.textContent!, /Secure checkout/);
  assert.equal(doc.querySelector("main#main h1")?.textContent, "Page");
  assert.equal(doc.querySelectorAll("main").length, 1, "one main landmark");
  assert.equal(doc.querySelector(".site-header, .maple-footer, .whatsapp-support, .desktop-nav"), null, "none of the full chrome");
});

test("the shell keeps the brand bar and ends with the four policies", () => {
  const doc = shell("checkout");
  assert.equal(doc.querySelector("[data-brand-bar]")?.textContent, "LUXURY FURNITURE. FACTORY PRICES.");
  const footer = doc.querySelector("footer")!;
  assert.match(footer.textContent!, /© Maple Furnishers/);
  assert.deepEqual([...footer.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]), [
    ["Refund policy", "/policies/refund-policy"],
    ["Shipping policy", "/policies/shipping-policy"],
    ["Privacy policy", "/policies/privacy-policy"],
    ["Terms of service", "/policies/terms-of-service"],
  ]);
});

test("account pages say Your Maple account; checkout and the order status page keep Secure checkout", () => {
  assert.match(shell("account").querySelector("header")!.textContent!, /Your Maple account/);
  assert.match(shell("checkout").querySelector("header")!.textContent!, /Secure checkout/);
  // Each section's layout draws its shell with the published announcement.
  for (const [path, kind] of [["../app/account/(signed-in)/layout.tsx", "account"], ["../app/checkout/layout.tsx", "checkout"], ["../app/orders/layout.tsx", "checkout"]] as const) {
    const source = read(path);
    assert.match(source, new RegExp(`<CheckoutChrome kind="${kind}" siteChrome=\\{\\(await getPublishedContent\\(\\)\\)\\.siteChrome\\}>`), path);
  }
  // The sign-in pages (Figma 392:1652, 392:1697) are a full-screen split of their own: no shell around them.
  for (const path of ["../app/account/layout.tsx", "../app/account/(auth)/layout.tsx"]) assert.doesNotMatch(read(path), /CheckoutChrome/, path);
});

test("the brand bar follows the published announcement, and goes when it is switched off", () => {
  const custom = customChrome();
  assert.equal(shell("account", custom).querySelector("[data-brand-bar]")?.textContent, custom.announcement.text);
  custom.announcement.enabled = false;
  const off = shell("account", custom);
  assert.ok(off.querySelector("[data-checkout-chrome]"));
  assert.equal(off.querySelector("[data-brand-bar]"), null);
});

test("the store chrome leaves /checkout, /account and /orders to their own layouts, and every page's chrome carries no shell", () => {
  for (const path of ["/checkout", "/account", "/account/orders/MF-10482", "/orders/0b8e1c3a-5d2f-4a6b-9c8d-7e6f5a4b3c2d"]) {
    const doc = storeChrome(path);
    assert.equal(doc.querySelector(".site-header, .maple-footer, .whatsapp-support, main, [data-checkout-chrome]"), null, path);
    assert.equal(doc.querySelector("h1")?.textContent, "Page", path);
  }
  assert.doesNotMatch(read("../components/admin/store-chrome.tsx"), /checkout-chrome/, "the store chrome, loaded on every page, never imports the shell");
});

test("every other page keeps the full site chrome, including look-alike addresses", () => {
  for (const path of ["/", "/cart", "/accounting", "/account-help", "/checkout-guide", "/orders-and-returns", "/products/nola-accent-chair"]) {
    const doc = storeChrome(path);
    assert.ok(doc.querySelector(".site-header"), path);
    assert.ok(doc.querySelector(".maple-footer"), path);
    assert.equal(doc.querySelector("[data-checkout-chrome]"), null, path);
  }
});
