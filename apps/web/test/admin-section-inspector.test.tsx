import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The section inspector: Edit on a homepage section opens everything that section draws from
// (its text, its artwork, its layout and its motion) in the editor column, beside the live
// preview, instead of sending staff to the Artwork, Merchandising or Campaigns screens.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLIFrameElement: dom.window.HTMLIFrameElement, MessageEvent: dom.window.MessageEvent, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const { previewMessageSource } = await import("../lib/live-preview");
const container = document.getElementById("root")!;
const token = "eyJzIjoiZWRpdG9yIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function until(condition: () => boolean, what: string, limitMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > limitMs) assert.fail(`Timed out waiting for: ${what}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}
function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function click(name: string, scope?: ParentNode) { await act(async () => button(name, scope).click()); }
function field<T extends HTMLElement = HTMLInputElement>(label: string, scope: ParentNode = container) {
  const found = scope.querySelector<T>(`[aria-label="${label}"]`) ?? [...scope.querySelectorAll("label")].find((l) => l.textContent?.trim().startsWith(label))?.control as T | undefined;
  assert.ok(found, `Missing ${label} field`);
  return found;
}
async function type(label: string, value: string, scope?: ParentNode) {
  const input = field(label, scope);
  const proto = input instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const inspector = () => container.querySelector<HTMLElement>("[data-section-inspector]");
const tabs = () => [...(inspector()?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => tab.textContent?.trim());
async function openTab(name: string) {
  const tab = [...inspector()!.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.trim() === name);
  assert.ok(tab, `Missing ${name} tab`);
  await act(async () => tab.click());
}

async function setup() {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const puts: any[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/api/admin/content" && method === "PUT") { puts.push(body); return Response.json({ version: body.expectedVersion + 1, draft: body.content, publishedVersion: 2, updatedAt: "2026-11-01T09:00:00Z" }); }
    if (path === "/api/admin/content/preview" && method === "POST") return Response.json({ token, version: body.expectedVersion, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (path === "/api/admin/content") return Response.json({ version: 4, draft: structuredClone(defaultStorefrontContent), publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    return Response.json({ products: [], total: 0, page: 1, limit: 24, items: [], mode: "preview", checkoutEnabled: false });
  };
  await act(async () => root.render(
    <ContentEditor
      session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent}
      onExpired={() => assert.fail("Unexpected expiry")}
      livePreviewDebounceMs={30}
    />,
  ));
  await until(() => Boolean([...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Homepage")), "the editor");
  await click("Homepage");
  return { puts, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const card = (key: string) => container.querySelector<HTMLElement>(`[data-section-card="${key}"]`)!;

test("Edit on Cities opens one inspector with its text, artwork, layout and motion, and saving keeps every change", async () => {
  const app = await setup();
  try {
    await click("Edit Cities", card("cities"));
    assert.equal(inspector()?.getAttribute("data-section-inspector"), "cities");
    assert.equal(container.querySelector("[data-section-card]"), null, "the inspector replaces the section list in the editor column");
    assert.deepEqual(tabs(), ["Content", "Media", "Layout", "Motion"]);

    await type("Cities heading", "Delivering across India");
    await openTab("Media");
    const placements = [...field<HTMLSelectElement>("Artwork placement", inspector()!).options].map((o) => o.textContent);
    assert.equal(placements.length, 18, "every city illustration, and nothing from other sections");
    assert.ok(placements.includes("Delhi city artwork"));
    await type("Desktop image URL", "/media/uploads/delhi-new.webp", inspector()!);
    await openTab("Layout");
    assert.ok(inspector()!.querySelector('[aria-label="City artwork Delhi"]'), "city order and visibility");
    await openTab("Motion");
    const autoplay = field("Automatically move city illustrations", inspector()!);
    await act(async () => autoplay.click());

    await click("Save draft");
    await until(() => app.puts.length === 1, "the save");
    const saved = app.puts[0].content;
    assert.equal(saved.homeDetails.cities.heading, "Delivering across India");
    assert.deepEqual(saved.templateMedia.map((m: { key: string; image: string }) => [m.key, m.image]), [["home-city-delhi", "/media/uploads/delhi-new.webp"]], "only Delhi's artwork is replaced");
    assert.equal(saved.motion.autoplayCities, false);
    const { homeDetails: _d, templateMedia: _t, motion: _m, ...rest } = saved;
    const { homeDetails: _dd, templateMedia: _td, motion: _md, ...untouched } = defaultStorefrontContent as typeof saved;
    assert.deepEqual(rest, JSON.parse(JSON.stringify(untouched)), "nothing else in the draft changes");

    await click("Back to sections");
    assert.equal(inspector(), null);
    await until(() => document.activeElement === button("Edit Cities", card("cities")), "focus back on the Cities card");
  } finally { await app.close(); }
});

test("product rails, banners and Instagram are edited in place, scoped to that one section", async () => {
  const app = await setup();
  try {
    await click("Edit Bestsellers", card("bestsellers"));
    assert.ok(field("Bestsellers heading", inspector()!));
    assert.ok(inspector()!.querySelector('[aria-label="Bestsellers selection"]'));
    assert.equal(inspector()!.querySelector('[aria-label="Chairs selection"]'), null, "only this section's rail");
    assert.ok(container.querySelector('[aria-label="Homepage editor"]'), "still on the Homepage screen");
    await click("Back to sections");

    await click("Edit Dining Banner", card("dining-banner"));
    assert.equal(inspector()?.getAttribute("data-section-inspector"), "dining-banner");
    assert.equal(inspector()!.querySelector('[aria-label="Campaign"]'), null, "no choosing among other campaigns");
    assert.ok(inspector()!.querySelector("[data-campaign-key='landing-dining-table']"));
    await click("Back to sections");

    await click("Edit Instagram", card("instagram"));
    assert.ok(field("Social heading", inspector()!));
    assert.deepEqual(tabs(), ["Content", "Motion"]);
  } finally { await app.close(); }
});

test("Edit in the live preview opens that section's inspector", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await until(() => Boolean(container.querySelector("iframe[data-live-preview-frame]")), "the preview frame");
    const frameWindow = container.querySelector<HTMLIFrameElement>("iframe[data-live-preview-frame]")!.contentWindow!;
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, type: "select", section: "values" }, origin: "http://localhost:3000", source: frameWindow })); });
    assert.equal(inspector()?.getAttribute("data-section-inspector"), "values");
    assert.ok(field("Quiet luxury title", inspector()!));
  } finally { await app.close(); }
});

test("the three promo banners share one inspector that edits the chosen campaign by name", async () => {
  const app = await setup();
  try {
    await click("Edit Promos", card("promos"));
    const choice = field<HTMLSelectElement>("Campaign", inspector()!);
    assert.deepEqual([...choice.options].map((o) => o.textContent), ["landing dining", "landing storage", "landing consoles"]);
    const storage = [...choice.options].find((o) => o.textContent === "landing storage")!;
    await act(async () => { choice.value = storage.value; choice.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await type("Campaign label", "Storage week", inspector()!);
    await click("Save draft");
    await until(() => app.puts.length === 1, "the save");
    assert.equal(app.puts[0].content.campaigns.find((c: { key: string }) => c.key === "landing-storage").label, "Storage week");
    assert.equal(app.puts[0].content.campaigns.find((c: { key: string }) => c.key === "landing-dining").label, defaultStorefrontContent.campaigns.find((c) => c.key === "landing-dining")!.label);
  } finally { await app.close(); }
});

test("while a campaign schedule is open, the inspector stays put: Back is disabled and Edit in the preview waits", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await until(() => Boolean(container.querySelector("iframe[data-live-preview-frame]")), "the preview frame");
    await click("Edit Dining Banner", card("dining-banner"));
    await click("Enable schedule", inspector()!);
    assert.equal(button("Back to sections").disabled, true);
    const frameWindow = container.querySelector<HTMLIFrameElement>("iframe[data-live-preview-frame]")!.contentWindow!;
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, type: "select", section: "values" }, origin: "http://localhost:3000", source: frameWindow })); });
    assert.equal(inspector()?.getAttribute("data-section-inspector"), "dining-banner", "the open schedule is not thrown away");
    await click("Cancel schedule edit", inspector()!);
    assert.equal(button("Back to sections").disabled, false);
  } finally { await app.close(); }
});

test("a one-panel section shows no tabs; Instagram has one heading; hiding from the inspector hides the section", async () => {
  const app = await setup();
  try {
    await click("Edit Project", card("project"));
    assert.equal(inspector()!.querySelector('[role="tablist"]'), null);
    assert.ok(field("Project heading", inspector()!));
    const show = field("Show on the homepage", inspector()!);
    await act(async () => show.click());
    await click("Back to sections");
    assert.equal(card("project").dataset.hidden, "true");

    await click("Edit Instagram", card("instagram"));
    assert.deepEqual([...inspector()!.querySelectorAll("h2")].map((h) => h.textContent), ["Instagram"]);
    await click("Homepage");
    assert.equal(inspector(), null, "the Homepage item returns to the section list");
  } finally { await app.close(); }
});
