import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
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

// Catches implicit migration and changes to legacy body serialization when saving unrelated edits.
test("legacy page opening and saving preserve plain text and absent blocks", async () => {
  const original = "  First paragraph  \n\nSecond paragraph\nwith a line break.  ";
  const state = await mount(contentWithPages(original));
  try {
    assert.equal(field("Page body").value, original);
    assert.equal(container.querySelector('[aria-label="Page preview"] [data-plain-copy]')?.textContent, original);
    await fill("Page title", "Revised title"); await click("Save draft");
    assert.equal(state.saved[0].content.pages[0].body, original);
    assert.equal(Object.hasOwn(state.saved[0].content.pages[0], "blocks"), false);
  } finally { await state.cleanup(); }
});
// Catches trimming source copy or discarding its recovery value during explicit conversion.
test("explicit conversion preserves paragraph strings and original body until confirmed restoration", async () => {
  const original = "  First paragraph  \n\n  \n\nSecond paragraph\nwith a line break.  ";
  const state = await mount(contentWithPages(original));
  try {
    await click("Use structured blocks");
    assert.equal(container.querySelector('[aria-label="Page body"]'), null);
    assert.equal(field("Block 1 text").value, "  First paragraph  ");
    assert.equal(field("Block 2 text").value, "Second paragraph\nwith a line break.  ");
    await fill("Block 1 text", "Updated block copy"); await click("Save draft");
    assert.equal(state.saved[0].content.pages[0].body, original);
    assert.deepEqual(state.saved[0].content.pages[0].blocks.map(({ id, ...block }: any) => block), [
      { type: "paragraph", text: "Updated block copy" }, { type: "paragraph", text: "Second paragraph\nwith a line break.  " },
    ]);
    await click("Return to plain text");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /discard/i);
    await click("Keep structured blocks"); assert.equal(field("Block 1 text").value, "Updated block copy");
    await click("Return to plain text"); await click("Confirm return to plain text");
    assert.equal(field("Page body").value, original);
    await click("Save draft"); assert.equal(Object.hasOwn(state.saved[1].content.pages[0], "blocks"), false);
  } finally { await state.cleanup(); }
});
// Catches invalid empty drafts being saved, manufactured copy, or conversion silently truncating long bodies.
test("empty conversion requires real copy and more than 60 paragraphs is rejected without changes", async () => {
  const tooMany = Array.from({ length: 61 }, (_, index) => `Paragraph ${index}`).join("\n\n");
  const state = await mount(contentWithPages("", tooMany));
  try {
    await click("Use structured blocks"); assert.equal(field("Block 1 text").value, "");
    await click("Save draft"); assert.equal(state.saved.length, 0);
    await fill("Block 1 text", "Staff-written copy");
    await select("Page", "1"); await click("Use structured blocks");
    assert.equal(field("Page body").value, tooMany);
    assert.match(container.textContent ?? "", /60 paragraphs/);
    await click("Save draft");
    assert.equal(state.saved[0].content.pages[1].body, tooMany);
    assert.equal(Object.hasOwn(state.saved[0].content.pages[1], "blocks"), false);
  } finally { await state.cleanup(); }
});
// Catches lost focus/data while reordering, slug-key remounts, stale picker state and empty required blocks.
test("page blocks support editing, boundaries and switching without data or focus loss", async () => {
  const state = await mount(contentWithPages("First", "Other"));
  try {
    await click("Use structured blocks");
    for (const [kind, label, copy] of [["heading", "text", "Heading"], ["quote", "text", "Quotation"], ["list", "list items", "Chair\nLamp"], ["link", "link label", "Browse"]]) {
      await click(`Add ${kind}`);
      const count = container.querySelectorAll('[aria-label="Page block"]').length;
      assert.equal(field(`Block ${count} ${label}`).value, "");
      await click("Save draft"); assert.equal(state.saved.length, 0);
      await fill(`Block ${count} ${label}`, copy!);
    }
    await fill("Block 5 link destination", "javascript:alert(1)");
    assert.equal(container.querySelector('[aria-label="Page preview"] a'), null);
    await click("Save draft"); assert.equal(state.saved.length, 0);
    await fill("Block 5 link destination", "/collections/all");
    const move = button("Move up", container.querySelectorAll('[aria-label="Page block"]')[1]);
    move.focus(); await act(async () => move.click());
    assert.equal(document.activeElement, field("Block 1 text")); assert.equal(field("Block 1 text").value, "Heading");
    await fill("Page slug", "revised-slug"); assert.equal(document.activeElement, field("Page slug"));
    await click("Add image"); assert.ok(container.querySelector('[aria-label="New image block"]'));
    await click("Return to plain text");
    await select("Page", "1"); await click("Use structured blocks");
    assert.ok(container.querySelector('[aria-label="New image block"]') === null, "The new page must not inherit an open image composer");
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Confirm return to plain text"), false);
    await select("Page", "0"); assert.equal(field("Block 1 text").value, "Heading");
    assert.ok(container.querySelector('[aria-label="New image block"]') === null, "The new page must not inherit an open image composer");
    await click("Remove block", container.querySelectorAll('[aria-label="Page block"]')[0]);
    assert.equal(document.activeElement, field("Block 1 text")); assert.equal(field("Block 1 text").value, "First");
    await click("Save draft"); assert.equal(state.saved[0].content.pages[0].blocks.length, 4);
    await select("Page", "1"); assert.equal(button("Remove block", container.querySelector('[aria-label="Page block"]')!).disabled, true);
  } finally { await state.cleanup(); }
});
// Catches loading structured pages in legacy mode and editor additions exceeding contract limits.
test("existing structured pages open without conversion and block limits preserve editing", async () => {
  const initial = contentWithPages("Retained recovery body");
  Object.assign(initial.pages[0]!, { blocks: Array.from({ length: 60 }, (_, index) => ({ id: `block-${index}`, type: "paragraph", text: `Paragraph ${index}` })) });
  const state = await mount(initial);
  try {
    assert.equal(container.querySelectorAll('[aria-label="Page block"]').length, 60);
    assert.equal(button("Add paragraph").disabled, true); assert.equal(button("Add image").disabled, true);
    assert.doesNotMatch(container.querySelector('[aria-label="Page preview"]')?.textContent ?? "", /Retained recovery body/);
    await fill("Block 1 text", "Updated at limit"); await click("Save draft");
    assert.equal(state.saved[0].content.pages[0].blocks[0].text, "Updated at limit");
  } finally { await state.cleanup(); }
});
// Catches public URL leaks and accepting image blocks without staff descriptions.
test("page image library previews privately and saves canonical media only with a description", async () => {
  const state = await mount(); const transport = globalThis.fetch;
  const hash = "a".repeat(64); const url = `/media/uploads/${hash}.webp`; const previewUrl = `/api/admin/media/${hash}/preview`;
  globalThis.fetch = async (input, init) => String(input) === "/api/admin/media" ? Response.json({ assets: [{ id: "asset", sha256: hash, label: "Reading room", width: 120, height: 80, bytes: 400, mimeType: "image/webp", createdAt: "2026-10-26T00:00:00Z", publicAt: null, url, previewUrl }], nextCursor: null }) : transport(input, init);
  try {
    await click("Use structured blocks"); await click("Add image");
    await click("Choose image"); await click("Use image: Reading room");
    assert.equal(field("Block 3 image description").value, "");
    await click("Save draft"); assert.equal(state.saved.length, 0);
    await fill("Block 3 image description", "Room with a chair");
    assert.equal(container.querySelector('[aria-label="Page preview"] img')?.getAttribute("src"), previewUrl);
    await click("Save draft"); assert.equal(state.saved[0].content.pages[0].blocks[2].src, url);
  } finally { await state.cleanup(); }
});
// Catches accidentally making all text authoring depend on an authenticated media picker.
test("session-less page fields keep text editing available and media selection disabled", async () => {
  const { PageFields } = await import("../components/admin/forms");
  const root = createRoot(container); let current = contentWithPages("Original paragraph");
  function Harness() {
    const [value, setValue] = React.useState(current);
    return <PageFields content={value} onChange={next => { current = next; setValue(next); }} />;
  }
  try {
    await act(async () => root.render(<Harness />)); await click("Use structured blocks");
    await fill("Block 1 text", "Edited without media session");
    assert.equal((current.pages[0]!.blocks![0] as { text: string }).text, "Edited without media session");
    assert.equal(button("Add image").disabled, true);
    await click("Add quote"); assert.equal(field("Block 2 text").value, "");
  } finally { await act(async () => root.unmount()); }
});
// Catches index reuse keeping a removed page's open image composer attached to the next page.
test("removing the first page resets picker state when the next page takes its index", async () => {
  const state = await mount(contentWithPages("First page", "Second page"));
  try {
    await click("Use structured blocks"); await select("Page", "1"); await click("Use structured blocks");
    await select("Page", "0"); await click("Add image");
    assert.ok(container.querySelector('[aria-label="New image block"]'));
    await click("Remove page");
    assert.equal(field("Block 1 text").value, "Second page");
    assert.ok(container.querySelector('[aria-label="New image block"]') === null, "The new page must not inherit an open image composer");
    await click("Save draft"); assert.equal(state.saved[0].content.pages.length, 1);
  } finally { await state.cleanup(); }
});
// Catches blank-line runs becoming stray newlines in converted copy or legacy paragraph whitespace being trimmed.
test("conversion treats consecutive blank lines as separators while retaining paragraph indentation", async () => {
  const state = await mount(contentWithPages("  First  \r\n\r\n\r\n  Second\r\ncontinued  "));
  try {
    await click("Use structured blocks");
    assert.equal(field("Block 1 text").value, "  First  \n");
    // Match legacy paragraph strings exactly, including CR left before its LF separator.
    // Textareas normalize line endings for display; serialization preserves the raw strings.
    assert.equal(field("Block 2 text").value, "  Second\ncontinued  ");
    await click("Save draft");
    assert.equal(state.saved[0].content.pages[0].blocks[0].text, "  First  \r");
    assert.equal(state.saved[0].content.pages[0].blocks[1].text, "  Second\r\ncontinued  ");
  } finally { await state.cleanup(); }
});
// Catches an empty list rendering as a bare sentence with no way to fill it.
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
