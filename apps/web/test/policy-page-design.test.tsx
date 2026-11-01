import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import PolicyPage, { generateMetadata } from "../app/policies/[slug]/page";
import ArticlePage from "../app/blogs/[blog]/[article]/page";
import { PolicyArticle } from "../components/policy-page";
import { StoreContent, type ContentNode } from "../components/store-content";
import source from "../data/store-content.json";
import captured from "./fixtures/policy-article-markup.json";

// Captured from main (ce8edc9) before the policy redesign: each policy's article markup, metadata
// and structured data, as the live store serves them.
const before = captured as Record<string, { article: string; metadata: unknown; jsonLd: number }>;
const slugs = ["privacy-policy", "refund-policy", "shipping-policy", "terms-of-service"];
const props = (slug: string) => ({ params: Promise.resolve({ slug }) });
const render = (markup: string) => new JSDOM(markup).window.document;
const text = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();

async function unpublished(run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try { await run(); } finally { globalThis.fetch = previous; }
}
const policyDocument = async (slug: string) => render(renderToStaticMarkup(await PolicyPage(props(slug))));
const articleHeadings = (doc: Document) => [...doc.querySelectorAll("article h2, article h3")];
const outline = (doc: Document) => doc.querySelector('nav[aria-label="On this page"]');
const tableOfContents = (doc: Document) => [...(outline(doc)?.querySelectorAll("a") ?? [])];

// Catches the redesign rewording, dropping or reordering staff-edited policy copy.
test("every policy's article renders the published markup unchanged apart from heading anchors", async () => {
  await unpublished(async () => {
    assert.deepEqual(Object.keys(source.policies), slugs);
    for (const slug of slugs) {
      const article = (await policyDocument(slug)).querySelector("article")!;
      for (const heading of article.querySelectorAll("h2, h3")) heading.removeAttribute("id");
      assert.equal(article.innerHTML, before[slug]!.article, slug);
    }
  });
});

// Catches the redesign changing titles, canonicals or structured data search engines already read.
test("policy metadata, canonicals and structured data stay as they were", async () => {
  await unpublished(async () => {
    for (const slug of slugs) {
      assert.deepEqual(await generateMetadata(props(slug)), before[slug]!.metadata, slug);
      assert.equal((await policyDocument(slug)).querySelectorAll('script[type="application/ld+json"]').length, before[slug]!.jsonLd, slug);
    }
    assert.deepEqual(await generateMetadata(props("not-a-policy")), { title: "Policy" });
  });
});

// Catches section links that cannot be shared or jumped to.
test("every policy heading gets a unique, readable anchor", async () => {
  await unpublished(async () => {
    for (const slug of slugs) {
      const ids = articleHeadings(await policyDocument(slug)).map(heading => heading.id);
      assert.ok(ids.length > 0 && ids.every(id => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)), `${slug}: ${ids}`);
      assert.equal(new Set(ids).size, ids.length, slug);
    }
    const privacy = await policyDocument("privacy-policy");
    assert.equal(privacy.getElementById("data-retention")?.textContent, "Data Retention");
    assert.equal(privacy.getElementById("cookies-tracking")?.textContent, "Cookies & Tracking");
    const refund = await policyDocument("refund-policy");
    assert.equal(text(refund.getElementById("cancellation-return-refund-policy")!), "Cancellation, Return & Refund Policy");
  });
});

// Catches a table of contents that skips, invents or misdirects sections.
test("the table of contents lists the policy's headings in order and links to each one", async () => {
  await unpublished(async () => {
    const shipping = await policyDocument("shipping-policy");
    assert.deepEqual(tableOfContents(shipping).map(text), [
      "Shipping & Delivery Policy", "Made-to-Order Manufacturing", "Delivery Timeline", "Shipping Charges", "Delivery Process",
      "Site Readiness", "Installation Services", "Delays & External Factors", "Delivery Acceptance", "Multiple Shipments",
    ]);
    for (const slug of slugs) {
      const doc = await policyDocument(slug);
      const headings = articleHeadings(doc);
      assert.deepEqual(tableOfContents(doc).map(link => link.getAttribute("href")), headings.map(heading => `#${heading.id}`), slug);
      assert.deepEqual(tableOfContents(doc).map(text), headings.map(text), slug);
    }
  });
});

const edited = (content: ContentNode[], title = "Your privacy at Maple") =>
  render(renderToStaticMarkup(<PolicyArticle policy={{ title, content }} slug="privacy-policy" policies={[]} />));

// Catches edited content breaking anchors: repeated, empty, demoted, deeper or unrendered headings.
test("staff-edited headings get anchors only where they render, without clashing with the page or each other", () => {
  const doc = edited([
    { tag: "h1", children: ["Overview"] },
    { tag: "div", children: [{ tag: "h2", children: ["Your choices"] }, { tag: "h3", children: ["Email ", { tag: "em", children: ["& SMS"] }] }] },
    { tag: "h2", children: ["Your choices"] },
    { tag: "h2", children: ["Main"] },
    { tag: "h2", children: ["  "] },
    { tag: "h2", children: ["उपयोग"] },
    { tag: "h4", children: ["Fine print"] },
    { tag: "script", children: [{ tag: "h2", children: ["Hidden"] }] },
  ]);
  assert.deepEqual(tableOfContents(doc).map(link => [text(link), link.getAttribute("href")]), [
    ["Overview", "#overview"],
    ["Your choices", "#your-choices"],
    ["Email & SMS", "#email-sms"],
    ["Your choices", "#your-choices-2"],
    ["Main", "#main-2"],
    ["उपयोग", "#section"],
  ]);
  assert.equal(doc.querySelectorAll("#main").length, 0, "the page's skip-link target stays unique");
  assert.equal(doc.querySelector("article h4")?.hasAttribute("id"), false);
  assert.equal(outline(doc)?.querySelector('a[href="#email-sms"]')?.closest("li")?.getAttribute("data-level"), "3");
  assert.doesNotMatch(doc.body.textContent ?? "", /Hidden/);
});

test("a policy without headings shows no empty table of contents", () => {
  assert.equal(outline(edited([{ tag: "p", children: ["Short policy."] }])), null);
});

// Catches readers finishing a policy with nowhere to ask about it.
test("every policy ends with a help box linking the contact page, and lets readers move between policies", async () => {
  await unpublished(async () => {
    for (const slug of slugs) {
      const doc = await policyDocument(slug);
      const help = doc.querySelector('aside[aria-labelledby="policy-help-title"]');
      assert.ok(help, slug);
      assert.ok(help.querySelector('a[href="/pages/contact"]'), slug);
      assert.ok(doc.querySelector("article")!.compareDocumentPosition(help) & 4 /* following */, slug);
      const switcher = [...doc.querySelectorAll('nav[aria-label="Policies"] a')];
      assert.deepEqual(switcher.map(link => [text(link), link.getAttribute("href")]), [
        ["Privacy policy", "/policies/privacy-policy"], ["Refund policy", "/policies/refund-policy"],
        ["Shipping", "/policies/shipping-policy"], ["Terms of service", "/policies/terms-of-service"],
      ]);
      assert.deepEqual(switcher.filter(link => link.getAttribute("aria-current") === "page").map(link => link.getAttribute("href")), [`/policies/${slug}`]);
    }
  });
});

// Catches the policy redesign leaking into blog articles, which share the content renderer.
test("blog articles keep their headings without policy anchors or a table of contents", async () => {
  await unpublished(async () => {
    const doc = render(renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ blog: "recent-stories", article: "how-to-measure-furniture-before-ordering-online" }) })));
    assert.match(doc.querySelector("article")?.textContent ?? "", /A furniture piece can look perfectly sized/);
    assert.equal(outline(doc), null);
    assert.equal(doc.querySelector("aside"), null);
    const body = render(renderToStaticMarkup(<StoreContent nodes={[{ tag: "h2", children: ["Before you measure"] }, { tag: "h3", children: ["Doorways"] }]} />));
    assert.equal(body.body.innerHTML, "<h2>Before you measure</h2><h3>Doorways</h3>");
  });
});
