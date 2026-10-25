import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";
import source from "../data/store-content.json";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name);
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
function strings(nodes: any[]): string[] {
  return nodes.flatMap(node => typeof node === "string" ? [node] : strings(node.children));
}
function tags(nodes: any[]): string[] {
  return nodes.flatMap(node => typeof node === "string" ? [] : [node.tag, ...tags(node.children)]);
}
for (const conflict of [false, true]) test(`staff edit original policy and blog copy without flattening structure (${conflict ? "conflict" : "saved"})`, async () => {
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
    const text = [...container.querySelectorAll<HTMLTextAreaElement>("textarea")].find(field => field.value === "Learn how Maple Furnishers collects, protects, and responsibly uses your information.");
    assert.ok(text, "Original paragraph is editable as text");
    text.focus();
    await change(text, "");
    assert.equal(document.contains(text), true, "Clearing a text leaf does not remove its editor");
    await change(text, "<script>literal copy</script> Our privacy information.");
    assert.equal(document.activeElement, text, "Editing a leaf preserves focus");
    assert.equal(container.querySelector("script"), null);
    await select("blog:recent-stories");
    await fill("Editorial page title", "Stories from Maple");
    await select("article:recent-stories/standard-dining-table-size-guide-for-indian-homes");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Editorial page title"]')?.value, "Standard Dining Table Size Guide for Indian Homes");
    await fill("Editorial page title", "Choosing a dining table");
    await fill("Article excerpt", "A guide to comfortable dining.");
    const checklist = [...container.querySelectorAll<HTMLTextAreaElement>("textarea")].find(field => field.value.trim() === "Before approving a dining table, check:");
    assert.ok(checklist, "Nested article text is editable");
    await change(checklist, "Before choosing your table, check:");
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
    assert.deepEqual(tags(editorial.policies[0].content), tags(source.policies["privacy-policy"].content), "Source heading and list structure is retained");
    assert.deepEqual(editorial.blogs, [{ handle: "recent-stories", title: "Stories from Maple" }]);
    assert.equal(editorial.articles.length, 1);
    assert.equal(editorial.articles[0].title, "Choosing a dining table");
    assert.equal(editorial.articles[0].excerpt, "A guide to comfortable dining.");
    assert.equal(editorial.articles[0].handle, "standard-dining-table-size-guide-for-indian-homes");
    assert.equal(editorial.articles[0].blog, "recent-stories");
    assert.equal(tags(editorial.articles[0].content).filter(tag => tag === "table").length, 2, "Article tables remain structured");
    assert.ok(strings(editorial.articles[0].content).includes("Before choosing your table, check:"));
    assert.deepEqual(saved.content.homeSections, initial.homeSections);
    assert.match(container.textContent ?? "", conflict ? /Another editor saved/ : /Draft saved/);
    assert.match(container.textContent ?? "", /Published version 2/);
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Editorial page title"]')?.value, "Privacy at Maple");
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Publish draft"), false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
