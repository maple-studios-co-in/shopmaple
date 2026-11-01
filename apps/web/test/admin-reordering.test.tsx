import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Every ordered admin list reorders by keyboard drag and saves exactly the order
// the Move up/down buttons would have produced, so the content contracts are unchanged.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, {
  window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
});
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
const rowHeight = 40;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const row = (this as HTMLElement).closest("[data-sortable-row]");
  const rows = [...document.querySelectorAll("[data-sortable-row]")];
  const index = row ? rows.indexOf(row) : -1;
  const top = index >= 0 ? index * rowHeight : 0, height = index >= 0 ? rowHeight : rows.length * rowHeight;
  return { x: 0, y: top, top, left: 0, width: 300, right: 300, height, bottom: top + height, toJSON() { return this; } } as DOMRect;
};

function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function select(label: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`); assert.ok(input, `Missing ${label} selector`);
  await act(async () => { input.value = value; input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
async function tab(list: string, name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>(`[role="tablist"][aria-label="${list}"] [role="tab"]`)].find(t => t.textContent === name);
  assert.ok(found, `Missing ${name} tab`);
  await act(async () => found.click());
}
async function key(target: Element, code: string) {
  await act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true })); });
}
/** Lift with space, press the arrow `steps` times, drop with space. */
async function drag(name: string, direction: "ArrowUp" | "ArrowDown", steps: number) {
  const handle = button(`Drag ${name}`);
  handle.focus();
  await key(handle, "Space");
  for (let step = 0; step < steps; step++) await key(handle, direction);
  await key(handle, "Space");
}
const product = (handle: string) => ({ id: handle, handle, title: `Product ${handle}`, description: "", category: "chairs", images: [], published: true, source: "fixture", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] });
const tile = (key: string) => ({ key, title: `Tile ${key}`, collectionHandle: key, image: "/media/test.webp", alt: `Image ${key}`, enabled: true });
async function setup(prepare: (content: StorefrontContent) => void = () => {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  prepare(initial);
  let saved: any;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.startsWith("/api/products?")) return Response.json({ products: ["alpha", "bravo"].map(product), total: 2, page: 1, limit: 20, mode: "preview", checkoutEnabled: false });
    assert.equal(path, "/api/admin/content", "Reordering only saves through the private content transport");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      saved = JSON.parse(String(init.body));
      return Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return {
    initial,
    save: async () => { await click("Save draft"); assert.ok(saved, "Save draft sent the draft"); assert.equal(saved.expectedVersion, 4); return saved.content as StorefrontContent; },
    close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; },
  };
}

test("homepage sections drag into the order the buttons would produce", async () => {
  const app = await setup();
  try {
    await click("Homepage");
    assert.equal(button("Move Hero up").disabled, true, "Buttons stay as the fallback");
    await drag("Hero", "ArrowDown", 2);
    const content = await app.save();
    assert.deepEqual(content.homeSections.slice(0, 4).map(section => section.key), ["announcement", "difference", "hero", "categories"]);
    assert.deepEqual(content.homeSections.slice(3), app.initial.homeSections.slice(3));
  } finally { await app.close(); }
});

test("merchandising product rails and collection tiles drag and save", async () => {
  const app = await setup(content => { content.homeMerchandising = { bestsellers: ["alpha", "bravo"], chairs: [], categories: [tile("sofas"), tile("beds"), tile("tables")], offers: [tile("chairs")] }; });
  try {
    await click("Merchandising");
    await drag("alpha in Bestsellers", "ArrowDown", 1);
    await drag("category tile 3", "ArrowUp", 2);
    const content = await app.save();
    assert.deepEqual(content.homeMerchandising!.bestsellers, ["bravo", "alpha"]);
    assert.deepEqual(content.homeMerchandising!.categories.map(item => item.key), ["tables", "sofas", "beds"]);
    assert.deepEqual(content.homeMerchandising!.offers.map(item => item.key), ["chairs"]);
  } finally { await app.close(); }
});

test("homepage city artwork drags and saves complete identities", async () => {
  const app = await setup(content => { delete content.homeCitiesLayout; });
  try {
    await click("Homepage");
    await drag("Delhi", "ArrowDown", 2);
    const content = await app.save();
    assert.deepEqual(content.homeCitiesLayout!.slice(0, 3), [{ key: "kolkata", enabled: true }, { key: "hyderabad", enabled: true }, { key: "delhi", enabled: true }]);
    assert.equal(content.homeCitiesLayout!.length, 18);
  } finally { await app.close(); }
});

test("category page sections drag within their own page", async () => {
  const app = await setup();
  try {
    await click("Category pages");
    await drag("Sofas hero", "ArrowDown", 1);
    const content = await app.save();
    const sofas = content.landingPages.find(page => page.slug === "sofas")!;
    assert.deepEqual(sofas.sections.slice(0, 3).map(section => section.key), ["categories", "hero", "sale"]);
    assert.deepEqual(content.landingPages.find(page => page.slug === "tables"), app.initial.landingPages.find(page => page.slug === "tables"), "Only the edited page changes");
  } finally { await app.close(); }
});

test("Nimbus page sections drag and save", async () => {
  const app = await setup();
  try {
    await click("Existing pages"); await select("Existing page", "nimbus");
    await drag("Nimbus Hero film", "ArrowDown", 1);
    const content = await app.save();
    assert.deepEqual(content.nimbusPage!.sections.slice(0, 3).map(section => section.key), ["intro", "hero", "rooms-grid"]);
  } finally { await app.close(); }
});

test("Our Story sections drag and save", async () => {
  const app = await setup();
  try {
    await click("Existing pages");
    await drag("Our Story Journey", "ArrowUp", 1);
    const content = await app.save();
    assert.deepEqual(content.storyPage!.sections.map(section => section.key), ["hero", "journey", "belief-film", "cities"]);
  } finally { await app.close(); }
});

test("service page sections drag and save", async () => {
  const app = await setup();
  try {
    await click("Existing pages"); await select("Existing page", "contact");
    await drag("Contact Cities", "ArrowUp", 2);
    const content = await app.save();
    assert.deepEqual(content.servicePages!.contact.sections.map(section => section.key), ["cities", "intro", "help"]);
  } finally { await app.close(); }
});

test("navigation items and footer columns drag and save", async () => {
  const app = await setup(content => { delete content.siteChrome; });
  try {
    await click("Navigation & footer"); await tab("Navigation & footer section", "Main navigation");
    await drag("navigation item 5", "ArrowUp", 1);
    await tab("Navigation & footer section", "Footer");
    await drag("footer care", "ArrowUp", 2);
    const content = await app.save();
    assert.deepEqual(content.siteChrome!.navigation.map(item => item.id), ["nav-1", "nav-2", "nav-3", "nav-5", "nav-4"]);
    assert.deepEqual(content.siteChrome!.footer.columns.map(column => column.key), ["care", "shop", "help"]);
  } finally { await app.close(); }
});

