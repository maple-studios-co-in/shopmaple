import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { SiteChrome } from "@shopmaple/contracts";
import { MegaPanel } from "../components/store/mega-panel";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";
import { customChrome } from "./support/site-chrome-fixture";

/* "Maple / PDF Review / Mega-menu open" (Figma 1045:2): the menu's columns and Discover share one row of
   headed columns, every link ends in a decorative arrow, and an enquiry is an outlined action. */
function panel(siteChrome = structuredClone(defaultSiteChrome), index = 0) {
  const markup = renderToStaticMarkup(<MegaPanel item={siteChrome.navigation[index]!} siteChrome={siteChrome} onNavigate={() => {}} />);
  return new JSDOM(markup).window.document.querySelector<HTMLElement>("[data-mega]")!;
}
/** What a screen reader announces for a link: its aria-label, else its text without aria-hidden parts. */
function accessibleName(link: Element) {
  if (link.hasAttribute("aria-label")) return link.getAttribute("aria-label");
  const copy = link.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return copy.textContent?.replace(/\s+/g, " ").trim();
}

test("Discover is the last column in the panel's row, after the menu's own columns", () => {
  const grid = panel().querySelector("[data-mega-grid]")!;
  const columns = [...grid.children];
  assert.equal(columns.length, 5);
  assert.deepEqual(columns.slice(0, 4).map((column) => column.hasAttribute("data-mega-column")), [true, true, true, true]);
  assert.ok(columns[4]!.hasAttribute("data-mega-discovery"), "Discover follows the menu columns in the same row");
  assert.equal(columns[4]!.querySelector("h3")?.textContent, "Discover");
});

test("discovery links read as their label alone, without the call-to-action text", () => {
  const links = [...panel().querySelectorAll("[data-mega-discovery] a:not([data-mega-action])")];
  assert.deepEqual(links.map((link) => link.textContent?.replace(/\s+/g, " ").trim()), ["All furniture →", "Our Story →"]);
  assert.deepEqual(links.map(accessibleName), ["All furniture", "Our Story"]);
});

test("a discovery enquiry is the column's outlined action, after the plain links", () => {
  const discovery = panel().querySelector("[data-mega-discovery]")!;
  const action = discovery.querySelector<HTMLAnchorElement>("a[data-mega-action]")!;
  assert.ok(action, "the custom furniture enquiry renders as an action");
  assert.equal([...discovery.querySelectorAll("a")].at(-1), action);
  assert.equal(action.textContent?.replace(/\s+/g, " ").trim(), "Fully Customizable →");
  assert.equal(accessibleName(action), "Enquire about custom furniture");
  const url = new URL(action.getAttribute("href")!, "http://localhost");
  assert.equal(url.pathname, "/pages/contact");
  assert.equal(url.searchParams.get("product"), "Custom furniture");
});

test("each discovery enquiry becomes an action and renamed ones keep the admin's label", () => {
  const chrome: SiteChrome = customChrome();
  chrome.desktopDiscovery.push({ id: "story", label: "Read our story", href: "/pages/our-story", enabled: true, cta: "Read" });
  const discovery = panel(chrome).querySelector("[data-mega-discovery]")!;
  const plain = [...discovery.querySelectorAll("a:not([data-mega-action])")];
  const actions = [...discovery.querySelectorAll("a[data-mega-action]")];
  assert.deepEqual(plain.map(accessibleName), ["Read our story"]);
  assert.deepEqual(actions.map(accessibleName), ["Made for you"]);
});

test("menu links and the feature button keep their names; arrows are decorative", () => {
  const root = panel();
  const sofas = [...root.querySelectorAll("[data-mega-column]")][0]!;
  const names = [...sofas.querySelectorAll("a")].map(accessibleName);
  assert.equal(names[0], "Sofas");
  assert.ok(names.includes("3-Seater Sofa"));
  for (const link of root.querySelectorAll("[data-mega-column] a:not(:first-child), [data-mega-feature] a"))
    assert.equal(link.querySelector('[aria-hidden="true"]')?.textContent, "→", `${accessibleName(link)} ends in the design's arrow`);
  assert.equal(accessibleName(root.querySelector("[data-mega-feature] a")!), "Explore living room");
});

test("without enabled discovery entries the row holds only the menu's columns", () => {
  const chrome = structuredClone(defaultSiteChrome);
  chrome.desktopDiscovery.forEach((entry) => { entry.enabled = false; });
  const root = panel(chrome);
  assert.equal(root.querySelector("[data-mega-discovery]"), null);
  assert.equal(root.querySelector("[data-mega-grid]")!.children.length, 4);
});
