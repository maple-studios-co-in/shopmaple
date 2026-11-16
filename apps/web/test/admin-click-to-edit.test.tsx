import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Click-to-edit in the live preview (owner, 14 Nov 2026: "everything is live where anybody could directly edit from
// there seeing it live"): words clicked on the draft page become a text box, and the editor types the new words into
// the one field that holds them, on the screen that edits them. These tests cover the messages, the field matching,
// the frame's side, and the editor end to end.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLAnchorElement: dom.window.HTMLAnchorElement, HTMLIFrameElement: dom.window.HTMLIFrameElement, MessageEvent: dom.window.MessageEvent, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { renderToString } = await import("react-dom/server");
const { ContentEditor } = await import("../components/admin/editor");
const { PreviewFrameBridge } = await import("../components/admin/preview-shell");
const { readPreviewMessage, previewMessageSource, previewRouteFor } = await import("../lib/live-preview");
const { matchWords, findTextCandidates, pickCandidate, applyCandidate, revealCandidate } = await import("../lib/admin-focus");
const { clickEditScreen } = await import("../components/admin/use-click-to-edit");
const { PreviewNavigation } = await import("../components/admin/preview-shell");
const container = document.getElementById("root")!;
const origin = "http://localhost:3000";

async function until(condition: () => boolean, what: string, limitMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > limitMs) assert.fail(`Timed out waiting for: ${what}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}
const settle = (ms = 80) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const words = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

test("click-to-edit messages are read only with a known shape: words, a page address, an area, a bounded context and a repeat count", () => {
  const frameWindow = {};
  const read = (data: Record<string, unknown>) => readPreviewMessage({ origin, source: frameWindow, data }, origin, frameWindow);
  const base = { source: previewMessageSource, path: "/", section: "nimbus", area: "section", context: "The Terra Collection Explore", occurrence: 1 };
  assert.deepEqual(read({ ...base, type: "text-select", text: "Explore" }),
    { type: "text-select", text: "Explore", path: "/", section: "nimbus", area: "section", context: "The Terra Collection Explore", occurrence: 1, repeats: 1 }, "no count reads as words shown once");
  assert.deepEqual(read({ ...base, repeats: 2, type: "text-edit", before: "Explore", after: "Discover\nmore" }),
    { type: "text-edit", before: "Explore", after: "Discover\nmore", path: "/", section: "nimbus", area: "section", context: "The Terra Collection Explore", occurrence: 1, repeats: 2 });
  assert.equal(read({ ...base, repeats: 0, type: "text-select", text: "Explore" }), null);
  assert.equal(read({ ...base, repeats: 1001, type: "text-select", text: "Explore" }), null);
  assert.equal(read({ ...base, repeats: "4", type: "text-select", text: "Explore" }), null);
  assert.deepEqual(read({ ...base, section: null, area: "footer", type: "text-select", text: "SHOP" })?.type, "text-select", "words outside a section carry a null section");
  assert.equal(read({ ...base, type: "text-select", text: "   " }), null, "blank words are ignored");
  assert.equal(read({ ...base, type: "text-select", text: "x".repeat(2001) }), null, "words are bounded");
  assert.equal(read({ ...base, type: "text-edit", before: "Explore", after: "" }), null, "an edit always carries new words");
  assert.equal(read({ ...base, area: "sidebar", type: "text-select", text: "Explore" }), null, "areas are a closed list");
  assert.equal(read({ ...base, occurrence: -1, type: "text-select", text: "Explore" }), null);
  assert.equal(read({ ...base, occurrence: 1.5, type: "text-select", text: "Explore" }), null);
  assert.equal(read({ ...base, context: "x".repeat(4001), type: "text-select", text: "Explore" }), null);
  assert.equal(read({ ...base, path: "//evil.example/", type: "text-select", text: "Explore" }), null);
  assert.equal(read({ ...base, section: "<b>", type: "text-select", text: "Explore" }), null);
  assert.equal(readPreviewMessage({ origin: "https://evil.example", source: frameWindow, data: { ...base, type: "text-select", text: "Explore" } }, origin, frameWindow), null, "other origins are ignored");
  assert.deepEqual(read({ source: previewMessageSource, type: "editing", active: true }), { type: "editing", active: true });
  assert.equal(read({ source: previewMessageSource, type: "editing", active: "yes" }), null);
  assert.deepEqual(read({ source: previewMessageSource, type: "mode", mode: "browse" }), { type: "mode", mode: "browse" });
  assert.equal(read({ source: previewMessageSource, type: "mode", mode: "fly" }), null);
  assert.deepEqual(read({ source: previewMessageSource, type: "text-result", phase: "edit", ok: false, message: "No field" }), { type: "text-result", phase: "edit", ok: false, message: "No field" });
  assert.deepEqual(read({ source: previewMessageSource, type: "text-result", phase: "select", ok: true }), { type: "text-result", phase: "select", ok: true });
  assert.equal(read({ source: previewMessageSource, type: "text-result", phase: "later", ok: true }), null);
  assert.equal(read({ source: previewMessageSource, type: "text-result", phase: "edit", ok: true, message: "x".repeat(301) }), null);
});

test("a field is matched by its words, by part of them, or with fixed words around it, and each kind is typed back correctly", () => {
  assert.deepEqual(matchWords("Explore", "  Explore "), { how: "same" });
  assert.equal(matchWords("Every element is yours to reshape", "yours to reshape")?.how, "part");
  assert.equal(matchWords("Every element is yours to reshape", "is")?.how, undefined, "a word of three letters or fewer is too weak a clue");
  assert.deepEqual(matchWords("Maple Furnishers", "© 2026 Maple Furnishers. All rights reserved."), { how: "around", prefix: "© 2026 ", suffix: ". All rights reserved." });
  assert.equal(matchWords("Art", "Art gallery"), null);

  const host = document.createElement("div");
  host.innerHTML = '<input aria-label="Heading" value="Every element is yours to reshape"><input aria-label="Copyright" value="Maple Furnishers" maxlength="20"><textarea aria-label="Address">A-2/57\nDelhi</textarea>';
  document.body.append(host);
  try {
    const [heading, copyright] = [...host.querySelectorAll("input")];
    const typed: string[] = [];
    heading!.addEventListener("input", () => typed.push(heading!.value));
    const [part] = findTextCandidates(host, "yours to   reshape");
    assert.deepEqual(applyCandidate(part!, "ours to shape"), { ok: true });
    assert.equal(heading!.value, "Every element is ours to shape", "only the clicked part of the field changes");
    assert.deepEqual(typed, ["Every element is ours to shape"], "the value arrives through an input event, as typing would");

    const [framed] = findTextCandidates(host, "© 2026 Maple Furnishers. All rights reserved.");
    assert.equal(framed?.match.how, "around");
    assert.deepEqual(applyCandidate(framed!, "© 2026 Maple Studio. All rights reserved."), { ok: true });
    assert.equal(copyright!.value, "Maple Studio");
    const refused = applyCandidate(findTextCandidates(host, "© 2026 Maple Studio. All rights reserved.")[0]!, "Copyright Maple Studio");
    assert.equal(refused.ok, false);
    assert.equal(copyright!.value, "Maple Studio", "fixed words around a field never end up in it");
    const long = applyCandidate(findTextCandidates(host, "Maple Studio")[0]!, "A name much longer than twenty letters");
    assert.equal(long.ok, false);
    assert.match(long.ok ? "" : long.message, /20 characters/);
    assert.equal(copyright!.value, "Maple Studio", "a field's length limit holds");

    const [address] = findTextCandidates(host, "A-2/57 Delhi");
    assert.equal(address?.match.how, "same", "line breaks read as spaces on the page");
    assert.deepEqual(applyCandidate(address!, "A-2/57\nNew Delhi"), { ok: true });
    assert.equal(host.querySelector("textarea")!.value, "A-2/57\nNew Delhi", "a text box keeps line breaks typed on the page");
  } finally { host.remove(); }
});

test("a short word drawn apart from the rest of a short field ('20+' of '20+ Cities') is matched when the page shows the whole field there", () => {
  const around = "We Are Serving 20+ Cities Delivering comfort and elegance across India.";
  assert.equal(matchWords("20+ Cities", "20+"), null, "on its own, a short word is still too weak a clue");
  assert.deepEqual(matchWords("20+ Cities", "20+", around), { how: "part", start: 0, end: 3 });
  assert.equal(matchWords("20+ Cities", "20+", "We Are Serving 20+ Kolkata Delhi"), null, "not when the field's words are not shown together");
  const paragraph = `Every one of our pieces is built to order in our own workshop, with 20+ checks before it ships to you.`;
  assert.equal(matchWords(paragraph, "20+", paragraph), null, "never inside a long field, where a short word is everywhere");

  const host = document.createElement("div");
  host.innerHTML = '<input aria-label="Cities heading" value="20+ Cities">';
  document.body.append(host);
  try {
    const [figure] = findTextCandidates(host, "20+", around);
    assert.deepEqual(applyCandidate(figure!, "25+"), { ok: true });
    assert.equal(host.querySelector("input")!.value, "25+ Cities", "only the figure changes");
  } finally { host.remove(); }
});

test("an empty field whose placeholder is the theme's words (the hero headline) is found and filled in", () => {
  const host = document.createElement("div");
  host.innerHTML = '<input aria-label="Hero headline" placeholder="Timeless Craftsmanship for Modern Living" value=""><input aria-label="Search" placeholder="Search products" value="">';
  document.body.append(host);
  try {
    const [headline] = findTextCandidates(host, " Timeless Craftsmanship  for Modern Living ");
    assert.equal(headline?.element.getAttribute("aria-label"), "Hero headline");
    assert.deepEqual(applyCandidate(headline!, "Made by hand in Delhi"), { ok: true });
    assert.equal(host.querySelector("input")!.value, "Made by hand in Delhi");
    assert.equal(findTextCandidates(host, "Search").length, 0, "only a placeholder that is exactly the words counts");
  } finally { host.remove(); }
});

test("repeated words are told apart by the fields around them, then by their place on the page; addresses lose to shown words", () => {
  const host = document.createElement("div");
  host.innerHTML = `
    <div><input aria-label="Nimbus heading" value="The Nimbus Collection"><input aria-label="Nimbus feature 1" value="Cloud Like Comfort"><input aria-label="Nimbus button" value="Explore"></div>
    <section><h3>More collections</h3><div><input aria-label="Nimbus collection 1 heading" value="The Terra Collection"><input aria-label="Nimbus collection 1 feature 1" value="Earthy Textures"><input aria-label="Nimbus collection 1 button" value="Explore"></div></section>
    <div><input aria-label="Page title" value="king"><input aria-label="Page slug" value="king"></div>`;
  document.body.append(host);
  try {
    const found = findTextCandidates(host, "Explore");
    assert.equal(found.length, 2);
    const label = (candidate: ReturnType<typeof pickCandidate>) => candidate?.element.getAttribute("aria-label");
    assert.equal(label(pickCandidate(found, "The Terra Collection Soft presence. Earthy Textures Explore", 0, host)), "Nimbus collection 1 button");
    assert.equal(label(pickCandidate(found, "The Nimbus Collection Cloud Like Comfort Explore", 1, host)), "Nimbus button", "the words around beat the place on the page");
    assert.equal(label(pickCandidate(found, "Explore", 1, host)), "Nimbus collection 1 button", "with no clue around them, the second repeat is the second field");
    assert.equal(label(pickCandidate(findTextCandidates(host, "king"), "king", 0, host)), "Page title", "a slug is never shown as words");
  } finally { host.remove(); }
});

test("a field inside a closed panel is opened and pulsed, without taking the keyboard", () => {
  const host = document.createElement("div");
  host.innerHTML = '<details><summary>Footer</summary><input aria-label="Shop heading" value="SHOP"></details><button>Elsewhere</button>';
  document.body.append(host);
  try {
    host.querySelector("button")!.focus();
    const [candidate] = findTextCandidates(host, "SHOP");
    revealCandidate(candidate!);
    assert.equal(host.querySelector("details")!.open, true);
    assert.equal(candidate!.element.getAttribute("data-field-flash"), "true");
    assert.equal(document.activeElement, host.querySelector("button"), "the keyboard stays where it was");
  } finally { host.remove(); }
});

const existingPages = [
  ["story", "Our Story", "pages/our-story"], ["nimbus", "The Nimbus Collection", "pages/nimbus-collection"], ["terra", "The Terra Collection", "pages/terra-collection"],
  ["contact", "Contact", "pages/contact"], ["bulk", "Bulk Enquiry", "pages/bulk-enquiry"], ["returns", "Return & Exchange", "pages/returns"],
] as const;

test("clicked words open the screen that edits them, and the preview keeps its page", () => {
  const content: StorefrontContent = { ...structuredClone(defaultStorefrontContent), pages: [{ slug: "king", title: "King", description: "", body: "", banner: null }] };
  const message = (over: Record<string, unknown>) => ({ type: "text-select" as const, text: "x", path: "/", section: null, area: "page" as const, context: "", occurrence: 0, ...over }) as Parameters<typeof clickEditScreen>[0];
  assert.deepEqual(clickEditScreen(message({ area: "section", section: "nimbus" }), content, existingPages), { kind: "section", section: "nimbus" });
  assert.deepEqual(clickEditScreen(message({ area: "section", section: "not-a-section" }), content, existingPages), { kind: "current" });
  assert.deepEqual(clickEditScreen(message({ area: "footer", path: "/our-story" }), content, existingPages), { kind: "chrome", part: "footer" });
  assert.deepEqual(clickEditScreen(message({ area: "announcement" }), content, existingPages), { kind: "chrome", part: "announcement" });
  assert.deepEqual(clickEditScreen(message({ path: "/our-story" }), content, existingPages), { kind: "existing", page: "story" });
  assert.deepEqual(clickEditScreen(message({ path: "/terra-collection" }), content, existingPages), { kind: "existing", page: "terra" });
  assert.deepEqual(clickEditScreen(message({ path: "/king" }), content, existingPages), { kind: "pages", slug: "king" });
  assert.deepEqual(clickEditScreen(message({ path: "/tables" }), content, existingPages), { kind: "category", slug: "tables" });
  assert.deepEqual(clickEditScreen(message({ path: "/policies/privacy-policy" }), content, existingPages), { kind: "editorial", choice: "policy:privacy-policy" });
  assert.deepEqual(clickEditScreen(message({ path: "/blogs/news" }), content, existingPages), { kind: "editorial", choice: "blog:news" });
  assert.deepEqual(clickEditScreen(message({ path: "/blogs/news/a-post" }), content, existingPages), { kind: "editorial", choice: "article:news/a-post", article: "a-post" });
  assert.deepEqual(clickEditScreen(message({ path: "/products/aero" }), content, existingPages), { kind: "current" });
  assert.equal(previewRouteFor("/"), "home");
  assert.equal(previewRouteFor("/our-story"), "pages/our-story");
  assert.equal(previewRouteFor("/king"), "pages/king");
  assert.equal(previewRouteFor("/policies/privacy-policy"), "policies/privacy-policy");
  assert.equal(previewRouteFor("/blogs/news/a-post"), "blogs/news/a-post");
  assert.equal(previewRouteFor("/collections/all"), "collections/all");
});

test("a link to a page of its own, followed in Browse, opens that page in the frame instead of 'unavailable'", async () => {
  // Found in the browser on 14 Nov 2026: the footer's Our Story link reopened the frame at /our-story, which the frame
  // does not serve; pages of their own live at pages/<slug>.
  const opened: string[] = [];
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <PreviewNavigation token="t" navigate={(url) => opened.push(url)}><a href="/our-story">Our Story</a><a href="/policies/privacy-policy">Privacy</a></PreviewNavigation>,
    ));
    for (const link of container.querySelectorAll("a")) await act(async () => { link.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    assert.deepEqual(opened, ["/admin/preview-frame/pages/our-story?token=t", "/admin/preview-frame/policies/privacy-policy?token=t"]);
  } finally { await act(async () => root.unmount()); }
});

/** The frame's side, with a stand-in parent window that records what the bridge tells the editor. */
async function renderBridge(page: React.ReactNode) {
  const sent: Record<string, any>[] = [];
  const parent = { postMessage: (data: Record<string, any>) => { sent.push(data); } } as unknown as Window;
  const root = createRoot(container);
  await act(async () => root.render(<div>{page}<PreviewFrameBridge path="/" version={7} parentWindow={parent} selectable /></div>));
  const tell = async (data: Record<string, unknown>) => {
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, ...data }, origin, source: parent as never })); });
  };
  const click = async (node: Element) => {
    const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { node.dispatchEvent(event); });
    return event;
  };
  const key = async (node: Element, name: string) => {
    await act(async () => { node.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })); });
  };
  return { sent, tell, click, key, close: () => act(async () => root.unmount()) };
}
const slider = (
  <>
    <div data-home-section="nimbus">
      <div><h2>The Nimbus Collection</h2><p>Cloud Like Comfort</p><a href="/nimbus-collection"><span>Explore</span></a></div>
      <div><h2>The Terra Collection</h2><p>Earthy Textures</p><a href="/terra-collection"><span>Explore</span></a></div>
      <button type="button" aria-label="Next collection"><svg /></button>
      <a href="/nimbus-collection"><img alt="A cloud sofa" /></a>
    </div>
    <div className="announcement"><a href="/collections/all">Free delivery this week</a></div>
    <footer className="maple-footer"><h4>SHOP</h4><p>Line one<br />Line two</p></footer>
  </>
);

test("inside the frame: clicked words become a text box; Enter hands the new words to the editor with where they sit", async () => {
  const frame = await renderBridge(slider);
  try {
    const terra = container.querySelectorAll('[data-home-section="nimbus"] span')[1]!;
    const event = await frame.click(terra);
    assert.equal(event.defaultPrevented, true, "the link around the words does not open while editing");
    assert.ok(terra.hasAttribute("contenteditable"), "the words are a text box on the page");
    assert.equal(terra.getAttribute("data-preview-editing"), "true");
    const select = frame.sent.find((message) => message.type === "text-select")!;
    assert.deepEqual({ ...select, context: undefined }, { source: previewMessageSource, type: "text-select", text: "Explore", path: "/", section: "nimbus", area: "section", context: undefined, occurrence: 1, repeats: 2 });
    assert.match(select.context, /The Terra Collection/);
    assert.doesNotMatch(select.context, /Nimbus Collection/, "the context stops before the other Explore");
    assert.ok(frame.sent.some((message) => message.type === "editing" && message.active === true), "the pane is told typing started");

    terra.textContent = "Discover Terra";
    await frame.key(terra, "Enter");
    const edit = frame.sent.find((message) => message.type === "text-edit")!;
    assert.deepEqual({ before: edit.before, after: edit.after, section: edit.section, area: edit.area, occurrence: edit.occurrence }, { before: "Explore", after: "Discover Terra", section: "nimbus", area: "section", occurrence: 1 });
    assert.equal(terra.hasAttribute("contenteditable"), false, "Enter ends the edit");
    assert.ok(frame.sent.some((message) => message.type === "editing" && message.active === false));

    // The editor had no field for them after all: the page shows the original words again, and why.
    await frame.tell({ type: "text-result", phase: "edit", ok: false, message: "These words can't be changed here." });
    assert.equal(words(terra), "Explore");
    assert.equal(words(container.querySelector("[data-preview-hint]")), "These words can't be changed here.");
  } finally { await frame.close(); }
});

test("inside the frame: a new token after kept words says they are saved, and in which draft version", async () => {
  const frame = await renderBridge(slider);
  try {
    await frame.tell({ type: "token", token: tokenB, version: 8 });
    assert.equal(words(container.querySelector("[data-preview-hint]")), "Saved in draft version 8. It goes live when the draft is published.");
  } finally { await frame.close(); }
});

test("inside the frame: Esc puts the words back, chrome words say which part they sit in, and line breaks are kept", async () => {
  const frame = await renderBridge(slider);
  try {
    const shop = container.querySelector(".maple-footer h4")!;
    await frame.click(shop);
    assert.equal(frame.sent.find((message) => message.type === "text-select")?.area, "footer");
    shop.textContent = "SHOP ALL";
    await frame.key(shop, "Escape");
    assert.equal(words(shop), "SHOP", "Esc puts the original words back");
    assert.equal(frame.sent.some((message) => message.type === "text-edit"), false, "nothing reaches the editor");

    const announcement = container.querySelector(".announcement a")!;
    await frame.click(announcement);
    assert.equal(frame.sent.filter((message) => message.type === "text-select").at(-1)?.area, "announcement");
    await frame.key(announcement, "Escape");

    const lines = container.querySelector(".maple-footer p")!;
    await frame.click(lines);
    assert.ok(lines.hasAttribute("contenteditable"), "words split by line breaks are editable too");
    lines.innerHTML = "Line one<br>Line three";
    await frame.key(lines, "Enter");
    const edit = frame.sent.filter((message) => message.type === "text-edit").at(-1)!;
    assert.equal(edit.before, "Line one Line two", "a line break reads as a space when matching fields");
    assert.equal(edit.after, "Line one\nLine three", "and is kept in the new words, for a text box field");
  } finally { await frame.close(); }
});

test("inside the frame: a refused click ends the edit at once; Browse turns click-to-edit off; controls without words keep working", async () => {
  const frame = await renderBridge(slider);
  try {
    const nimbus = container.querySelector('[data-home-section="nimbus"] h2')!;
    await frame.click(nimbus);
    nimbus.textContent = "Typed before the answer";
    await frame.tell({ type: "text-result", phase: "select", ok: false, message: "You have View access." });
    assert.equal(nimbus.hasAttribute("contenteditable"), false);
    assert.equal(words(nimbus), "The Nimbus Collection", "a refused click puts the words back");
    assert.equal(frame.sent.some((message) => message.type === "text-edit"), false);

    const next = container.querySelector('[aria-label="Next collection"]')!;
    const arrow = await frame.click(next);
    assert.equal(arrow.defaultPrevented, false, "a slider arrow still moves the slider");
    const picture = await frame.click(container.querySelector('[data-home-section="nimbus"] img')!);
    assert.equal(picture.defaultPrevented, true, "a picture link does not open");
    assert.deepEqual(frame.sent.at(-1), { source: previewMessageSource, type: "select", section: "nimbus" }, "a picture opens its section in the editor");

    await frame.tell({ type: "mode", mode: "browse" });
    assert.equal(container.querySelector("[data-preview-hint]"), null, "Browse hides the hint");
    const before = frame.sent.length;
    const browsing = await frame.click(container.querySelector('[data-home-section="nimbus"] span')!);
    assert.equal(browsing.defaultPrevented, false, "in Browse a click is an ordinary click");
    assert.equal(frame.sent.length, before, "and nothing is edited");
  } finally { await frame.close(); }
});

test("inside the frame: a click on words is stopped before anything listening at the document sees it (Next.js roots React there)", async () => {
  // Found in the browser on 14 Nov 2026: React's own capture listener on the document (the preview's link capture)
  // ran before a document listener, so clicking Terra's Explore opened the Terra page instead of editing the words.
  const seen: string[] = [];
  const early = (event: Event) => { seen.push((event.target as Element).getAttribute("aria-label") ?? words(event.target as Element)); };
  document.addEventListener("click", early, true);
  const frame = await renderBridge(slider);
  try {
    await frame.click(container.querySelectorAll('[data-home-section="nimbus"] span')[1]!);
    assert.deepEqual(seen, [], "the document never sees a click on words, so no link is followed");
    await frame.key(container.querySelector("[data-preview-editing]")!, "Escape");
    await frame.click(container.querySelector('[aria-label="Next collection"]')!);
    assert.deepEqual(seen, ["Next collection"], "a slider arrow still reaches the page");
  } finally {
    document.removeEventListener("click", early, true);
    await frame.close();
  }
});

test("the frame's server markup has no click-to-edit hint, so the first render in the browser matches it", () => {
  assert.equal(renderToString(<PreviewFrameBridge path="/" version={3} selectable />), "");
});

// The editor end to end, with the frame played by test code.
const tokenA = "eyJzIjoiZWRpdG9yIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const tokenB = "eyJzIjoiZWRpdG9yIn0.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
async function setup({ role = "editor", content = defaultStorefrontContent }: { role?: "editor" | "viewer"; content?: StorefrontContent } = {}) {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const puts: any[] = [];
  let version = 4, mints = 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/api/admin/content" && method === "PUT") {
      puts.push(body);
      version = body.expectedVersion + 1;
      return Response.json({ version, draft: body.content, publishedVersion: 2, updatedAt: "2026-11-14T09:00:00Z" });
    }
    if (path === "/api/admin/content/preview" && method === "POST") {
      return Response.json({ token: mints++ === 0 ? tokenA : tokenB, version, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    }
    if (path.startsWith("/api/catalogue")) return Response.json({ items: [], total: 0 });
    assert.equal(path, "/api/admin/content", `Unexpected request ${method} ${path}`);
    return Response.json({ version: 4, draft: structuredClone(content), publishedVersion: 2, updatedAt: "2026-11-14T08:00:00Z" });
  };
  await act(async () => root.render(
    <ContentEditor session={{ user: { id: role, email: `${role}@example.test`, role }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} livePreviewDebounceMs={30} />,
  ));
  const button = (name: string) => {
    const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === name || words(b) === name);
    assert.ok(found, `Missing ${name} button`);
    return found;
  };
  const click = async (name: string) => { await act(async () => button(name).click()); };
  const frame = () => {
    const found = container.querySelector<HTMLIFrameElement>("iframe[data-live-preview-frame]");
    assert.ok(found, "The live preview frame is rendered");
    return found;
  };
  const replies: Record<string, any>[] = [];
  /** Opens the live preview and plays a frame that is ready and records what the editor answers. */
  async function openPreview() {
    await click("Live preview");
    await until(() => container.querySelector("iframe[data-live-preview-frame]") !== null, "the preview frame");
    const frameWindow = frame().contentWindow!;
    frameWindow.postMessage = ((data: Record<string, any>) => { replies.push(data); }) as typeof frameWindow.postMessage;
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, type: "ready", path: "/", version, sections: [] }, origin, source: frameWindow })); });
  }
  /** What the frame sends when words are clicked (text-select) or kept (text-edit). */
  async function fromFrame(data: Record<string, unknown>) {
    const frameWindow = frame().contentWindow!;
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: previewMessageSource, ...data }, origin, source: frameWindow })); });
  }
  const field = (label: string) => container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  return { puts, click, button, frame, replies, openPreview, fromFrame, field, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const terraContext = "The Terra Collection Soft presence. Strong craftsmanship. Earthy Textures Organic Curves Warm Woods Grounded Comfort Explore";

test("clicking Terra's Explore in the preview opens the Nimbus inspector and lights up Terra's button field, not Nimbus's", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    assert.ok(app.button("Click to edit"), "Edit access offers click-to-edit");
    await app.fromFrame({ type: "text-select", text: "Explore", path: "/", section: "nimbus", area: "section", context: terraContext, occurrence: 1 });
    await until(() => app.replies.some((reply) => reply.type === "text-result"), "the editor's answer");
    assert.deepEqual(app.replies.find((reply) => reply.type === "text-result"), { source: previewMessageSource, type: "text-result", phase: "select", ok: true });
    assert.equal(container.querySelector("[data-section-inspector]")?.getAttribute("data-section-inspector"), "nimbus");
    assert.equal(app.field("Nimbus collection 1 button")?.getAttribute("data-field-flash"), "true", "Terra's button field lights up");
    assert.equal(app.field("Nimbus button")?.hasAttribute("data-field-flash"), false);
    assert.notEqual(document.activeElement?.tagName, "H2", "the inspector leaves the keyboard on the page");
  } finally { await app.close(); }
});

test("words kept on the page are typed into the right field and saved with the draft; the Nimbus card's own button is untouched", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    await app.fromFrame({ type: "text-edit", before: "Explore", after: "Discover Terra", path: "/", section: "nimbus", area: "section", context: terraContext, occurrence: 1 });
    await until(() => app.replies.some((reply) => reply.type === "text-result" && reply.phase === "edit"), "the editor's answer");
    assert.equal(app.replies.find((reply) => reply.phase === "edit")?.ok, true);
    assert.equal(app.field("Nimbus collection 1 button")?.value, "Discover Terra");
    assert.equal(app.field("Nimbus button")?.value, "Explore");
    await until(() => app.puts.length > 0, "the live preview's quiet save");
    const nimbus = app.puts.at(-1).content.homeDetails.nimbus;
    assert.equal(nimbus.slides[0].cta, "Discover Terra");
    assert.equal(nimbus.cta, "Explore");
  } finally { await app.close(); }
});

test("a click-to-edit save never reloads the page: the frame gets the new token in place (owner: 'the page keep reloading')", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    const before = app.frame().getAttribute("src");
    assert.match(before ?? "", new RegExp(tokenA));
    await app.fromFrame({ type: "text-edit", before: "Explore", after: "Discover Terra", path: "/", section: "nimbus", area: "section", context: terraContext, occurrence: 1, repeats: 2 });
    await until(() => app.puts.length > 0, "the quiet save");
    await until(() => app.replies.some((reply) => reply.type === "token"), "the new token handed to the page (two copies, each its own field)");
    assert.deepEqual(app.replies.find((reply) => reply.type === "token"), { source: previewMessageSource, type: "token", token: tokenB, version: 5 });
    await settle(120);
    assert.equal(app.frame().getAttribute("src"), before, "the frame was not reloaded");
    await until(() => [...container.querySelectorAll('[data-notice="status"]')].some((node) => /Saved in draft version 5/.test(words(node))), "the saved notice");
    assert.ok([...container.querySelectorAll('[data-notice="status"]')].some((node) => words(node) === "Saved in draft version 5. A publisher puts it on the live store when they publish the draft."),
      "the editor says the words are saved, and who puts them live");
  } finally { await app.close(); }
});

test("the big hero headline, shown from the theme until staff write their own, is typed into Hero headline and saved", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    const before = app.frame().getAttribute("src");
    await app.fromFrame({ type: "text-edit", before: "Timeless Craftsmanship for Modern Living", after: "Made by hand in Delhi", path: "/", section: "hero", area: "section",
      context: "Timeless Craftsmanship for Modern Living Handcrafted furniture that brings elegance to every corner of your home.", occurrence: 0, repeats: 4 });
    await until(() => app.replies.some((reply) => reply.type === "text-result" && reply.phase === "edit"), "the editor's answer");
    assert.equal(app.replies.find((reply) => reply.phase === "edit")?.ok, true);
    assert.equal(app.field("Hero headline")?.value, "Made by hand in Delhi");
    await until(() => app.puts.length > 0, "the quiet save");
    assert.equal(app.puts.at(-1).content.homeDetails.hero.headline, "Made by hand in Delhi");
    assert.equal(app.puts.at(-1).content.homeDetails.hero.intro, undefined, "the intro keeps the theme's words");
    // The other three photos show the same field: the page reloads once (keeping its place) so they show the new words too.
    await until(() => app.frame().getAttribute("src") !== before, "the page reloaded with the new draft");
    assert.match(app.frame().getAttribute("src") ?? "", new RegExp(tokenB));
    assert.equal(app.replies.some((reply) => reply.type === "token"), false, "no in-place token: the reload carries it");
  } finally { await app.close(); }
});

test("the promos' second card is found in its own campaign: the Campaign list switches to it and its headline changes", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    await app.fromFrame({ type: "text-edit", before: "Less clutter.", after: "Less mess.", path: "/", section: "promos", area: "section",
      context: "Less clutter. More celebration. Up to 25% off selected storage furniture Shop Storage", occurrence: 0 });
    await until(() => app.replies.some((reply) => reply.type === "text-result" && reply.phase === "edit"), "the editor's answer");
    assert.equal(app.replies.find((reply) => reply.phase === "edit")?.ok, true, "the words are taken, not refused");
    const chooser = [...container.querySelectorAll<HTMLSelectElement>("[data-section-inspector=promos] select")].find((select) => (select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent ?? "").trim() === "Campaign");
    assert.equal(chooser?.selectedOptions[0]?.textContent?.toLowerCase(), "landing storage");
    assert.equal(app.field("Campaign headline")?.value, "Less mess.\nMore celebration.");
    await until(() => app.puts.length > 0, "the quiet save");
    const campaigns = app.puts.at(-1).content.campaigns as { key: string; headline: string[] }[];
    assert.deepEqual(campaigns.find((campaign) => campaign.key === "landing-storage")?.headline, ["Less mess.", "More celebration."]);
    assert.deepEqual(campaigns.find((campaign) => campaign.key === "landing-dining")?.headline, ["Come together.", "Stay a little longer."], "the first card is untouched");
  } finally { await app.close(); }
});

test("words in none of a section's campaigns are refused and the Campaign list is put back where it was", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    await app.fromFrame({ type: "text-select", text: "Nothing like this", path: "/", section: "promos", area: "section", context: "Nothing like this", occurrence: 0 });
    await until(() => app.replies.some((reply) => reply.type === "text-result"), "the editor's answer");
    assert.equal(app.replies.find((reply) => reply.type === "text-result")?.ok, false);
    await settle(120);
    const chooser = [...container.querySelectorAll<HTMLSelectElement>("[data-section-inspector=promos] select")].find((select) => (select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent ?? "").trim() === "Campaign");
    assert.equal(chooser?.selectedOptions[0]?.textContent?.toLowerCase(), "landing dining");
    assert.equal(app.puts.length, 0, "nothing was saved");
  } finally { await app.close(); }
});

test("footer words clicked on another page open Navigation & footer on its Footer tab; the preview stays on that page", async () => {
  const app = await setup();
  try {
    await app.click("Existing pages");
    await app.openPreview();
    assert.match(app.frame().getAttribute("src") ?? "", /pages\/our-story/);
    await app.fromFrame({ type: "text-edit", before: "SHOP", after: "SHOP ALL", path: "/our-story", section: null, area: "footer", context: "SHOP Sofas Chairs", occurrence: 0 });
    await until(() => app.replies.some((reply) => reply.phase === "edit"), "the editor's answer");
    assert.equal(app.replies.find((reply) => reply.phase === "edit")?.ok, true);
    assert.equal(container.querySelector("[data-admin-panel]")?.getAttribute("aria-label"), "Navigation & footer editor");
    assert.equal(app.field("Shop heading")?.value, "SHOP ALL");
    await until(() => app.puts.length > 0, "the quiet save");
    assert.equal(app.puts.at(-1).content.siteChrome.footer.shopHeading, "SHOP ALL");
    assert.match(app.frame().getAttribute("src") ?? "", /pages\/our-story/, "the preview never jumps to another page");
  } finally { await app.close(); }
});

test("words on a page of its own open Pages with that page chosen and change its title, not its address", async () => {
  const content: StorefrontContent = { ...structuredClone(defaultStorefrontContent), pages: [
    { slug: "about-delivery", title: "About delivery", description: "", body: "", banner: null },
    { slug: "king", title: "king", description: "", body: "", banner: null },
  ] };
  const app = await setup({ content });
  try {
    await app.openPreview();
    await app.fromFrame({ type: "text-edit", before: "king", after: "The King range", path: "/king", section: null, area: "page", context: "king", occurrence: 0 });
    await until(() => app.replies.some((reply) => reply.phase === "edit"), "the editor's answer");
    assert.equal(app.replies.find((reply) => reply.phase === "edit")?.ok, true);
    assert.equal(container.querySelector("[data-admin-panel]")?.getAttribute("aria-label"), "Pages editor");
    assert.equal(app.field("Page title")?.value, "The King range");
    assert.equal(app.field("Page slug")?.value, "king", "the page keeps its address");
    await until(() => app.puts.length > 0, "the quiet save");
    assert.deepEqual(app.puts.at(-1).content.pages.map((page: { slug: string; title: string }) => [page.slug, page.title]), [["about-delivery", "About delivery"], ["king", "The King range"]]);
  } finally { await app.close(); }
});

test("words no field holds are refused with a reason, and the editor says the page was put back", async () => {
  const app = await setup();
  try {
    await app.openPreview();
    await app.fromFrame({ type: "text-edit", before: "Aero Three Seater Sofa", after: "Aero Sofa", path: "/", section: "bestsellers", area: "section", context: "Aero Three Seater Sofa ₹1,18,000", occurrence: 0 });
    await until(() => app.replies.some((reply) => reply.phase === "edit"), "the editor's answer");
    const reply = app.replies.find((item) => item.phase === "edit")!;
    assert.equal(reply.ok, false);
    assert.match(reply.message, /Keeri/);
    await until(() => (container.textContent ?? "").includes("The page was put back"), "the editor's notice");
    await settle();
    assert.equal(app.puts.length, 0, "nothing is saved");
  } finally { await app.close(); }
});

test("View access browses the preview: no click-to-edit switch, and a clicked word is refused with the reason", async () => {
  const app = await setup({ role: "viewer" });
  try {
    await app.openPreview();
    assert.equal([...container.querySelectorAll("button")].some((b) => words(b) === "Click to edit" || words(b) === "Browse"), false);
    assert.ok(app.replies.some((reply) => reply.type === "mode" && reply.mode === "browse"), "the frame is told to browse");
    await app.fromFrame({ type: "text-select", text: "Explore", path: "/", section: "nimbus", area: "section", context: terraContext, occurrence: 1 });
    await until(() => app.replies.some((reply) => reply.type === "text-result"), "the editor's answer");
    const reply = app.replies.find((item) => item.type === "text-result")!;
    assert.equal(reply.ok, false);
    assert.match(reply.message, /View access/);
  } finally { await app.close(); }
});
