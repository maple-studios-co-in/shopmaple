import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout; ProseMirror asks for rectangles when it scrolls a selection into view.
const noRects = () => Object.assign([], { item: () => null });
const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} });
Object.assign(dom.window.Range.prototype, { getClientRects: noRects, getBoundingClientRect: zeroRect });
Object.assign(dom.window.Text.prototype, { getClientRects: noRects, getBoundingClientRect: zeroRect });
Object.assign(dom.window.HTMLElement.prototype, { scrollIntoView() {} });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
function field(label: string) {
  const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(found, `Missing ${label} field`); return found;
}
async function fill(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`); assert.ok(input, `Missing ${label} selector`);
  await act(async () => { input.value = value; input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
async function click(name: string, scope?: ParentNode) { await act(async () => button(name, scope).click()); }
function contentWithPages(...bodies: string[]): StorefrontContent {
  return { ...structuredClone(defaultStorefrontContent), pages: bodies.map((body, index) => ({ slug: `page-${index}`, title: `Page ${index}`, description: "", body, banner: null })) };
}
async function mount(initial = contentWithPages("First paragraph\n\nSecond paragraph")) {
  const previous = globalThis.fetch; const root = createRoot(container); const saved: any[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "Page edits only save through the private content transport");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      const body = JSON.parse(String(init.body)); saved.push(body);
      return Response.json({ version: 5, draft: body.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={initial} onExpired={() => assert.fail("Unexpected expiry")} />));
  await click("Pages");
  return { saved, cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}

/** The page body's rich-text editor; TipTap keeps its instance on the editable element. */
async function richText() {
  for (let i = 0; i < 50 && !container.querySelector('[role="textbox"][aria-label="Page body"]'); i++) await act(() => new Promise(r => setTimeout(r, 10)));
  const node = container.querySelector<HTMLElement & { editor?: any }>('[role="textbox"][aria-label="Page body"]');
  assert.ok(node?.editor, "The page body is a rich-text editor");
  return node.editor;
}
const preview = () => container.querySelector('[aria-label="Page preview"]')!;
async function type(text: string) {
  const editor = await richText();
  await act(async () => { editor.chain().focus("end", { scrollIntoView: false }).insertContent({ type: "paragraph", content: [{ type: "text", text }] }).run(); });
}

// Catches implicit migration: opening a page and saving another field must not rewrite its body.
test("an older plain-text page opens with its words in the rich-text editor and saving another field leaves it alone", async () => {
  const original = "  First paragraph  \n\nSecond paragraph\nwith a line break.  ";
  const state = await mount(contentWithPages(original));
  try {
    const editor = await richText();
    assert.match(editor.getText(), /First paragraph/);
    assert.match(editor.getText(), /with a line break\./);
    assert.equal(container.querySelector('textarea[aria-label="Page body"]'), null, "no plain text box");
    await fill("Page title", "Revised title"); await click("Save draft");
    const saved = state.saved[0].content.pages[0];
    assert.equal(saved.title, "Revised title");
    assert.equal(saved.body, original);
    assert.equal(Object.hasOwn(saved, "content"), false);
    assert.equal(Object.hasOwn(saved, "blocks"), false);
  } finally { await state.cleanup(); }
});

test("an older block page opens as rich text and keeps its blocks until the body is edited", async () => {
  const initial = contentWithPages("Retained recovery body");
  Object.assign(initial.pages[0]!, { blocks: [{ id: "h", type: "heading", level: 2, text: "Materials" }, { id: "p", type: "paragraph", text: "Solid teak." }] });
  const state = await mount(initial);
  try {
    const editor = await richText();
    assert.equal(editor.getJSON().content[0].type, "heading");
    assert.match(editor.getText(), /Solid teak\./);
    assert.doesNotMatch(preview().textContent ?? "", /Retained recovery body/);
    await fill("Page title", "Revised"); await click("Save draft");
    const saved = state.saved[0].content.pages[0];
    assert.equal(saved.blocks.length, 2, "blocks stay until the body is edited");
    assert.equal(Object.hasOwn(saved, "content"), false);
  } finally { await state.cleanup(); }
});

test("editing the body saves rich text in place of blocks and keeps the original text for recovery", async () => {
  const initial = contentWithPages("Retained recovery body");
  Object.assign(initial.pages[0]!, { blocks: [{ id: "p", type: "paragraph", text: "Solid teak." }] });
  const state = await mount(initial);
  try {
    await type("<b>Literal</b> care notes.");
    assert.match(preview().textContent ?? "", /<b>Literal<\/b> care notes\./, "the preview shows the edit, as text");
    await click("Save draft");
    const saved = state.saved[0].content.pages[0];
    assert.deepEqual(saved.content, [{ tag: "p", children: ["Solid teak."] }, { tag: "p", children: ["<b>Literal</b> care notes."] }]);
    assert.equal(Object.hasOwn(saved, "blocks"), false, "the rich text replaces the blocks");
    assert.equal(saved.body, "Retained recovery body");
  } finally { await state.cleanup(); }
});

// Catches public URL leaks and accepting pictures without staff descriptions.
test("a picture from the media library goes into the page with its description and previews privately", async () => {
  const state = await mount(); const transport = globalThis.fetch;
  const hash = "a".repeat(64); const url = `/media/uploads/${hash}.webp`; const previewUrl = `/api/admin/media/${hash}/preview`;
  globalThis.fetch = async (input, init) => String(input) === "/api/admin/media" ? Response.json({ assets: [{ id: "asset", sha256: hash, label: "Reading room", width: 120, height: 80, bytes: 400, mimeType: "image/webp", createdAt: "2026-10-26T00:00:00Z", publicAt: null, url, previewUrl }], nextCursor: null }) : transport(input, init);
  try {
    await richText();
    await click("Image");
    await click("Choose image"); await click("Use image: Reading room");
    assert.equal(button("Insert image").disabled, true, "a description is required");
    await fill("Image description", "Room with a chair");
    await click("Insert image");
    assert.equal(preview().querySelector("img")?.getAttribute("src"), previewUrl, "unpublished uploads preview privately");
    await click("Save draft");
    const content = state.saved[0].content.pages[0].content;
    assert.deepEqual(content.at(-1), { tag: "img", src: url, alt: "Room with a chair", children: [] });
  } finally { await state.cleanup(); }
});

// Catches making all text authoring depend on an authenticated media picker.
test("without a staff session the body stays editable and pictures cannot be added", async () => {
  const { PageFields } = await import("../components/admin/forms");
  const root = createRoot(container); let current = contentWithPages("Original paragraph");
  function Harness() {
    const [value, setValue] = React.useState(current);
    return <PageFields content={value} onChange={next => { current = next; setValue(next); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    await type("Edited without media session");
    assert.deepEqual(current.pages[0]!.content, [{ tag: "p", children: ["Original paragraph"] }, { tag: "p", children: ["Edited without media session"] }]);
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Image"), false);
  } finally { await act(async () => root.unmount()); }
});

// Catches index reuse keeping a removed page's open picture panel or text attached to the next page.
test("removing the first page shows the next page's words and closes the picture panel", async () => {
  const state = await mount(contentWithPages("First page", "Second page"));
  try {
    await richText(); await click("Image");
    assert.ok(container.querySelector('[aria-label="Insert a picture"]'));
    await click("Remove page");
    const editor = await richText();
    assert.match(editor.getText(), /Second page/);
    assert.equal(container.querySelector('[aria-label="Insert a picture"]'), null);
    await click("Save draft"); assert.equal(state.saved[0].content.pages.length, 1);
  } finally { await state.cleanup(); }
});
test("empty page and Instagram lists show an empty state whose one action fills them", async () => {
  const { PageFields, InstagramFields } = await import("../components/admin/forms");
  const root = createRoot(container); let current: StorefrontContent = { ...contentWithPages(), instagramPosts: [] };
  function Harness() {
    const [value, setValue] = React.useState(current);
    const change = (next: StorefrontContent) => { current = next; setValue(next); };
    return <><PageFields content={value} onChange={change} /><InstagramFields content={value} onChange={change} /></>;
  }
  try {
    await act(async () => root.render(<Harness />));
    const empties = [...container.querySelectorAll<HTMLElement>("[data-empty]")];
    assert.equal(empties.length, 2, "Both lists show a designed empty state");
    await click("Add page", empties[0]); assert.equal(current.pages.length, 1); assert.ok(field("Page title"));
    await click("Add Instagram post", empties[1]); assert.equal(current.instagramPosts.length, 1); assert.ok(field("Post 1 link"));
    assert.equal(container.querySelector("[data-empty]"), null);
  } finally { await act(async () => root.unmount()); }
});
