import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { ProductHighlights, StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
const panel = () => container.querySelector<HTMLElement>("[data-admin-panel]")!;
const text = () => panel().textContent ?? "";

function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string, scope: ParentNode = container) { await act(async () => button(name, scope).click()); }
function field(label: string) {
  const found = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  assert.ok(found, `Missing ${label} field`); return found;
}
async function fill(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function blur(label: string) { await act(async () => field(label).dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }))); }
/** The text of the error message an invalid field points at. */
function errorFor(label: string) {
  const input = field(label);
  if (input.getAttribute("aria-invalid") !== "true") return "";
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids.map(id => document.getElementById(id)).filter(node => node?.hasAttribute("data-field-error")).map(node => node!.textContent).join(" ");
}

const variant = (title: string) => ({ id: `v-${title}`, title, sku: null, pricePaise: 100000, compareAtPaise: null, available: true, stockPolicy: "stocked" });
const product = (handle: string, options: string[] = []) => ({
  id: handle, handle, title: `Product ${handle}`, description: "", category: "chairs", images: [], published: true, source: "fixture",
  sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: options.map(variant),
});
const catalogue = (products: ReturnType<typeof product>[]) => Response.json({ products, total: products.length, page: 1, limit: 20, mode: "preview", checkoutEnabled: false });

async function setup(options: { highlights?: ProductHighlights; conflict?: boolean; products?: ReturnType<typeof product>[] } = {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial: StorefrontContent = structuredClone(defaultStorefrontContent);
  delete initial.productHighlights;
  if (options.highlights) initial.productHighlights = structuredClone(options.highlights);
  let saved: any;
  let saves = 0;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input); calls.push(path);
    if (path.startsWith("/api/products?")) return catalogue(options.products ?? [product("alpha", ["Deep Atlantic", "Sand"]), product("bravo", ["Default Title", "Olive"])]);
    assert.equal(path, "/api/admin/content", `Unexpected request ${path}`);
    if (init?.method === "PUT") {
      saves++;
      saved = JSON.parse(String(init.body));
      return options.conflict ? Response.json({ error: "Version conflict" }, { status: 409 })
        : Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
    initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return { calls, saved: () => saved, saves: () => saves, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}

test("the highlights screen sits with Merchandising, explains itself and starts empty for a legacy draft", async () => {
  const app = await setup();
  try {
    const names = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Admin sections"] button')].map(b => b.textContent);
    assert.equal(names.indexOf("Product highlights"), names.indexOf("Merchandising") + 1, "listed right after Merchandising");
    await click("Product highlights");
    assert.equal(panel().querySelector("h2")?.textContent, "Product highlights");
    assert.match(text(), /Colours, New badges and review ratings shown on product cards\. Cards show only what you set here\./);
    assert.ok(panel().querySelector('[aria-label="Colours"] [data-empty]'), "colours empty state");
    assert.ok(panel().querySelector('[aria-label="Products"] [data-empty]'), "products empty state");
    assert.equal(button("Save draft").disabled, true, "opening the screen changes nothing");
    assert.equal(button("Live preview").disabled, false, "the screen can use the live preview");
  } finally { await app.close(); }
});

test("colours: add, keep the colour picker and hex code in sync, remove, and save the document shape", async () => {
  const app = await setup();
  try {
    await click("Product highlights");
    await click("Add colour");
    assert.equal(document.activeElement, field("Colour 1 option name"), "focus moves to the new row");
    await fill("Colour 1 option name", "Deep Atlantic");
    await fill("Colour 1 hex code", "#1F4E5F");
    assert.equal(field("Colour 1 colour").value, "#1f4e5f", "typing a hex code moves the picker");
    await fill("Colour 1 colour", "#aabbcc");
    assert.equal(field("Colour 1 hex code").value, "#aabbcc", "the picker writes the hex code");
    await click("Add colour");
    await fill("Colour 2 option name", "Sand");
    await click("Remove colour 2");
    assert.equal(container.querySelector('[aria-label="Colour 2 option name"]'), null);
    assert.equal(document.activeElement, button("Add colour"), "focus returns to Add colour after removing the last row");
    await click("Save draft");
    assert.deepEqual(app.saved().content.productHighlights, { swatches: [{ name: "Deep Atlantic", hex: "#aabbcc" }], products: [] });
    assert.match(container.textContent ?? "", /Draft saved/);
  } finally { await app.close(); }
});

test("duplicate names, blank names and invalid hex codes show inline and block saving until fixed", async () => {
  const app = await setup({ highlights: { swatches: [{ name: "Deep Atlantic", hex: "#1f4e5f" }], products: [] } });
  try {
    await click("Product highlights");
    await click("Add colour");
    await fill("Colour 2 option name", " deep atlantic ");
    assert.match(errorFor("Colour 2 option name"), /already has a colour/i);
    assert.equal(errorFor("Colour 1 option name"), "", "the first use of a name is fine");
    await fill("Colour 2 hex code", "#12345");
    assert.match(errorFor("Colour 2 hex code"), /hex colour such as #1f4e5f/i);
    await click("Save draft");
    assert.equal(app.saves(), 0, "an invalid colour is never sent");
    assert.match(container.querySelector('[data-notice="error"]')?.textContent ?? "", /product highlights/i, "the editor says which screen to fix");
    await fill("Colour 2 option name", "   ");
    await blur("Colour 2 option name");
    assert.equal(field("Colour 2 option name").value, "", "a blank name is trimmed away");
    assert.match(errorFor("Colour 2 option name"), /option name/i);
    await click("Save draft");
    assert.equal(app.saves(), 0, "a blank name is never sent");
    await fill("Colour 2 option name", "Olive");
    await fill("Colour 2 hex code", "#556b2f");
    assert.equal(errorFor("Colour 2 option name"), "");
    assert.equal(errorFor("Colour 2 hex code"), "");
    await click("Save draft");
    assert.deepEqual(app.saved().content.productHighlights.swatches, [{ name: "Deep Atlantic", hex: "#1f4e5f" }, { name: "Olive", hex: "#556b2f" }]);
  } finally { await app.close(); }
});

test("option names from the catalogue without a colour can be added in one step", async () => {
  const app = await setup({ highlights: { swatches: [{ name: "sand", hex: "#c2b280" }], products: [] } });
  try {
    await click("Product highlights");
    const suggestions = panel().querySelector('[aria-label="Option names without a colour"]');
    assert.ok(suggestions, "suggestions are listed");
    const offered = [...suggestions.querySelectorAll("button")].map(b => b.textContent?.trim());
    assert.deepEqual(offered, ["Deep Atlantic", "Olive"], "names that already have a colour and placeholder titles are left out");
    await click("Add a colour for Deep Atlantic");
    assert.equal(field("Colour 2 option name").value, "Deep Atlantic");
    assert.equal(document.activeElement, field("Colour 2 hex code"), "focus moves to the colour of the new row");
    assert.deepEqual([...suggestions.querySelectorAll("button")].map(b => b.textContent?.trim()), ["Olive"]);
  } finally { await app.close(); }
});

test("products: pick from the catalogue, set New and a complete rating, remove, and save", async () => {
  const app = await setup();
  try {
    await click("Product highlights");
    await click("Add alpha to product highlights");
    assert.match(text(), /Only enter the average and count of real customer reviews\./);
    assert.equal(button("Add alpha to product highlights").disabled, true, "a product is listed once");
    const table = panel().querySelector('table[aria-label="Product highlights"]');
    assert.ok(table, "products are a table");
    assert.match(table.textContent ?? "", /Product alpha/);
    const isNew = button("New badge for alpha");
    assert.equal(isNew.getAttribute("role"), "switch");
    assert.equal(document.activeElement, isNew, "focus moves to the new row");
    assert.equal(isNew.getAttribute("aria-checked"), "false");
    await act(async () => isNew.click());
    assert.equal(button("New badge for alpha").getAttribute("aria-checked"), "true");

    const help = document.getElementById(field("Average rating for alpha").getAttribute("aria-describedby")!.split(" ")[0]!);
    assert.match(help?.textContent ?? "", /Only enter the average and count of real customer reviews/, "rating fields point at the help text");

    await fill("Average rating for alpha", "4.6");
    assert.match(errorFor("Review count for alpha"), /review count/i, "an average needs a count");
    await click("Save draft");
    assert.equal(app.saves(), 0, "a half-entered rating is never sent");
    await fill("Review count for alpha", "12");
    assert.equal(errorFor("Review count for alpha"), "");
    assert.equal(errorFor("Average rating for alpha"), "");

    await click("Add bravo to product highlights");
    await fill("Review count for bravo", "3");
    assert.match(errorFor("Average rating for bravo"), /average/i, "a count needs an average");
    await fill("Average rating for bravo", "5.5");
    assert.match(errorFor("Average rating for bravo"), /1\.0 to 5\.0/);
    await fill("Average rating for bravo", "4.25");
    assert.match(errorFor("Average rating for bravo"), /one decimal/i);
    await fill("Average rating for bravo", "");
    await fill("Review count for bravo", "");
    assert.equal(errorFor("Average rating for bravo"), "", "a rating is optional");
    await click("Remove bravo from product highlights");
    assert.equal(container.querySelector('[aria-label="Average rating for bravo"]'), null);

    await click("Save draft");
    assert.deepEqual(app.saved().content.productHighlights, { swatches: [], products: [{ handle: "alpha", isNew: true, rating: { value: 4.6, count: 12 } }] });
  } finally { await app.close(); }
});

test("saved highlights load into the table, and removing every entry stores empty lists", async () => {
  const app = await setup({ highlights: { swatches: [{ name: "Olive", hex: "#556b2f" }], products: [{ handle: "charlie", isNew: false, rating: { value: 4, count: 7 } }] } });
  try {
    await click("Product highlights");
    assert.equal(field("Average rating for charlie").value, "4.0", "the average shows one decimal");
    assert.equal(field("Review count for charlie").value, "7");
    assert.equal(field("Colour 1 hex code").value, "#556b2f");
    await click("Remove charlie from product highlights");
    await click("Remove colour 1");
    assert.ok(panel().querySelector('[aria-label="Products"] [data-empty]'));
    await click("Save draft");
    assert.deepEqual(app.saved().content.productHighlights, { swatches: [], products: [] });
  } finally { await app.close(); }
});

test("a legacy draft keeps highlights absent when other screens are edited", async () => {
  const app = await setup();
  try {
    await click("Product highlights");
    await click("Homepage");
    await act(async () => {
      const input = field("Category heading");
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Shop by room");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await click("Save draft");
    assert.equal("productHighlights" in app.saved().content, false);
  } finally { await app.close(); }
});

test("after a version conflict every highlights control is locked", async () => {
  const app = await setup({ conflict: true, highlights: { swatches: [{ name: "Olive", hex: "#556b2f" }], products: [{ handle: "alpha", isNew: true, rating: null }] } });
  try {
    await click("Product highlights");
    await fill("Colour 1 option name", "Olive green");
    await click("Save draft");
    assert.match(container.textContent ?? "", /Another editor saved/);
    const controls = [...panel().querySelectorAll<HTMLElement>("input, button")];
    assert.ok(controls.length > 8);
    for (const control of controls) assert.equal(control.matches(":disabled"), true, `${control.getAttribute("aria-label") ?? control.textContent} is locked`);
  } finally { await app.close(); }
});

test("every highlights control is labelled and reachable from the keyboard", async () => {
  const app = await setup({ highlights: { swatches: [{ name: "Olive", hex: "#556b2f" }], products: [{ handle: "alpha", isNew: false, rating: { value: 4.5, count: 2 } }] } });
  try {
    await click("Product highlights");
    const controls = [...panel().querySelectorAll<HTMLElement>("input, button, select, textarea")];
    for (const control of controls) {
      const named = control.getAttribute("aria-label") || control.textContent?.trim() || (control as HTMLInputElement).labels?.length;
      assert.ok(named, `${control.outerHTML.slice(0, 120)} has a name`);
      assert.notEqual(control.getAttribute("tabindex"), "-1", `${control.getAttribute("aria-label")} is in the tab order`);
    }
    for (const label of ["Colour 1 option name", "Colour 1 colour", "Colour 1 hex code", "Average rating for alpha", "Review count for alpha"]) {
      field(label).focus();
      assert.equal(document.activeElement, field(label));
    }
    assert.equal(field("Average rating for alpha").getAttribute("inputmode"), "decimal");
    assert.equal(field("Review count for alpha").getAttribute("inputmode"), "numeric");
  } finally { await app.close(); }
});
