import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditorialNode } from "@shopmaple/contracts";
import PolicyPage, { generateMetadata } from "../app/policies/[slug]/page";
import { ContentPage } from "../components/content-page";
import { StoreContent } from "../components/store-content";
import source from "../data/store-content.json";
import { fromEditorDoc, toEditorDoc } from "../lib/editorial-rich-text";
import published from "./fixtures/policy-source-text.json";

// The owner's direction (1 November): policies are pages the page editor can build, in plain HTML.
// `published` holds every line of text of the four policies as main (ce8edc9) served them.
const slugs = ["privacy-policy", "refund-policy", "shipping-policy", "terms-of-service"] as const;
const policies = source.policies as Record<string, { title: string; content: EditorialNode[] }>;
const props = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function unpublished(run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try { await run(); } finally { globalThis.fetch = previous; }
}

// Catches policies keeping a template of their own instead of the page editor's.
test("each policy is laid out exactly like a page built in the page editor", async () => {
  await unpublished(async () => {
    for (const slug of slugs) {
      const { title, content } = policies[slug]!;
      const editorPage = renderToStaticMarkup(<ContentPage page={{ slug, title, description: "", body: "", content, banner: null }} />);
      assert.equal(renderToStaticMarkup(await PolicyPage(props(slug))), editorPage, slug);
    }
  });
});

// Catches leftovers from the old store (unstyled boxes, cards, icons) that the editor cannot make.
test("policy text is plain editor HTML that comes back unchanged after a round trip through the page editor", () => {
  const editorTags = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "u", "a", "br"]);
  const tagsIn = (nodes: EditorialNode[]): string[] => nodes.flatMap(node => typeof node === "string" ? [] : [node.tag, ...tagsIn(node.children)]);
  for (const slug of slugs) {
    const { content } = policies[slug]!;
    assert.deepEqual([...new Set(tagsIn(content))].filter(tag => !editorTags.has(tag)), [], slug);
    assert.deepEqual(fromEditorDoc(toEditorDoc(content)), content, slug);
  }
});

// The decorative labels the old store's design carried, which plain HTML leaves out: icons, the
// brand line and section numbers above headings, topic labels repeating the heading below them, and an
// opening heading that repeats the page title.
const dropped: Record<(typeof slugs)[number], string[]> = {
  "privacy-policy": [
    "MAPLE FURNISHERS", "Privacy Policy", "✦", "◎", "◷", "Introduction", "Information Collection", "Data Usage", "Information Sharing",
    "Security", "Cookies", "Communication", "Retention", "Third-Party Platforms", "Your Rights", "Policy Updates", "Contact",
  ],
  "refund-policy": ["Maple Furnishers", "✦", "◎", "◷", "Section 1", "Section 2", "Section 3", "Section 4", "Section 5", "Section 6"],
  "shipping-policy": ["Maple Furnishers", ...Array.from({ length: 9 }, (_, index) => `Section 0${index + 1}`)],
  "terms-of-service": ["MAPLE FURNISHERS", "Terms of Service", ...Array.from({ length: 17 }, (_, index) => `Section ${String(index + 1).padStart(2, "0")}`)],
};

// Catches the rewrite losing, changing, reordering or inventing policy wording.
test("the plain HTML keeps every published line of each policy in order and adds no words", () => {
  for (const slug of slugs) {
    const lines = [...published[slug].runs];
    for (const label of dropped[slug]) {
      const index = lines.indexOf(label);
      assert.ok(index >= 0, `${slug}: "${label}" was published`);
      lines.splice(index, 1);
    }
    const copy = new JSDOM(`<main>${renderToStaticMarkup(<StoreContent nodes={policies[slug]!.content} />)}</main>`).window.document.querySelector("main")!;
    copy.querySelectorAll("br").forEach(lineBreak => lineBreak.replaceWith(" "));
    copy.querySelectorAll("h2, h3, p, li").forEach(block => block.append(" "));
    let text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    for (const line of lines) {
      assert.ok(text.startsWith(line), `${slug}: expected "${line}" next, found "${text.slice(0, 80)}"`);
      text = text.slice(line.length).trimStart();
    }
    assert.equal(text, "", `${slug}: words not in the published policy`);
  }
});

// Catches the redesign changing titles or canonical addresses search engines already know.
test("policy titles and canonical addresses stay as published", async () => {
  await unpublished(async () => {
    for (const slug of slugs)
      assert.deepEqual(await generateMetadata(props(slug)), { title: published[slug].title, alternates: { canonical: `/policies/${slug}` } }, slug);
    assert.deepEqual(await generateMetadata(props("not-a-policy")), { title: "Policy" });
  });
});
