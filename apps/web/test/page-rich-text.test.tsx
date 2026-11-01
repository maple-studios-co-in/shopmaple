import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { contentPageSchema, type AuthoredBlock, type ContentPage as Page, type EditorialNode } from "@shopmaple/contracts";
import { ContentPage } from "../components/content-page";
import { pageDocument } from "../lib/page-document";
import { fromEditorDoc } from "../lib/editorial-rich-text";

// Custom pages are written as rich text (the policy editor's safe tag tree). Older pages keep
// their plain text or blocks until someone edits the body; nothing changes on its own.
const upload = `/media/uploads/${"a".repeat(64)}.webp`;
const shopImage = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/room.jpg";
const page = (patch: Partial<Page> = {}): Page => ({ slug: "care-guide", title: "Care guide", description: "", body: "Old body", banner: null, ...patch });
const doc = (element: React.ReactElement) => new JSDOM(renderToStaticMarkup(element)).window.document;
const rich: EditorialNode[] = [
  { tag: "h2", children: ["Caring for velvet"] },
  { tag: "p", children: ["Brush ", { tag: "strong", children: ["gently"] }, ", then see ", { tag: "a", href: "/collections/sofas", children: ["our sofas"] }, "."] },
  { tag: "ul", children: [{ tag: "li", children: [{ tag: "p", children: ["No direct sun"] }] }] },
];

test("a page body can be rich text, with the same safety rules as policies", () => {
  assert.ok(contentPageSchema.safeParse(page({ content: rich })).success);
  assert.ok(contentPageSchema.safeParse(page({ content: [{ tag: "img", src: upload, alt: "A sofa", children: [] }] })).success, "media library uploads are allowed");
  assert.ok(contentPageSchema.safeParse(page({ content: [{ tag: "img", src: shopImage, alt: "", children: [] }] })).success);
  for (const unsafe of [
    [{ tag: "script", children: ["alert(1)"] }],
    [{ tag: "a", href: "javascript:alert(1)", children: ["x"] }],
    [{ tag: "img", src: "https://elsewhere.example/x.png", children: [] }],
    [{ tag: "img", src: "/media/uploads/../../etc/passwd", children: [] }],
  ] as EditorialNode[][]) assert.equal(contentPageSchema.safeParse(page({ content: unsafe })).success, false, JSON.stringify(unsafe));
  const huge: EditorialNode[] = Array.from({ length: 900 }, () => ({ tag: "p", children: ["x".repeat(60)] }));
  assert.equal(contentPageSchema.safeParse(page({ content: huge })).success, false, "a page over 48 KiB is refused");
});

test("older pages open in the rich-text editor as the same words and structure", () => {
  assert.deepEqual(pageDocument(page({ body: "First paragraph\n\nSecond line one\nline two" })), [
    { tag: "p", children: ["First paragraph"] },
    { tag: "p", children: ["Second line one", { tag: "br", children: [] }, "line two"] },
  ]);
  const blocks: AuthoredBlock[] = [
    { id: "a", type: "heading", level: 3, text: "Materials" },
    { id: "b", type: "paragraph", text: "Solid teak." },
    { id: "c", type: "quote", text: "Built to last." },
    { id: "d", type: "list", ordered: true, items: ["Dust", "Polish"] },
    { id: "e", type: "link", text: "See chairs", href: "/collections/chairs" },
    { id: "f", type: "image", src: upload, alt: "Teak grain" },
  ];
  assert.deepEqual(pageDocument(page({ blocks })), [
    { tag: "h3", children: ["Materials"] },
    { tag: "p", children: ["Solid teak."] },
    { tag: "blockquote", children: [{ tag: "p", children: ["Built to last."] }] },
    { tag: "ol", children: [{ tag: "li", children: [{ tag: "p", children: ["Dust"] }] }, { tag: "li", children: [{ tag: "p", children: ["Polish"] }] }] },
    { tag: "p", children: [{ tag: "a", href: "/collections/chairs", children: ["See chairs"] }] },
    { tag: "img", src: upload, alt: "Teak grain", children: [] },
  ]);
  assert.deepEqual(pageDocument(page({ content: rich, blocks })), rich, "rich text wins once it exists");
  assert.deepEqual(pageDocument(page({ body: "   " })), [], "an empty body is an empty document");
});

test("the storefront shows a rich-text page in the classic page layout, ahead of older blocks and text", () => {
  const html = doc(<ContentPage page={page({ content: rich, blocks: [{ id: "x", type: "paragraph", text: "Old block" }] })} />);
  const copy = html.querySelector(".content-page-copy.store-prose")!;
  assert.equal(copy.querySelector("h2")?.textContent, "Caring for velvet");
  assert.equal(copy.querySelector("strong")?.textContent, "gently");
  assert.equal(copy.querySelector("a")?.getAttribute("href"), "/collections/sofas");
  assert.equal(copy.querySelector("li")?.textContent, "No direct sun");
  assert.ok(!copy.textContent!.includes("Old block") && !copy.textContent!.includes("Old body"), "older copy is not shown");
  const pictured = doc(<ContentPage page={page({ content: [{ tag: "img", src: upload, alt: "A sofa", children: [] }] })} />).querySelector(".content-page-copy img")!;
  assert.ok(pictured, "media library uploads are shown");
  assert.equal(pictured.getAttribute("alt"), "A sofa");
  assert.match(pictured.getAttribute("src") ?? "", /media%2Fuploads%2Fa{64}\.webp|\/media\/uploads\/a{64}\.webp/);
});

test("edited images keep media library uploads and drop pictures from other sites", () => {
  const back = fromEditorDoc({ type: "doc", content: [
    { type: "image", attrs: { src: upload, alt: "Ours" } },
    { type: "image", attrs: { src: "https://elsewhere.example/x.png", alt: "Theirs" } },
    { type: "image", attrs: { src: "/media/uploads/not-a-hash.webp", alt: "Bad" } },
  ] });
  assert.deepEqual(back, [{ tag: "img", src: upload, alt: "Ours", children: [] }]);
});
