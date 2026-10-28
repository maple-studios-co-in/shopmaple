import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Each admin list must save exactly the order produced by keyboard drag-and-drop.
// The expected arrays below are written out by hand from the bundled defaults.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin", pretendToBeVisual: true });
const w = dom.window;
Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
const rowHeight = 48;
w.HTMLElement.prototype.getBoundingClientRect = function () {
  const row = (this as HTMLElement).closest<HTMLElement>("[data-sortable-key]");
  const index = row ? [...row.parentElement!.children].indexOf(row) : -1;
  const top = index < 0 ? 0 : index * rowHeight, height = index < 0 ? 0 : rowHeight;
  return { x: 0, y: top, top, bottom: top + height, left: 0, right: 600, width: 600, height, toJSON() { return {}; } } as DOMRect;
};
w.HTMLElement.prototype.scrollIntoView = () => {};
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;

function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function key(target: Element, code: string) {
  await act(async () => { target.dispatchEvent(new w.KeyboardEvent("keydown", { code, key: code === "Space" ? " " : code, bubbles: true, cancelable: true })); });
}
/** Lift a row by its handle, move it with arrow keys, then drop it. */
async function drag(label: string, direction: "ArrowUp" | "ArrowDown", steps: number) {
  const grip = button(`Reorder ${label}`); grip.focus();
  await key(grip, "Space");
  for (let i = 0; i < steps; i++) await key(grip, direction);
  await key(grip, "Space");
}
async function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} field`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new w.Event("input", { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  const field = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} selector`);
  await act(async () => { field.value = value; field.dispatchEvent(new w.Event("change", { bubbles: true })); });
}
const product = (handle: string) => ({ id: handle, handle, title: `Product ${handle}`, description: "", category: "chairs", images: [], published: true, source: "fixture", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] });
const tile = (key: string) => ({ key, title: `Tile ${key}`, collectionHandle: key, image: "/media/test.webp", alt: `Image ${key}`, enabled: true });
async function setup(prepare: (initial: typeof defaultStorefrontContent) => void = () => {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  prepare(initial);
  let saved: any;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.startsWith("/api/products?")) return Response.json({ products: ["alpha", "bravo", "charlie"].map(product), total: 3, page: 1, limit: 20, mode: "preview", checkoutEnabled: false });
    if (path === "/api/admin/media") return Response.json({ assets: [], nextCursor: null });
    assert.equal(path, "/api/admin/content", "Reordering never publishes");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      saved = JSON.parse(String(init.body));
      return Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return { initial, saved: () => { assert.ok(saved, "Save draft must send the draft"); assert.equal(saved.expectedVersion, 4); return saved.content; }, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const keys = (items: { key: string }[]) => items.map(item => item.key);

test("homepage sections: dragging Hero down two rows saves it third", async () => {
  const app = await setup();
  try {
    await click("Homepage");
    await drag("Hero", "ArrowDown", 2);
    await click("Save draft");
    assert.deepEqual(keys(app.saved().homeSections), ["announcement", "difference", "hero", "categories", "ticker", "offers", "nimbus", "dining-banner", "instagram", "bestsellers", "seating-banner", "chairs", "promos", "testimonial", "newsletter", "values", "cities", "project"]);
    assert.equal(button("Move Hero up").disabled, false, "Move buttons remain as the fallback");
  } finally { await app.close(); }
});

test("homepage city artwork: dragging Kolkata down one row saves the same order as Move down", async () => {
  const app = await setup(initial => { delete initial.homeCitiesLayout; });
  try {
    await click("Homepage");
    await drag("Kolkata", "ArrowDown", 1);
    await click("Save draft");
    assert.deepEqual(keys(app.saved().homeCitiesLayout).slice(0, 4), ["delhi", "hyderabad", "kolkata", "varanasi"]);
    assert.equal(app.saved().homeCitiesLayout.length, 18);
  } finally { await app.close(); }
});

test("merchandising rails and tiles: dragging saves the dropped order for products and collection tiles", async () => {
  const app = await setup(initial => { initial.homeMerchandising = { bestsellers: ["alpha", "bravo", "charlie"], chairs: [], categories: [tile("sofas"), tile("beds"), tile("chairs")], offers: [tile("chairs")] }; });
  try {
    await click("Merchandising");
    await drag("charlie in Bestsellers", "ArrowUp", 2);
    await drag("category tile 1", "ArrowDown", 2);
    await click("Save draft");
    assert.deepEqual(app.saved().homeMerchandising.bestsellers, ["charlie", "alpha", "bravo"]);
    assert.deepEqual(keys(app.saved().homeMerchandising.categories), ["beds", "chairs", "sofas"]);
    assert.deepEqual(keys(app.saved().homeMerchandising.offers), ["chairs"]);
  } finally { await app.close(); }
});

test("category pages: dragging the Sofas sale section to the top saves that section order", async () => {
  const app = await setup();
  try {
    await click("Category pages");
    await drag("Sofas sale", "ArrowUp", 2);
    await click("Save draft");
    const sofas = app.saved().landingPages.find((page: { slug: string }) => page.slug === "sofas");
    assert.deepEqual(keys(sofas.sections).slice(0, 4), ["sale", "hero", "categories", "bestsellers"]);
    assert.equal(sofas.sections.length, 15);
  } finally { await app.close(); }
});

test("Nimbus page: dragging the hero film below the introduction saves that order", async () => {
  const app = await setup(initial => { delete (initial as Record<string, unknown>).nimbusPage; });
  try {
    await click("Existing pages"); await select("Existing page", "nimbus");
    await drag("Nimbus Hero film", "ArrowDown", 1);
    await click("Save draft");
    assert.deepEqual(keys(app.saved().nimbusPage.sections), ["intro", "hero", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises"]);
  } finally { await app.close(); }
});

test("Our Story page: dragging the hero to the end saves it last", async () => {
  const app = await setup(initial => { delete (initial as Record<string, unknown>).storyPage; });
  try {
    await click("Existing pages");
    await drag("Our Story Hero", "ArrowDown", 3);
    await click("Save draft");
    assert.deepEqual(keys(app.saved().storyPage.sections), ["belief-film", "journey", "cities", "hero"]);
  } finally { await app.close(); }
});

test("service pages: dragging Contact help above the introduction saves that order", async () => {
  const app = await setup(initial => { delete (initial as Record<string, unknown>).servicePages; });
  try {
    await click("Existing pages"); await select("Existing page", "contact");
    await drag("Contact Help", "ArrowUp", 1);
    await click("Save draft");
    assert.deepEqual(keys(app.saved().servicePages.contact.sections), ["help", "intro", "cities"]);
    assert.deepEqual(keys(app.saved().servicePages.bulk.sections), ["hero", "trust", "process", "business", "cities"]);
  } finally { await app.close(); }
});

test("navigation and footer: dragging utility links and footer columns saves both orders with stable ids", async () => {
  const app = await setup(initial => { delete initial.siteChrome; });
  try {
    await click("Navigation & footer");
    await select("Navigation & footer section", "header");
    await drag("utility link 3", "ArrowUp", 2);
    await select("Navigation & footer section", "footer");
    await drag("footer shop", "ArrowDown", 2);
    await click("Save draft");
    assert.deepEqual(app.saved().siteChrome.utilityLinks.map((link: { id: string }) => link.id), ["help", "story", "bulk"]);
    assert.deepEqual(keys(app.saved().siteChrome.footer.columns), ["help", "care", "shop"]);
    assert.deepEqual(keys(app.saved().siteChrome.footer.contactColumns), ["bulk", "service", "marketplace"]);
  } finally { await app.close(); }
});

test("article blocks: dragging a heading above the first paragraph saves the blocks in that order", async () => {
  const app = await setup();
  try {
    await click("Policies & blogs");
    await click("New article"); await select("New article blog", "news");
    await fill("New article slug", "a-room-for-reading"); await fill("New article title", "A room for reading");
    await click("Add article to draft");
    await fill("Block 1 text", "A comfortable reading chair.");
    await click("Add heading"); await fill("Block 2 text", "Find a quiet corner");
    await click("Add quote"); await fill("Block 3 text", "Make time to pause.");
    await drag("Block 3", "ArrowUp", 2);
    await click("Save draft");
    const blocks = app.saved().authoredArticles[0].blocks;
    assert.deepEqual(blocks.map((block: { type: string }) => block.type), ["quote", "paragraph", "heading"]);
    assert.equal(blocks[0].text, "Make time to pause.");
  } finally { await app.close(); }
});
