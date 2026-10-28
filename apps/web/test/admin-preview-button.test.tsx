import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// "Preview draft" saves the draft first (honouring the version conflict path), mints a
// short-lived preview token and opens the preview in a new tab.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
const token = "eyJzIjoiZWRpdG9yIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function type(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); assert.ok(input, `Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`); assert.ok(input, `Missing ${label} selector`);
  await act(async () => { input.value = value; input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
type FakeTab = { location: { href: string }; closed: boolean; close(): void };
type Page = (typeof defaultStorefrontContent)["pages"][number];
async function setup(options: { saveStatus?: number; previewStatus?: number; popupBlocked?: boolean; pages?: Page[] } = {}) {
  const previous = globalThis.fetch, previousOpen = dom.window.open, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  if (options.pages) initial.pages = options.pages;
  const calls: { method: string; path: string; body?: any; csrf?: string | null }[] = [];
  const tabs: FakeTab[] = [];
  dom.window.open = ((url?: string) => {
    if (options.popupBlocked) return null;
    const tab: FakeTab = { location: { href: String(url ?? "") }, closed: false, close() { this.closed = true; } };
    tabs.push(tab);
    return tab as unknown as Window;
  }) as typeof window.open;
  let version = 4;
  globalThis.fetch = async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, csrf: new Headers(init?.headers).get("X-CSRF-Token") });
    if (path === "/api/admin/content" && method === "PUT") {
      if (options.saveStatus && options.saveStatus !== 200) return Response.json({ code: "CONTENT_VERSION_CONFLICT" }, { status: options.saveStatus });
      version = body.expectedVersion + 1;
      return Response.json({ version, draft: body.content, publishedVersion: 2, updatedAt: "2026-10-28T09:00:00Z" });
    }
    if (path === "/api/admin/content/preview" && method === "POST") {
      if (options.previewStatus && options.previewStatus !== 200) return Response.json({ code: "ERROR" }, { status: options.previewStatus });
      assert.equal(body.expectedVersion, version, "Preview tokens are minted for the version just saved");
      return Response.json({ token, version, expiresAt: "2026-10-28T09:15:00Z" });
    }
    assert.equal(path, "/api/admin/content", `Unexpected request ${method} ${path}`);
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return { calls, tabs, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.open = previousOpen; } };
}

test("preview saves unsaved changes, mints a token and opens the preview tab for the current page", async () => {
  const app = await setup();
  try {
    assert.equal(button("Preview draft").disabled, false);
    await click("Homepage"); await type("Category heading", "Preview me");
    await click("Preview draft");
    assert.deepEqual(app.calls.map(call => `${call.method} ${call.path}`), ["GET /api/admin/content", "PUT /api/admin/content", "POST /api/admin/content/preview"]);
    assert.equal(app.calls[1]!.body.expectedVersion, 4);
    assert.equal(app.calls[1]!.body.content.homeCopy.categoryHeading, "Preview me");
    assert.deepEqual([app.calls[2]!.body, app.calls[2]!.csrf], [{ expectedVersion: 5 }, "c".repeat(64)]);
    assert.equal(app.tabs.length, 1);
    assert.equal(app.tabs[0]!.location.href, `/admin/preview/home?token=${encodeURIComponent(token)}`);
    assert.equal(app.tabs[0]!.closed, false);
    assert.match(container.textContent ?? "", /Draft version 5/);
    assert.equal(button("Save draft").disabled, true, "Nothing left unsaved");
    await click("Existing pages"); await select("Existing page", "nimbus");
    await click("Preview draft");
    assert.equal(app.calls.filter(call => call.method === "PUT").length, 1, "A clean draft is not saved again");
    assert.equal(app.tabs[1]!.location.href, `/admin/preview/pages/nimbus-collection?token=${encodeURIComponent(token)}`);
  } finally { await app.close(); }
});

test("the Pages tab previews the page currently selected, not the first page with a slug", async () => {
  const banner = { desktopImage: "/media/cities/delhi.webp", mobileImage: "/media/cities/delhi.webp", alt: "Banner", href: "/collections/all", label: "Explore" };
  const page = (slug: string, title: string): Page => ({ slug, title, description: title, body: `${title} body.`, banner });
  const app = await setup({ pages: [page("care-guide", "Care guide"), page("delivery-areas", "Delivery areas")] });
  try {
    await click("Pages"); await select("Page", "1");
    await click("Preview draft");
    assert.equal(app.tabs[0]!.location.href, `/admin/preview/pages/delivery-areas?token=${encodeURIComponent(token)}`);
    await click("Homepage"); await click("Pages");
    await click("Preview draft");
    assert.equal(app.tabs[1]!.location.href, `/admin/preview/pages/care-guide?token=${encodeURIComponent(token)}`, "Reopening the tab selects its first page again");
  } finally { await app.close(); }
});

test("a version conflict while saving keeps the local edits, closes the empty tab and never mints a token", async () => {
  const app = await setup({ saveStatus: 409 });
  try {
    await click("Homepage"); await type("Category heading", "Conflicting edit");
    await click("Preview draft");
    assert.deepEqual(app.calls.map(call => `${call.method} ${call.path}`), ["GET /api/admin/content", "PUT /api/admin/content"]);
    assert.equal(app.tabs[0]!.closed, true);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /newer version/);
    assert.ok(button("Reload latest draft"));
    assert.equal(button("Preview draft").disabled, true);
    assert.equal(container.querySelector<HTMLInputElement>('input[aria-label="Category heading"]')?.value, "Conflicting edit");
  } finally { await app.close(); }
});

test("a blocked pop-up falls back to a visible preview link and a failed mint reports clearly", async () => {
  const blocked = await setup({ popupBlocked: true });
  try {
    await click("Preview draft");
    const link = container.querySelector<HTMLAnchorElement>('a[href^="/admin/preview/"]');
    assert.ok(link, "Fallback link offered when the tab cannot be opened");
    assert.equal(link.getAttribute("href"), `/admin/preview/home?token=${encodeURIComponent(token)}`);
    assert.equal(link.getAttribute("target"), "_blank");
  } finally { await blocked.close(); }
  const failing = await setup({ previewStatus: 500 });
  try {
    await click("Preview draft");
    assert.equal(failing.tabs[0]!.closed, true);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /preview/i);
  } finally { await failing.close(); }
});
