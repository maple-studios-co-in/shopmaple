import assert from "node:assert/strict";
import { test } from "node:test";
import { editorialContentSchema, type EditorialNode } from "@shopmaple/contracts";
import { resolveEditorialContent } from "../lib/editorial-content-defaults";
import { fromEditorDoc, toEditorDoc } from "../lib/editorial-rich-text";

// Policies and articles are stored as a validated tree of safe tags. The admin edits them as rich
// text; these two conversions are the only bridge, so a round trip must keep what readers see.
const roundTrip = (nodes: EditorialNode[]) => fromEditorDoc(toEditorDoc(nodes));
/** The words a reader sees, in order; blocks render apart, so whitespace between them does not matter. */
const visible = (nodes: EditorialNode[]): string => nodes.map((node) => typeof node === "string" ? node : visible(node.children)).join(" ").replace(/\s+/g, " ").trim();
/** Tags counted the way a reader meets them: formatting around no words shows nothing and need not survive. */
const count = (nodes: EditorialNode[], tag: string): number => nodes.reduce((sum, node) => typeof node === "string" ? sum
  : sum + (node.tag === tag && (!["strong", "b", "em"].includes(tag) || visible(node.children)) ? 1 : 0) + count(node.children, tag), 0);
const defaults = resolveEditorialContent();
const documents = [
  ...Object.values(defaults.policies).map((policy) => [policy.title, policy.content] as const),
  ...defaults.blogs.flatMap((blog) => blog.articles.map((article) => [article.title, article.content] as const)),
];

test("every policy and article keeps its words, headings, lists, tables and images through the editor, and stays valid", () => {
  for (const [title, content] of documents) {
    const back = roundTrip(content);
    assert.equal(visible(back), visible(content), `${title}: same text`);
    for (const tag of ["h2", "h5", "li", "ol", "ul", "table", "tr", "td", "img", "hr", "strong", "em"])
      assert.equal(count(back, tag) + (tag === "strong" ? count(back, "b") : 0), count(content, tag) + (tag === "strong" ? count(content, "b") : 0), `${title}: same number of ${tag}`);
    assert.equal(count(back, "span"), 0, `${title}: span wrappers, which carry no styling, are dropped`);
    assert.equal(count(back, "div"), count(content, "div"), `${title}: div sections, which the storefront styles, are kept`);
    const parsed = editorialContentSchema.safeParse({ policies: [], blogs: [], articles: [{ blog: "recent-stories", handle: "how-to-measure-furniture-before-ordering-online", title: "T", excerpt: "", content: back }] });
    assert.ok(parsed.success, `${title}: the edited document is still a valid editorial document`);
  }
});

test("formatting, links and line breaks come back as the same tags", () => {
  const doc: EditorialNode[] = [
    { tag: "h2", children: ["Returns"] },
    { tag: "p", children: ["Write to ", { tag: "a", href: "mailto:care@maplefurnishers.com", children: [{ tag: "strong", children: ["care"] }] }, ".", { tag: "br", children: [] }, { tag: "em", children: ["Thank you"] }] },
    { tag: "ul", children: [{ tag: "li", children: [{ tag: "p", children: ["Within 7 days"] }] }] },
  ];
  assert.deepEqual(roundTrip(doc), doc);
});

test("an unsafe link keeps its words but loses the link; unknown content becomes plain paragraphs", () => {
  const back = fromEditorDoc({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Click here", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
    { type: "codeBlock", content: [{ type: "text", text: "plain words" }] },
  ] });
  assert.deepEqual(back, [{ tag: "p", children: ["Click here"] }, { tag: "p", children: ["plain words"] }]);
});

const tags = (nodes: EditorialNode[]): string[] => nodes.flatMap((node) => typeof node === "string" ? [] : [node.tag, ...tags(node.children)]);

test("an untouched policy comes back with exactly its stored structure, so the storefront looks the same", () => {
  for (const policy of Object.values(defaults.policies)) {
    assert.deepEqual(tags(roundTrip(policy.content)), tags(policy.content), `${policy.title}: same divs, paragraphs, headings and lists, no added paragraphs`);
  }
});

test("imported indentation reads as one space, as it does on the storefront", () => {
  const back = roundTrip([{ tag: "div", children: ["\n        Maple   Furnishers\n      "] }]);
  assert.deepEqual(back, [{ tag: "div", children: ["Maple Furnishers"] }]);
});

test("pasted content the store would refuse is cleaned: off-site images go, control characters go, words stay", () => {
  const back = fromEditorDoc({ type: "doc", content: [
    { type: "image", attrs: { src: "https://elsewhere.example/x.png", alt: "x" } },
    { type: "paragraph", content: [{ type: "text", text: "Line\u000bbreak\u0008 here" }] },
  ] });
  assert.deepEqual(back, [{ tag: "p", children: ["Linebreak here"] }]);
});

test("an image inside a heading is kept, after the heading", () => {
  const src = "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.png";
  const back = roundTrip([{ tag: "h2", children: ["Care", { tag: "img", src, alt: "Care", children: [] }] }]);
  assert.deepEqual(back, [{ tag: "h2", children: ["Care"] }, { tag: "img", src, alt: "Care", children: [] }]);
});
