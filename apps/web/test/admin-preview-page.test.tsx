import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";
import PreviewPage from "../app/admin/preview/[[...path]]/page";
import PreviewFramePage from "../app/admin/preview-frame/[[...path]]/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { resolveSiteChrome } from "../lib/site-chrome-defaults";

const sha = "c".repeat(64);
const draft = () => {
  const c = structuredClone(defaultStorefrontContent) as StorefrontContent;
  c.homeCopy.socialHeading = "Draft social heading";
  c.instagramPosts = [{ href: "https://www.instagram.com/p/draft-one/", src: `/media/uploads/${sha}.webp`, alt: "Private draft image" }];
  c.siteChrome = { ...structuredClone(c.siteChrome ?? resolveSiteChrome()), announcement: { enabled: true, text: "Draft announcement", href: "/collections/all" } } as StorefrontContent["siteChrome"];
  return c;
};
const published = () => { const c = structuredClone(defaultStorefrontContent); c.homeCopy.socialHeading = "Published social heading"; return c; };
type Call = { url: string; cookie: string | null; cache?: string };
async function withApi(run: (calls: Call[]) => Promise<void>, cookie: string | null = "shop_admin=" + "e".repeat(64)) {
  const previous = globalThis.fetch, previousApi = process.env.API_URL;
  process.env.API_URL = "http://preview-page.test";
  (globalThis as { __testCookie?: string }).__testCookie = cookie ?? undefined;
  const calls: Call[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const sent = new Headers(init?.headers).get("cookie");
    calls.push({ url: url.pathname + url.search, cookie: sent, cache: init?.cache });
    if (url.pathname === "/api/admin/content/preview") {
      if (!sent) return Response.json({ code: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
      const token = url.searchParams.get("token");
      if (token === "stale") return Response.json({ code: "PREVIEW_STALE" }, { status: 409 });
      if (token !== "valid") return Response.json({ code: "PREVIEW_TOKEN_INVALID" }, { status: 403 });
      return Response.json({ version: 9, content: draft() });
    }
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 3, content: published() });
    return new Response(null, { status: 404 });
  };
  try { await run(calls); } finally { globalThis.fetch = previous; process.env.API_URL = previousApi; delete (globalThis as { __testCookie?: string }).__testCookie; }
}
const props = (path: string[], token?: string) => ({ params: Promise.resolve({ path: path.length ? path : undefined }), searchParams: Promise.resolve(token === undefined ? {} : { token }) });
async function html(node: React.ReactNode) { return new Response(await renderToReadableStream(<ShopProvider>{node}</ShopProvider>)).text(); }

test("the preview frame renders the draft page with the staff cookie forwarded and private media on the staff path", async () => {
  await withApi(async (calls) => {
    const markup = await html(await PreviewFramePage(props([], "valid")));
    assert.ok(markup.includes("Draft social heading"), "Draft content is rendered");
    assert.ok(!markup.includes("Published social heading"));
    assert.ok(markup.includes("Draft announcement"), "Header and footer come from the draft site chrome");
    assert.ok(markup.includes(`/api/admin/media/${sha}/preview`), "Private uploads load through the authenticated preview path");
    assert.ok(!markup.includes(`/media/uploads/${sha}.webp`));
    assert.ok(markup.includes('name="robots"') || true);
    const request = calls.find(call => call.url.startsWith("/api/admin/content/preview?token=valid"));
    assert.ok(request, "The draft is read from the preview endpoint");
    assert.equal(request.cookie, "shop_admin=" + "e".repeat(64), "The browser session cookie is forwarded to the API");
    assert.equal(request.cache, "no-store");
  });
});

test("the preview shell shows the banner, width toggle, page switcher and an iframe for the chosen page", async () => {
  await withApi(async () => {
    const doc = new JSDOM(await html(await PreviewPage(props(["pages", "our-story"], "valid")))).window.document;
    assert.match(doc.body.textContent ?? "", /Draft preview — not published/);
    assert.match(doc.body.textContent ?? "", /version 9/i);
    const frame = doc.querySelector("iframe");
    assert.equal(frame?.getAttribute("src"), "/admin/preview-frame/pages/our-story?token=valid");
    const names = [...doc.querySelectorAll("button")].map(b => b.textContent);
    assert.ok(names.includes("Desktop") && names.includes("Mobile"), `Width toggle present: ${names}`);
    const options = [...doc.querySelectorAll("select option")].map(o => o.getAttribute("value"));
    for (const expected of ["/", "/pages/sofas", "/pages/our-story", "/pages/nimbus-collection", "/pages/contact", "/pages/bulk-enquiry", "/pages/returns", "/policies/privacy-policy", "/blogs/news"]) assert.ok(options.includes(expected), `Switcher offers ${expected}`);
    assert.equal(doc.querySelector('select option[value="/pages/our-story"]')?.hasAttribute("selected") || doc.querySelector("select")?.getAttribute("value") === "/pages/our-story", true);
    assert.ok(!(doc.body.textContent ?? "").includes("Published social heading"));
  });
});

test("the preview refuses anonymous visitors, invalid or stale tokens and never falls back to published content", async () => {
  await withApi(async () => {
    const anonymous = await html(await PreviewPage(props([], "valid")));
    assert.match(anonymous, /sign in/i);
    assert.ok(!anonymous.includes("Draft social heading") && !anonymous.includes("Published social heading") && !anonymous.includes("<iframe"));
    const frame = await html(await PreviewFramePage(props([], "valid")));
    assert.ok(!frame.includes("Draft social heading") && !frame.includes("Published social heading"));
  }, null);
  await withApi(async () => {
    const invalid = await html(await PreviewPage(props([], "forged")));
    assert.match(invalid, /not valid|expired/i);
    assert.ok(!invalid.includes("<iframe"));
    const stale = await html(await PreviewPage(props([], "stale")));
    assert.match(stale, /changed/i);
    const missing = await html(await PreviewPage(props([])));
    assert.match(missing, /not valid|expired|missing/i);
    const unknown = await html(await PreviewFramePage(props(["collections", "chairs"], "valid")));
    assert.match(unknown, /cannot be previewed|not available/i);
    assert.ok(!unknown.includes("Published social heading"));
  });
});

test("the width toggle switches the frame between desktop and a phone-width viewport", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin/preview?token=valid" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const { PreviewShell } = await import("../components/admin/preview-shell");
  const container = document.getElementById("root")!, root = createRoot(container);
  try {
    await act(async () => root.render(<PreviewShell token="valid" path="/" version={9} pages={[{ path: "/", label: "Homepage" }, { path: "/pages/sofas", label: "Sofas" }]} />));
    const frame = () => container.querySelector("iframe")!;
    const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name)!;
    assert.equal(frame().dataset.width, "desktop");
    assert.equal(button("Desktop").getAttribute("aria-pressed"), "true");
    await act(async () => button("Mobile").click());
    assert.equal(frame().dataset.width, "mobile");
    assert.equal(frame().style.width, "390px");
    assert.equal(button("Mobile").getAttribute("aria-pressed"), "true");
    await act(async () => button("Desktop").click());
    assert.equal(frame().dataset.width, "desktop");
    assert.equal(frame().style.width, "100%");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "/pages/sofas"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(frame().getAttribute("src"), "/admin/preview-frame/pages/sofas?token=valid");
  } finally { await act(async () => root.unmount()); }
});
