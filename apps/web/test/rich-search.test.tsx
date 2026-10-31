import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Product } from "@shopmaple/contracts";

const dom = new JSDOM('<div id="root"></div><button id="elsewhere">Elsewhere</button>', { url: "http://localhost:3000/products/alpha" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = await import("react-dom/client");
const { Header } = await import("../components/header");
const { ProductDetail } = await import("../components/product-detail");
const { ShopProvider } = await import("../components/shop-provider");
const product = (handle: string): Product => ({ id: handle, handle, title: `${handle} Chair`, description: "Source description", category: "chairs", images: [], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [{ id: `${handle}-variant`, title: "Standard", sku: null, pricePaise: 123400, compareAtPaise: null, available: false, stockPolicy: "unverified" }] });
import { cardEnvelope, pageFixture } from "./support/catalogue-fixtures";
import { waitFor } from "./support/wait-for";
const page = (handles: string[], total = handles.length, q = "") => Response.json(pageFixture(handles, total, q));
type Request = { url: string; signal?: AbortSignal | null; resolve: (value: Response) => void };
const storageKey = "maple-recent-products-v1";
function button(name: string) { const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name); assert.ok(found, `Missing ${name} button`); return found; }
async function click(name: string) { await act(async () => { const b = button(name); b.focus(); b.click(); }); }
const input = () => document.querySelector<HTMLInputElement>('dialog[open] input[type="search"]')!;
async function fill(value: string) { const field = input(); assert.ok(field); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); }
async function tick(t: TestContext, ms: number) { await act(async () => t.mock.timers.tick(ms)); }
async function setup(t: TestContext, history?: string) {
  t.mock.timers.enable({ apis: ["setTimeout"] }); localStorage.clear(); if (history) localStorage.setItem(storageKey, history);
  const root = createRoot(document.getElementById("root")!); const previous = globalThis.fetch; const requests: Request[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === "/api/cart") return Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
    assert.equal(init?.method ?? "GET", "GET", "search never writes to the server");
    return new Promise<Response>(resolve => requests.push({ url: String(url), signal: init?.signal, resolve }));
  };
  await act(async () => root.render(<ShopProvider><Header /></ShopProvider>));
  return { requests, root, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; t.mock.timers.reset(); } };
}
async function settle(request: Request, response: Response) { await act(async () => request.resolve(response)); }
const names = () => [...document.querySelectorAll('[data-search-discovery] [data-card-name]')].map(e=>e.textContent);

test("existing search opens from the header and provides a local full-results form", async t => {
  const app = await setup(t); try { await click("Search furniture"); await waitFor(() => document.querySelector('dialog[open][aria-label="Search"]')); assert.equal(input().name, "q"); assert.equal(input().form?.getAttribute("action"), "/collections/all"); } finally { await app.close(); }
});
test("opening search lazily loads four discoverable products and closing restores the trigger", async t => {
  const app = await setup(t); try {
    assert.equal(app.requests.length, 0); await click("Search furniture");
    await waitFor(() => document.querySelector('dialog[open][aria-label="Search"]'));
    assert.ok(document.querySelector('dialog[open][aria-label="Search"]'), "Search should match the original dialog label");
    assert.equal(document.activeElement, input());
    const request = app.requests[0]; assert.ok(request, "opening search must request product suggestions");
    assert.equal(new URL(request.url,"http://localhost").searchParams.get("limit"),"4");
    await settle(request, page(["alpha","bravo"])); assert.deepEqual(names(), ["alpha Chair","bravo Chair"]);
    assert.ok(document.querySelector('[aria-label="Products"] a[href="/products/alpha"]'));
    await click("Close Search"); assert.equal(document.querySelector('dialog[open]'),null); assert.equal(document.activeElement,button("Search furniture"));
  } finally { await app.close(); }
});
test("typing debounces local search, rejects stale results and preserves the full-results query", async t => {
  const app = await setup(t); try {
    await click("Search furniture"); assert.ok(app.requests[0],"default suggestions request"); await settle(app.requests[0], page(["initial"]));
    await fill("oak"); await tick(t,200); assert.equal(app.requests.length,1);
    await fill("oak & brass"); await tick(t,249); assert.equal(app.requests.length,1); await tick(t,1);
    const old=app.requests[1]!; assert.equal(new URL(old.url,"http://localhost").searchParams.get("q"),"oak & brass");
    await fill("new"); assert.equal(old.signal?.aborted,true); await tick(t,250);
    await settle(app.requests[2]!,page(["new", "new-two", "new-three", "new-four"],7,"new")); await settle(old,page(["stale"],1,"oak & brass"));
    assert.deepEqual(names(),["new Chair", "new-two Chair", "new-three Chair", "new-four Chair"]); assert.match(document.querySelector('[role="status"]')?.textContent??"",/7 search results found for "new"/);
    assert.equal(document.querySelector<HTMLAnchorElement>('[data-search-view-all]')?.getAttribute("href"),"/collections/all?q=new");
    assert.equal(localStorage.getItem(storageKey),null,"queries are not stored as browsing history");
  } finally { await app.close(); }
});
test("empty results keep the original message and reset restores input focus and suggestions", async t => {
  const app = await setup(t); try {
    await click("Search furniture"); assert.ok(app.requests[0]); await settle(app.requests[0],page(["alpha"]));
    await fill("nothing"); await tick(t,250); await settle(app.requests[1]!,page([],0,"nothing"));
    assert.match(document.querySelector('[data-search-discovery]')?.textContent??"",/No results found for "nothing"\. Try another search\./);
    await click("Reset search"); assert.equal(input().value,""); assert.equal(document.activeElement,input());
    await settle(app.requests[2]!,page(["bravo"])); assert.deepEqual(names(),["bravo Chair"]);
  } finally { await app.close(); }
});
test("a headers timeout offers retry and late completion cannot replace recovered results", async t => {
  const app=await setup(t); try {
    await click("Search furniture"); const old=app.requests[0]; assert.ok(old,"search must load suggestions");
    await tick(t,6000); assert.ok(document.querySelector('[data-search-discovery] [role="alert"]')); assert.equal(old.signal?.aborted,true);
    await click("Retry search"); await settle(app.requests[1]!,page(["recovered"])); await settle(old,page(["late"]));
    assert.deepEqual(names(),["recovered Chair"]);
  } finally { await app.close(); }
});
test("a stalled response body also times out and close aborts outstanding results", async t => {
  const app=await setup(t); try {
    await click("Search furniture"); const request=app.requests[0]; assert.ok(request);
    await settle(request, {ok:true,json:()=>new Promise(()=>{})} as Response); await tick(t,6000);
    assert.ok(document.querySelector('[data-search-discovery] [role="alert"]')); await click("Retry search"); const pending=app.requests[1]!;
    await click("Close Search"); assert.equal(pending.signal?.aborted,true); await settle(pending,page(["late"])); assert.equal(document.querySelector('[data-search-discovery]'),null);
  } finally { await app.close(); }
});
test("recent handles resolve fresh public records, omit missing pieces and clear only their own history", async t => {
  const app=await setup(t,JSON.stringify(["alpha","missing"])); try {
    localStorage.setItem("other-preference","preserved"); await click("Search furniture");
    const alpha=app.requests.find(r=>r.url==="/api/catalogue/cards/alpha"); const missing=app.requests.find(r=>r.url==="/api/catalogue/cards/missing"); assert.ok(alpha,"recent product lookup"); assert.ok(missing);
    await settle(alpha,Response.json(cardEnvelope("alpha", "Current alpha"))); await settle(missing,new Response(null,{status:404}));
    assert.equal(document.querySelector('[aria-label="Recently viewed"] [data-card-name]')?.textContent,"Current alpha");
    await click("Clear recently viewed"); assert.equal(localStorage.getItem(storageKey),null); assert.equal(localStorage.getItem("other-preference"),"preserved"); assert.equal(document.querySelector('[aria-label="Recently viewed"]'),null); assert.equal(document.activeElement,input());
  } finally { await app.close(); }
});
test("malformed stored handles never become requests, and invalid API products never become links", async t => {
  const app=await setup(t,JSON.stringify(["https://evil.test/private","../admin","alpha"])); try {
    await click("Search furniture"); assert.ok(app.requests[0],"product suggestion lookup"); assert.equal(app.requests.filter(r=>!r.url.startsWith('/api/catalogue/collections/all?')).length,0);
    await settle(app.requests[0],Response.json(pageFixture(["../admin"])));
    assert.ok(document.querySelector('[data-search-discovery] [role="alert"]')); assert.equal(document.querySelector('[data-search-discovery] a[href*="admin"]'),null);
  } finally { await app.close(); }
});
test("recent lookups reject mismatched identities without hiding independently loaded suggestions", async t => {
  const app=await setup(t,JSON.stringify(["alpha"])); try {
    await click("Search furniture"); const recent=app.requests.find(r=>r.url==="/api/catalogue/cards/alpha"); assert.ok(recent);
    await settle(recent,Response.json(cardEnvelope("bravo"))); await settle(app.requests.find(r=>r.url.startsWith('/api/catalogue/collections/all?'))!,page(["suggestion"]));
    assert.deepEqual(names(),["suggestion Chair"]); assert.ok(document.querySelector('[data-search-recent-error]'));
  } finally { await app.close(); }
});
test("canonical product visits record bounded newest-first handles, without product data or duplicates", async t => {
  const app=await setup(t,JSON.stringify(["one","two","three","four","five","six","seven","eight"])); try {
    await act(async()=>app.root.render(<ShopProvider><ProductDetail product={product("alpha")} /></ShopProvider>));
    assert.equal(localStorage.getItem(storageKey),'["alpha","one","two","three","four","five","six","seven"]');
    await act(async()=>app.root.render(<ShopProvider><ProductDetail product={product("two")} /></ShopProvider>));
    assert.equal(localStorage.getItem(storageKey),'["two","alpha","one","three","four","five","six","seven"]');
  } finally { await app.close(); }
});

test("Escape closes search while preserving header focus and normal link navigation remains available", async t => {
  const app=await setup(t); try {
    await click("Search furniture"); await settle(app.requests[0]!,page(["alpha"]));
    const link=document.querySelector<HTMLAnchorElement>('[aria-label="Products"] a')!;
    assert.equal(link.getAttribute("href"),"/products/alpha"); assert.equal(link.tabIndex,0); link.focus(); assert.equal(document.activeElement,link);
    const event=new dom.window.Event("cancel",{cancelable:true}); await act(async()=>document.querySelector('dialog[open]')!.dispatchEvent(event));
    assert.equal(event.defaultPrevented,true); assert.equal(document.querySelector('dialog[open]'),null); assert.equal(document.activeElement,button("Search furniture"));
  } finally { await app.close(); }
});
test("storage denial does not block search or product browsing", async t => {
  const app=await setup(t); const prototype=dom.window.Storage.prototype; const oldGet=prototype.getItem,oldSet=prototype.setItem;
  try {
    prototype.getItem=()=>{throw new Error("Blocked storage");}; prototype.setItem=()=>{throw new Error("Blocked storage");};
    await click("Search furniture"); await settle(app.requests[0]!,page(["alpha"])); assert.deepEqual(names(),["alpha Chair"]);
    await act(async()=>app.root.render(<ShopProvider><ProductDetail product={product("alpha")} /></ShopProvider>));
    assert.equal(document.querySelector("h1")?.textContent,"alpha Chair");
  } finally { prototype.getItem=oldGet; prototype.setItem=oldSet; await app.close(); }
});
test("clearing recent entries cancels pending requests so late responses cannot restore them", async t => {
  const app=await setup(t,JSON.stringify(["alpha"])); try {
    await click("Search furniture"); const request=app.requests.find(r=>r.url==='/api/catalogue/cards/alpha')!;
    await click("Clear recently viewed"); assert.equal(request.signal?.aborted,true);
    await settle(request,Response.json(cardEnvelope("alpha"))); assert.equal(document.querySelector('[aria-label="Recently viewed"]'),null);
  } finally { await app.close(); }
});
test("failed history clearing keeps visible history and reports failure rather than promising deletion", async t => {
  const app=await setup(t,JSON.stringify(["alpha"])); const remove=dom.window.Storage.prototype.removeItem;
  try {
    await click("Search furniture"); await settle(app.requests.find(r=>r.url==='/api/catalogue/cards/alpha')!,Response.json(cardEnvelope("alpha")));
    dom.window.Storage.prototype.removeItem=()=>{throw new Error("Storage blocked");}; await click("Clear recently viewed");
    assert.ok(document.querySelector('[aria-label="Recently viewed"]')); assert.match(document.querySelector('[role="alert"]')?.textContent??"",/couldn’t be cleared/);
  } finally {dom.window.Storage.prototype.removeItem=remove;await app.close();}
});
test("unknown unpublished records and excess result pages fail closed", async t => {
  for (const response of [Response.json({...pageFixture(["alpha"]),published:false}),page(["a","b","c","d","e"])]) {
    const app=await setup(t); try {await click("Search furniture"); await settle(app.requests[0]!,response); assert.ok(document.querySelector('[role="alert"]'));assert.deepEqual(names(),[]);}finally{await app.close();}
  }
});
test("closing before a debounced lookup prevents unnecessary requests and reopening starts fresh", async t => {
  const app=await setup(t);try {
    await click("Search furniture");await settle(app.requests[0]!,page(["alpha"]));await fill("private query");await click("Close Search");await tick(t,1000);assert.equal(app.requests.length,1);
    await click("Search furniture");assert.equal(input().value,"");await settle(app.requests[1]!,page(["bravo"]));assert.deepEqual(names(),["bravo Chair"]);assert.equal(localStorage.getItem(storageKey),null);
  }finally{await app.close();}
});

test("search cards offer one clear product destination without unrelated save or option controls", async t => {
  const app=await setup(t);try {
    await click("Search furniture");await settle(app.requests[0]!,page(["alpha"]));
    const results=document.querySelector('[aria-label="Products"]')!;
    assert.equal(results.querySelectorAll('a').length,1,"one product should create one keyboard destination");
    assert.equal(results.querySelectorAll('button').length,0,"original search cards do not include save controls");
    assert.equal(results.querySelector('a')?.getAttribute('href'),'/products/alpha');
  }finally{await app.close();}
});
test("changing query removes old cards and announcements before debounce expires",async t=>{
  const app=await setup(t);try{
    await click("Search furniture");await settle(app.requests[0]!,page(["initial"]));await fill("oak");await tick(t,250);await settle(app.requests[1]!,page(["oak","oak-two","oak-three","oak-four"],4,"oak"));
    await fill("brass");assert.deepEqual(names(),[]);assert.doesNotMatch(document.querySelector('[data-search-discovery]')?.textContent??"",/4 search results found for "brass"/);
  }finally{await app.close();}
});

async function tabKey(target: HTMLElement, shiftKey = false) {
  const event = new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  target.focus(); await act(async () => target.dispatchEvent(event)); return event;
}
test("Search wraps Shift+Tab from its input to the last result and Tab back to the input", async t => {
  const app=await setup(t);try {
    await click("Search furniture");await settle(app.requests[0]!,page(["alpha","bravo"]));
    const links=document.querySelectorAll<HTMLAnchorElement>('[aria-label="Products"] a');const last=links[1]!;
    const backwards=await tabKey(input(),true);assert.equal(backwards.defaultPrevented,true,"backwards boundary must stay in search");assert.ok(document.activeElement === last);
    const forwards=await tabKey(last);assert.equal(forwards.defaultPrevented,true,"forwards boundary must stay in search");assert.ok(document.activeElement === input());
    const middle=await tabKey(links[0]!);assert.equal(middle.defaultPrevented,false,"interior navigation uses native tab order");
  }finally{await app.close();}
});
test("Search wraps current loading, retry and reset result controls as they change",async t=>{
  const app=await setup(t);try{
    await click("Search furniture");await tabKey(input(),true);assert.ok(document.activeElement === button("Close Search"));
    await settle(app.requests[0]!,new Response(null,{status:503}));await tabKey(input(),true);assert.ok(document.activeElement === button("Retry search"));
    await tabKey(button("Retry search"));assert.ok(document.activeElement === input());await click("Retry search");await settle(app.requests[1]!,page(["alpha"]));
    await fill("oak");await tick(t,250);await settle(app.requests[2]!,page(["oak"],1,"oak"));
    const all=document.querySelector<HTMLAnchorElement>('[data-search-view-all]')!;await tabKey(input(),true);assert.ok(document.activeElement === all);
    const reset=button("Reset search");const native=await tabKey(reset);assert.equal(native.defaultPrevented,false,"Reset is an interior control");
    await tabKey(all);assert.ok(document.activeElement === input());
    const enter=new dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true});await act(async()=>input().dispatchEvent(enter));assert.equal(enter.defaultPrevented,false,"implicit form submission remains native");
  }finally{await app.close();}
});
test("Search boundary ignores disabled and visually hidden destinations",async t=>{
  const app=await setup(t);try{
    await click("Search furniture");const close=button("Close Search");close.disabled=true;
    await tabKey(input(),true);assert.ok(document.activeElement === input(),"only enabled input wraps to itself");
    close.disabled=false;await settle(app.requests[0]!,page(["alpha","bravo"]));
    const links=document.querySelectorAll<HTMLAnchorElement>('[aria-label="Products"] a');links[1]!.parentElement!.style.display="none";
    await tabKey(input(),true);assert.ok(document.activeElement === links[0],"hidden ancestor removes last result from keyboard cycle");
  }finally{await app.close();}
});
