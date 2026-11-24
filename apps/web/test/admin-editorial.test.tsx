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
const { storefrontContentSchema } = await import("@shopmaple/contracts");
const container = document.getElementById("root")!;
const session = { user: { id: "editor", email: "editor@example.test", role: "editor" as const }, csrfToken: "c".repeat(64) };

function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name || b.getAttribute("aria-label") === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function click(name: string, scope?: ParentNode) { await act(async () => button(name, scope).click()); }
async function change(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  for (let parent = field.parentElement; parent; parent = parent.parentElement)
    if (parent.tagName === "DETAILS" && !(parent as HTMLDetailsElement).open) await act(async () => parent!.querySelector<HTMLElement>("summary")!.click());
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
function field(label: string) {
  const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(found, `Missing ${label} field`);
  return found;
}
const fill = async (label: string, value: string) => change(field(label), value);
/** The section tabs (Radix) change on mouse down. */
async function openTab(name: "Policies" | "Articles" | "Blogs") {
  const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(item => item.textContent?.startsWith(name));
  assert.ok(tab, `Missing ${name} tab`);
  await act(async () => { tab.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, button: 0 })); });
}
/** Opens a listed policy, article or blog by its address part. */
async function openItem(id: string) {
  const row = container.querySelector<HTMLButtonElement>(`[data-editorial-open="${id}"]`);
  assert.ok(row, `Missing ${id} in the list`);
  await act(async () => row.click());
}
/** The rich-text editor on screen; TipTap keeps its instance on the editable element. */
async function richText(label: string) {
  const selector = `[role="textbox"][aria-label="${label}"]`;
  for (let i = 0; i < 100 && !container.querySelector(selector); i++) await act(() => new Promise(r => setTimeout(r, 10)));
  const element = container.querySelector<HTMLElement & { editor?: any }>(selector);
  assert.ok(element?.editor, `${label} is a rich-text editor`);
  return element.editor;
}
const strings = (nodes: any[]): string[] => nodes.flatMap(node => typeof node === "string" ? [node] : strings(node.children));
const tags = (nodes: any[]): string[] => nodes.flatMap(node => typeof node === "string" ? [] : [node.tag, ...tags(node.children)]);
async function mount(respond: (init?: RequestInit) => Response | Promise<Response>) {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "Only the private content endpoint is used");
    return respond(init);
  };
  await act(async () => root.render(<ContentEditor session={session} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  await click("Policies & blogs");
  return async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
}

for (const conflict of [false, true]) test(`staff edit policies, blogs and articles as rich text without losing their structure (${conflict ? "conflict" : "saved"})`, async () => {
  const initial = structuredClone(defaultStorefrontContent);
  let saved: any;
  let puts = 0;
  const cleanup = await mount(init => {
    if (init?.method !== "PUT") return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    puts++;
    assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
    saved = JSON.parse(String(init.body));
    return conflict ? Response.json({ error: "Version conflict" }, { status: 409 }) : Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  });
  try {
    assert.deepEqual([...container.querySelectorAll('[aria-label="Policies"] [data-editorial-open]')].map(item => item.textContent),
      Object.values(source.policies).map(policy => policy.title), "every policy is listed");
    await openItem("privacy-policy");
    assert.equal(field("Policy title").value, "Privacy policy");
    await fill("Policy title", "");
    await click("Save draft");
    assert.equal(puts, 0, "Invalid title must not be sent");
    assert.match(container.textContent ?? "", /Give the policy a title before saving/);
    await fill("Policy title", "Privacy at Maple");
    const editor = await richText("Policy text");
    assert.match(editor.view.dom.textContent ?? "", /Learn how Maple Furnishers collects, protects, and responsibly uses your information\./, "the page reads as a document");
    for (const name of ["Undo", "Redo", "Bold", "Italic", "Underline", "Strikethrough", "Superscript", "Subscript", "Text colour", "Highlight", "Align left", "Align centre",
      "Align right", "Justify", "Bulleted list", "Numbered list", "Decrease indent", "Increase indent", "Link", "Insert table", "Quote", "Divider line", "Clear formatting"])
      assert.ok(container.querySelector(`[aria-label="Policy text formatting"] [aria-label="${name}"]`), `${name} in the toolbar`);
    assert.ok(container.querySelector('[aria-label="Policy text formatting"] select[aria-label="Text style"]'));
    assert.ok(button("Full screen"), "full screen writing");
    assert.match(container.querySelector("[data-word-count]")?.textContent ?? "", /^\d+ words · \d+ min read$/);
    await act(async () => { editor.chain().focus("end", { scrollIntoView: false }).insertContent({ type: "paragraph", content: [{ type: "text", text: "<script>literal copy</script> Our privacy information." }] }).run(); });
    assert.equal(container.querySelector("script"), null, "typed HTML stays text");
    await click("Link");
    await fill("Link address", "javascript:alert(1)");
    assert.equal(button("Apply link").disabled, true, "an unsafe link cannot be applied");
    assert.ok([...container.querySelectorAll('[role="alert"]')].some(alert => /store page/.test(alert.textContent ?? "")), "and says which links are allowed");
    await click("Cancel");

    await openTab("Blogs");
    await openItem("recent-stories");
    await fill("Blog name", "Stories from Maple");
    await openTab("Articles");
    await openItem("recent-stories/standard-dining-table-size-guide-for-indian-homes");
    assert.equal(field("Article title").value, "Standard Dining Table Size Guide for Indian Homes");
    await fill("Article title", "Choosing a dining table");
    await fill("Excerpt", "A guide to comfortable dining.");
    const article = await richText("Article text");
    assert.match(article.view.dom.textContent ?? "", /Before approving a dining table, check:/, "article text is in the editor");
    assert.equal(article.view.dom.querySelectorAll("table").length, 2, "tables are editable in place");
    let cell = 0;
    article.state.doc.descendants((node: any, pos: number) => { if (!cell && node.type.name === "tableCell") cell = pos + 2; });
    await act(async () => { article.chain().focus(cell, { scrollIntoView: false }).run(); });
    const rows = article.view.dom.querySelector("table")!.querySelectorAll("tr").length;
    await click("Row below", container.querySelector('[aria-label="Table"]')!);
    assert.equal(article.view.dom.querySelector("table")!.querySelectorAll("tr").length, rows + 1, "the table tools add a row");
    await click("Undo", container.querySelector('[aria-label="Article text formatting"]')!);
    await act(async () => { article.chain().focus("start", { scrollIntoView: false }).insertContent("Before choosing your table. ").run(); });

    await openTab("Policies");
    assert.equal(field("Policy title").value, "Privacy at Maple", "each section keeps its open page and edits");
    await click("Save draft");
    assert.equal(puts, 1);
    assert.equal(saved.expectedVersion, 4);
    const editorial = saved.content.editorialContent;
    assert.deepEqual(editorial.policies.map((policy: any) => [policy.slug, policy.title]), [["privacy-policy", "Privacy at Maple"]], "only edited policies are stored");
    assert.ok(strings(editorial.policies[0].content).includes("<script>literal copy</script> Our privacy information."));
    const kept = (nodes: any[]) => tags(nodes).filter(tag => ["h2", "ul", "li", "strong"].includes(tag));
    assert.deepEqual(kept(editorial.policies[0].content), kept(source.policies["privacy-policy"].content), "source headings and lists are retained");
    assert.deepEqual(editorial.blogs, [{ handle: "recent-stories", title: "Stories from Maple" }]);
    assert.deepEqual(editorial.articles.map((item: any) => [item.blog, item.handle, item.title, item.excerpt]),
      [["recent-stories", "standard-dining-table-size-guide-for-indian-homes", "Choosing a dining table", "A guide to comfortable dining."]]);
    assert.equal(tags(editorial.articles[0].content).filter(tag => tag === "table").length, 2, "article tables remain structured");
    assert.ok(strings(editorial.articles[0].content).some(text => text.includes("Before choosing your table.")));
    assert.deepEqual(saved.content.homeSections, initial.homeSections);
    assert.match(container.textContent ?? "", conflict ? /Another editor saved/ : /Draft saved/);
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Publish draft"), false);
  } finally { await cleanup(); }
});

test("clicking into a page does not change the draft, and Reload latest draft shows the server's text in the editor", async () => {
  let gets = 0;
  const cleanup = await mount(init => {
    if (init?.method === "PUT") return Response.json({ error: "Version conflict" }, { status: 409 });
    gets++;
    const draft = structuredClone(defaultStorefrontContent);
    if (gets > 1) draft.editorialContent = { policies: [{ slug: "privacy-policy", title: "Privacy policy", content: [{ tag: "p", children: ["Newer text from another editor."] }] }], blogs: [], articles: [] };
    return Response.json({ version: 4 + gets, draft, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  });
  try {
    await openItem("refund-policy");
    const refund = await richText("Policy text");
    await act(async () => { refund.commands.focus("end", { scrollIntoView: false }); refund.commands.focus("start", { scrollIntoView: false }); });
    assert.equal(button("Save draft").disabled, true, "moving the cursor is not an edit");
    await click("All policies");
    await openItem("privacy-policy");
    const privacy = await richText("Policy text");
    await act(async () => { privacy.chain().focus("end", { scrollIntoView: false }).insertContent("Local words.").run(); });
    await click("Save draft");
    await click("Reload latest draft");
    for (let i = 0; i < 50 && !/Newer text/.test((await richText("Policy text")).view.dom.textContent ?? ""); i++) await act(() => new Promise(r => setTimeout(r, 10)));
    assert.equal((await richText("Policy text")).view.dom.textContent, "Newer text from another editor.", "the editor shows the reloaded draft, not the discarded local text");
  } finally { await cleanup(); }
});

test("articles take pictures from the media library, as the Pages editor does (owner, 12 Nov 2026)", async () => {
  const upload = `/media/uploads/${"a".repeat(64)}.webp`;
  let saved: any;
  const cleanup = await mount(init => {
    if (init?.method !== "PUT") return Response.json({ version: 4, draft: defaultStorefrontContent, publishedVersion: 2, updatedAt: "2026-11-12T12:00:00Z" });
    saved = JSON.parse(String(init.body));
    return Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-11-12T12:00:00Z" });
  });
  try {
    await openTab("Articles");
    await openItem("recent-stories/how-to-measure-furniture-before-ordering-online");
    const editor = await richText("Article text");
    assert.ok([...container.querySelectorAll('[aria-label="Article text formatting"] button')].some(b => b.textContent === "Image"), "the toolbar offers a picture");
    await act(async () => { editor.chain().focus("end", { scrollIntoView: false }).setImage({ src: upload, alt: "A tape measure on a sofa arm" }).run(); });
    assert.ok(editor.view.dom.querySelector('img[alt="A tape measure on a sofa arm"]'), "the editor shows the picture where it goes");
    await click("Save draft");
    const pictures = (nodes: any[]): any[] => nodes.flatMap(node => typeof node === "string" ? [] : node.tag === "img" ? [node] : pictures(node.children));
    assert.deepEqual(pictures(saved.content.editorialContent.articles[0].content).map(node => [node.src, node.alt]), [[upload, "A tape measure on a sofa arm"]]);
    assert.equal(storefrontContentSchema.safeParse(saved.content).success, true, "the picture is valid editorial content");
  } finally { await cleanup(); }
});

test("staff add, format, hide, duplicate and delete policies, articles and blogs, and the draft saves (owner, 24 Nov 2026)", async () => {
  let saved: any;
  const cleanup = await mount(init => {
    if (init?.method !== "PUT") return Response.json({ version: 4, draft: defaultStorefrontContent, publishedVersion: 2, updatedAt: "2026-11-24T12:00:00Z" });
    saved = JSON.parse(String(init.body));
    return Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-11-24T12:00:00Z" });
  });
  try {
    // A new policy, in the footer, with formatted text.
    await click("New policy");
    await fill("Policy title", "Warranty Policy");
    assert.equal(field("Address").value, "warranty-policy", "the address follows the title");
    await click("Create policy");
    assert.match(container.querySelector('[aria-label="Policies and blogs"] h3')?.textContent ?? "", /Warranty Policy/, "the new policy opens");
    const text = await richText("Policy text");
    assert.equal(text.view.dom.querySelector(".is-empty")?.getAttribute("data-placeholder"), "Start writing the policy. Use Heading for each section.");
    await act(async () => { text.chain().focus("end", { scrollIntoView: false }).insertContent("Covered for five years.").selectAll().run(); });
    for (const name of ["Bold", "Highlight", "Align centre"]) await click(name);
    await click("Text colour");
    await click("Maple red");
    await click("All policies");
    // Another one, deleted again; an original hidden.
    await click("New policy");
    await fill("Policy title", "Care Policy");
    await click("Create policy");
    await click("All policies");
    await click("Delete Care Policy");
    await click("Delete policy");
    assert.equal(container.querySelector('[data-editorial-open="care-policy"]'), null, "deleted");
    await click("Hide Privacy policy from the site");
    assert.match(container.querySelector('[data-editorial-item="privacy-policy"]')?.textContent ?? "", /Hidden/);

    // A new article, a hidden copy of an imported one, and that copy deleted.
    await openTab("Articles");
    await click("New article");
    await fill("Article title", "A room for reading");
    await click("Create article");
    const body = await richText("Article text");
    await act(async () => { body.chain().focus("end", { scrollIntoView: false }).insertContent("Light, a chair and a lamp.").run(); });
    await fill("Excerpt", "Reading corners.");
    await click("All articles");
    await fill("Find an article", "standard dining");
    assert.equal(container.querySelectorAll('[aria-label="Articles"] [data-editorial-open]').length, 1, "search narrows the list");
    await click("Duplicate Standard Dining Table Size Guide for Indian Homes");
    assert.match(field("Article title").value, /^Copy of Standard Dining Table/, "the copy opens");
    assert.match(container.textContent ?? "", /hidden copy/);
    await click("All articles");
    await fill("Find an article", "");
    await click("Delete Copy of Standard Dining Table Size Guide for Indian Homes");
    await click("Delete article");

    // A blog added and deleted; one that has articles cannot be.
    await openTab("Blogs");
    await click("New blog");
    await fill("Blog name", "Care guides");
    await click("Create blog");
    await click("All blogs");
    await click("Delete Care guides");
    await click("Delete blog");
    assert.equal(container.querySelector('[data-editorial-open="care-guides"]'), null);

    await click("Save draft");
    assert.ok(saved, "the draft was saved");
    const content = saved.content;
    const policies = Object.fromEntries(content.editorialContent.policies.map((policy: any) => [policy.slug, policy]));
    assert.deepEqual(Object.keys(policies).sort(), ["privacy-policy", "warranty-policy"]);
    assert.equal(policies["privacy-policy"].hidden, true);
    assert.deepEqual(policies["warranty-policy"].content, [{ tag: "p", align: "center", children: [{ tag: "span", color: "maple", children: [{ tag: "mark", children: [{ tag: "strong", children: ["Covered for five years."] }] }] }] }]);
    const footer = content.siteChrome.footer.policyLinks;
    assert.deepEqual(footer.find((link: any) => link.href === "/policies/warranty-policy"), { id: "policy-warranty-policy", label: "Warranty Policy", href: "/policies/warranty-policy", enabled: true });
    assert.equal(footer.find((link: any) => link.href === "/policies/privacy-policy").enabled, false, "the hidden policy's footer link is off");
    assert.deepEqual(content.authoredArticles.map((article: any) => [article.blog, article.handle, article.title, article.excerpt, strings(article.content).join("")]),
      [["news", "a-room-for-reading", "A room for reading", "Reading corners.", "Light, a chair and a lamp."]]);
    assert.equal(content.editorialContent.blogs.length, 0);
    assert.equal(storefrontContentSchema.safeParse(content).success, true, "everything saved is valid content");
  } finally { await cleanup(); }
});
