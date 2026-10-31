import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StoreChromeView } from "../components/admin/store-chrome";
import { ShopProvider } from "../components/shop-provider";
import { SectionHeading } from "../components/store/section-heading";
import { PromiseSection } from "../components/store/promise-strip";
import { ProductCard } from "../components/store/product-card";
import { customChrome } from "./support/site-chrome-fixture";
import type { ProductCardModel } from "../lib/product-card-model";

/*
 * The shared storefront chrome from the "Maple / PDF Review / UI Components" Figma frame
 * (file nTEPXzov9IuWraGF0Ace6V, node 1046:3): announcement, main navigation, footer, section
 * heading, the promise section and the card surfaces.
 */
const render = (siteChrome?: ReturnType<typeof customChrome>) =>
  new JSDOM(
    renderToStaticMarkup(
      <ShopProvider>
        <StoreChromeView path="/" siteChrome={siteChrome}>
          <h1>Page</h1>
        </StoreChromeView>
      </ShopProvider>,
    ),
  ).window.document;
const doc = (element: React.ReactElement) => new JSDOM(renderToStaticMarkup(element)).window.document;
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

test("the announcement pairs the published message with the design's craft line", () => {
  const page = render();
  const bar = page.querySelector("[data-announcement]");
  assert.equal(text(bar?.querySelector("a")), "LUXURY FURNITURE. FACTORY PRICES.");
  assert.equal(text(bar?.querySelector("[data-announcement-detail]")), "CRAFTED IN DELHI · DELIVERY ACROSS INDIA");
  // The detail line is decoration beside the message; the link stays the published one.
  assert.equal(bar?.querySelectorAll("a").length, 1);
});

test("the main navigation is one row: logo, menu, a search field, then account, saved and bag", () => {
  const page = render();
  const row = page.querySelector("[data-header-main]")!;
  const order = [...row.querySelectorAll("[data-brand], [data-desktop-nav], [data-header-search], [data-header-actions]")].map(
    (element) => [...element.attributes].find((attribute) => attribute.name.startsWith("data-"))!.name,
  );
  assert.deepEqual(order, ["data-brand", "data-desktop-nav", "data-header-search", "data-header-actions"]);
  const search = row.querySelector("[data-header-search]")!;
  assert.equal(search.tagName, "BUTTON");
  assert.equal(search.getAttribute("aria-label"), "Search furniture");
  assert.equal(text(search), "Search furniture…");
  assert.deepEqual(
    [...row.querySelectorAll("[data-desktop-nav] > *")].map((element) => element.textContent),
    ["Living Room", "Bedroom", "Storage", "Outdoors", "Contact"],
  );
  assert.equal(row.querySelector("[data-brand] img")?.getAttribute("alt"), "Maple Furnishers");
  assert.equal(row.querySelector("[data-brand]")?.getAttribute("href"), "/");
  // The design's row has no separate utility links.
  assert.equal(page.querySelector("[data-utility-links]"), null);
});

test("the footer follows the design: brand story, published columns, a contact band and one legal line", () => {
  const page = render();
  const footer = page.querySelector("footer")!;
  assert.equal(text(footer.querySelector("[data-footer-story] p")), "Thoughtfully designed furniture for spaces that feel like home.");
  assert.deepEqual([...footer.querySelectorAll("[data-footer-main] h2")].map(text), ["SHOP", "HELP", "CUSTOMER CARE"]);
  const care = footer.querySelector("[data-footer-care]")!;
  assert.deepEqual(
    [...care.querySelectorAll("a")].map((link) => [link.getAttribute("href"), text(link)]),
    [["tel:+918796130252", "+91 87961 30252"], ["mailto:contact@maplefurnishers.com", "contact@maplefurnishers.com"]],
  );
  assert.deepEqual([...care.querySelectorAll("address > *")].map(text), ["A-2/56 - 57, W.H.S, Kirti Nagar,", "New Delhi, Delhi, 110015"]);
  const band = footer.querySelector("[data-footer-contact]")!;
  assert.equal(text(band.querySelector("h2")), "Let’s Build Something Lasting");
  assert.match(text(band)!, /Bulk enquiries · \+91 92629 68727 · aditya@maplefurnishers\.com/);
  assert.ok(band.querySelector('a[href="tel:+919262968727"]'));
  assert.ok(band.querySelector('a[href="mailto:aditya@maplefurnishers.com"]'));
  const legal = footer.querySelector("[data-footer-bottom]")!;
  assert.equal(legal.querySelector("details"), null, "the policies sit in the legal line, not behind a disclosure");
  assert.match(text(legal)!, new RegExp(`© ${new Date().getFullYear()} Maple Furnishers`));
  assert.deepEqual(
    [...legal.querySelectorAll('nav[aria-label="Store policies"] a')].map((link) => link.getAttribute("href")),
    ["/policies/privacy-policy", "/policies/terms-of-service", "/policies/shipping-policy", "/policies/refund-policy"],
  );
  assert.ok(legal.querySelector('a[href*="instagram.com"]'));
});

test("the footer keeps the editors' column order and toggles, and drops the band's bulk line when bulk is off", () => {
  const chrome = customChrome();
  const page = render(chrome);
  assert.deepEqual([...page.querySelectorAll("[data-footer-main] h2")].map(text), ["Talk to us", "Explore Maple"]);
  assert.match(text(page.querySelector("[data-footer-contact]"))!, /Bulk enquiries/);
  chrome.footer.contactColumns = chrome.footer.contactColumns.map((column) => ({ ...column, enabled: column.key !== "bulk" }));
  const withoutBulk = render(chrome);
  assert.doesNotMatch(text(withoutBulk.querySelector("[data-footer-contact]"))!, /Bulk enquiries/);
  assert.ok(withoutBulk.querySelector("[data-footer-contact] h2"), "the closing line stays");
});

test("a section heading pairs an eyebrow with a serif title at the requested level", () => {
  const heading = doc(<SectionHeading eyebrow="Our promise" title="Every piece. Every time." id="promise" level={3} />);
  const eyebrow = heading.querySelector("[data-section-eyebrow]");
  assert.equal(text(eyebrow), "Our promise");
  assert.equal(heading.querySelector("h3")?.id, "promise");
  assert.equal(text(heading.querySelector("h3")), "Every piece. Every time.");
});

test("the promise section labels its four promises with the design's heading", () => {
  const section = doc(<PromiseSection />).querySelector("section[data-promise-section]")!;
  assert.equal(section.getAttribute("aria-labelledby"), section.querySelector("h2")?.id);
  assert.equal(text(section.querySelector("[data-section-eyebrow]")), "Our promise");
  assert.equal(text(section.querySelector("h2")), "Every piece. Every time.");
  assert.deepEqual([...section.querySelectorAll("[data-promise-strip] strong")].map(text), [
    "Fully customisable", "Crafted in Delhi", "36-month warranty", "Delivery across India",
  ]);
});

const product: ProductCardModel = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", image: null, pricePaise: 2_360_000, compareAtPaise: 2_714_000,
  priceFrom: false, category: null, optionNames: [], optionCount: 1, otherOptionsOnRequest: false,
};

test("product cards come in the design's two surfaces: outlined on white (243) and plain (246)", () => {
  const outlined = doc(<ShopProvider><ProductCard product={product} /></ShopProvider>).querySelector("[data-product-card]");
  const plain = doc(<ShopProvider><ProductCard product={product} surface="plain" /></ShopProvider>).querySelector("[data-product-card]");
  assert.equal(outlined?.getAttribute("data-card-surface"), "outlined");
  assert.equal(plain?.getAttribute("data-card-surface"), "plain");
  assert.equal(text(plain?.querySelector("[data-card-name]")), "Aero Dining Chair");
});
