import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuthoredBlock, ContentPage as Page } from "@shopmaple/contracts";
import { ContentPage } from "../components/content-page";
import ShopPage, { generateMetadata } from "../app/pages/[slug]/page";
import { readPublishedContent } from "../lib/content";
import { defaultStorefrontContent } from "../lib/content-defaults";

const legacyPage: Page = {
  slug: "design-guide",
  title: "Room & reading guide",
  description: "A quiet corner",
  body: ' First line\nsecond line\n\n<script>plain text</script>\n \nLast & final ',
  banner: null,
};
const banner = {
  desktopImage: "/media/desktop.webp",
  mobileImage: "/media/mobile.webp",
  alt: "Reading room",
  href: "/collections/chairs",
  label: "Explore chairs",
};
const documentFor = (element: Parameters<typeof renderToStaticMarkup>[0]) => new JSDOM(renderToStaticMarkup(element)).window.document;

// Exact markup apart from the utility classes, which carry the look rather than the structure.
const markup = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element).replace(/ class="[^"]*"/g, "");

test("legacy pages retain exact paragraph markup, whitespace and escaped source text", () => {
  const html = markup(<ContentPage page={legacyPage} />);
  assert.equal(html, '<article data-store="true" data-content-page="true"><header><h1>Room &amp; reading guide</h1><p>A quiet corner</p></header><div data-content-copy="true"><p> First line\nsecond line</p><p>&lt;script&gt;plain text&lt;/script&gt;</p><p>Last &amp; final </p></div></article>');
  assert.equal(markup(<ContentPage page={{ ...legacyPage, description: "", body: "" }} />), '<article data-store="true" data-content-page="true"><header><h1>Room &amp; reading guide</h1></header><div data-content-copy="true"></div></article>');
});

test("legacy banner remains between the header and paragraph copy with responsive media", () => {
  const doc = documentFor(<ContentPage page={{ ...legacyPage, banner }} />);
  assert.deepEqual([...doc.querySelector("article")!.children].map(element => element.tagName), ["HEADER", "A", "DIV"]);
  const link = doc.querySelector("[data-content-banner]")!;
  assert.equal(link.getAttribute("href"), "/collections/chairs");
  assert.equal(link.querySelector("source")?.getAttribute("media"), "(max-width:749px)");
  assert.equal(link.querySelector("source")?.getAttribute("srcset"), "/media/mobile.webp");
  assert.equal(link.querySelector("img")?.getAttribute("src"), "/media/desktop.webp");
  assert.equal(link.querySelector("img")?.getAttribute("alt"), "Reading room");
  assert.equal(link.querySelector("span")?.textContent, "Explore chairs");
});

const managedImage = `/media/uploads/${"a".repeat(64)}.webp`;
const blocks: AuthoredBlock[] = [
  { id: "heading", type: "heading", level: 2, text: "Choose your corner" },
  { id: "paragraph", type: "paragraph", text: '<script>alert("hello")</script> is literal copy.' },
  { id: "subheading", type: "heading", level: 3, text: "Consider daylight" },
  { id: "quote", type: "quote", text: "Leave room to breathe." },
  { id: "ordered", type: "list", ordered: true, items: ["Measure first", "Choose a chair"] },
  { id: "unordered", type: "list", ordered: false, items: ["Daylight", "A lamp"] },
  { id: "link", type: "link", href: "/collections/chairs", text: "Browse chairs" },
  { id: "image", type: "image", src: managedImage, alt: '<img src=x onerror="bad()"> is alt text' },
];
const structuredPage: Page = { ...legacyPage, body: "Retained legacy text for recovery", banner, blocks };

test("structured pages render all block kinds in author order and suppress retained body", () => {
  const doc = documentFor(<ContentPage page={structuredPage} />);
  const copy = doc.querySelector("[data-content-copy]")!;
  assert.deepEqual([...copy.children].map(element => element.tagName), ["H2", "P", "H3", "BLOCKQUOTE", "OL", "UL", "P", "IMG"]);
  assert.equal(copy.querySelector("h2")?.textContent, "Choose your corner");
  assert.equal(copy.querySelector("p")?.textContent, '<script>alert("hello")</script> is literal copy.');
  assert.equal(copy.querySelector("h3")?.textContent, "Consider daylight");
  assert.equal(copy.querySelector("blockquote")?.textContent, "Leave room to breathe.");
  assert.deepEqual([...copy.querySelectorAll("ol li")].map(item => item.textContent), ["Measure first", "Choose a chair"]);
  assert.deepEqual([...copy.querySelectorAll("ul li")].map(item => item.textContent), ["Daylight", "A lamp"]);
  assert.equal(copy.querySelector("a")?.getAttribute("href"), "/collections/chairs");
  assert.equal(copy.querySelector("a")?.textContent, "Browse chairs");
  assert.equal(copy.querySelector("img")?.getAttribute("src"), managedImage);
  assert.equal(copy.querySelector("img")?.getAttribute("alt"), '<img src=x onerror="bad()"> is alt text');
  assert.equal(doc.querySelectorAll("script, [onerror]").length, 0);
  assert.ok(!copy.textContent?.includes("Retained legacy text for recovery"));
  assert.deepEqual([...doc.querySelector("article")!.children].map(element => element.tagName), ["HEADER", "A", "DIV"]);
  const legacy = documentFor(<ContentPage page={{ ...legacyPage, banner }} />);
  assert.equal(doc.querySelector("[data-content-banner]")?.outerHTML, legacy.querySelector("[data-content-banner]")?.outerHTML);
});

test("page rendering leaves dangerous unsaved link destinations as escaped plain text", () => {
  for (const href of ["javascript:alert(1)", "https://attacker.example", "//attacker.example", "/admin", "/collections/../admin", "/pages/%2f%2fattacker.example"]) {
    const page = { ...structuredPage, banner: null, blocks: [{ id: "link", type: "link" as const, href, text: "Read <script>bad()</script>" }] };
    const doc = documentFor(<ContentPage page={page} />);
    assert.equal(doc.querySelector("[data-content-copy]")?.textContent, "Read <script>bad()</script>");
    assert.equal(doc.querySelector("a, script"), null, href);
  }
});

test("page rendering never requests dangerous or noncanonical unsaved images", () => {
  for (const src of ["javascript:alert(1)", "https://attacker.example/track", "//attacker.example/track", "/api/admin/media/private", "/media/uploads/not-a-hash.webp", "/media/uploads/../private.webp", "data:image/svg+xml,<svg onload='alert(1)'/>"]) {
    const page = { ...structuredPage, banner: null, blocks: [{ id: "image", type: "image" as const, src, alt: "Unsafe image" }, { id: "safe", type: "paragraph" as const, text: "Safe copy" }] };
    const doc = documentFor(<ContentPage page={page} />);
    assert.equal(doc.querySelector("[data-content-copy]")?.textContent, "Safe copy");
    assert.equal(doc.querySelector("img"), null, src);
  }
});

const published = { version: 2, content: { ...defaultStorefrontContent, pages: [structuredPage] } };
const routeProps = (slug = "design-guide") => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });
async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const requests: { url: string; cache: RequestCache | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), cache: init?.cache });
    if (body === "offline") throw Error("offline");
    return body === null ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json(body);
  };
  try {
    await run();
    assert.ok(requests.length > 0);
    for (const request of requests) {
      assert.ok(request.url.endsWith("/api/content/storefront"), "public pages read only the published endpoint");
      assert.equal(request.cache, "no-store");
    }
  } finally { globalThis.fetch = previous; }
}

test("published structured pages reach the real route and retain title and description metadata", async () => {
  await withResponse(published, async () => {
    const content = await readPublishedContent();
    assert.equal(content.pages[0]?.slug, "design-guide", "published reader must preserve the structured page");
    const page = await ShopPage(routeProps()).catch(() => null);
    assert.notEqual(page, null, "published structured page must have a public route");
    const doc = documentFor(page);
    assert.equal(doc.querySelector("h1")?.textContent, "Room & reading guide");
    assert.equal(doc.querySelector("[data-content-copy] h2")?.textContent, "Choose your corner");
    assert.equal(doc.querySelector("[data-content-copy] img")?.getAttribute("src"), managedImage);
    assert.deepEqual(await generateMetadata(routeProps()), { title: "Room & reading guide", description: "A quiet corner" });
  });
});

test("draft, malformed and unavailable structured pages cannot create routes or replace source fallback", async () => {
  const unsafePage = { ...structuredPage, blocks: [{ id: "unsafe", type: "link", href: "javascript:alert(1)", text: "Unsafe" }] };
  for (const response of [null, "offline", { version: 2, draft: published.content }, { ...published, content: { ...published.content, pages: [unsafePage] } }]) {
    await withResponse(response, async () => {
      const content = await readPublishedContent();
      assert.deepEqual(content.pages, []);
      assert.equal(content.homeCopy.socialHeading, "Our Social Proof");
      assert.equal(content.homeCopy.ticker, "Elegance isn't found. At Maple, it is custom-built.");
      await assert.rejects(() => ShopPage(routeProps()), /NEXT_HTTP_ERROR_FALLBACK;404/);
      assert.deepEqual(await generateMetadata(routeProps()), { title: "Page not found", description: undefined });
      assert.equal((await generateMetadata(routeProps("contact"))).title, "Contact Us");
    });
  }
});
