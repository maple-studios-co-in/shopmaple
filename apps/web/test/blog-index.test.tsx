import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import BlogPage from "../app/blogs/[blog]/page";
import source from "../data/store-content.json";
import index from "../data/blog-index.json";
import { defaultHomeMerchandising } from "../lib/home-merchandising-defaults";
import { blogFetch, normalize, renderBlogPage } from "./support/blog-fixtures";

// The blog listing as Figma 268:4185 draws it (owner, 10 Nov 2026): the title, a slider of the newest stories, two
// columns of cards with Load more, then Shop Bestsellers.
const newest = [
  "how-to-measure-furniture-before-ordering-online",
  "what-should-be-finalised-first-furniture-flooring-or-lighting",
  "furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door",
  "best-wood-for-furniture-in-indian-climate-humidity-heat-and-maintenance",
  "standard-dining-table-size-guide-for-indian-homes",
  "why-every-successful-cafe-has-three-types-of-seating",
  "how-luxury-hotels-design-seating-that-makes-guests-stay-longer",
  "luxury-furniture-trends-2026-what-defined-the-first-half-of-the-year-and-what-will-shape-the-months-ahead",
  "how-to-identify-quality-furniture-before-you-buy",
  "space-saving-furniture-ideas-for-small-homes",
];
const href = (handle: string) => `/blogs/recent-stories/${handle}`;
// Four imported articles sign off with their author; the store signs the rest.
const signedBy: Record<string, string> = {
  "how-to-measure-furniture-before-ordering-online": "Rezaa Modasiya",
  "furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door": "Rezaa Modasiya",
  "luxury-furniture-trends-2026-what-defined-the-first-half-of-the-year-and-what-will-shape-the-months-ahead": "Rezaa Modasiya",
  "space-saving-furniture-ideas-for-small-homes": "Abhigna Ghosh",
};
const authorOf = (handle: string) => signedBy[handle] ?? "Maple Furnishers";
const presentation = (index as Record<string, Record<string, { excerpt: string; image: { src: string; width: number; height: number } }>>)["recent-stories"]!;
let api = 0;
const render = async (blog = "recent-stories") =>
  renderBlogPage(await BlogPage({ params: Promise.resolve({ blog }) }), blogFetch(), `http://blog-index-${++api}.invalid`);

test("the listing opens with its title and a slider of the three newest stories", async () => {
  const document = await render();
  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.equal(document.querySelector("h1")?.textContent, "Recent Stories");
  const slider = document.querySelector("[data-blog-featured]")!;
  assert.equal(slider.getAttribute("role"), "group");
  assert.equal(slider.getAttribute("aria-roledescription"), "carousel");
  const slides = [...slider.querySelectorAll("article[data-blog-slide]")];
  assert.deepEqual(slides.map((slide) => slide.querySelector("h2 a")?.getAttribute("href")), newest.slice(0, 3).map(href));
  const first = slides[0]!;
  assert.equal(first.querySelector("time")?.getAttribute("datetime"), "2026-07-13T07:57:33Z");
  assert.equal(first.querySelector("time")?.textContent, "July 13, 2026");
  assert.equal(first.querySelector("[data-blog-author]")?.textContent, "Rezaa Modasiya", "the author the article signs off with");
  assert.equal(normalize(first.querySelector("[data-slide-excerpt]")?.textContent), normalize(presentation[newest[0]!]!.excerpt));
  const read = first.querySelector<HTMLAnchorElement>("a[data-slide-read]")!;
  assert.equal(read.textContent, "Read more");
  assert.equal(read.getAttribute("href"), href(newest[0]!));
  const dots = [...slider.querySelectorAll<HTMLButtonElement>("button[data-slide-dot]")];
  assert.equal(dots.length, 3);
  assert.deepEqual(dots.map((dot) => dot.getAttribute("aria-current")), ["true", null, null]);
  assert.equal(slider.querySelector<HTMLButtonElement>("button[data-slide-prev]")?.disabled, true, "the first story has nothing before it");
  assert.equal(slider.querySelector<HTMLButtonElement>("button[data-slide-next]")?.disabled, false);
});

test("cards list every story after the newest, six at a time, with Load more for the rest", async () => {
  const document = await render();
  const cards = [...document.querySelectorAll<HTMLElement>("[data-blog-cards] > article[data-blog-card]")];
  assert.deepEqual(cards.map((card) => card.querySelector("h2 a")?.getAttribute("href")), newest.slice(1).map(href));
  assert.deepEqual(cards.map((card) => card.hidden), [false, false, false, false, false, false, true, true, true]);
  assert.equal(document.querySelector("button[data-load-more]")?.textContent, "Load more");
  // Without script every card shows and the button steps aside.
  assert.match(document.querySelector("noscript")?.textContent ?? "", /\[data-blog-card\]\[hidden\][\s\S]*display/);
});

test("each card shows its date, title, original excerpt, its author (else Maple Furnishers) and a named arrow link, all within the store", async () => {
  const document = await render();
  assert.equal(document.querySelectorAll("article[data-blog-card]").length, 9);
  for (const card of document.querySelectorAll("article[data-blog-card]")) {
    const title = card.querySelector("h2 a")!;
    const handle = title.getAttribute("href")!.split("/").at(-1)!;
    assert.equal(card.querySelector("[data-card-date] img")?.getAttribute("src"), "/blog/calendar.svg");
    assert.match(card.querySelector("[data-card-date] time")?.getAttribute("datetime") ?? "", /^2026-/);
    assert.equal(normalize(card.querySelector("[data-card-excerpt]")?.textContent), normalize(presentation[handle]!.excerpt), handle);
    assert.equal(card.querySelector("[data-blog-author]")?.textContent, authorOf(handle), handle);
    const arrow = card.querySelector<HTMLAnchorElement>("a[data-card-arrow]")!;
    assert.equal(arrow.getAttribute("aria-label"), `Read ${title.textContent}`);
    assert.equal(arrow.getAttribute("href"), title.getAttribute("href"));
    assert.equal(arrow.querySelector("img")?.getAttribute("src"), "/blog/card-arrow.svg");
  }
  for (const link of document.querySelectorAll("[data-blog-featured] a, article[data-blog-card] a"))
    assert.match(link.getAttribute("href")!, /^\/blogs\/recent-stories\/[a-z0-9-]+$/);
});

test("story pictures keep their source artwork and reserved sizes, and only the first loads at once", async () => {
  const document = await render();
  const images = [...document.querySelectorAll<HTMLImageElement>("[data-blog-featured] article img, article[data-blog-card] a[data-card-image] img")];
  assert.equal(images.length, 12, "three slides and nine cards");
  for (const image of images) {
    const handle = image.closest("article")!.querySelector("h2 a")!.getAttribute("href")!.split("/").at(-1)!;
    const art = presentation[handle]!.image;
    assert.equal(image.getAttribute("src"), art.src);
    assert.equal(image.getAttribute("width"), String(art.width));
    assert.equal(image.getAttribute("height"), String(art.height));
  }
  assert.equal(images[0]!.getAttribute("loading"), "eager");
  assert.equal(images[0]!.getAttribute("fetchPriority"), "high");
  assert.equal(images.slice(1).filter((image) => image.getAttribute("loading") === "lazy").length, 11);
});

test("an empty blog says so truthfully, with no slider, cards or Load more", async () => {
  const document = await render("news");
  assert.match(document.body.textContent!, /No articles published yet\./);
  assert.equal(document.querySelector("[data-blog-featured]"), null);
  assert.equal(document.querySelectorAll("article[data-blog-card]").length, 0);
  assert.equal(document.querySelector("[data-load-more]"), null);
});

test("Shop Bestsellers closes the listing with a Maple picture tile and the bestseller cards", async () => {
  const document = await render();
  const band = document.querySelector<HTMLElement>("section[data-blog-bestsellers]")!;
  assert.equal(band.querySelector("h2")?.textContent, "Shop Bestsellers");
  const tile = band.querySelector<HTMLAnchorElement>("a[data-bestsellers-promo]")!;
  assert.equal(tile.getAttribute("href"), "/collections/bestsellers");
  assert.equal(tile.querySelector("img")?.getAttribute("src"), "/media/home/editorial-left.webp");
  assert.equal(normalize(tile.textContent), "Maple");
  assert.deepEqual([...band.querySelectorAll("[data-blog-rail] article[data-product-card] a[href^='/products/']")]
    .map((link) => link.getAttribute("href")).filter((value, at, all) => all.indexOf(value) === at),
  defaultHomeMerchandising.bestsellers.map((handle) => `/products/${handle}`));
  const cards = document.querySelector("[data-blog-cards]")!;
  assert.ok(cards.compareDocumentPosition(band) & 4, "after the stories");
});

test("the source articles stay as imported", () => {
  const before = JSON.stringify(source.blogs.find((blog) => blog.handle === "recent-stories")!.articles.map((article) => article.handle));
  assert.equal(before, JSON.stringify(JSON.parse(readFileSync(new URL("../data/store-content.json", import.meta.url), "utf8")).blogs.find((blog: { handle: string }) => blog.handle === "recent-stories").articles.map((article: { handle: string }) => article.handle)));
});
