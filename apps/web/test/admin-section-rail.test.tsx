import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The Homepage screen as a section builder: every section is a card with a live thumbnail
// (the real section rendered from the draft by the staff-only frame, with no app bundle loaded),
// thumbnails share one preview token and reload only when their own section changes, a card
// says where its content is edited, and hidden sections come back through an Add section picker.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
/** Every observed card is on screen at once, as on a tall monitor. */
class VisibleObserver {
  constructor(private callback: (entries: { isIntersecting: boolean; target: Element }[]) => void) {}
  observe(target: Element) { queueMicrotask(() => this.callback([{ isIntersecting: true, target }])); }
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLIFrameElement: dom.window.HTMLIFrameElement, MessageEvent: dom.window.MessageEvent, IntersectionObserver: VisibleObserver, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(dom.window, { IntersectionObserver: VisibleObserver });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
const tokenA = "eyJzIjoiZWRpdG9yIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const tokenB = "eyJzIjoiZWRpdG9yIn0.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

async function until(condition: () => boolean, what: string, limitMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > limitMs) assert.fail(`Timed out waiting for: ${what}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}
const settle = (ms = 80) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function click(name: string, scope?: ParentNode) { await act(async () => button(name, scope).click()); }
const card = (key: string) => {
  const found = container.querySelector<HTMLElement>(`[data-section-card="${key}"]`);
  assert.ok(found, `Missing the ${key} card`);
  return found;
};
const thumbnail = (key: string, scope: ParentNode = card(key)) => scope.querySelector<HTMLIFrameElement>("iframe[data-section-thumbnail-frame]");
const order = () => [...container.querySelectorAll<HTMLElement>("[data-section-card]")].map((node) => node.dataset.sectionCard);

/** A draft saved before the editorial and compare sections: neither is in its section list or details. */
const publishedEarlier = (content: typeof defaultStorefrontContent) => {
  content.homeSections = content.homeSections.filter((section) => section.key !== "editorial" && section.key !== "compare");
  delete content.homeDetails!.editorial;
  delete content.homeDetails!.compare;
};
async function setup(edit?: (content: typeof defaultStorefrontContent) => void) {
  const initial = structuredClone(defaultStorefrontContent);
  edit?.(initial);
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const calls: { method: string; path: string; body?: any }[] = [];
  let version = 4;
  let minted = 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path === "/api/admin/content" && method === "PUT") {
      version = body.expectedVersion + 1;
      return Response.json({ version, draft: body.content, publishedVersion: 2, updatedAt: "2026-10-30T09:00:00Z" });
    }
    if (path === "/api/admin/content/preview" && method === "POST") {
      assert.equal(body.expectedVersion, version, "Tokens are minted for the current draft version");
      minted++;
      return Response.json({ token: minted === 1 ? tokenA : tokenB, version, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    }
    assert.equal(`${method} ${path}`, "GET /api/admin/content", "Unexpected request");
    return Response.json({ version: 4, draft: structuredClone(initial), publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(
    <ContentEditor
      session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
      initialContent={initial}
      onExpired={() => assert.fail("Unexpected expiry")}
      livePreviewDebounceMs={30}
    />,
  ));
  await until(() => calls.length > 0 && Boolean(button("Homepage")), "the draft");
  await click("Homepage");
  return {
    calls, mints: () => calls.filter((c) => c.method === "POST"),
    close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; },
  };
}

test("every homepage section is a card with a thumbnail of that section, hidden from assistive technology, all from one token", async () => {
  const app = await setup();
  try {
    assert.deepEqual(order(), defaultStorefrontContent.homeSections.map((section) => section.key));
    await until(() => thumbnail("project")?.getAttribute("src") !== undefined && thumbnail("project")?.hasAttribute("src") === true, "the thumbnails");
    for (const { key } of defaultStorefrontContent.homeSections) {
      const frame = thumbnail(key);
      assert.ok(frame, `${key} has a thumbnail`);
      assert.equal(frame.getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenA)}&section=${key}`);
      assert.equal(frame.getAttribute("aria-hidden"), "true");
      assert.equal(frame.getAttribute("tabindex"), "-1");
    }
    assert.equal(app.mints().length, 1, "one token for every thumbnail");
  } finally { await app.close(); }
});

test("saving an edit reloads only the edited section's thumbnail; reordering reloads none", async () => {
  const app = await setup();
  try {
    await until(() => thumbnail("project")?.hasAttribute("src") === true, "the thumbnails");
    await click("Move Hero down");
    await settle();
    assert.deepEqual(order().slice(0, 2), ["announcement", "hero"]);
    assert.equal(thumbnail("hero")?.getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenA)}&section=hero`, "moving a card keeps its picture");

    const heading = container.querySelector<HTMLInputElement>('input[aria-label="Category heading"]');
    assert.ok(heading);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(heading, "Shop by room");
      heading.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await click("Save draft");
    await until(() => thumbnail("categories")?.getAttribute("src")?.includes(encodeURIComponent(tokenB)) === true, "the categories thumbnail to reload");
    assert.equal(app.mints().length, 2, "one new token for the new version");
    for (const key of ["hero", "announcement", "values", "chairs"]) {
      assert.ok(thumbnail(key)?.getAttribute("src")?.includes(encodeURIComponent(tokenA)), `${key} keeps its loaded picture`);
    }
  } finally { await app.close(); }
});

test("every card's Edit opens that section's inspector, and Back returns to the list with the card selected", async () => {
  const app = await setup();
  try {
    assert.match(card("dining-banner").textContent ?? "", /Shown on the homepage/);
    await click("Edit Nimbus", card("nimbus"));
    assert.equal(container.querySelector("[data-section-inspector]")?.getAttribute("data-section-inspector"), "nimbus");
    await click("Back to sections");
    assert.equal(card("nimbus").getAttribute("aria-current"), "true", "and the card is the selected one");
    await click("Edit Dining Banner", card("dining-banner"));
    assert.equal(container.querySelector("[data-section-inspector]")?.getAttribute("data-section-inspector"), "dining-banner", "banners too, without leaving Homepage");
  } finally { await app.close(); }
});

test("a hidden section comes back from the Add section picker, after the selected card", async () => {
  const app = await setup();
  try {
    assert.equal(button("Add section").disabled, true, "nothing is hidden yet");
    const show = card("values").querySelector<HTMLInputElement>('input[aria-label="Show Values"]');
    assert.ok(show);
    await act(async () => show.click());
    assert.equal(card("values").dataset.hidden, "true", "a hidden section keeps its place, dimmed");
    await click("Select Nimbus", card("nimbus"));
    await click("Add section");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog, "the picker opens");
    const choices = [...dialog.querySelectorAll<HTMLElement>("[data-section-choice]")].map((node) => node.dataset.sectionChoice);
    assert.deepEqual(choices, ["values"], "only hidden sections are offered");
    await until(() => thumbnail("values", dialog)?.hasAttribute("src") === true, "the picker thumbnail");
    await click("Add Values", dialog);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    const keys = order();
    assert.equal(keys[keys.indexOf("nimbus") + 1], "values", "placed after the selected section");
    assert.equal(card("values").dataset.hidden, undefined, "and shown");
    assert.equal(card("values").querySelector<HTMLInputElement>('input[aria-label="Show Values"]')?.checked, true);
  } finally { await app.close(); }
});

test("sections a document predates are offered by Add section and join the page where chosen", async () => {
  const app = await setup(publishedEarlier);
  try {
    const before = order();
    assert.equal(before.length, 18);
    assert.equal(button("Add section").disabled, false, "nothing is hidden, but two sections are new");
    assert.match(container.textContent ?? "", /18 of 18 visible/);
    await click("Select Nimbus", card("nimbus"));
    await click("Add section");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog, "the picker opens");
    assert.deepEqual([...dialog.querySelectorAll<HTMLElement>("[data-section-choice]")].map((node) => node.dataset.sectionChoice), ["editorial", "compare"]);
    await until(() => thumbnail("editorial", dialog)?.hasAttribute("src") === true, "the picker thumbnail");
    assert.match(thumbnail("editorial", dialog)!.getAttribute("src")!, /&section=editorial$/);
    await click("Add Pull Up A Chair", dialog);
    const keys = order();
    assert.equal(keys.length, 19);
    assert.equal(keys[keys.indexOf("nimbus") + 1], "editorial", "placed after the selected section");
    assert.deepEqual(keys.filter((key) => key !== "editorial"), before, "the others keep their order");
    assert.equal(card("editorial").dataset.hidden, undefined, "and shown");
    await click("Add section");
    assert.deepEqual([...document.querySelector('[role="dialog"]')!.querySelectorAll<HTMLElement>("[data-section-choice]")].map((node) => node.dataset.sectionChoice), ["compare"], "only the one left");
  } finally { await app.close(); }
});

test("adding the selected hidden section shows it where it was", async () => {
  const app = await setup();
  try {
    await act(async () => card("nimbus").querySelector<HTMLInputElement>('input[aria-label="Show Nimbus"]')!.click());
    const before = order();
    await click("Select Nimbus", card("nimbus"));
    await click("Add section");
    await click("Add Nimbus", document.querySelector<HTMLElement>('[role="dialog"]')!);
    assert.deepEqual(order(), before, "it keeps its place");
    assert.equal(card("nimbus").dataset.hidden, undefined);
  } finally { await app.close(); }
});

test("closing the Add section picker without adding returns focus to Add section", async () => {
  const app = await setup();
  try {
    await act(async () => card("values").querySelector<HTMLInputElement>('input[aria-label="Show Values"]')!.click());
    await click("Add section");
    await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await until(() => document.querySelector('[role="dialog"]') === null, "the picker to close");
    await until(() => document.activeElement === button("Add section"), "focus on Add section");
  } finally { await app.close(); }
});

test("a thumbnail's content is inert, so keyboard focus never enters it", async () => {
  const { SectionThumbnailDocument } = await import("../components/admin/preview-shell");
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<SectionThumbnailDocument section="newsletter"><input aria-label="Email" /></SectionThumbnailDocument>));
  assert.equal(host.querySelector("[data-section-thumbnail]")?.hasAttribute("inert"), true);
  await act(async () => root.unmount());
});

test("thumbnail addresses are served with a policy that loads no script file", async () => {
  const { default: config } = await import("../next.config");
  const rules = await config.headers!();
  const rule = rules.find((item) => item.source === "/admin/preview-frame/:path*" && item.has?.some((has) => has.type === "query" && has.key === "section"));
  const policy = rule?.headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  const scripts = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));
  assert.equal(scripts, "script-src 'unsafe-inline'", "inline streaming scripts only: no 'self', no host");
  assert.match(policy, /object-src 'none'/);
});
