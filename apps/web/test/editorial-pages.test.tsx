import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import PolicyPage, { generateMetadata as policyMetadata } from "../app/policies/[slug]/page";
import BlogPage, { generateMetadata as blogMetadata } from "../app/blogs/[blog]/page";
import ArticlePage, { generateMetadata as articleMetadata } from "../app/blogs/[blog]/[article]/page";
import type { ContentNode } from "../components/store-content";
import { defaultStorefrontContent } from "../lib/content-defaults";

const articleHandle = "how-to-measure-furniture-before-ordering-online";
const policyProps = (slug = "privacy-policy") => ({ params: Promise.resolve({ slug }) });
const blogProps = (blog = "recent-stories") => ({ params: Promise.resolve({ blog }) });
const articleProps = (article = articleHandle, blog = "recent-stories") => ({ params: Promise.resolve({ blog, article }) });
const documentFor = async (element: ReturnType<typeof PolicyPage>) => new JSDOM(renderToStaticMarkup(await element)).window.document;

async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    if (!String(input).endsWith("/api/content/storefront")) {
      return Response.json({ version: 99, draft: { title: "Private draft" } });
    }
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method ?? "GET", "GET");
    if (body === "offline") throw new Error("offline");
    return body === null
      ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 })
      : Response.json(body);
  };
  try {
    await run();
    assert.ok(requests.every(url => url.endsWith("/api/content/storefront")), "public routes must never read a draft endpoint");
  } finally { globalThis.fetch = previous; }
}

// Catches loss of the legacy copy/layout when public editorial reads are introduced.
test("legacy editorial routes retain source copy, semantic body and original metadata", async () => {
  const legacy = structuredClone(defaultStorefrontContent) as Record<string, unknown>;
  delete legacy.editorialContent;
  await withResponse({ version: 1, content: legacy }, async () => {
    const policy = await documentFor(PolicyPage(policyProps()));
    assert.equal(policy.querySelector("h1")?.textContent, "Privacy policy");
    assert.match(policy.querySelector("article")?.textContent ?? "", /How We Use Your Information/);
    assert.match(policy.querySelector("article")?.textContent ?? "", /Data Retention/);
    assert.ok(policy.querySelector("article div h2"));
    assert.ok(policy.querySelector("article ul li"));
    assert.equal((await policyMetadata(policyProps())).title, "Privacy policy");
    const blog = await documentFor(BlogPage(blogProps()));
    assert.equal(blog.querySelector("h1")?.textContent, "Recent Stories");
    assert.equal(blog.querySelectorAll("article").length, 10);
    assert.equal(blog.querySelector("article p")?.textContent?.replace(/\s+/g, " ").trim(), "A furniture piece can look perfectly sized on a website and still feel completely wrong once it arrives. The most common mistake is checking whether the furniture fits the room,...");
    assert.equal((await blogMetadata(blogProps())).title, "Recent Stories");
    const article = await documentFor(ArticlePage(articleProps()));
    assert.equal(article.querySelector("h1")?.textContent, "How to Measure Furniture Before Ordering Online");
    assert.match(article.querySelector("article")?.textContent ?? "", /A furniture piece can look perfectly sized on a website/);
    assert.equal((await articleMetadata(articleProps())).title, "How to Measure Furniture Before Ordering Online");
    const empty = await documentFor(BlogPage(blogProps("news")));
    assert.equal(empty.querySelector("h1")?.textContent, "News");
    assert.equal(empty.querySelectorAll("article").length, 0);
    assert.match(empty.body.textContent ?? "", /No articles published yet\./);
  });
});

function editorialEdits() {
  return {
    policies: [{ slug: "privacy-policy", title: "Your privacy at Maple", content: [
      { tag: "div", children: [
        { tag: "h2", children: ["Published privacy details"] },
        { tag: "p", children: ["Your preferences are respected."] },
        { tag: "ul", children: [{ tag: "li", children: ["Contact preferences", { tag: "strong", children: [" remain yours"] }] }] },
        { tag: "table", children: [{ tag: "tbody", children: [{ tag: "tr", children: [{ tag: "th", children: ["Purpose"] }, { tag: "td", children: ["Order support"] }] }] }] },
      ] },
    ] as ContentNode[] }],
    blogs: [{ handle: "recent-stories", title: "Stories from Maple" }, { handle: "news", title: "Maple news" }],
    articles: [{ blog: "recent-stories", handle: articleHandle, title: "Measure for your home", excerpt: "Published measuring advice for your next room.", content: [
      { tag: "h2", children: ["Before you measure"] },
      { tag: "p", children: ["Allow room to move comfortably."] },
      { tag: "ol", children: [{ tag: "li", children: ["Measure the doorway."] }] },
    ] as ContentNode[] }],
  };
}
const published = (editorialContent = editorialEdits()) => ({ version: 8, content: { ...defaultStorefrontContent, editorialContent } });

// Catches the pages or metadata continuing to read bundled source after publication.
test("published policy title and structured body reach its page and metadata", async () => {
  await withResponse(published(), async () => {
    const policy = await documentFor(PolicyPage(policyProps()));
    assert.equal(policy.querySelector("h1")?.textContent, "Your privacy at Maple");
    assert.equal(policy.querySelector("nav span")?.textContent, "Your privacy at Maple");
    assert.equal(policy.querySelector("article div > h2")?.textContent, "Published privacy details");
    assert.equal(policy.querySelector("article p")?.textContent, "Your preferences are respected.");
    assert.equal(policy.querySelector("article ul li strong")?.textContent, " remain yours");
    assert.equal(policy.querySelector("table tbody tr th")?.textContent, "Purpose");
    assert.equal(policy.querySelector("table tbody tr td")?.textContent, "Order support");
    assert.equal(policy.querySelectorAll("h1").length, 1);
    assert.equal((await policyMetadata(policyProps())).title, "Your privacy at Maple");
  });
});

test("published blog title and article excerpt reach cards while routes and artwork remain fixed", async () => {
  await withResponse(published(), async () => {
    const blog = await documentFor(BlogPage(blogProps()));
    assert.equal(blog.querySelector("h1")?.textContent, "Stories from Maple");
    assert.equal(blog.querySelector("article h2")?.textContent, "Measure for your home");
    assert.equal(blog.querySelector("article p")?.textContent, "Published measuring advice for your next room.");
    assert.equal(blog.querySelector("article h2 a")?.getAttribute("href"), `/blogs/recent-stories/${articleHandle}`);
    assert.equal(blog.querySelector("article img")?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/articles/unnamed_15.png?v=1783929571");
    assert.equal(blog.querySelectorAll("article").length, 10);
    assert.equal((await blogMetadata(blogProps())).title, "Stories from Maple");
    const empty = await documentFor(BlogPage(blogProps("news")));
    assert.equal(empty.querySelector("h1")?.textContent, "Maple news");
    assert.match(empty.body.textContent ?? "", /No articles published yet\./);
    assert.equal(empty.querySelectorAll("article").length, 0);
  });
});

test("published article title, body and metadata preserve its source date and image", async () => {
  await withResponse(published(), async () => {
    const article = await documentFor(ArticlePage(articleProps()));
    assert.equal(article.querySelector("h1")?.textContent, "Measure for your home");
    assert.equal(article.querySelector("article h2")?.textContent, "Before you measure");
    assert.equal(article.querySelector("article p")?.textContent, "Allow room to move comfortably.");
    assert.equal(article.querySelector("article ol li")?.textContent, "Measure the doorway.");
    assert.equal(article.querySelector('nav a[href="/blogs/recent-stories"]')?.textContent, "Stories from Maple");
    assert.equal(article.querySelector("time")?.getAttribute("datetime"), "2026-07-13T07:57:33Z");
    assert.equal(article.querySelector("time")?.textContent, "July 13, 2026");
    assert.equal(article.querySelector("section > img")?.getAttribute("src"), "https://shop.maplefurnishers.com/cdn/shop/articles/unnamed_15.png?v=1783929571");
    assert.equal(article.querySelector("section > img")?.getAttribute("width"), "482");
    assert.equal(article.querySelector("section > img")?.getAttribute("height"), "322");
    assert.equal((await articleMetadata(articleProps())).title, "Measure for your home");
  });
});

test("published editorial text is escaped instead of interpreted as HTML", async () => {
  const content = editorialEdits();
  const literal = '<img src=x onerror="alert(1)">';
  content.policies[0]!.title = literal;
  content.policies[0]!.content = [{ tag: "p", children: [literal] }];
  content.blogs[0]!.title = literal;
  content.articles[0]!.title = literal;
  content.articles[0]!.excerpt = literal;
  content.articles[0]!.content = [{ tag: "p", children: [literal] }];
  await withResponse(published(content), async () => {
    for (const element of [PolicyPage(policyProps()), BlogPage(blogProps()), ArticlePage(articleProps())]) {
      const doc = await documentFor(element);
      assert.equal(doc.querySelector("h1")?.textContent, literal);
      assert.ok(doc.querySelector("article p")?.textContent?.includes(literal));
      assert.equal(doc.querySelectorAll("script, [onerror], img[src=x]").length, 0);
    }
  });
});

test("draft, malformed and unavailable editorial responses retain original public copy", async () => {
  for (const body of [null, "offline", { version: 9, draft: published().content }, { version: 8, content: { ...defaultStorefrontContent, editorialContent: { policies: [{ slug: "privacy-policy", title: "Invalid override", content: [{ tag: "script", children: ["bad()"] }] }] } } }]) {
    await withResponse(body, async () => {
      assert.equal((await documentFor(PolicyPage(policyProps()))).querySelector("h1")?.textContent, "Privacy policy");
      assert.equal((await documentFor(BlogPage(blogProps()))).querySelector("h1")?.textContent, "Recent Stories");
      assert.equal((await documentFor(ArticlePage(articleProps()))).querySelector("h1")?.textContent, "How to Measure Furniture Before Ordering Online");
      assert.equal((await policyMetadata(policyProps())).title, "Privacy policy");
      assert.equal((await blogMetadata(blogProps())).title, "Recent Stories");
      assert.equal((await articleMetadata(articleProps())).title, "How to Measure Furniture Before Ordering Online");
    });
  }
});

test("publication never creates unknown routes or cross-blog article aliases", async () => {
  await withResponse(published(), async () => {
    for (const slug of ["missing", "constructor", "__proto__"]) {
      await assert.rejects(() => PolicyPage(policyProps(slug)), /NEXT_HTTP_ERROR_FALLBACK;404/);
      assert.equal((await policyMetadata(policyProps(slug))).title, "Policy");
    }
    await assert.rejects(() => BlogPage(blogProps("missing")), /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.equal((await blogMetadata(blogProps("missing"))).title, "Blogs");
    for (const [article, blog] of [[articleHandle, "news"], [articleHandle, "missing"], ["missing", "recent-stories"]]) {
      await assert.rejects(() => ArticlePage(articleProps(article, blog)), /NEXT_HTTP_ERROR_FALLBACK;404/);
      assert.equal((await articleMetadata(articleProps(article, blog))).title, "Article");
    }
  });
});
