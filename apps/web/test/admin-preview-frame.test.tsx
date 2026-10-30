import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM, VirtualConsole } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Links clicked inside the preview frame must stay on the draft: same-origin storefront
// links reopen inside the frame with the same token, while external and /admin links are left alone.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin/preview-frame/pages/sofas?token=x", virtualConsole: new VirtualConsole() });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, HTMLAnchorElement: dom.window.HTMLAnchorElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { PreviewFrameDocument } = await import("../components/admin/preview-shell");
const { ShopProvider } = await import("../components/shop-provider");
const { renderStorefrontRoute } = await import("../lib/storefront-routes");
const token = "eyJzIjoiZWRpdG9yIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const content = structuredClone(defaultStorefrontContent);

function click(anchor: Element, init: MouseEventInit = {}) {
  const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  const allowed = anchor.dispatchEvent(event);
  return { prevented: !allowed };
}

test("storefront links inside the frame reopen on the draft with the same token; external and admin links are untouched", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(document.getElementById("root")!);
  const assigned: string[] = [];
  try {
    await act(async () => root.render(
      <ShopProvider>
        <PreviewFrameDocument token={token} version={7} path="/pages/sofas" siteChrome={content.siteChrome} navigate={(url) => assigned.push(url)}>
          <a href="/">Home link</a>
          <a href="/collections/all">Shop all</a>
          <a href="https://example.com/outside">Outside</a>
          <a href="/admin">Editor</a>
        </PreviewFrameDocument>
      </ShopProvider>,
    ));
    const byText = (text: string) => { const a = [...document.querySelectorAll("a")].find((el) => el.textContent === text); assert.ok(a, `Missing ${text} link`); return a; };
    assert.equal(document.querySelector('[role="status"]')?.textContent, "Draft preview, not published. Version 7");
    const query = `?token=${encodeURIComponent(token)}`;

    const chromeLink = [...document.querySelectorAll<HTMLAnchorElement>("header a[href], footer a[href]")].find((a) => a.getAttribute("href")?.startsWith("/policies/"));
    assert.ok(chromeLink, "The draft's own navigation and footer render inside the frame");
    assert.equal(click(chromeLink).prevented, true, "Chrome links are intercepted");
    assert.deepEqual(assigned, [`/admin/preview-frame${chromeLink.getAttribute("href")}${query}`]);

    assert.equal(click(byText("Shop all")).prevented, true);
    assert.equal(assigned.at(-1), `/admin/preview-frame/collections/all${query}`);
    assert.equal(click(byText("Home link")).prevented, true);
    assert.equal(assigned.at(-1), `/admin/preview-frame/home${query}`);
    assert.equal(assigned.length, 3);

    assert.equal(click(byText("Outside")).prevented, false, "External links keep their default behaviour");
    assert.equal(click(byText("Editor")).prevented, false, "Links back into the admin are not rewritten");
    assert.equal(click(byText("Shop all"), { metaKey: true }).prevented, false, "Modifier clicks open as the browser decides");
    assert.equal(assigned.length, 3);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("every link of a real draft page renders inside the navigation wrapper", async () => {
  const route = renderStorefrontRoute(["home"], { ...content, campaignsAvailable: true });
  assert.ok(route);
  const html = await new Response(await renderToReadableStream(
    <ShopProvider>
      <PreviewFrameDocument token={token} version={7} path={route.path} siteChrome={content.siteChrome}>{route.node}</PreviewFrameDocument>
    </ShopProvider>,
  )).text();
  const page = new JSDOM(html).window.document;
  const anchors = [...page.querySelectorAll("a[href]")];
  assert.ok(anchors.length > 20, `Expected the homepage chrome and sections to render links, got ${anchors.length}`);
  const outside = anchors.filter((a) => !a.closest("[data-preview-navigation]")).map((a) => a.getAttribute("href"));
  assert.deepEqual(outside, [], "Links rendered outside the click-capturing wrapper would leave the draft");
  assert.ok(page.querySelector("[data-preview-navigation] header"), "The draft chrome is inside the wrapper");
});

test("links followed inside the published view stay on the published view", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(document.getElementById("root")!);
  const assigned: string[] = [];
  try {
    await act(async () => root.render(
      <ShopProvider>
        <PreviewFrameDocument token={token} version={2} path="/pages/sofas" siteChrome={content.siteChrome} view="published" navigate={(url) => assigned.push(url)}>
          <a href="/collections/all">Shop all</a>
        </PreviewFrameDocument>
      </ShopProvider>,
    ));
    assert.match(document.querySelector('[role="status"]')?.textContent ?? "", /Published/);
    const link = [...document.querySelectorAll("a")].find((el) => el.textContent === "Shop all")!;
    assert.equal(click(link).prevented, true);
    assert.deepEqual(assigned, [`/admin/preview-frame/collections/all?token=${encodeURIComponent(token)}&view=published`]);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("a section thumbnail renders that one section alone: no navigation, footer, ribbon or link capture", async () => {
  const { SectionThumbnailDocument } = await import("../components/admin/preview-shell");
  const { thumbnailContent } = await import("../lib/section-thumbnails");
  const hidden = { ...content, campaignsAvailable: true, homeSections: content.homeSections.map((section) => ({ ...section, enabled: section.key !== "values" })) };
  const route = renderStorefrontRoute(["home"], thumbnailContent(hidden, "values"));
  assert.ok(route);
  const html = await new Response(await renderToReadableStream(
    <ShopProvider><SectionThumbnailDocument section="values">{route.node}</SectionThumbnailDocument></ShopProvider>,
  )).text();
  const page = new JSDOM(html).window.document;
  assert.deepEqual([...page.querySelectorAll<HTMLElement>("[data-home-section]")].map((node) => node.dataset.homeSection), ["values"], "only the requested section, even though the draft hides it");
  assert.equal(page.querySelector("[data-section-thumbnail]")?.getAttribute("data-section-thumbnail"), "values");
  assert.equal(page.querySelector("header, footer, [role=status], [data-preview-navigation]"), null);
});

test("the frame takes a thumbnail section only for a homepage section on the home page", async () => {
  const { readThumbnailSection } = await import("../lib/live-preview");
  assert.equal(readThumbnailSection(["home"], undefined), null, "no section asked for: the whole page");
  assert.equal(readThumbnailSection(["home"], "dining-banner"), "dining-banner");
  assert.equal(readThumbnailSection([], "hero"), "hero", "the bare address is the home page");
  assert.equal(readThumbnailSection(["home"], "footer"), false, "not a homepage section");
  assert.equal(readThumbnailSection(["home"], ["hero", "values"]), false, "repeated parameters are refused");
  assert.equal(readThumbnailSection(["pages", "sofas"], "hero"), false, "sections exist only on the home page");
});
