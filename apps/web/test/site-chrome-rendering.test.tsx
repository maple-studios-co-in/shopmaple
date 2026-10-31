import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StoreChromeView } from "../components/admin/store-chrome";
import { MobileNavigation } from "../components/store/mobile-navigation";
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
    doc.querySelector("[data-announcement]")?.textContent,
    "LUXURY FURNITURE. FACTORY PRICES.",
  );
  assert.deepEqual(
    [...doc.querySelectorAll("[data-desktop-nav] > *")].map((e) => e.textContent),
    ["Living Room", "Bedroom", "Storage", "Outdoors", "Contact"],
  );
  assert.equal(
    doc.querySelector("[data-footer-care] a")?.getAttribute("href"),
    "tel:+918796130252",
  );
  assert.ok(
    doc.querySelector('[data-footer-contact] a[href="tel:+919262968727"]'),
  );
  assert.equal(
    doc.querySelector("[data-whatsapp]")?.getAttribute("href"),
    "https://wa.me/918796130252",
  );
});
test("published chrome overrides text, targets, ordering and visibility across public surfaces", () => {
  const doc = render(customChrome());
  assert.equal(
    doc.querySelector("[data-announcement] a")?.textContent,
    "Visit our new showroom",
  );
  assert.equal(
    doc.querySelector("[data-announcement] a")?.getAttribute("href"),
    "/pages/our-story",
  );
  assert.deepEqual(
    [...doc.querySelectorAll("[data-utility-links] a")].map((e) => e.textContent),
    ["Ask our team"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll("[data-desktop-nav] > *")].map((e) => e.textContent),
    ["Lounge"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll("[data-footer-main] h2")].map(
      (e) => e.textContent,
    ),
    ["Talk to us", "Explore Maple"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll("[data-footer-contact] h3")].map(
      (e) => e.textContent,
    ),
    ["Customer enquiries", "Business enquiries"],
  );
  assert.match(
    doc.querySelector("[data-footer-care]")!.textContent!,
    /New showroom.*Delhi/,
  );
  assert.ok(doc.querySelector('a[href="tel:+919876543210"]'));
  assert.ok(doc.querySelector('a[href="mailto:business@example.com"]'));
  assert.equal(
    doc.querySelector("[data-footer-bottom] nav a")?.textContent,
    "Your privacy",
  );
  assert.match(
    doc.querySelector("[data-footer-bottom]")!.textContent!,
    /Maple Studio/,
  );
  assert.equal(doc.querySelector('a[href*="instagram.com"]'), null);
  assert.equal(
    doc.querySelector("[data-whatsapp]")?.getAttribute("href"),
    "https://wa.me/919876543212",
  );
  assert.equal(
    doc.querySelector("[data-whatsapp]")?.getAttribute("aria-label"),
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
    "[data-announcement]",
    "[data-whatsapp]",
    'nav[aria-label="About Maple"]',
    'nav[aria-label="Store policies"]',
    'nav[aria-label="More from Maple"]',
    "[data-utility-links]",
  ])
    assert.equal(doc.querySelector(selector), null, selector);
});
test("published overrides stay isolated from staff routes", () => {
  const doc = render(customChrome(), "/admin/content");
  assert.equal(doc.querySelector("header,footer,[data-whatsapp]"), null);
  assert.equal(doc.querySelector("main h1")?.textContent, "Page");
});
test("the chrome is rebuilt on utilities: no legacy class names remain and every root opts into the scoped base", () => {
  // The announcement, header, navigation, footer and WhatsApp button moved off hand-written CSS
  // with no visual change; the rules that styled these names were deleted. (`data-site-header` is
  // the hook the stylesheet's base uses to hide scrollbars on public routes.)
  const legacy = new Set([
    "skip-link", "announcement", "header-main", "utility-links", "icon-button", "mobile-menu-button",
    "brand", "header-actions", "count", "desktop-nav", "maple-desktop-nav", "maple-menu-trigger-wrap",
    "maple-menu-trigger", "maple-menu-link", "maple-menu-parent", "maple-mobile-drawer", "maple-drawer-toolbar",
    "maple-drawer-back", "maple-drawer-close", "maple-drawer-scroll", "maple-drawer-main", "maple-drawer-submenu",
    "maple-drawer-group", "maple-drawer-quick-links", "maple-menu-products", "maple-menu-product",
    "maple-footer", "maple-footer-main", "maple-footer-logo", "maple-footer-care", "maple-footer-contact",
    "maple-footer-bottom", "maple-footer-policies", "whatsapp-support", "favourite-link", "account-button", "site-header",
  ]);
  const doc = render();
  const found = [...doc.querySelectorAll("[class]")].flatMap((element) => [...element.classList]).filter((name) => legacy.has(name));
  assert.deepEqual(found, []);
  for (const selector of ['a[href="#main"]', "[data-announcement]", "header", "footer", "[data-whatsapp]"])
    assert.ok(doc.querySelector(selector)?.closest("[data-store]"), `${selector} sits inside [data-store]`);
  // The mobile drawer loads on demand, so it is rendered on its own here.
  const drawer = new JSDOM(renderToStaticMarkup(<ShopProvider><MobileNavigation open={false} onClose={() => {}} /></ShopProvider>)).window.document;
  assert.ok(drawer.querySelector("#maple-mobile-navigation")?.closest("[data-store]"), "#maple-mobile-navigation sits inside [data-store]");
  assert.deepEqual([...drawer.querySelectorAll("[class]")].flatMap((element) => [...element.classList]).filter((name) => legacy.has(name)), []);
  assert.ok(doc.querySelector("header[data-site-header]"));
});
