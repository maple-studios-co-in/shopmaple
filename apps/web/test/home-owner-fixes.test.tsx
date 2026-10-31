import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";

// The owner's homepage review of 1 November 2026: Instagram account, the Bestsellers row and link underlines.
async function renderHome() {
  const content = structuredClone(defaultStorefrontContent);
  content.homeSections = ["instagram", "bestsellers", "chairs"].map((key) => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, autoplayTicker: false, revealSections: false };
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/content/storefront")) return Response.json({ version: 7, content });
    if (new URL(url).pathname === "/api/catalogue/cards") return Response.json({ published: true,
      products: new URL(url).searchParams.get("handles")!.split(",").map((handle) => ({
        id: handle, handle, title: `Card ${handle}`, image: null,
        pricePaise: 2360000, compareAtPaise: null, priceFrom: false, otherOptionsOnRequest: false, optionCount: 1,
      })),
    });
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally { globalThis.fetch = previous; }
}

// The account the main Maple site links to (MapleFurnishersRevamp's social rail).
const instagram = "https://www.instagram.com/maplefurnishers/";

test("Instagram points at the maplefurnishers account, in the footer defaults and on the homepage", async () => {
  assert.equal(defaultSiteChrome.footer.instagram, instagram);
  const doc = await renderHome();
  const link = doc.querySelector<HTMLAnchorElement>("[data-home-social] a[href*='instagram.com']");
  assert.equal(link?.getAttribute("href"), instagram);
  assert.equal(link?.textContent?.trim(), "@maplefurnishers");
  assert.equal(doc.body.innerHTML.includes("the_maple_experience"), false, "The older account is gone from the page");
});

test("the Bestsellers row has no arrow buttons or View all link, and still scrolls by touch, trackpad and keyboard", async () => {
  const doc = await renderHome();
  const bestsellers = doc.querySelector('[data-home-section="bestsellers"] [data-home-products]')!;
  assert.equal(bestsellers.querySelectorAll('button[aria-label^="Previous"], button[aria-label^="Next"], [data-carousel-controls]').length, 0, "No arrow buttons");
  assert.equal(bestsellers.querySelector("[data-rail-cta]"), null, "No View all link");
  const rail = bestsellers.querySelector("[data-carousel-rail]")!;
  assert.equal(rail.getAttribute("tabindex"), "0", "Keyboard users can scroll the row");
  assert.equal(rail.getAttribute("aria-label"), "Bestsellers");
  assert.ok(rail.querySelector("[data-product-card]"));
  const chairs = doc.querySelector('[data-home-section="chairs"] [data-home-products]')!;
  assert.ok(chairs.querySelector('button[aria-label="Next Chair collection"]'), "The chairs row keeps its arrows");
  assert.ok(chairs.querySelector("[data-rail-cta]"), "and its View all link");
});

// Link underlines: one rule after the utilities removes them from storefront links, whatever utility a
// component carries; running text (product details, policy, article and page bodies) keeps its own.
const web = new URL("..", import.meta.url).pathname;
const css = postcss.parse((await postcss([tailwind({ base: web })]).process(readFileSync(web + "styles/tailwind.css", "utf8"), { from: web + "styles/tailwind.css" })).css);
const rules: { selector: string; index: number; decls: Record<string, string> }[] = [];
css.walkRules((rule) => {
  const decls: Record<string, string> = {};
  rule.walkDecls((decl) => { decls[decl.prop] = decl.value; });
  rules.push({ selector: rule.selector, index: rules.length, decls });
});

/** CSS specificity as [ids, classes, types], with :where() weightless and :is()/:not()/:has() taking their heaviest argument. */
function specificity(selector: string): [number, number, number] {
  const max = (list: string) => splitTop(list).map(specificity).reduce((a, b) => compare(a, b) >= 0 ? a : b, [0, 0, 0] as [number, number, number]);
  let ids = 0, classes = 0, types = 0;
  for (let i = 0; i < selector.length;) {
    const ch = selector[i]!;
    if (ch === "\\") { i += 2; continue; }
    if (ch === "#") { ids++; i = skipName(selector, i + 1); continue; }
    if (ch === ".") { classes++; i = skipName(selector, i + 1); continue; }
    if (ch === "[") { classes++; i = closing(selector, i, "[", "]") + 1; continue; }
    if (ch === ":") {
      if (selector[i + 1] === ":") { types++; i = skipName(selector, i + 2); continue; }
      const end = skipName(selector, i + 1), name = selector.slice(i + 1, end);
      if (selector[end] === "(") {
        const close = closing(selector, end, "(", ")"), inner = selector.slice(end + 1, close);
        if (name !== "where") {
          const [a, b, c] = ["is", "not", "has"].includes(name) ? max(inner) : [0, 1, 0];
          ids += a; classes += b; types += c;
        }
        i = close + 1; continue;
      }
      classes++; i = end; continue;
    }
    if (/[a-zA-Z]/.test(ch)) { types++; i = skipName(selector, i); continue; }
    i++;
  }
  return [ids, classes, types];
}
function skipName(s: string, i: number) { while (i < s.length && (/[\w-]/.test(s[i]!) || s[i] === "\\")) i += s[i] === "\\" ? 2 : 1; return i; }
function closing(s: string, i: number, open: string, close: string) { let depth = 0; for (; i < s.length; i++) { if (s[i] === "\\") { i++; continue; } if (s[i] === open) depth++; else if (s[i] === close && --depth === 0) return i; } return s.length; }
function splitTop(list: string) { const out: string[] = []; let depth = 0, start = 0; for (let i = 0; i < list.length; i++) { if (list[i] === "\\") { i++; continue; } if ("([".includes(list[i]!)) depth++; else if (")]".includes(list[i]!)) depth--; else if (list[i] === "," && depth === 0) { out.push(list.slice(start, i)); start = i + 1; } } out.push(list.slice(start)); return out.map((part) => part.trim()); }
function compare(a: number[], b: number[]) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!; return 0; }

test("storefront links show no underline, whatever utility a component gives them", () => {
  const override = rules.find((rule) => rule.decls["text-decoration-line"] === "none" && rule.selector.startsWith("[data-store]"));
  assert.ok(override, "One rule clears link underlines across the storefront");
  const underlines = rules.filter((rule) => rule.decls["text-decoration-line"] === "underline");
  assert.ok(underlines.length > 0);
  for (const rule of underlines) for (const selector of splitTop(rule.selector)) {
    const order = compare(specificity(override.selector), specificity(selector));
    assert.ok(order > 0 || (order === 0 && override.index > rule.index), `${override.selector} outweighs ${selector}`);
  }
  const { document } = new JSDOM(`<main data-store>
    <a id="nav" href="/">Shop</a><a href="/x"><span id="part">Explore</span></a>
    <a href="/products/x">Rs. 20,000 <del id="was">Rs. 25,000</del><s id="struck">old</s></a>
    <div data-prose><a id="product" href="/care">care guide</a></div>
    <article data-policy-body><a id="policy" href="/p">policy</a></article>
    <article data-article-body><a id="article" href="/a">article</a></article>
    <div data-content-copy><a id="page" href="/c">page</a></div>
  </main><a id="outside" href="/">admin</a>`).window;
  const clears = (id: string) => document.getElementById(id)!.matches(override.selector);
  assert.ok(clears("nav") && clears("part"), "Links and the text inside them lose their underline");
  for (const id of ["product", "policy", "article", "page"]) assert.equal(clears(id), false, `inline links in running text (${id}) keep theirs`);
  assert.equal(clears("outside"), false, "Pages outside the storefront are untouched");
  assert.equal(clears("was") || clears("struck"), false, "A struck-through old price inside a product link keeps its line");
});
