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
