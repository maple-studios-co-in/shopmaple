import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The builder-style live preview: a pane beside the editor that embeds the staff-only
// preview frame, mints a token for the loaded draft version, re-mints when the version
// changes (tokens are bound to staff id and version), saves edits after a pause so the
// frame can show them, switches device widths and published/draft, and talks to the frame
// over postMessage with an origin check in both directions.
//
// Timing: the editor's debounce is 30 ms here. Tests never assert after a fixed timer; they
// wait for an observable condition (`until`) or drive the save mock by hand (`manualSaves`),
// so a slow runner changes nothing.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLIFrameElement: dom.window.HTMLIFrameElement, MessageEvent: dom.window.MessageEvent, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const { PreviewFrameBridge } = await import("../components/admin/preview-shell");
const { previewFrameUrl, readPreviewMessage, previewTokenState, previewMessageSource } = await import("../lib/live-preview");
const container = document.getElementById("root")!;
const tokenA = "eyJzIjoiZWRpdG9yIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const tokenB = "eyJzIjoiZWRpdG9yIn0.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
/** A short flushed pause, only ever used to let something that must NOT happen have its chance. */
const settle = (ms = 80) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
/** Waits (with flushed renders) until a condition holds; fails loudly instead of racing a timer. */
async function until(condition: () => boolean, what: string, limitMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > limitMs) assert.fail(`Timed out waiting for: ${what}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function type(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  assert.ok(input, `Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const frame = () => {
  const found = container.querySelector<HTMLIFrameElement>("iframe[data-live-preview-frame]");
  assert.ok(found, "The live preview frame is rendered");
  return found;
};

type SetupOptions = {
  expiresInMs?: number;
  previewStatus?: number;
  previewCode?: string;
  saveFailures?: number;
  /** PUTs stay pending until the test resolves them with `resolveSave()`. */
  manualSaves?: boolean;
  /** Quiet-save debounce; a test that asserts between two saves uses a window wider than a render. */
  debounceMs?: number;
  initialDraft?: null;
};
async function setup(options: SetupOptions = {}) {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const calls: { method: string; path: string; body?: any }[] = [];
  const pendingSaves: (() => void)[] = [];
  let version = 4;
  let minted = 0;
  let saveFailures = options.saveFailures ?? 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path === "/api/admin/content" && method === "PUT") {
      if (options.manualSaves) await new Promise<void>((resolve) => { pendingSaves.push(resolve); });
      if (saveFailures > 0) { saveFailures--; return Response.json({ code: "SERVER_ERROR" }, { status: 500 }); }
      version = body.expectedVersion + 1;
      return Response.json({ version, draft: body.content, publishedVersion: options.initialDraft === null ? null : 2, updatedAt: "2026-10-28T09:00:00Z" });
    }
    if (path === "/api/admin/content/preview" && method === "POST") {
      if (options.previewStatus && options.previewStatus !== 200) return Response.json({ code: options.previewCode ?? "ERROR", message: "Preview failed" }, { status: options.previewStatus });
      assert.equal(body.expectedVersion, version, "Preview tokens are minted for the current draft version");
      minted++;
      return Response.json({ token: minted === 1 ? tokenA : tokenB, version, expiresAt: new Date(Date.now() + (options.expiresInMs ?? 15 * 60_000)).toISOString() });
    }
    assert.equal(path, "/api/admin/content", `Unexpected request ${method} ${path}`);
    if (options.initialDraft === null) { version = 0; return Response.json({ version: 0, draft: null, publishedVersion: null, updatedAt: null }); }
    return Response.json({ version: 4, draft: structuredClone(defaultStorefrontContent), publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(
    <ContentEditor
      session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent}
      onExpired={() => assert.fail("Unexpected expiry")}
      livePreviewDebounceMs={options.debounceMs ?? 30}
    />,
  ));
  const puts = () => calls.filter((c) => c.method === "PUT");
  const posts = () => calls.filter((c) => c.method === "POST");
  /** Lets the oldest pending PUT return, then flushes the renders that follow. */
  async function resolveSave() {
    const resolve = pendingSaves.shift();
    assert.ok(resolve, "A save is pending");
    await act(async () => { resolve(); await Promise.resolve(); });
    await until(() => true, "flush");
  }
  return { calls, puts, posts, resolveSave, pendingCount: () => pendingSaves.length, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}

test("frame URLs keep the token model: the draft view is the existing frame address, the published view adds view=published", () => {
  assert.equal(previewFrameUrl({ path: "home", token: tokenA, view: "draft" }), `/admin/preview-frame/home?token=${encodeURIComponent(tokenA)}`);
  assert.equal(previewFrameUrl({ path: "pages/sofas", token: tokenA, view: "published" }), `/admin/preview-frame/pages/sofas?token=${encodeURIComponent(tokenA)}&view=published`);
});

test("a token is needed when there is none, when the draft version moved on, and shortly before expiry", () => {
  const now = Date.parse("2026-10-28T09:00:00Z");
  assert.equal(previewTokenState({ token: "", version: null, expiresAt: null }, 4, now), "mint");
  assert.equal(previewTokenState({ token: tokenA, version: 4, expiresAt: now + 10 * 60_000 }, 4, now), "valid");
  assert.equal(previewTokenState({ token: tokenA, version: 4, expiresAt: now + 10 * 60_000 }, 5, now), "mint");
  assert.equal(previewTokenState({ token: tokenA, version: 4, expiresAt: now + 30_000 }, 4, now), "mint");
});

test("messages are trusted only from the expected origin and window, and only with a known shape", () => {
  const origin = "http://localhost:3000";
  const parent = {};
  const ready = { source: previewMessageSource, type: "ready", path: "/", version: 4, sections: ["hero", "chairs"] };
  assert.deepEqual(readPreviewMessage({ origin, source: parent, data: ready }, origin, parent), { type: "ready", path: "/", version: 4, sections: ["hero", "chairs"] });
  assert.equal(readPreviewMessage({ origin: "https://evil.example", source: parent, data: ready }, origin, parent), null, "Other origins are ignored");
  assert.equal(readPreviewMessage({ origin, source: {}, data: ready }, origin, parent), null, "Other windows are ignored");
  assert.equal(readPreviewMessage({ origin, source: parent, data: { ...ready, source: "other" } }, origin, parent), null, "Other message families are ignored");
  assert.equal(readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, type: "ready", sections: "hero" } }, origin, parent), null, "Malformed payloads are ignored");
  assert.deepEqual(readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, type: "focus", section: "hero" } }, origin, parent), { type: "focus", section: "hero" });
  assert.equal(readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, type: "focus", section: "<script>" } }, origin, parent), null, "Section keys are validated");
  assert.deepEqual(readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, type: "select", section: "nimbus" } }, origin, parent), { type: "select", section: "nimbus" });
  assert.equal(readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, type: "select", section: null } }, origin, parent), null, "Selecting needs a section");
  assert.equal(readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, type: "select", section: "../admin" } }, origin, parent), null);
});

test("opening the live preview mints a token for the loaded version and embeds the frame on the page being edited", async () => {
  const app = await setup();
  try {
    assert.equal(container.querySelector("iframe[data-live-preview-frame]"), null, "The pane is closed until requested");
    await click("Live preview");
    assert.deepEqual(app.calls.map((c) => `${c.method} ${c.path}`), ["GET /api/admin/content", "POST /api/admin/content/preview"]);
    assert.equal(app.calls[1]!.body.expectedVersion, 4);
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenA)}`);
    assert.match(frame().getAttribute("title") ?? "", /draft preview/i);
    await click("Category pages");
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/pages/sofas?token=${encodeURIComponent(tokenA)}`, "The frame follows the section being edited without a new token");
    assert.equal(app.posts().length, 1);
  } finally { await app.close(); }
});

test("editing saves the draft after a pause, re-mints for the new version and reloads the frame", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Homepage");
    await type("Category heading", "Live");
    await type("Category heading", "Live edit");
    assert.equal(app.puts().length, 0, "Nothing is saved while typing continues");
    await until(() => app.posts().length === 2, "the save and the re-mint");
    const puts = app.puts();
    assert.equal(puts.length, 1, "One save after the pause, not one per keystroke");
    assert.equal(puts[0]!.body.expectedVersion, 4);
    assert.equal(puts[0]!.body.content.homeCopy.categoryHeading, "Live edit");
    assert.deepEqual(app.posts().map((c) => c.body.expectedVersion), [4, 5], "A new token for the new version");
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenB)}`);
    assert.match(container.textContent ?? "", /Draft version 5/);
    assert.equal(button("Save draft").disabled, true, "The manual save has nothing left to do");
  } finally { await app.close(); }
});

test("live updates can be paused; Update preview then saves and refreshes on demand", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Pause live updates");
    await click("Homepage");
    await type("Category heading", "Paused edit");
    await settle();
    assert.equal(app.puts().length, 0, "Paused: typing does not save");
    await click("Update preview");
    await until(() => app.posts().length === 2, "the re-mint after the manual update");
    assert.equal(app.puts().length, 1);
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenB)}`);
  } finally { await app.close(); }
});

test("the token is minted again shortly before it expires", async () => {
  // Due for renewal a second after minting: soon, yet after opening the preview has settled on a slow machine.
  const app = await setup({ expiresInMs: 60_000 + 1_000 });
  try {
    await click("Live preview");
    assert.equal(app.posts().length, 1);
    await until(() => app.posts().length === 2, "the re-mint inside the expiry lead time");
    await until(() => frame().getAttribute("src") === `/admin/preview-frame/home?token=${encodeURIComponent(tokenB)}`, "the frame to use the new token");
  } finally { await app.close(); }
});

test("device toggles resize the frame, the published switch changes the view, and full screen can be left with Escape", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    const pane = () => container.querySelector<HTMLElement>("[data-live-preview]")!;
    assert.equal(pane().dataset.device, "desktop");
    assert.equal(button("Desktop").getAttribute("aria-pressed"), "true");
    assert.equal(pane().querySelector<HTMLElement>("[data-device-frame]")?.style.width, "1288px", "Desktop renders a true 1280 px storefront (plus the bezel), scaled to fit");
    await click("Phone");
    assert.equal(pane().dataset.device, "phone");
    assert.equal(button("Phone").getAttribute("aria-pressed"), "true");
    assert.equal(button("Desktop").getAttribute("aria-pressed"), "false");
    await click("Tablet");
    assert.equal(pane().dataset.device, "tablet");

    const published = container.querySelector<HTMLInputElement>('input[name="preview-view"][value="published"]');
    assert.ok(published, "A labelled published/draft switch");
    await act(async () => { published.click(); });
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenA)}&view=published`);
    assert.equal(app.posts().length, 1, "Switching views reuses the token");

    await click("Full screen");
    assert.equal(pane().dataset.fullscreen, "true");
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(pane().dataset.fullscreen, "false");
  } finally { await app.close(); }
});

test("a trusted ready message marks the preview ready; focusing a section row tells the frame to scroll there; other origins are ignored", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Homepage");
    const status = () => container.querySelector("[data-preview-status]")?.textContent ?? "";
    assert.match(status(), /loading/i);
    const posted: { data: any; origin: string }[] = [];
    const frameWindow = frame().contentWindow!;
    frameWindow.postMessage = ((data: unknown, origin: string) => { posted.push({ data, origin }); }) as typeof frameWindow.postMessage;

    const ready = { source: previewMessageSource, type: "ready", path: "/", version: 4, sections: ["hero", "categories"] };
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: ready, origin: "https://evil.example", source: frameWindow })); });
    assert.match(status(), /loading/i, "A message from another origin changes nothing");
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: ready, origin: "http://localhost:3000", source: frameWindow })); });
    assert.match(status(), /ready/i);

    const row = container.querySelector<HTMLElement>('[data-preview-section="categories"]');
    assert.ok(row, "Homepage section rows carry their section key");
    const focusable = row.querySelector<HTMLElement>("input, button") ?? row;
    await act(async () => { focusable.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true })); });
    assert.deepEqual(posted.at(-1), { data: { source: previewMessageSource, type: "focus", section: "categories" }, origin: "http://localhost:3000" });
  } finally { await app.close(); }
});

test("inside the frame: the bridge announces its sections to the parent and scrolls to a section the parent asks for, ignoring other origins", async () => {
  const scrolled: string[] = [];
  (dom.window.HTMLElement.prototype as any).scrollIntoView = function (this: HTMLElement) { scrolled.push(this.getAttribute("data-home-section") ?? "?"); };
  const parentMessages: { data: any; origin: string }[] = [];
  const parent = { postMessage: (data: unknown, origin: string) => { parentMessages.push({ data, origin }); } } as unknown as Window;
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <div>
        <div data-home-section="hero">Hero</div>
        <div data-home-section="categories">Categories</div>
        <PreviewFrameBridge path="/" version={7} parentWindow={parent} />
      </div>,
    ));
    assert.deepEqual(parentMessages, [{ data: { source: previewMessageSource, type: "ready", path: "/", version: 7, sections: ["hero", "categories"] }, origin: "http://localhost:3000" }]);
    const focus = { source: previewMessageSource, type: "focus", section: "categories" };
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: focus, origin: "https://evil.example", source: parent })); });
    assert.deepEqual(scrolled, [], "Other origins cannot drive the frame");
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: focus, origin: "http://localhost:3000", source: parent })); });
    assert.deepEqual(scrolled, ["categories"]);
    assert.equal(container.querySelector('[data-home-section="categories"]')?.getAttribute("data-preview-highlight"), "true");
    assert.equal(container.querySelector('[data-home-section="hero"]')?.getAttribute("data-preview-highlight"), null);
  } finally { await act(async () => root.unmount()); }
});

test("inside the frame: a focused section scrolls and highlights its own box, not its box-less display: contents wrapper", async () => {
  const scrolled: string[] = [];
  (dom.window.HTMLElement.prototype as any).scrollIntoView = function (this: HTMLElement) { scrolled.push(this.tagName); };
  const parent = { postMessage: () => {} } as unknown as Window;
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <div><div data-home-section="values" className="contents"><section>Values</section></div><PreviewFrameBridge path="/" version={7} parentWindow={parent} /></div>,
    ));
    const focus = { source: previewMessageSource, type: "focus", section: "values" };
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: focus, origin: "http://localhost:3000", source: parent })); });
    assert.deepEqual(scrolled, ["SECTION"]);
  } finally { await act(async () => root.unmount()); }
});

test("inside the frame: hovering a draft section offers Edit, which selects that section in the editor; the published view offers nothing", async () => {
  const parentMessages: { data: any; origin: string }[] = [];
  const parent = { postMessage: (data: unknown, origin: string) => { parentMessages.push({ data, origin }); } } as unknown as Window;
  const root = createRoot(container);
  const editButton = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Edit"));
  try {
    for (const selectable of [false, true]) {
      await act(async () => root.render(
        <div>
          <div data-home-section="hero">Hero</div>
          <div data-home-section="dining-banner"><a href="/collections/dining">Dining</a></div>
          <PreviewFrameBridge path="/" version={7} parentWindow={parent} selectable={selectable} />
        </div>,
      ));
      const banner = container.querySelector('[data-home-section="dining-banner"] a')!;
      await act(async () => { banner.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })); });
      if (!selectable) { assert.equal(editButton(), undefined, "the published view is not editable"); continue; }
      assert.equal(editButton()?.textContent, "Edit Dining Banner");
      assert.equal(container.querySelector('[data-home-section="dining-banner"]')?.getAttribute("data-preview-hover"), "true");
      await act(async () => editButton()!.click());
      assert.deepEqual(parentMessages.at(-1), { data: { source: previewMessageSource, type: "select", section: "dining-banner" }, origin: "http://localhost:3000" });
    }
  } finally { await act(async () => root.unmount()); }
});

test("pressing Edit on a section in the live preview opens its inspector; a message from elsewhere opens nothing", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Homepage");
    const frameWindow = frame().contentWindow!;
    const select = { source: previewMessageSource, type: "select", section: "nimbus" };
    const inspecting = () => container.querySelector("[data-section-inspector]")?.getAttribute("data-section-inspector");
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: select, origin: "https://evil.example", source: frameWindow })); });
    assert.equal(inspecting(), undefined);
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: select, origin: "http://localhost:3000", source: frameWindow })); });
    assert.equal(inspecting(), "nimbus");
  } finally { await app.close(); }
});

test("pressing Edit in the preview from another screen that shows the homepage opens Homepage with that section's inspector", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Merchandising");
    const frameWindow = frame().contentWindow!;
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, type: "select", section: "values" }, origin: "http://localhost:3000", source: frameWindow })); });
    await until(() => container.querySelector("[data-section-inspector]")?.getAttribute("data-section-inspector") === "values", "Homepage with the Values inspector open");
  } finally { await app.close(); }
});

test("a rejected mint is requested exactly once, shows a designed error with a manual retry, and never retries by itself", async () => {
  const app = await setup({ previewStatus: 500 });
  try {
    await click("Live preview");
    await until(() => container.querySelector<HTMLElement>("[data-preview-status]")?.dataset.state === "error", "the pane's error state");
    await settle();
    assert.equal(app.posts().length, 1, "One mint per version and attempt");
    assert.equal(container.querySelector('[role="alert"]'), null, "The pane owns its own error state; no global alert");
    assert.equal(container.querySelector("iframe[data-live-preview-frame]"), null);
    await click("Retry preview");
    await until(() => app.posts().length === 2, "the manual retry's request");
    await settle();
    assert.equal(app.posts().length, 2, "Retry is manual: still no automatic retry");
  } finally { await app.close(); }
});

test("a rate-limited mint stops until the user retries; a missing draft asks for one save, never a conflict reload", async () => {
  const limited = await setup({ previewStatus: 429, previewCode: "RATE_LIMITED" });
  try {
    await click("Live preview");
    await until(() => /too many|wait/i.test(container.querySelector("[data-preview-status]")?.textContent ?? ""), "the rate-limit message");
    await settle();
    assert.equal(limited.posts().length, 1);
    assert.doesNotMatch(container.querySelector("[data-preview-status]")?.textContent ?? "", /saved/i, "A rate limit says nothing about the draft being saved");
  } finally { await limited.close(); }
  const missing = await setup({ previewStatus: 409, previewCode: "CONTENT_DRAFT_REQUIRED" });
  try {
    await click("Live preview");
    await until(() => /save/i.test(container.querySelector("[data-preview-status]")?.textContent ?? ""), "the draft-required message");
    await settle();
    assert.equal(missing.posts().length, 1);
    assert.doesNotMatch(container.textContent ?? "", /newer version/, "A missing draft is not an editor conflict");
    assert.equal([...container.querySelectorAll("button")].some((b) => b.textContent === "Reload latest draft"), false);
  } finally { await missing.close(); }
});

test("a failed quiet save pauses live updates with one persistent notice and resumes only after a successful manual retry", async () => {
  const app = await setup({ saveFailures: 1 });
  try {
    await click("Live preview");
    await click("Homepage");
    await type("Category heading", "Will fail once");
    await until(() => container.querySelector("[data-autosave-failed]") !== null, "the persistent notice for the failed save");
    assert.equal(app.puts().length, 1, "One failed attempt");
    await settle();
    assert.equal(app.puts().length, 1, "No automatic retry after a failure");
    assert.equal(container.querySelectorAll('[role="alert"]').length, 1, "Exactly one alert");
    await type("Category heading", "Still paused");
    await settle();
    assert.equal(app.puts().length, 1, "Typing does not restart auto-save while paused");
    await click("Retry save");
    assert.equal(app.puts().length, 2);
    assert.equal(container.querySelector("[data-autosave-failed]"), null, "The notice clears after a successful save");
    await type("Category heading", "Resumed");
    await until(() => app.puts().length === 3, "auto-save to resume after the successful manual save");
  } finally { await app.close(); }
});

test("a quiet save never disables the form or moves focus", async () => {
  const app = await setup({ manualSaves: true });
  try {
    await click("Live preview");
    await click("Homepage");
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Category heading"]')!;
    await act(async () => { input.focus(); });
    await type("Category heading", "Keep my focus");
    assert.equal(document.activeElement, input);
    await until(() => app.puts().length === 1, "the quiet save to start");
    assert.equal(app.pendingCount(), 1, "The quiet save is in flight");
    assert.equal(container.querySelector("fieldset")?.disabled, false, "Fields stay enabled during a quiet save");
    assert.equal(document.activeElement, input, "Focus stays put while the quiet save runs");
    await app.resolveSave();
    await until(() => button("Save draft").disabled, "the save to land");
    assert.equal(app.puts().length, 1);
    assert.equal(document.activeElement, input, "Focus stays put after the quiet save");
    assert.equal(container.querySelector("fieldset")?.disabled, false);
  } finally { await app.close(); }
});

test("text typed while a quiet save is in flight survives, stays unsaved and is saved next with the newer version", async () => {
  // The assertions below run between the first save landing and the next quiet save starting,
  // so that window is a second rather than 30 ms a loaded runner can spend on one render.
  const app = await setup({ manualSaves: true, debounceMs: 1000 });
  try {
    await click("Live preview");
    await click("Homepage");
    const input = () => container.querySelector<HTMLInputElement>('input[aria-label="Category heading"]')!;
    await type("Category heading", "A");
    await until(() => app.puts().length === 1, "the first quiet save to start");
    assert.equal(app.pendingCount(), 1, "The first quiet save is in flight");
    await type("Category heading", "AB");
    await app.resolveSave();
    assert.equal(input().value, "AB", "The edit made during the save is kept, not replaced by the server's copy");
    assert.equal(button("Save draft").disabled, false, "The edit made during the save is still unsaved");
    assert.match(container.textContent ?? "", /Draft version 5/);
    await until(() => app.puts().length === 2, "a second quiet save for the edit made during the first");
    const puts = app.puts();
    assert.equal(puts[0]!.body.content.homeCopy.categoryHeading, "A");
    assert.equal(puts[1]!.body.expectedVersion, 5, "The second save uses the version the first one produced");
    assert.equal(puts[1]!.body.content.homeCopy.categoryHeading, "AB");
    await app.resolveSave();
    await until(() => button("Save draft").disabled, "the second save to land");
    assert.equal(input().value, "AB");
    assert.match(container.textContent ?? "", /Draft version 6/);
    await settle();
    assert.equal(app.puts().length, 2, "Nothing left to save");
  } finally { await app.close(); }
});

test("on version 0 the pane never saves by itself; a visible action performs the first save", async () => {
  const app = await setup({ initialDraft: null });
  try {
    await click("Live preview");
    await settle();
    assert.equal(app.puts().length, 0, "No draft version is created without the user asking");
    assert.equal(app.posts().length, 0, "Nothing is minted for version 0");
    assert.match(container.querySelector("[data-preview-status]")?.textContent ?? "", /save/i);
    await click("Save draft to start the preview");
    assert.equal(app.puts().length, 1);
    await until(() => app.posts().length === 1, "the first save to unlock the preview");
    await until(() => container.querySelector("iframe[data-live-preview-frame]") !== null, "the frame");
  } finally { await app.close(); }
});

test("while live updates are paused after a failed save the status says so", async () => {
  const app = await setup({ saveFailures: 1 });
  try {
    await click("Live preview");
    await click("Homepage");
    await type("Category heading", "Will fail once");
    await until(() => container.querySelector("[data-autosave-failed]") !== null, "the persistent notice for the failed save");
    const status = container.querySelector("[data-preview-status]")?.textContent ?? "";
    assert.match(status, /paused/i);
    assert.doesNotMatch(status, /updating shortly/i);
  } finally { await app.close(); }
});

// Owner, 17 Nov 2026: "when I am clicking the banner with the new image it should get updated on the live preview".
async function choose(label: string, value: string) {
  const select = [...container.querySelectorAll<HTMLSelectElement>("select")].find((node) => node.getAttribute("aria-label") === label
    || node.labels?.[0]?.textContent?.trim() === label || node.id && container.querySelector(`label[for="${node.id}"]`)?.textContent?.trim() === label);
  assert.ok(select, `Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}
const fromFrame = async (data: Record<string, unknown>) => {
  const source = frame().contentWindow!;
  await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, ...data }, origin: "http://localhost:3000", source })); });
};

test("a campaign replacement still waiting for its picture holds back no other edit: the original artwork shows meanwhile", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Campaigns");
    await choose("Campaign", String(defaultStorefrontContent.campaigns.findIndex((item) => item.key === "sofas-hero")));
    await click("Replace campaign artwork");
    await type("Campaign label", "Diwali");
    await until(() => app.puts().length === 1, "the quiet save, which a picture-less replacement used to refuse");
    const saved = app.puts()[0]!.body.content.campaigns.find((item: { key: string }) => item.key === "sofas-hero");
    assert.equal(saved.label, "Diwali");
    assert.equal(saved.artwork, null, "the replacement with no picture yet keeps the original artwork");
    assert.equal(container.querySelector("[data-preview-blocked]"), null);
    assert.ok(container.querySelector('[data-picture-target="campaign:sofas-hero"]'), "the form keeps the replacement being chosen");
    assert.equal(container.querySelector<HTMLInputElement>('input[aria-label="Campaign artwork alt text"]')?.value, "Settle in for the celebrations.",
      "the description starts from the campaign's own words (every campaign's label is empty)");
  } finally { await app.close(); }
});

test("an unfinished Instagram post is left out of the preview's save and named; the draft stays unsaved and is not saved again and again", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Instagram");
    const count = defaultStorefrontContent.instagramPosts.length;
    await click("Add Instagram post");
    await until(() => app.puts().length === 1, "the quiet save");
    assert.equal(app.puts()[0]!.body.content.instagramPosts.length, count, "the new post waits for its link and picture");
    await until(() => container.querySelector("[data-preview-left-out]") !== null, "the note naming what is not shown");
    assert.match(container.querySelector("[data-preview-left-out]")!.textContent ?? "", new RegExp(`Instagram post ${count + 1}`));
    assert.equal(button("Save draft").disabled, false, "the post is still only in the form");
    await settle(200);
    assert.equal(app.puts().length, 1, "nothing new to save until the next edit");
  } finally { await app.close(); }
});

test("a save made in the editor never reloads the frame: the page it shows (one browsed to, too) redraws itself in place", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Homepage");
    const posted: any[] = [];
    const frameWindow = frame().contentWindow!;
    frameWindow.postMessage = ((data: unknown) => { posted.push(data); }) as typeof frameWindow.postMessage;
    const before = frame().getAttribute("src");
    await fromFrame({ type: "navigate", path: "/sofas" });
    await fromFrame({ type: "ready", path: "/sofas", version: 4, sections: [] });
    await type("Category heading", "Seen on the Sofas page");
    await until(() => posted.some((message) => message.type === "refresh"), "the page asked to redraw itself");
    assert.deepEqual(posted.find((message) => message.type === "refresh"), { source: previewMessageSource, type: "refresh", token: tokenB, version: 5 });
    assert.equal(frame().getAttribute("src"), before, "the frame is not reloaded: it stays where it is scrolled");
    assert.equal(posted.some((message) => message.type === "token"), false, "an editor change is not one the page already shows");
  } finally { await app.close(); }
});

test("a picture chosen in the editor shows on the page at once, before the save; the save then redraws the page in place", async () => {
  const app = await setup({ manualSaves: true });
  const upload = `/media/uploads/${"a".repeat(64)}.webp`;
  try {
    await click("Live preview");
    await click("Artwork");
    const posted: any[] = [];
    const frameWindow = frame().contentWindow!;
    frameWindow.postMessage = ((data: unknown) => { posted.push(data); }) as typeof frameWindow.postMessage;
    const before = frame().getAttribute("src");
    await fromFrame({ type: "ready", path: "/", version: 4, sections: [] });
    await type("Desktop image URL", upload);
    const swap = posted.find((message) => message.type === "pictures");
    assert.ok(swap, "the picture is handed to the page with the edit itself");
    assert.equal(swap.items.length, 1);
    assert.equal(swap.items[0].slot, "home-workshop-poster");
    assert.equal(swap.items[0].src, `/api/admin/media/${"a".repeat(64)}/preview`, "an unpublished upload shows through the staff preview route");
    await until(() => app.pendingCount() === 1, "the save, started at once for a chosen picture");
    assert.equal(posted.some((message) => message.type === "refresh"), false, "nothing to redraw until the save is in");
    await app.resolveSave();
    await until(() => posted.some((message) => message.type === "refresh"), "the redraw in place after the save");
    assert.equal(frame().getAttribute("src"), before, "no reload");
    await type("Desktop image URL", "/media/home/typ");
    await settle(120);
    assert.equal(posted.filter((message) => message.type === "pictures").length, 1, "an address typed by hand is never swapped in letter by letter");
  } finally { await app.close(); }
});

test("inside the frame: chosen pictures swap in where they are, phone parts take the phone picture, and a sliced campaign is covered until the redraw", async () => {
  const parent = { postMessage: () => {} } as unknown as Window;
  const root = createRoot(container);
  const send = (data: Record<string, unknown>) => act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, ...data }, origin: "http://localhost:3000", source: parent })); });
  const page = (version: number) => (
    <div>
      <img data-media-slot="home-newsletter" src="/media/old.webp" srcSet="/media/old.webp 1x" sizes="100vw" alt="Old words" />
      <picture><source media="(max-width: 749px)" srcSet="/media/old-phone.webp" /><img data-picture-target="merch:categories:sofas" src="/media/old-tile.webp" alt="" /></picture>
      <div data-picture-target="campaign:sofas-hero">
        <div data-artwork="desktop"><div className="campaign-art-tile"><img src="/media/slice.png" alt="" /></div></div>
        <div data-artwork="mobile"><div className="campaign-art-tile"><img src="/media/slice-phone.png" alt="" /></div></div>
      </div>
      <PreviewFrameBridge path="/" version={version} parentWindow={parent} />
    </div>
  );
  const a = `/api/admin/media/${"a".repeat(64)}/preview`, b = `/api/admin/media/${"b".repeat(64)}/preview`, c = `/api/admin/media/${"c".repeat(64)}/preview`;
  try {
    await act(async () => root.render(page(7)));
    await send({ type: "pictures", items: [
      { slot: "home-newsletter", src: a, alt: "New words" },
      { target: "merch:categories:sofas", src: b, mobileSrc: c, alt: "Sofas" },
      { target: "campaign:sofas-hero", src: a, mobileSrc: c },
    ] });
    const newsletter = container.querySelector<HTMLImageElement>('[data-media-slot="home-newsletter"]')!;
    assert.deepEqual([newsletter.getAttribute("src"), newsletter.getAttribute("srcset"), newsletter.getAttribute("sizes"), newsletter.alt], [a, null, null, "New words"]);
    const tile = container.querySelector<HTMLImageElement>('[data-picture-target="merch:categories:sofas"]')!;
    assert.deepEqual([tile.getAttribute("src"), tile.alt, tile.parentElement!.querySelector("source")!.getAttribute("srcset")], [b, "", c], "a decorative picture keeps its empty description");
    const covers = [...container.querySelectorAll<HTMLImageElement>("img[data-preview-overlay]")];
    assert.deepEqual(covers.map((cover) => [cover.closest<HTMLElement>("[data-artwork]")!.dataset.artwork, cover.getAttribute("src")]), [["desktop", a], ["mobile", c]]);
    assert.deepEqual([...container.querySelectorAll(".campaign-art-tile img")].map((slice) => slice.getAttribute("src")), ["/media/slice.png", "/media/slice-phone.png"], "the slices themselves are left alone");
    await act(async () => root.render(page(8)));
    assert.equal(container.querySelectorAll("img[data-preview-overlay]").length, 0, "the redraw of a newer version takes the cover away");
  } finally { await act(async () => root.unmount()); }
});

test("inside the frame: a redraw request redraws the page in place from the new version, with its own query and anchor", async () => {
  const parent = { postMessage: () => {} } as unknown as Window;
  const root = createRoot(container);
  const redraws: string[] = [];
  const tokens: [string, number][] = [];
  const was = dom.window.location.href;
  dom.window.history.replaceState(null, "", `/admin/preview-frame/collections/chairs?sort=price-asc&token=${tokenA}#reviews`);
  try {
    await act(async () => root.render(<PreviewFrameBridge path="/collections/chairs" version={4} parentWindow={parent} refreshTo={(url) => redraws.push(url)} onToken={(token, version) => tokens.push([token, version])} />));
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, type: "refresh", token: tokenB, version: 5 }, origin: "http://localhost:3000", source: parent })); });
    assert.deepEqual(redraws, [`/admin/preview-frame/collections/chairs?sort=price-asc&token=${tokenB}#reviews`]);
    assert.deepEqual(tokens, [[tokenB, 5]], "links followed from here on use the new token");
  } finally { await act(async () => root.unmount()); dom.window.history.replaceState(null, "", was); }
});

test("redraw and picture messages are trusted only with a known shape, and pictures only from the store's own media", () => {
  const origin = "http://localhost:3000", parent = {};
  const read = (data: Record<string, unknown>) => readPreviewMessage({ origin, source: parent, data: { source: previewMessageSource, ...data } }, origin, parent);
  assert.deepEqual(read({ type: "refresh", token: tokenB, version: 5 }), { type: "refresh", token: tokenB, version: 5 });
  assert.equal(read({ type: "refresh", token: "not a token", version: 5 }), null);
  const upload = `/api/admin/media/${"a".repeat(64)}/preview`;
  assert.deepEqual(read({ type: "pictures", items: [{ slot: "home-newsletter", src: upload }] }), { type: "pictures", items: [{ slot: "home-newsletter", src: upload }] });
  assert.deepEqual(read({ type: "pictures", items: [{ target: "campaign:sofas-hero", src: "/media/home/x.webp", mobileSrc: upload, alt: "Sofa" }] }),
    { type: "pictures", items: [{ target: "campaign:sofas-hero", src: "/media/home/x.webp", mobileSrc: upload, alt: "Sofa" }] });
  for (const src of ["https://tracker.example/x.png", "javascript:alert(1)", "/media/../admin", "//evil.example/x.png", "/api/admin/media/abc/preview"])
    assert.equal(read({ type: "pictures", items: [{ slot: "home-newsletter", src }] }), null, `refused: ${src}`);
  assert.equal(read({ type: "pictures", items: [{ slot: "not-a-slot", src: upload }] }), null);
  assert.equal(read({ type: "pictures", items: [{ target: "campaign:sofas-hero", slot: "home-newsletter", src: upload }] }), null, "one place per picture");
  assert.equal(read({ type: "pictures", items: [] }), null);
});

test("Campaigns shows the page the chosen campaign is on", async () => {
  const app = await setup();
  try {
    await click("Live preview");
    await click("Campaigns");
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/home?token=${encodeURIComponent(tokenA)}`, "the first campaign is on the homepage");
    const index = defaultStorefrontContent.campaigns.findIndex((item) => item.key === "sofas-hero");
    await choose("Campaign", String(index));
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/pages/sofas?token=${encodeURIComponent(tokenA)}`);
    await click("Category pages");
    assert.equal(frame().getAttribute("src"), `/admin/preview-frame/pages/sofas?token=${encodeURIComponent(tokenA)}`);
  } finally { await app.close(); }
});
