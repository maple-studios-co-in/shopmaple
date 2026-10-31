import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";
import source from "../data/store-content.json";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout; ProseMirror asks for rectangles when it scrolls a selection into view.
const noRects = () => Object.assign([], { item: () => null });
const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} });
Object.assign(dom.window.Range.prototype, { getClientRects: noRects, getBoundingClientRect: zeroRect });
Object.assign(dom.window.Text.prototype, { getClientRects: noRects, getBoundingClientRect: zeroRect });
Object.assign(dom.window.HTMLElement.prototype, { scrollIntoView() {} });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name || b.getAttribute("aria-label") === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function change(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const groups: HTMLDetailsElement[] = [];
  for (let parent = field.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS") groups.unshift(parent as HTMLDetailsElement);
  }
  for (const group of groups) if (!group.open) await act(async () => group.querySelector<HTMLElement>("summary")!.click());
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} field`);
  await change(field, value);
}
async function select(value: string) {
  const field = container.querySelector<HTMLSelectElement>('[aria-label="Policy or blog page"]');
  assert.ok(field);
  await act(async () => { field.value = value; field.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
/** The rich-text editor on screen; TipTap keeps its instance on the editable element. */
async function richText() {
  for (let i = 0; i < 50 && !container.querySelector('[role="textbox"][aria-label="Page text"]'); i++) await act(() => new Promise(r => setTimeout(r, 10)));
  const dom = container.querySelector<HTMLElement & { editor?: any }>('[role="textbox"][aria-label="Page text"]');
  assert.ok(dom?.editor, "The page text is a rich-text editor");
  return dom.editor;
}
function strings(nodes: any[]): string[] {
  return nodes.flatMap(node => typeof node === "string" ? [node] : strings(node.children));
}
function tags(nodes: any[]): string[] {
  return nodes.flatMap(node => typeof node === "string" ? [] : [node.tag, ...tags(node.children)]);
}
for (const conflict of [false, true]) test(`staff edit policies and articles as rich text without losing their structure (${conflict ? "conflict" : "saved"})`, async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  let saved: any;
  let puts = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "Only the private content endpoint is used");
    if (init?.method === "PUT") {
      puts++;
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      saved = JSON.parse(String(init.body));
      return conflict ? Response.json({ error: "Version conflict" }, { status: 409 }) : Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  try {
    await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
    await act(async () => button("Policies & blogs").click());
    await select("policy:privacy-policy");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Editorial page title"]')?.value, "Privacy policy");
    await fill("Editorial page title", "");
    await act(async () => button("Save draft").click());
    assert.equal(puts, 0, "Invalid title must not be sent");
    await fill("Editorial page title", "Privacy at Maple");
    assert.equal(container.querySelector('[aria-label^="Text 1"]'), null, "no numbered text blocks");
    const editor = await richText();
    assert.match(editor.view.dom.textContent ?? "", /Learn how Maple Furnishers collects, protects, and responsibly uses your information\./, "the page reads as a document");
    for (const name of ["Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Quote", "Divider", "Link", "Undo", "Redo"])
      assert.ok(container.querySelector(`[aria-label="Page text formatting"] [aria-label="${name}"]`), `${name} in the toolbar`);
    assert.ok(container.querySelector('[aria-label="Page text formatting"] select[aria-label="Text style"]'));
    await act(async () => { editor.chain().focus("end", { scrollIntoView: false }).insertContent({ type: "paragraph", content: [{ type: "text", text: "<script>literal copy</script> Our privacy information." }] }).run(); });
    assert.equal(container.querySelector("script"), null, "typed HTML stays text");
    await act(async () => button("Link").click());
    await fill("Link address", "javascript:alert(1)");
    assert.equal(button("Apply link").disabled, true, "an unsafe link cannot be applied");
    assert.ok([...container.querySelectorAll('[role="alert"]')].some(alert => /store page/.test(alert.textContent ?? "")), "and says which links are allowed");
    await act(async () => button("Cancel").click());
    await select("blog:recent-stories");
    await fill("Editorial page title", "Stories from Maple");
    await select("article:recent-stories/standard-dining-table-size-guide-for-indian-homes");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Editorial page title"]')?.value, "Standard Dining Table Size Guide for Indian Homes");
    await fill("Editorial page title", "Choosing a dining table");
    await fill("Article excerpt", "A guide to comfortable dining.");
    const article = await richText();
    assert.match(article.view.dom.textContent ?? "", /Before approving a dining table, check:/, "article text is in the editor");
    assert.equal(article.view.dom.querySelectorAll("table").length, 2, "tables are editable in place");
    await act(async () => { article.chain().focus("start", { scrollIntoView: false }).insertContent("Before choosing your table. ").run(); });
    await select("policy:privacy-policy");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Editorial page title"]')?.value, "Privacy at Maple", "Template switching preserves edits");
    await act(async () => button("Save draft").click());
    assert.equal(puts, 1);
    assert.equal(saved.expectedVersion, 4);
    const editorial = saved.content.editorialContent;
    assert.equal(editorial.policies.length, 1, "Only edited policies are stored");
    assert.equal(editorial.policies[0].slug, "privacy-policy");
    assert.equal(editorial.policies[0].title, "Privacy at Maple");
    assert.ok(strings(editorial.policies[0].content).includes("<script>literal copy</script> Our privacy information."));
    const kept = (nodes: any[]) => tags(nodes).filter(tag => ["h2", "ul", "li", "strong"].includes(tag));
    assert.deepEqual(kept(editorial.policies[0].content), kept(source.policies["privacy-policy"].content), "Source headings and lists are retained");
    assert.deepEqual(editorial.blogs, [{ handle: "recent-stories", title: "Stories from Maple" }]);
    assert.equal(editorial.articles.length, 1);
    assert.equal(editorial.articles[0].title, "Choosing a dining table");
    assert.equal(editorial.articles[0].excerpt, "A guide to comfortable dining.");
    assert.equal(editorial.articles[0].handle, "standard-dining-table-size-guide-for-indian-homes");
    assert.equal(editorial.articles[0].blog, "recent-stories");
    assert.equal(tags(editorial.articles[0].content).filter(tag => tag === "table").length, 2, "Article tables remain structured");
    assert.ok(strings(editorial.articles[0].content).some(text => text.includes("Before choosing your table.")));
    assert.deepEqual(saved.content.homeSections, initial.homeSections);
    assert.match(container.textContent ?? "", conflict ? /Another editor saved/ : /Draft saved/);
    assert.match(container.textContent ?? "", /Published version 2/);
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Editorial page title"]')?.value, "Privacy at Maple");
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Publish draft"), false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("clicking into a page does not change the draft, and Reload latest draft shows the server's text in the editor", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  let gets = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "PUT") return Response.json({ error: "Version conflict" }, { status: 409 });
    gets++;
    const draft = structuredClone(defaultStorefrontContent);
    if (gets > 1) draft.editorialContent = { policies: [{ slug: "privacy-policy", title: "Privacy policy", content: [{ tag: "p", children: ["Newer text from another editor."] }] }], blogs: [], articles: [] };
    return Response.json({ version: 4 + gets, draft, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  try {
    await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
    await act(async () => button("Policies & blogs").click());
    await select("policy:refund-policy");
    const refund = await richText();
    await act(async () => { refund.commands.focus("end", { scrollIntoView: false }); refund.commands.focus("start", { scrollIntoView: false }); });
    assert.equal(button("Save draft").disabled, true, "moving the cursor is not an edit");

    await select("policy:privacy-policy");
    const privacy = await richText();
    await act(async () => { privacy.chain().focus("end", { scrollIntoView: false }).insertContent("Local words.").run(); });
    await act(async () => button("Save draft").click());
    await act(async () => button("Reload latest draft").click());
    for (let i = 0; i < 50 && !/Newer text/.test((await richText()).view.dom.textContent ?? ""); i++) await act(() => new Promise(r => setTimeout(r, 10)));
    const reloaded = await richText();
    assert.equal(reloaded.view.dom.textContent, "Newer text from another editor.", "the editor shows the reloaded draft, not the discarded local text");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
