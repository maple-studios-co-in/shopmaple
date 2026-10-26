import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { Product } from "@shopmaple/contracts";
import { MobileNavigation } from "../components/navigation";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (fn: () => void) => { fn(); return 0; } });
Object.assign(dom.window, { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
dom.window.HTMLElement.prototype.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const handles = ["veyra-chest-of-drawers", "rowan-bookcase", "elion-storage-cabinet", "arden-console-cabinet", "morik-media-unit", "zylen-media-unit"];
function product(handle: string, pricePaise: number | null = 123400): Product {
  return { id: handle, handle, title: "Current catalogue name", description: "Current description", category: "chairs", images: [], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: `${handle}-option`, title: "Standard", sku: null, pricePaise, compareAtPaise: 150000, available: false, stockPolicy: "unverified" }] };
}
type Request = { handle: string; signal?: AbortSignal | null; resolve: (response: Response) => void };
function button(label: string) {
  const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label || b.getAttribute("aria-label") === label);
  assert.ok(element, `Missing ${label}`); return element;
}
async function click(label: string) { await act(async () => { const b = button(label); b.focus(); b.click(); }); }
function cards() { return [...document.querySelectorAll<HTMLAnchorElement>(".maple-menu-product")]; }
async function setup(t: TestContext, open = true) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = globalThis.fetch, requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method ?? "GET", "GET");
    const url = String(input); assert.match(url, /^\/api\/products\/[a-z0-9-]+$/);
    return new Promise<Response>(resolve => requests.push({ handle: url.split("/").at(-1)!, signal: init?.signal, resolve }));
  };
  const root = createRoot(document.getElementById("root")!);
  const render = async (isOpen: boolean) => { await act(async () => root.render(<MobileNavigation open={isOpen} onClose={() => { void render(false); }} />)); };
  await render(open);
  return { requests, render, close: async () => { await act(async () => root.unmount()); globalThis.fetch = original; t.mock.timers.reset(); } };
}
async function resolveAll(requests: Request[], response: (handle: string) => Response = handle => Response.json(product(handle))) {
  await act(async () => { for (const request of requests) request.resolve(response(request.handle)); });
}

// Reverting to source-price cards exposes old prices before the current read completes.
test("menu waits for current publication and prices while retaining curated order, copy and artwork", async t => {
  const app = await setup(t, false); try {
    assert.equal(app.requests.length, 0, "closed drawer must not load products");
    await app.render(true);
    assert.equal(cards().length, 0, "loading must not advertise source snapshot prices");
    assert.match(document.querySelector('[aria-label="Featured furniture"]')?.textContent ?? "", /Loading/);
    assert.deepEqual(app.requests.map(r => r.handle), handles);
    await resolveAll(app.requests);
    assert.deepEqual(cards().map(a => a.getAttribute("href")), handles.slice(0, 4).map(h => `/products/${h}`));
    assert.match(cards()[0]!.textContent!, /Veyra Chest of Drawers/);
    assert.match(cards()[0]!.textContent!, /1,234/);
    assert.match(cards()[0]!.querySelector("del")!.textContent!, /1,500/);
    assert.doesNotMatch(cards()[0]!.textContent!, /76,700|82,600/);
    assert.match(cards()[0]!.querySelector("img")!.getAttribute("src")!, /f64f78cc692eed394c40922a3594286a/);
    await click("Living Room");
    assert.deepEqual(cards().map(a => a.getAttribute("href")), ["/products/morik-media-unit", "/products/zylen-media-unit"]);
    assert.equal(app.requests.length, 6, "drilldown reuses this opening's current records");
  } finally { await app.close(); }
});

// Accepting a 404, unpublished record or different identity would advertise withdrawn/wrong products.
test("missing and invalid records never become menu links or source-price fallbacks", async t => {
  const app = await setup(t); try {
    assert.equal(app.requests.length, 6, "menu must resolve current products");
    await resolveAll(app.requests, handle => handle === handles[0] ? new Response(null, {status:404}) :
      handle === handles[1] ? Response.json({...product(handle), published:false}) :
      handle === handles[2] ? Response.json(product("different-product")) :
      handle === handles[3] ? Response.json({handle}) : Response.json(product(handle)));
    assert.equal(cards().length, 0);
    assert.ok(document.querySelector('[aria-label="Featured furniture"] [role="alert"]'));
    await click("Living Room"); assert.equal(cards().length, 2, "valid independent products remain visible");
  } finally { await app.close(); }
});

// Source price fallback or losing projection flags would misrepresent partially priced variants.
test("menu reports request-only and mixed option prices using the current catalogue", async t => {
  const app = await setup(t); try {
    assert.equal(app.requests.length, 6);
    await resolveAll(app.requests, handle => {
      const p = product(handle, handle === handles[0] ? null : 123400);
      if (handle === handles[1]) p.variants.push({...p.variants[0]!, id:"unknown", pricePaise:null});
      return Response.json(p);
    });
    assert.match(cards()[0]!.textContent!, /Price on request/); assert.equal(cards()[0]!.querySelector("del"), null);
    assert.match(cards()[1]!.textContent!, /From.*1,234/); assert.match(cards()[1]!.textContent!, /Other options on request/);
  } finally { await app.close(); }
});

// Unbounded response-body waits leave the loading UI stuck; whole-batch retry loses good cards.
test("stalled bodies time out and retry only failures while preserving loaded cards and safe focus", async t => {
  const app = await setup(t); try {
    assert.equal(app.requests.length, 6);
    let finishOldBody: ((value: Product) => void) | undefined;
    await resolveAll(app.requests, handle => handle === handles[0] ? {ok:true, json:()=>new Promise(resolve => { finishOldBody = resolve; })} as Response :
      handle === handles[1] ? new Response(null,{status:404}) : Response.json(product(handle)));
    await act(async () => t.mock.timers.tick(6000));
    assert.equal(app.requests[0]!.signal?.aborted, true);
    assert.deepEqual(cards().map(a=>a.getAttribute("href")), ["/products/elion-storage-cabinet", "/products/arden-console-cabinet"]);
    await click("Retry featured furniture");
    assert.equal(app.requests.length, 7); assert.equal(app.requests[6]!.handle, handles[0]);
    assert.equal(cards().length, 2, "retry preserves successful cards");
    await resolveAll(app.requests.slice(6), handle => Response.json(product(handle, 987600)));
    await act(async () => finishOldBody?.(product(handles[0]!, 111100)));
    assert.match(cards()[0]!.textContent!, /9,876/);
    assert.doesNotMatch(cards()[0]!.textContent!, /1,111/);
    assert.equal(cards().length, 3); assert.equal(document.querySelector('[aria-label="Featured furniture"] [role="alert"]'), null);
    assert.notEqual(document.activeElement, document.body, "removing retry must not strand focus");
    assert.equal(document.activeElement?.getAttribute("role"), "region", "retry focus must land in an accessible named region");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Featured furniture");
  } finally { await app.close(); }
});

// Removing cleanup or its stale-result guard lets a closed menu's old records replace a fresh opening.
test("closing cancels header waits and reopening ignores stale successful responses", async t => {
  const app = await setup(t); try {
    assert.equal(app.requests.length, 6);
    const old = [...app.requests]; await app.render(false);
    assert.ok(old.every(r=>r.signal?.aborted));
    await app.render(true); assert.equal(app.requests.length, 12);
    await resolveAll(app.requests.slice(6), handle=>Response.json(product(handle,987600)));
    await resolveAll(old, handle=>Response.json(product(handle,111100)));
    assert.match(cards()[0]!.textContent!, /9,876/); assert.doesNotMatch(cards()[0]!.textContent!, /1,111/);
  } finally { await app.close(); }
});
