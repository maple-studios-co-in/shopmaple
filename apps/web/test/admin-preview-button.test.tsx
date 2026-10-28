import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`); assert.ok(field, `Missing ${label}`);
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
async function select(label: string, value: string) {
  const field = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`); assert.ok(field, `Missing ${label}`);
  await act(async () => { field.value = value; field.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
type Options = { saveStatus?: number; previewStatus?: number };
async function setup(options: Options = {}) {
  const previous = globalThis.fetch, previousOpen = dom.window.open, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  const calls: { method: string; path: string; body?: any; csrf: string | null }[] = [];
  const opened: { url: string; target?: string; features?: string }[] = [];
  dom.window.open = ((url: string, target?: string, features?: string) => { opened.push({ url: String(url), target, features }); return null; }) as typeof dom.window.open;
  globalThis.fetch = async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined, csrf: new Headers(init?.headers).get("X-CSRF-Token") });
    if (path === "/api/admin/content" && method === "PUT") {
      const body = JSON.parse(String(init!.body));
      return options.saveStatus ? Response.json({ error: "rejected" }, { status: options.saveStatus }) : Response.json({ version: body.expectedVersion + 1, draft: body.content, publishedVersion: 2, updatedAt: "2026-10-28T12:00:00Z" });
    }
    if (path === "/api/admin/content/preview" && method === "POST") {
      return options.previewStatus ? Response.json({ code: "CONTENT_VERSION_CONFLICT" }, { status: options.previewStatus }) : Response.json({ token: "tok.en", version: JSON.parse(String(init!.body)).expectedVersion, expiresAt: "2026-10-28T12:15:00Z" });
    }
    assert.equal(path, "/api/admin/content", `Unexpected request ${method} ${path}`);
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-28T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return { calls, opened, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.open = previousOpen; } };
}
const previewLink = () => container.querySelector<HTMLAnchorElement>('a[href^="/admin/preview"]');

test("Preview draft saves unsaved changes first, mints a token for the saved version and opens the preview tab", async () => {
  const app = await setup();
  try {
    assert.equal(button("Preview draft").disabled, false, "Preview is available even without unsaved changes");
    await click("Homepage"); await fill("Category heading", "Preview heading");
    await click("Preview draft");
    const methods = app.calls.map(call => `${call.method} ${call.path}`);
    assert.deepEqual(methods, ["GET /api/admin/content", "PUT /api/admin/content", "POST /api/admin/content/preview"]);
    assert.equal(app.calls[1]!.body.content.homeCopy.categoryHeading, "Preview heading");
    assert.deepEqual(app.calls[2]!.body, { expectedVersion: 5 }, "The token is minted for the version the save returned");
    assert.equal(app.calls[2]!.csrf, "c".repeat(64));
    assert.deepEqual(app.opened, [{ url: "/admin/preview?token=tok.en", target: "_blank", features: "noopener,noreferrer" }]);
    assert.equal(previewLink()?.getAttribute("href"), "/admin/preview?token=tok.en", "A link remains in case the popup was blocked");
    assert.equal(previewLink()?.getAttribute("target"), "_blank");
    assert.match(container.textContent ?? "", /Draft saved/);
    assert.equal(button("Save draft").disabled, true, "Nothing is left unsaved");
  } finally { await app.close(); }
});

test("Preview draft opens the page matching the current editor tab without saving a clean draft", async () => {
  const app = await setup();
  try {
    await click("Existing pages"); await select("Existing page", "nimbus");
    await click("Preview draft");
    assert.deepEqual(app.calls.map(call => `${call.method} ${call.path}`), ["GET /api/admin/content", "POST /api/admin/content/preview"]);
    assert.deepEqual(app.calls[1]!.body, { expectedVersion: 4 });
    assert.equal(app.opened[0]?.url, "/admin/preview/pages/nimbus-collection?token=tok.en");
    await click("Category pages"); await click("Preview draft");
    assert.equal(app.opened[1]?.url, "/admin/preview/pages/sofas?token=tok.en");
    await click("Policies & blogs"); await click("Preview draft");
    assert.equal(app.opened[2]?.url, "/admin/preview/policies/privacy-policy?token=tok.en");
  } finally { await app.close(); }
});

test("a version conflict while saving stops the preview and shows the existing conflict guidance", async () => {
  const app = await setup({ saveStatus: 409 });
  try {
    await click("Homepage"); await fill("Category heading", "Conflicting heading");
    await click("Preview draft");
    assert.deepEqual(app.calls.map(call => `${call.method} ${call.path}`), ["GET /api/admin/content", "PUT /api/admin/content"]);
    assert.deepEqual(app.opened, []);
    assert.equal(previewLink(), null);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Another editor saved a newer version/);
    assert.equal(button("Preview draft").disabled, true);
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Category heading"]')?.value, "Conflicting heading", "Local edits are kept");
  } finally { await app.close(); }
});

test("a stale draft when minting the token shows the conflict instead of opening a preview", async () => {
  const app = await setup({ previewStatus: 409 });
  try {
    await click("Preview draft");
    assert.deepEqual(app.opened, []);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Another editor saved a newer version/);
    assert.ok(button("Reload latest draft"));
  } finally { await app.close(); }
});
