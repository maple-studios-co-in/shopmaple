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
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
function ticker() {
  const label = [...container.querySelectorAll("label")].find(item => item.textContent?.trim() === "Automatically move the homepage ticker");
  const field = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(field, "The Motion panel must expose an accessible homepage ticker switch");
  return field;
}
function heading() {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Chairs heading"]');
  assert.ok(input, "The Homepage panel must expose its chairs heading"); return input;
}
async function setup(options: { conflict?: boolean; explicit?: boolean; role?: "editor" | "publisher" } = {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  delete (initial.homeCopy as any).chairsHeading;
  delete (initial.motion as any).autoplayTicker;
  if (options.explicit !== undefined) Object.assign(initial.motion, { autoplayTicker: options.explicit });
  let saved: any;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url); calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/api/admin/content/publish") {
      assert.equal(options.role, "publisher");
      assert.deepEqual(JSON.parse(String(init?.body)), { expectedVersion: 5 });
      return Response.json({ version: 6, draft: saved.content, publishedVersion: 6, updatedAt: "2026-10-26T12:00:00Z" });
    }
    assert.equal(path, "/api/admin/content");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      assert.equal(init.credentials, "same-origin");
      saved = JSON.parse(String(init.body));
      return options.conflict ? Response.json({ error: "Version conflict" }, { status: 409 }) : Response.json({ version: 5, draft: saved.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: options.role ?? "editor" }, csrfToken: "c".repeat(64) }} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  await click("Homepage");
  return { initial, calls, saved: () => saved, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}

test("legacy controls display source defaults without dirtying drafts; ticker changes preserve omitted heading and siblings", async () => {
  const app = await setup();
  try {
    assert.equal(ticker().checked, true);
    assert.equal(heading().value, "Chairs");
    assert.equal(button("Save draft").disabled, true);
    assert.equal(app.calls.some(call => call.startsWith("PUT") || call.startsWith("POST")), false);
    await act(async () => ticker().click());
    await click("Save draft");
    assert.equal(app.saved().expectedVersion, 4);
    const expected = structuredClone(app.initial);
    Object.assign(expected.motion, { autoplayTicker: false });
    assert.deepEqual(app.saved().content, expected);
    assert.equal(container.textContent?.includes("Publish draft"), false);
  } finally { await app.close(); }
});

test("explicit ticker disable survives loading; heading and ticker edits require save then explicit publish", async () => {
  const app = await setup({ explicit: false, role: "publisher" });
  try {
    assert.equal(ticker().checked, false);
    await act(async () => {
      ticker().click();
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(heading(), "Studio chairs");
      heading().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(button("Publish draft").disabled, true);
    await click("Save draft");
    assert.equal(app.saved().content.motion.autoplayTicker, true);
    assert.equal(app.saved().content.homeCopy.chairsHeading, "Studio chairs");
    assert.equal(app.calls.includes("POST /api/admin/content/publish"), false);
    await click("Publish draft");
    assert.equal(app.calls.includes("POST /api/admin/content/publish"), true);
  } finally { await app.close(); }
});

test("ticker draft conflicts retain the unsaved choice and lock further writes", async () => {
  const app = await setup({ conflict: true });
  try {
    await act(async () => ticker().click());
    await click("Save draft");
    assert.match(container.textContent ?? "", /Another editor saved/);
    assert.equal(ticker().checked, false);
    assert.equal(button("Save draft").disabled, true);
    assert.equal(container.querySelector(".admin-panel > fieldset")?.hasAttribute("disabled"), true);
    assert.equal(app.calls.filter(call => call.startsWith("PUT")).length, 1);
  } finally { await app.close(); }
});
