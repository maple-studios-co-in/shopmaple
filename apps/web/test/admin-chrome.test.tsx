import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StoreChromeView } from "../components/admin/store-chrome";
import { ShopProvider } from "../components/shop-provider";
function render(path: string) {
  const html = renderToStaticMarkup(
    <ShopProvider>
      <StoreChromeView path={path}>
        <h1>Current page</h1>
      </StoreChromeView>
    </ShopProvider>,
  );
  return new JSDOM(html).window.document;
}
test("admin and nested admin pages render their content without customer shopping chrome", () => {
  for (const path of ["/admin", "/admin/content"]) {
    const document = render(path);
    assert.equal(
      document.querySelector("main h1")?.textContent,
      "Current page",
    );
    assert.ok(
      !document.querySelector('[aria-label="Open cart (0 items)"]'),
      "Staff editor must not render the customer cart",
    );
    assert.ok(
      !document.querySelector(
        '[aria-label="Chat with Maple Furnishers on WhatsApp"]',
      ),
    );
    assert.ok(!document.querySelector('nav[aria-label="Help and policies"]'));
    assert.ok(!document.querySelector('[aria-label="Preview status"]'));
    assert.ok(!document.querySelector('[aria-label="Open navigation"]'));
  }
});
test("storefront and admin-like public slugs preserve real shopping navigation and support", () => {
  for (const path of ["/", "/pages/care-guide", "/administrator"]) {
    const document = render(path);
    assert.ok(document.querySelector('[aria-label="Open cart (0 items)"]'));
    assert.ok(
      document.querySelector(
        '[aria-label="Chat with Maple Furnishers on WhatsApp"]',
      ),
    );
    assert.ok(document.querySelector('nav[aria-label="Help and policies"]'));
    assert.ok(document.querySelector('[aria-label="Preview status"]'));
    assert.equal(document.querySelectorAll("main").length, 1);
    assert.equal(
      document.querySelector("main h1")?.textContent,
      "Current page",
    );
  }
});
