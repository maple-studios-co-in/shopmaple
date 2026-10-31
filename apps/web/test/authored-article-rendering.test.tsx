import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveEditorialContent } from "../lib/editorial-content-defaults";
import source from "../data/store-content.json";
import BlogPage from "../app/blogs/[blog]/page";
import ArticlePage, { generateMetadata } from "../app/blogs/[blog]/[article]/page";
import { defaultStorefrontContent } from "../lib/content-defaults";

const cover = `/media/uploads/${"a".repeat(64)}.webp`;
const bodyImage = `/media/uploads/${"b".repeat(64)}.webp`;
const article = {
  blog: "recent-stories" as const, handle: "a-room-for-reading", title: "A room for reading", excerpt: "Make space for a quiet moment.",
  publishedAt: "2026-10-26T00:00:00.000Z", cover: { src: cover, alt: "An oak reading chair" },
  blocks: [
    { id: "intro", type: "paragraph" as const, text: 'Read <script>alert("x")</script> as text.' },
    { id: "heading", type: "heading" as const, level: 2 as const, text: "Choose a corner" },
    { id: "subheading", type: "heading" as const, level: 3 as const, text: "Consider the light" },
    { id: "quote", type: "quote" as const, text: "A quiet place matters." },
    { id: "steps", type: "list" as const, ordered: true, items: ["Measure your space", "Try the chair"] },
    { id: "tips", type: "list" as const, ordered: false, items: ["Natural light", "A side table"] },
    { id: "link", type: "link" as const, href: "/collections/chairs", text: "Explore chairs" },
    { id: "image", type: "image" as const, src: bodyImage, alt: 'Reading nook <img src=x onerror="bad()">' },
  ],
};
const params = (handle = article.handle, blog = "recent-stories") => ({ params: Promise.resolve({ blog, article: handle }) });
const documentFor = (element: Parameters<typeof renderToStaticMarkup>[0]) => new JSDOM(renderToStaticMarkup(element)).window.document;
async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith("/api/content/storefront"), "public render must only read published endpoint");
    if (body === "offline") throw Error("offline");
    return body === null ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json(body);
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
const published = (articles: unknown[] = [article]) => ({ version: 2, content: { ...defaultStorefrontContent, authoredArticles: articles } });

// Catches mutation or replacement of the ten imported articles when new entries are appended.
test("resolver preserves every imported article while appending published authored entries", () => {
  const original = structuredClone(source.blogs);
  const resolved = resolveEditorialContent(undefined, [article]);
  const recent = resolved.blogs.find(item => item.handle === "recent-stories")!;
  assert.equal(recent.articles.length, 11);
  assert.equal(recent.articles.at(-1)?.handle, "a-room-for-reading");
  for (const blog of original) {
    assert.deepEqual(resolved.blogs.find(item => item.handle === blog.handle)!.articles.slice(0, blog.articles.length).map(({ excerpt, ...entry }) => entry), blog.articles);
  }
  assert.deepEqual(source.blogs, original);
  assert.equal(resolveEditorialContent().blogs.find(item => item.handle === "recent-stories")!.articles.length, 10);
});

test("published new article is discoverable in its blog with its cover and date order", async () => {
  await withResponse(published([article, { ...article, blog: "news", handle: "news-chair" }]), async () => {
    const doc = documentFor(await BlogPage({ params: Promise.resolve({ blog: "recent-stories" }) }));
    assert.equal(doc.querySelectorAll("article").length, 11);
    assert.equal(doc.querySelector("article h2 a")?.getAttribute("href"), "/blogs/recent-stories/a-room-for-reading");
    assert.equal(doc.querySelector("article p")?.textContent, "Make space for a quiet moment.");
    assert.equal(doc.querySelector("article img")?.getAttribute("src"), cover);
    assert.equal(doc.querySelector("article img")?.getAttribute("alt"), "An oak reading chair");
    assert.equal(doc.querySelector('[href="/blogs/recent-stories/news-chair"]'), null);
    const news = documentFor(await BlogPage({ params: Promise.resolve({ blog: "news" }) }));
    assert.equal(news.querySelectorAll("article").length, 1);
    assert.equal(news.querySelector("article h2 a")?.getAttribute("href"), "/blogs/news/news-chair");
  });
});

test("published authored article renders all structured blocks safely and supplies metadata", async () => {
  await withResponse(published(), async () => {
    // Exposes route creation as an assertion failure, rather than treating Next's 404 as setup failure.
    const page = await ArticlePage(params()).catch(() => null);
    assert.notEqual(page, null, "published authored article must have a public route");
    const doc = documentFor(page);
    assert.equal(doc.querySelector("h1")?.textContent, "A room for reading");
    assert.equal(doc.querySelector("time")?.getAttribute("datetime"), "2026-10-26T00:00:00.000Z");
    assert.equal(doc.querySelector("section > img")?.getAttribute("src"), cover);
    assert.equal(doc.querySelector("article p")?.textContent, 'Read <script>alert("x")</script> as text.');
    assert.equal(doc.querySelector("article h2")?.textContent, "Choose a corner");
    assert.equal(doc.querySelector("article h3")?.textContent, "Consider the light");
    assert.equal(doc.querySelector("blockquote")?.textContent, "A quiet place matters.");
    assert.deepEqual([...doc.querySelectorAll("ol li")].map(item => item.textContent), ["Measure your space", "Try the chair"]);
    assert.deepEqual([...doc.querySelectorAll("ul li")].map(item => item.textContent), ["Natural light", "A side table"]);
    assert.equal(doc.querySelector("article a")?.getAttribute("href"), "/collections/chairs");
    assert.equal(doc.querySelector("article img")?.getAttribute("src"), bodyImage);
    assert.equal(doc.querySelector("article img")?.getAttribute("alt"), 'Reading nook <img src=x onerror="bad()">');
    assert.equal(doc.querySelectorAll('script:not([type="application/ld+json"]), [onerror]').length, 0);
    // The only scripts are inert structured data for search engines, with nothing that could end the tag.
    for (const data of doc.querySelectorAll('script[type="application/ld+json"]')) { assert.ok(!/[<>]/.test(data.textContent ?? "")); JSON.parse(data.textContent ?? ""); }
    assert.equal((await generateMetadata(params())).title, "A room for reading");
  });
});

test("draft, missing date, malformed and unavailable articles cannot create public routes", async () => {
  for (const body of [null, "offline", { version: 2, draft: published().content }, published([{ ...article, publishedAt: null }]), published([{ ...article, blocks: [{ id: "unsafe", type: "link", text: "Unsafe", href: "javascript:alert(1)" }] }])]) {
    await withResponse(body, async () => {
      await assert.rejects(() => ArticlePage(params()), /NEXT_HTTP_ERROR_FALLBACK;404/);
      const doc = documentFor(await BlogPage({ params: Promise.resolve({ blog: "recent-stories" }) }));
      assert.equal(doc.querySelectorAll("article").length, 10);
      assert.equal(doc.querySelector("article h2")?.textContent, "How to Measure Furniture Before Ordering Online");
    });
  }
});
