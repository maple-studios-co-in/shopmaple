import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StoreChromeView } from "../components/admin/store-chrome";
import { ShopProvider } from "../components/shop-provider";
import { customChrome } from "./support/site-chrome-fixture";
function render(siteChrome?: ReturnType<typeof customChrome>, path = "/") {
  return new JSDOM(
    renderToStaticMarkup(
      <ShopProvider>
        <StoreChromeView {...{ path, siteChrome }}>
          <h1>Page</h1>
        </StoreChromeView>
      </ShopProvider>,
    ),
  ).window.document;
}
test("absent published chrome retains approved contacts and original navigation", () => {
  const doc = render();
  assert.equal(
    doc.querySelector(".announcement")?.textContent,
    "LUXURY FURNITURE. FACTORY PRICES.",
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".desktop-nav > *")].map((e) => e.textContent),
    ["Living Room", "Bedroom", "Storage", "Outdoors", "Contact"],
  );
  assert.equal(
    doc.querySelector(".maple-footer-care a")?.getAttribute("href"),
    "tel:+918796130252",
  );
  assert.ok(
    doc.querySelector('.maple-footer-contact a[href="tel:+919262968727"]'),
  );
  assert.equal(
    doc.querySelector(".whatsapp-support")?.getAttribute("href"),
    "https://wa.me/918796130252",
  );
});
test("published chrome overrides text, targets, ordering and visibility across public surfaces", () => {
  const doc = render(customChrome());
  assert.equal(
    doc.querySelector(".announcement a")?.textContent,
    "Visit our new showroom",
  );
  assert.equal(
    doc.querySelector(".announcement a")?.getAttribute("href"),
    "/pages/our-story",
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".utility-links a")].map((e) => e.textContent),
    ["Ask our team"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".desktop-nav > *")].map((e) => e.textContent),
    ["Lounge"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".maple-footer-main h2")].map(
      (e) => e.textContent,
    ),
    ["Talk to us", "Explore Maple"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".maple-footer-contact h3")].map(
      (e) => e.textContent,
    ),
    ["Customer enquiries", "Business enquiries"],
  );
  assert.match(
    doc.querySelector(".maple-footer-care")!.textContent!,
    /New showroom.*Delhi/,
  );
  assert.ok(doc.querySelector('a[href="tel:+919876543210"]'));
  assert.ok(doc.querySelector('a[href="mailto:business@example.com"]'));
  assert.equal(
    doc.querySelector(".maple-footer-bottom nav a")?.textContent,
    "Your privacy",
  );
  assert.match(
    doc.querySelector(".maple-footer-bottom")!.textContent!,
    /Maple Studio/,
  );
  assert.equal(doc.querySelector('a[href*="instagram.com"]'), null);
  assert.equal(
    doc.querySelector(".whatsapp-support")?.getAttribute("href"),
    "https://wa.me/919876543212",
  );
  assert.equal(
    doc.querySelector(".whatsapp-support")?.getAttribute("aria-label"),
    "Ask Maple on WhatsApp",
  );
  assert.doesNotMatch(doc.body.textContent!, /Hidden/);
});
test("disabled and empty public lists produce no empty navigation headings or support controls", () => {
  const value = customChrome();
  value.announcement.enabled = false;
  value.whatsapp.enabled = false;
  value.footer.shopLinks.forEach((l) => (l.enabled = false));
  value.footer.policyLinks = [];
  value.utilityLinks = [];
  value.mobileQuickLinks = [];
  const doc = render(value);
  for (const selector of [
    ".announcement",
    ".whatsapp-support",
    'nav[aria-label="About Maple"]',
    'nav[aria-label="Store policies"]',
    'nav[aria-label="More from Maple"]',
    ".utility-links",
  ])
    assert.equal(doc.querySelector(selector), null, selector);
});
test("published overrides stay isolated from staff routes", () => {
  const doc = render(customChrome(), "/admin/content");
  assert.equal(doc.querySelector("header,footer,.whatsapp-support"), null);
  assert.equal(doc.querySelector("main h1")?.textContent, "Page");
});
