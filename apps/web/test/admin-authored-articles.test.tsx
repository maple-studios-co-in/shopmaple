import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
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
async function mount(initial = structuredClone(defaultStorefrontContent)) {
  const previous = globalThis.fetch; const root = createRoot(container); const saved: any[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "Article edits only save through the private content transport");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      const body = JSON.parse(String(init.body)); saved.push(body);
      return Response.json({ version: 5, draft: body.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={initial} onExpired={() => assert.fail("Unexpected expiry")} />));
  await click("Policies & blogs");
  return { saved, cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
async function createArticle(handle = "a-room-for-reading", title = "A room for reading") {
  await click("New article"); await select("New article blog", "news"); await fill("New article slug", handle); await fill("New article title", title); await click("Add article to draft");
}
// Catches publishing authoring prompts as real article content, while permitting incomplete local drafts.
test("new articles and blocks start blank and require staff copy before saving", async () => {
  const state = await mount();
  try {
    await createArticle();
    assert.equal(field("Block 1 text").value, "");
    await click("Save draft"); assert.equal(state.saved.length, 0);
    await createArticle("second-draft", "Second draft");
    assert.equal(field("Block 1 text").value, "", "An incomplete sibling does not block a new local draft");
    await fill("Block 1 text", "Second draft body.");
    await select("Authored article", "news/a-room-for-reading");
    await fill("Block 1 text", "A comfortable reading chair.");
    for (const [kind, label, copy] of [
      ["heading", "text", "Find a quiet corner"],
      ["quote", "text", "Make time to pause."],
      ["list", "list items", "A chair\nA lamp"],
      ["link", "link label", "Explore chairs"],
    ]) {
      await click(`Add ${kind}`);
      const blockNumber = container.querySelectorAll('[aria-label="Article block"]').length;
      assert.equal(field(`Block ${blockNumber} ${label}`).value, "");
      await click("Save draft"); assert.equal(state.saved.length, 0);
      await fill(`Block ${blockNumber} ${label}`, copy!);
    }
    await click("Save draft"); assert.equal(state.saved.length, 1);
    assert.equal(state.saved[0].content.authoredArticles[0].blocks[0].text, "A comfortable reading chair.");
    assert.equal(state.saved[0].content.authoredArticles[1].blocks[0].text, "Second draft body.");
  } finally { await state.cleanup(); }
});
// Catches missing authoring integration or a save that drops authored content.
test("staff create structured article copy and save through the global draft", async () => {
  const state = await mount();
  try {
    assert.equal(field("Editorial page title").value, "Privacy policy");
    await createArticle();
    await fill("Authored article excerpt", "Make space for a quiet evening.");
    await fill("Block 1 text", "<script>literal text</script> Bring a comfortable chair.");
    assert.equal(document.activeElement, field("Block 1 text"));
    await click("Add heading"); await fill("Block 2 text", "Choose a comfortable corner");
    await click("Add quote"); await fill("Block 3 text", "A place to pause.");
    await click("Add list"); await fill("Block 4 list items", "A chair\nA lamp");
    await click("Add link"); await fill("Block 5 link label", "Browse chairs"); await fill("Block 5 link destination", "/collections/chairs");
    assert.equal(container.querySelector("script"), null);
    assert.ok(container.querySelector('[aria-label="Authored article preview"] h2'));
    await click("Save draft"); assert.equal(state.saved.length, 1); assert.equal(state.saved[0].expectedVersion, 4);
    const article = state.saved[0].content.authoredArticles[0];
    assert.equal(article.blog, "news"); assert.equal(article.handle, "a-room-for-reading"); assert.equal(article.title, "A room for reading");
    assert.equal(article.excerpt, "Make space for a quiet evening."); assert.equal(article.publishedAt ?? null, null);
    assert.deepEqual(article.blocks.map(({ id, ...block }: any) => block), [
      { type: "paragraph", text: "<script>literal text</script> Bring a comfortable chair." },
      { type: "heading", level: 2, text: "Choose a comfortable corner" },
      { type: "quote", text: "A place to pause." },
      { type: "list", ordered: false, items: ["A chair", "A lamp"] },
      { type: "link", text: "Browse chairs", href: "/collections/chairs" },
    ]);
    assert.equal(new Set(article.blocks.map((block: any) => block.id)).size, 5);
    assert.deepEqual(state.saved[0].content.homeSections, defaultStorefrontContent.homeSections);
    assert.match(container.textContent ?? "", /whole storefront/);
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Publish draft"), false);
  } finally { await state.cleanup(); }
});
// Catches silent slug rewriting, route shadowing, duplicates, editable identity and accidental removal.
test("article identity is validated once and removal needs explicit confirmation", async () => {
  const state = await mount();
  try {
    await click("New article"); await select("New article blog", "recent-stories");
    await fill("New article slug", "standard-dining-table-size-guide-for-indian-homes"); await fill("New article title", "Reserved route"); await click("Add article to draft");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /reserved/i);
    await fill("New article slug", "Wrong Slug"); await click("Add article to draft");
    assert.equal(field("New article slug").value, "Wrong Slug"); assert.ok(container.querySelector('[role="alert"]'));
    await fill("New article slug", "new-dining-guide"); await click("Add article to draft");
    assert.equal(container.querySelector('[aria-label="New article slug"]'), null);
    assert.match(container.textContent ?? "", /\/blogs\/recent-stories\/new-dining-guide/);
    await click("New article"); await select("New article blog", "recent-stories"); await fill("New article slug", "new-dining-guide"); await fill("New article title", "Duplicate"); await click("Add article to draft");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /unique/i);
    await click("Cancel new article"); await click("Remove article"); assert.ok(field("Authored article title"));
    await click("Keep article"); assert.ok(field("Authored article title"));
    await click("Remove article"); await click("Confirm remove article");
    assert.equal(container.querySelector('[aria-label="Authored article title"]'), null);
    await click("Save draft"); assert.deepEqual(state.saved[0].content.authoredArticles, []);
  } finally { await state.cleanup(); }
});
// Catches unstable block focus, switching data loss, removing the last block and unsafe preview links.
test("block editing preserves focus across reorder and article switching", async () => {
  const state = await mount();
  try {
    await createArticle(); await fill("Block 1 text", "First paragraph"); await click("Add quote"); await fill("Block 2 text", "Second quotation");
    const move = button("Move up", container.querySelectorAll('[aria-label="Article block"]')[1]); move.focus(); await act(async () => move.click());
    assert.ok(document.activeElement === field("Block 1 text"), "Boundary moves focus the moved block text instead of a now-disabled control"); assert.equal(field("Block 1 text").value, "Second quotation");
    await createArticle("another-room", "Another room"); await fill("Block 1 text", "Another room body."); await select("Authored article", "news/a-room-for-reading");
    assert.equal(field("Block 1 text").value, "Second quotation");
    await click("Remove block", container.querySelectorAll('[aria-label="Article block"]')[0]);
    assert.equal(field("Block 1 text").value, "First paragraph"); assert.equal(button("Remove block", container.querySelector('[aria-label="Article block"]')!).disabled, true);
    await click("Add link"); await fill("Block 2 link destination", "javascript:alert(1)");
    assert.equal(container.querySelector('[aria-label="Authored article preview"] a[href^="javascript:"]'), null);
    await click("Save draft"); assert.equal(state.saved.length, 0);
    await fill("Block 2 link destination", "/collections/all"); await fill("Block 2 link label", "Browse furniture"); await click("Save draft");
    assert.equal(state.saved[0].content.authoredArticles.length, 2);
  } finally { await state.cleanup(); }
});
// Catches native-browser focus loss when a reorder disables the activated boundary button.
test("reordering to either boundary moves keyboard focus into the moved block", async () => {
  const state = await mount();
  try {
    await createArticle(); await fill("Block 1 text", "First paragraph");
    await click("Add quote"); await fill("Block 2 text", "Middle quotation");
    await click("Add heading"); await fill("Block 3 text", "Last heading");
    const middleUp = button("Move up", container.querySelectorAll('[aria-label="Article block"]')[1]);
    middleUp.focus(); await act(async () => middleUp.click());
    assert.equal(field("Block 1 text").value, "Middle quotation");
    assert.ok(document.activeElement === field("Block 1 text"), "Moving to the first position focuses the moved block text");
    const firstDown = button("Move down", container.querySelectorAll('[aria-label="Article block"]')[0]);
    firstDown.focus(); await act(async () => firstDown.click());
    assert.ok(document.activeElement === firstDown, "An enabled reorder control retains focus away from boundaries");
    await act(async () => firstDown.click());
    assert.equal(field("Block 3 text").value, "Middle quotation");
    assert.ok(document.activeElement === field("Block 3 text"), "Moving to the last position focuses the moved block text");
  } finally { await state.cleanup(); }
});
// Catches image publication leaks: admin previews must use private media transport while saved content keeps canonical URLs.
test("cover and body images use the library and private previews", async () => {
  const state = await mount(); const contentTransport = globalThis.fetch;
  const hash = "a".repeat(64); const url = `/media/uploads/${hash}.webp`; const previewUrl = `/api/admin/media/${hash}/preview`;
  globalThis.fetch = async (input, init) => String(input) === "/api/admin/media" ? Response.json({ assets: [{ id: "asset", sha256: hash, label: "Reading room", width: 120, height: 80, bytes: 400, mimeType: "image/webp", createdAt: "2026-10-26T00:00:00Z", publicAt: null, url, previewUrl }], nextCursor: null }) : contentTransport(input, init);
  try {
    await createArticle();
    await fill("Block 1 text", "Make room for a chair by the window.");
    await click("Choose image"); await click("Use image: Reading room");
    assert.equal(field("Cover image description").value, "");
    await click("Save draft"); assert.equal(state.saved.length, 0, "A cover requires staff-written alt text");
    await fill("Cover image description", "A quiet reading room");
    await click("Add image");
    const imageComposer = container.querySelector('[aria-label="New image block"]'); assert.ok(imageComposer);
    await click("Choose image", imageComposer); await click("Use image: Reading room", imageComposer);
    assert.equal(field("Block 2 image description").value, "");
    await click("Save draft"); assert.equal(state.saved.length, 0, "A body image requires staff-written alt text");
    await fill("Block 2 image description", "A chair by the window");
    const preview = container.querySelector('[aria-label="Authored article preview"]')!;
    assert.deepEqual([...preview.querySelectorAll("img")].map(image => image.getAttribute("src")), [previewUrl, previewUrl]);
    await click("Save draft");
    assert.deepEqual(state.saved[0].content.authoredArticles[0].cover, { src: url, alt: "A quiet reading room" });
    assert.equal(state.saved[0].content.authoredArticles[0].blocks[1].src, url);
    assert.equal(state.saved[0].content.authoredArticles[0].blocks[1].alt, "A chair by the window");
  } finally { await state.cleanup(); }
});
// Catches missing editor caps before the API rejects an oversized draft.
test("article and block limits disable additions while keeping existing content editable", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  initial.authoredArticles = Array.from({ length: 20 }, (_, index) => ({ blog: "news", handle: `article-${index}`, title: `Article ${index}`, excerpt: "", blocks: Array.from({ length: index === 0 ? 60 : 1 }, (_, block) => ({ id: `block-${block}`, type: "paragraph", text: `Paragraph ${block}` })) }));
  const state = await mount(initial);
  try {
    assert.equal(button("New article").disabled, true);
    assert.equal(button("Add paragraph").disabled, true); assert.equal(button("Add image").disabled, true);
    await fill("Block 1 text", "Updated at the limit"); await click("Save draft");
    assert.equal(state.saved[0].content.authoredArticles[0].blocks[0].text, "Updated at the limit");
  } finally { await state.cleanup(); }
});
// Catches an empty article list offering no clear starting point.
test("no authored articles shows an empty state whose action starts a new article", async () => {
  const { AuthoredArticleFields } = await import("../components/admin/authored-article-fields");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AuthoredArticleFields value={[]} onChange={() => {}} session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} onExpired={() => {}} />));
    const empty = container.querySelector<HTMLElement>("[data-empty]"); assert.ok(empty, "An empty article list is a designed state");
    await click("New article", empty);
    assert.ok(field("New article slug")); assert.equal(container.querySelector("[data-empty]"), null);
  } finally { await act(async () => root.unmount()); }
});
