import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import ArticlePage from "../app/blogs/[blog]/[article]/page";

async function render(article = "how-to-measure-furniture-before-ordering-online", blog = "recent-stories") {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    return new JSDOM(renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ blog, article }) }))).window.document;
  } finally { globalThis.fetch = previous; }
}

test("article preserves original title, body, and local breadcrumb destinations", async () => {
  const document = await render();
  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.equal(document.querySelector("h1")?.textContent, "How to Measure Furniture Before Ordering Online");
  assert.match(document.querySelector("article")?.textContent ?? "", /A furniture piece can look perfectly sized on a website/);
  assert.deepEqual([...document.querySelectorAll("nav a")].map((link) => link.getAttribute("href")), ["/", "/blogs/recent-stories"]);
});

test("unknown article and mismatched blog return not found instead of another article", async () => {
  for (const [article, blog] of [["missing-article", "recent-stories"], ["how-to-measure-furniture-before-ordering-online", "news"], ["how-to-measure-furniture-before-ordering-online", "unknown"]]) {
    await assert.rejects(render(article, blog), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});

test("article shows its original publication date with machine-readable timestamp", async () => {
  const document = await render();
  const date = document.querySelector("time");
  assert.ok(date, "the article header must expose its publication date");
  assert.equal(date.getAttribute("datetime"), "2026-07-13T07:57:33Z");
  assert.equal(date.textContent, "July 13, 2026");
  const lateUtc = await render("space-saving-furniture-ideas-for-small-homes");
  assert.equal(lateUtc.querySelector("time")?.getAttribute("datetime"), "2026-06-05T20:56:16Z");
  assert.equal(lateUtc.querySelector("time")?.textContent, "June 6, 2026");
});

test("article hero uses its own source artwork before the body with reserved natural dimensions", async () => {
  for (const [handle, image, width, height] of [
    ["how-to-measure-furniture-before-ordering-online", "unnamed_15.png?v=1783929571", "482", "322"],
    ["space-saving-furniture-ideas-for-small-homes", "image1_e2fafe60-2493-483b-8f0f-05563168be25.png?v=1780903153", "1536", "1024"],
  ]) {
    const document = await render(handle);
    const hero = document.querySelector<HTMLImageElement>("section > img");
    assert.ok(hero, "the article must show its featured image before the body");
    assert.equal(hero.getAttribute("src"), `https://shop.maplefurnishers.com/cdn/shop/articles/${image}`);
    assert.equal(hero.getAttribute("width"), width);
    assert.equal(hero.getAttribute("height"), height);
    assert.equal(hero.alt, document.querySelector("h1")?.textContent);
    assert.equal(hero.getAttribute("loading"), "eager");
    assert.equal(hero.getAttribute("fetchPriority"), "high");
    assert.ok(hero.compareDocumentPosition(document.querySelector("article")!) & 4, "featured image precedes article content");
  }
});

test("featured image supplements existing article body images without duplicating or removing them", async () => {
  const document = await render("standard-dining-table-size-guide-for-indian-homes");
  assert.equal(document.querySelectorAll("section > img").length, 1);
  assert.equal(document.querySelectorAll("article img").length, 1);
});
