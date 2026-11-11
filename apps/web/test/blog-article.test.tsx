import assert from "node:assert/strict";
import { shopifyMediaPath } from "@shopmaple/contracts/shopify-media";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArticlePage from "../app/blogs/[blog]/[article]/page";
import { absolute, seoSettings } from "../lib/seo";
import { blogFetch, blogProduct, normalize, renderBlogPage } from "./support/blog-fixtures";

// The blog article as Figma 268:4825 draws it (owner, 10 Nov 2026): the title, byline and picture; the text beside a
// sidebar (share, recent articles, related products); then "Explore our collections".
const measure = "how-to-measure-furniture-before-ordering-online";
const seren = "seren-mpl-ch-acc-seren-bgcgsg";
const catalogue = { [seren]: blogProduct(seren, 2_124_000), arven: blogProduct("arven", 1_652_000), avelia: blogProduct("avelia", null) };
let api = 0;
async function render(article = measure, blog = "recent-stories", fetcher = blogFetch({ products: catalogue })) {
  return renderBlogPage(await ArticlePage({ params: Promise.resolve({ blog, article }) }), fetcher, `http://blog-article-${++api}.invalid`);
}

test("the article opens with its title, its author's byline and its own picture before the text", async () => {
  for (const [handle, image, width, height, date, iso, author] of [
    // The imported artwork is 482px wide, soft across a 1200px banner: the banner shows a sharp copy enlarged four
    // times by ESRGAN (owner, 10 Nov 2026: "the hero is blur").
    [measure, "/blog/art/how-to-measure-furniture-before-ordering-online.webp", "1600", "1069", "Jul 13, 2026", "2026-07-13T07:57:33Z", "Rezaa Modasiya"],
    // Published at 20:56 UTC, already the 6th in India.
    // Its picture first appeared on Shopify; the store shows its own copy.
    ["space-saving-furniture-ideas-for-small-homes", shopifyMediaPath("https://shop.maplefurnishers.com/cdn/shop/articles/image1_e2fafe60-2493-483b-8f0f-05563168be25.png?v=1780903153")!, "1536", "1024", "Jun 6, 2026", "2026-06-05T20:56:16Z", "Abhigna Ghosh"],
  ]) {
    const document = await render(handle);
    assert.equal(document.querySelectorAll("h1").length, 1);
    const byline = document.querySelector("[data-article-byline]")!;
    assert.equal(byline.querySelector("[data-blog-author]")?.textContent, author);
    assert.equal(byline.querySelector("time")?.getAttribute("datetime"), iso);
    assert.equal(byline.querySelector("time")?.textContent, date);
    const hero = document.querySelector<HTMLImageElement>("img[data-article-hero]")!;
    assert.ok(decodeURIComponent(hero.getAttribute("src")!).includes(image!), `${handle}: ${hero.getAttribute("src")}`);
    assert.equal(hero.getAttribute("width"), width);
    assert.equal(hero.getAttribute("height"), height);
    assert.equal(hero.alt, document.querySelector("h1")?.textContent);
    assert.equal(hero.getAttribute("loading"), "eager");
    assert.equal(hero.getAttribute("fetchPriority"), "high");
    assert.ok(hero.compareDocumentPosition(document.querySelector("article[data-blog-body]")!) & 4, "the picture comes before the text");
    // The picture fills the whole banner, whatever its size: no smaller picture inside a blurred copy (owner, 10 Nov 2026).
    assert.equal(hero.closest("[data-hero]")?.getAttribute("data-hero"), "banner");
    assert.equal(document.querySelector("[data-hero-backdrop], [data-hero-fit]"), null, "no card inside a card");
  }
  assert.equal((await render()).querySelector("h1")?.textContent, "How to Measure Furniture Before Ordering Online");
});

test("the text keeps the original words and its own pictures", async () => {
  const document = await render();
  assert.match(document.querySelector("article[data-blog-body]")?.textContent ?? "", /A furniture piece can look perfectly sized on a website/);
  const dining = await render("standard-dining-table-size-guide-for-indian-homes");
  assert.equal(dining.querySelectorAll("img[data-article-hero]").length, 1);
  const own = [...dining.querySelectorAll("article[data-blog-body] img")].filter((img) => !img.closest("[data-body-picture]"));
  assert.equal(own.length, 1, "the article's own picture stays, once");
  // An article that names no author is signed by the store.
  assert.equal(dining.querySelector("[data-article-byline] [data-blog-author]")?.textContent, "Maple Furnishers");
});

// The owner's pattern (10 Nov 2026): "first the image then its related text, then the second image then its related
// text, then the third" — three pictures, each 16:9, every one opening the part of the story it shows.
test("an imported article reads picture, text, picture, text, picture, text: three 16:9 photographs of Maple's rooms", async () => {
  const delivery = "furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door";
  for (const [handle, first, last] of [
    [measure, "A furniture piece can look perfectly sized on a website", "Never order furniture because it “looks about right” in a photo. Measure it in your room first."],
    [delivery, "A sofa can fit perfectly in your living room and still never reach it.", "It needs to reach it first."],
    ["why-every-successful-cafe-has-three-types-of-seating", "Walk into a great café and look around.", "One space. Three types of stay. Three types of seating."],
  ]) {
    const body = (await render(handle)).querySelector("article[data-blog-body]")!;
    const pictures = [...body.querySelectorAll("figure[data-body-picture]")];
    assert.equal(pictures.length, 3, `${handle}: three pictures`);
    const blocks = [...body.children];
    assert.equal(blocks[0]?.tagName, "FIGURE", `${handle} opens with its first picture`);
    assert.notEqual(blocks.at(-1)?.tagName, "FIGURE", `${handle} closes with the third picture's text`);
    blocks.forEach((block, at) => {
      if (block.tagName === "FIGURE") assert.notEqual(blocks[at + 1]?.tagName, "FIGURE", `${handle}: every picture is followed by its text`);
    });
    const shown = new Set<string>();
    pictures.forEach((picture, at) => {
      assert.equal(picture.getAttribute("data-chapter"), String(at + 1).padStart(2, "0"));
      assert.equal(picture.querySelector("[data-figure-frame]")?.getAttribute("data-ratio"), "16:9", "a 16:9 frame");
      const image = picture.querySelector("img")!;
      assert.match(decodeURIComponent(image.getAttribute("src")!), /\/media\/home\/[a-z-]+\.webp|\/media\/shopify\/[a-f0-9]{32}\.(?:png|webp|jpg)/, "Maple's own room photography");
      assert.ok(image.alt.length > 20, "each photo is described");
      shown.add(image.getAttribute("src")!);
    });
    assert.equal(shown.size, 3, `${handle}: no photo twice`);
    const text = normalize(body.textContent ?? "");
    assert.ok(text.includes(normalize(first)), `${handle} keeps its opening words`);
    assert.ok(text.endsWith(normalize(last)), `${handle} keeps its closing words`);
  }
  // A numbered list a picture divides keeps counting where it left off.
  const lists = [...(await render(delivery)).querySelectorAll("article[data-blog-body] > ol")];
  let next = 1;
  for (const list of lists) {
    assert.equal(Number(list.getAttribute("start") ?? 1), next, "the numbering carries on after the picture");
    next += list.querySelectorAll(":scope > li").length;
  }
  assert.equal(next - 1, 5, "all five steps are still there");
});

// Imported text was hard-wrapped at its old width, which leaves one-word lines at every other width.
test("a line break in the middle of a sentence reads as a space, while real line breaks stay", async () => {
  const body = (await render("furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door")).querySelector("article[data-blog-body]")!;
  const text = normalize(body.textContent ?? "");
  assert.match(text, /but nobody checks the main door, lift, staircase/, "the wrapped sentence runs on");
  assert.match(text, /An open shutter, handle or security door can reduce usable width\./);
  const first = body.querySelector("p")!;
  assert.equal(first.querySelectorAll("br").length, 2, "the breaks between its three sentences stay");
  const steps = body.querySelector("ol > li")!;
  assert.ok(steps.innerHTML.includes("note:<br>"), "a lead-in's colon keeps its break");
  assert.ok(/<br>\s*• clear door width/.test(steps.innerHTML), "each bullet keeps its own line");
});

test("an author's sign-off moves into the byline instead of repeating under the text", async () => {
  const body = (await render()).querySelector("article[data-blog-body]")!;
  assert.doesNotMatch(body.textContent ?? "", /Author \| Maple Furnishers|Rezaa Modasiya/);
  assert.match(body.textContent ?? "", /Never order furniture because it .looks about right. in a photo\./, "the text before the sign-off stays whole");
  assert.equal(body.querySelector("hr:last-child"), null, "nor the rule that introduced it");
});

test("the text closes with the byline again and a Share button", async () => {
  const footer = (await render()).querySelector("[data-article-footer]")!;
  assert.equal(footer.querySelector("[data-blog-author]")?.textContent, "Rezaa Modasiya");
  assert.equal(footer.querySelector("time")?.textContent, "Jul 13, 2026");
  const share = footer.querySelector<HTMLButtonElement>("button[data-share-native]")!;
  assert.equal(normalize(share.textContent), "Share");
  assert.equal(share.querySelector("img")?.getAttribute("src"), "/blog/share-inline.svg");
});

test("unknown articles and a mismatched blog are not found instead of showing another article", async () => {
  for (const [article, blog] of [["missing-article", "recent-stories"], [measure, "news"], [measure, "unknown"]])
    await assert.rejects(render(article, blog), /NEXT_HTTP_ERROR_FALLBACK;404/);
});

test("the sidebar shares the article on Facebook, X and Pinterest by its full address", async () => {
  const document = await render();
  const sidebar = document.querySelector("aside[data-article-sidebar]")!;
  const share = sidebar.querySelector("section[data-sidebar-share]")!;
  assert.equal(share.querySelector("h2")?.textContent, "Share this article");
  assert.equal(normalize(share.querySelector("button[data-share-native]")?.textContent), "Share");
  assert.equal(share.querySelector("button[data-share-native] img")?.getAttribute("src"), "/blog/share.svg");
  const url = encodeURIComponent(absolute(seoSettings(process.env), `/blogs/recent-stories/${measure}`));
  const title = encodeURIComponent("How to Measure Furniture Before Ordering Online");
  const picture = encodeURIComponent(absolute(seoSettings(process.env), "/blog/art/how-to-measure-furniture-before-ordering-online.webp"));
  const expected = {
    facebook: [`https://www.facebook.com/sharer/sharer.php?u=${url}`, "Share on Facebook", "/blog/facebook.svg"],
    x: [`https://twitter.com/intent/tweet?url=${url}&text=${title}`, "Share on X", "/blog/x.svg"],
    pinterest: [`https://pinterest.com/pin/create/button/?url=${url}&media=${picture}&description=${title}`, "Share on Pinterest", "/blog/pinterest.svg"],
  };
  for (const [network, [href, label, icon]] of Object.entries(expected)) {
    const link = share.querySelector<HTMLAnchorElement>(`a[data-share="${network}"]`)!;
    assert.equal(link.getAttribute("href"), href, network);
    assert.equal(link.getAttribute("aria-label"), label);
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(link.getAttribute("rel"), "noopener noreferrer");
    assert.equal(link.querySelector("img")?.getAttribute("src"), icon);
  }
});

test("Recent Articles lists the three newest other stories with their dates", async () => {
  const recent = (document: Document) => [...document.querySelectorAll("[data-sidebar-recent] li")];
  const first = recent(await render());
  assert.deepEqual(first.map((item) => item.querySelector("a[data-recent-title]")?.getAttribute("href")), [
    "/blogs/recent-stories/what-should-be-finalised-first-furniture-flooring-or-lighting",
    "/blogs/recent-stories/furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door",
    "/blogs/recent-stories/best-wood-for-furniture-in-indian-climate-humidity-heat-and-maintenance",
  ], "the article itself is left out");
  assert.equal(first[0]!.querySelector("time")?.textContent, "July 8, 2026");
  assert.equal(first[0]!.querySelector("[data-recent-author]")?.textContent, "Maple");
  assert.ok(first[0]!.querySelector("a[data-recent-image] img"), "each has its picture");
  const other = recent(await render("standard-dining-table-size-guide-for-indian-homes"));
  assert.equal(other[0]!.querySelector("a[data-recent-title]")?.getAttribute("href"), `/blogs/recent-stories/${measure}`);
});

test("Related Products shows Seren, ARVEN and Avelia from the catalogue, with Add to cart where it can be bought", async () => {
  const items = [...(await render()).querySelectorAll("[data-sidebar-related] li[data-related-product]")];
  assert.deepEqual(items.map((item) => item.querySelector("a[data-related-title]")?.textContent), ["Seren - Burgundy Suede", "ARVEN", "Avelia"]);
  assert.deepEqual(items.map((item) => item.querySelector("a[data-related-title]")?.getAttribute("href")), [`/products/${seren}`, "/products/arven", "/products/avelia"]);
  assert.deepEqual(items.map((item) => item.querySelector("[data-related-price]")?.textContent), ["Rs. 21,240.00", "Rs. 16,520.00", "Price on request"]);
  assert.equal(items[0]!.querySelector("button[data-add-to-cart]")?.textContent, "Add to cart");
  assert.equal(items[0]!.querySelector("button[data-add-to-cart]")?.getAttribute("data-variant"), `${seren}-default`);
  // A piece without a price cannot go in the cart: it links to its page instead.
  assert.equal(items[2]!.querySelector("button[data-add-to-cart]"), null);
  assert.equal(items[2]!.querySelector("a[data-related-view]")?.getAttribute("href"), "/products/avelia");
});

test("a catalogue outage leaves the article whole and leaves the products out", async () => {
  const document = await render(measure, "recent-stories", blogFetch({ cards: false }));
  assert.equal(document.querySelector("[data-sidebar-related]"), null);
  assert.equal(document.querySelectorAll("[data-collection-tile]").length, 0);
  assert.ok(document.querySelector("[data-sidebar-share]") && document.querySelector("[data-sidebar-recent]"));
  assert.ok(document.querySelector("section[data-blog-collections] a[href='/collections/all']"), "the collections band still invites a visit");
});

test("Explore our collections closes the page with the design's four pieces", async () => {
  const band = (await render()).querySelector("section[data-blog-collections]")!;
  assert.equal(band.querySelector("img[data-collections-photo]")?.getAttribute("src"), "/media/home/editorial-right.webp");
  assert.equal(band.querySelector("[data-collections-eyebrow]")?.textContent, "Maple Furnishers");
  assert.equal(band.querySelector("h2")?.textContent, "Explore our collections");
  assert.equal(band.querySelector("p[data-collections-lede]")?.textContent, "Furniture designed around your space, materials and finishes.");
  const shop = band.querySelector<HTMLAnchorElement>("a[data-collections-shop]")!;
  assert.equal(shop.textContent, "Shop Now");
  assert.equal(shop.getAttribute("href"), "/collections/all");
  const tiles = [...band.querySelectorAll<HTMLAnchorElement>("a[data-collection-tile]")];
  assert.deepEqual(tiles.map((tile) => tile.getAttribute("href")), [`/products/${seren}`, "/products/arven", "/products/avelia", "/products/vellora"]);
  assert.deepEqual(tiles.map((tile) => tile.querySelector("[data-tile-name]")?.textContent), ["Seren", "ARVEN", "Avelia", "Vellora"]);
  assert.match(readFileSync(new URL("../styles/blog.css", import.meta.url), "utf8"), /\[data-tile-name\][^}]*text-transform: uppercase/, "set in capitals, as the design");
});
