import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { SiteChrome } from "@shopmaple/contracts";
import { StoreChromeView } from "../components/admin/store-chrome";
import { ShopProvider } from "../components/shop-provider";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";
import { customChrome } from "./support/site-chrome-fixture";

// Blog pages open with the home page's header itself (owner, 10 Nov 2026: "the blog page header should look like
// this", a screenshot of the home page's one row): the logo, the menu with its rooms' arrows and the red Sale, then the
// shopping icons. The blog design's own two-row header (Figma 275:496) is gone.
function render(path: string, siteChrome: SiteChrome = defaultSiteChrome) {
  return new JSDOM(
    renderToStaticMarkup(
      <ShopProvider>
        <StoreChromeView path={path} siteChrome={siteChrome}>
          <h1>Page</h1>
        </StoreChromeView>
      </ShopProvider>,
    ),
  ).window.document;
}
const header = (path: string, siteChrome?: SiteChrome) => render(path, siteChrome).querySelector("header.site-header")!;
const blogPaths = ["/blogs/recent-stories", "/blogs/recent-stories/how-to-measure-furniture-before-ordering-online"];

test("a blog page's header is the home page's header, exactly", () => {
  const home = header("/").outerHTML;
  for (const path of blogPaths) assert.equal(header(path).outerHTML, home, path);
  // The same holds for a staff-published menu.
  assert.equal(header(blogPaths[1]!, customChrome()).outerHTML, header("/", customChrome()).outerHTML);
});

test("on a blog page the one row holds the logo, the full menu and the shopping icons, with no second row", () => {
  const row = header(blogPaths[1]!).querySelector(".header-main")!;
  const order = [...row.children].filter((element) => !element.classList.contains("mobile-menu-button")).map((element) => element.className.split(" ")[0]);
  assert.deepEqual(order, ["brand", "desktop-nav", "header-actions"]);
  assert.deepEqual(
    [...row.querySelectorAll(".maple-desktop-nav > *")].map((item) => item.textContent),
    ["Living Room", "Bedroom", "Storage", "Outdoors", "Collections", "Custom Furniture", "Sale"],
  );
  assert.equal(row.querySelectorAll("svg[data-menu-chevron]").length, 2, "Living Room and Bedroom open their rooms");
  assert.equal(header(blogPaths[1]!).querySelector(".header-utility, .header-menu-row, [data-glyph]"), null, "no blog-only header parts");
});
