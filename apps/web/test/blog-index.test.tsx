import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import BlogPage from "../app/blogs/[blog]/page";
import source from "../data/store-content.json";

async function render(blog = "recent-stories") {
  return new JSDOM(renderToStaticMarkup(await BlogPage({ params: Promise.resolve({ blog }) }))).window.document;
}
function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

test("blog index keeps article discovery internal and empty blogs truthful", async () => {
  const document = await render();
  assert.equal(document.querySelector("h1")?.textContent, "Recent Stories");
  assert.equal(document.querySelectorAll("article").length, 10);
  for (const link of document.querySelectorAll<HTMLAnchorElement>("article a")) {
    assert.match(link.getAttribute("href")!, /^\/blogs\/recent-stories\/[a-z0-9-]+$/);
  }
  const empty = await render("news");
  assert.match(empty.body.textContent!, /No articles published yet\./);
  assert.equal(empty.querySelectorAll("article").length, 0);
});

test("recent stories lists newest publications first without reordering imported article data", async () => {
  const before = source.blogs.find((blog) => blog.handle === "recent-stories")!.articles.map((article) => article.handle);
  const document = await render();
  assert.deepEqual([...document.querySelectorAll("article h2 a")].map((link) => link.getAttribute("href")), [
    "/blogs/recent-stories/how-to-measure-furniture-before-ordering-online",
    "/blogs/recent-stories/what-should-be-finalised-first-furniture-flooring-or-lighting",
    "/blogs/recent-stories/furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door",
    "/blogs/recent-stories/best-wood-for-furniture-in-indian-climate-humidity-heat-and-maintenance",
    "/blogs/recent-stories/standard-dining-table-size-guide-for-indian-homes",
    "/blogs/recent-stories/why-every-successful-cafe-has-three-types-of-seating",
    "/blogs/recent-stories/how-luxury-hotels-design-seating-that-makes-guests-stay-longer",
    "/blogs/recent-stories/luxury-furniture-trends-2026-what-defined-the-first-half-of-the-year-and-what-will-shape-the-months-ahead",
    "/blogs/recent-stories/how-to-identify-quality-furniture-before-you-buy",
    "/blogs/recent-stories/space-saving-furniture-ideas-for-small-homes",
  ]);
  assert.deepEqual(source.blogs.find((blog) => blog.handle === "recent-stories")!.articles.map((article) => article.handle), before);
});

test("index presents the original excerpt and a named local read action for each article", async () => {
  const document = await render();
  const cards = [...document.querySelectorAll("article")];
  const measure = cards.find((card) => card.querySelector("h2")?.textContent === "How to Measure Furniture Before Ordering Online")!;
  assert.equal(normalize(measure.querySelector("p")?.textContent), "A furniture piece can look perfectly sized on a website and still feel completely wrong once it arrives. The most common mistake is checking whether the furniture fits the room,...");
  const quality = cards.find((card) => card.querySelector("h2")?.textContent === "How to Identify Quality Furniture Before You Buy")!;
  assert.equal(normalize(quality.querySelector("p")?.textContent), "Quality isn't always obvious at first glance — and that's exactly what furniture sellers count on.Buying furniture isn't something most people do often, which is why it's important to choose...");
  for (const card of cards) {
    assert.ok(normalize(card.querySelector("p")?.textContent).length > 30, "every imported article has its verified source excerpt");
    const action = card.querySelector<HTMLAnchorElement>('a[aria-label^="Read "]')!;
    assert.equal(action?.getAttribute("href"), card.querySelector("h2 a")?.getAttribute("href"));
    assert.equal(action?.textContent, "Read more...");
  }
});

test("index uses verified source artwork with reserved dimensions and no eager image collection", async () => {
  const document = await render();
  const images = [...document.querySelectorAll<HTMLImageElement>("article img")];
  assert.equal(images.length, 10);
  const measure = images.find((image) => image.alt === "How to Measure Furniture Before Ordering Online")!;
  assert.equal(measure?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/articles/unnamed_15.png?v=1783929571");
  assert.equal(measure?.getAttribute("width"), "482");
  assert.equal(measure?.getAttribute("height"), "322");
  assert.equal(images.filter((image) => image.getAttribute("loading") === "eager").length, 1);
  assert.equal(images.filter((image) => image.getAttribute("loading") === "lazy").length, 9);
});
