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
function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string, scope: ParentNode = container) { await act(async () => button(name, scope).click()); }
async function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} input`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const product = (handle: string) => ({ id: handle, handle, title: `Product ${handle}`, description: "", category: "chairs", images: [], published: true, source: "fixture", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] });
const page = (handles: string[], current = 1, total = handles.length) => Response.json({products:handles.map(product), total, page:current, limit:20, mode:"preview",checkoutEnabled:false});
const tile = (key: string) => ({key,title:`Tile ${key}`,collectionHandle:key,image:"/media/test.webp",alt:`Image ${key}`,enabled:true});
const merchandising = {bestsellers:["alpha","bravo"],chairs:[],categories:[tile("sofas"),tile("beds")],offers:[tile("chairs")]};
async function setup(options: {conflict?: boolean; catalog?: typeof fetch; legacy?: boolean} = {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  if(options.legacy) delete initial.homeMerchandising;
  else initial.homeMerchandising = structuredClone(merchandising);
  let saved: any;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input); calls.push(path);
    if(path.startsWith("/api/products?")) return options.catalog ? options.catalog(input, init) : page(["alpha","bravo","charlie"]);
    if(path === "/api/admin/media") return Response.json({assets:[{id:"asset1",sha256:"a".repeat(64),label:"Living room",width:100,height:100,bytes:100,mimeType:"image/webp",createdAt:"2026-10-26T00:00:00Z",publicAt:null,url:`/media/uploads/${"a".repeat(64)}.webp`,previewUrl:`/api/admin/media/${"a".repeat(64)}/preview`}],nextCursor:null});
    assert.equal(path,"/api/admin/content","No automatic publishing or commerce writes");
    if(init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"),"c".repeat(64));
      saved = JSON.parse(String(init.body));
      return options.conflict ? Response.json({error:"Version conflict"},{status:409}) : Response.json({version:5,draft:saved.content,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
    }
    return Response.json({version:4,draft:initial,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
  };
  await act(async () => root.render(<ContentEditor session={{user:{id:"editor",email:"editor@example.test",role:"editor"},csrfToken:"c".repeat(64)}} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return {initial,calls,saved:()=>saved,close:async()=>{await act(async()=>root.unmount());globalThis.fetch=previous;}};
}

test("merchandising selection, ordering and removal save safe handles and preserve unsaved siblings", async () => {
  const app = await setup();
  try {
    await click("Homepage"); await fill("Category heading","Edited sibling");
    await click("Merchandising");
    assert.match(container.textContent ?? "", /availability.*not verified/i);
    await fill("Search catalog","charlie"); await click("Search products");
    assert.ok(app.calls.includes("/api/products?q=charlie&page=1&limit=20"));
    assert.equal(button("Add alpha to Bestsellers").disabled,true,"Duplicate selection disabled");
    await click("Add charlie to Bestsellers");
    assert.equal(document.activeElement?.getAttribute("aria-label"),"Selected Bestsellers charlie");
    await click("Move charlie up in Bestsellers");
    assert.equal(document.activeElement?.getAttribute("aria-label"),"Selected Bestsellers charlie");
    await click("Remove alpha from Bestsellers");
    await click("Add bravo to Chairs");
    await click("Save draft");
    const saved = app.saved(); assert.ok(saved); assert.equal(saved.expectedVersion,4);
    assert.deepEqual(saved.content.homeMerchandising.bestsellers,["charlie","bravo"]);
    assert.deepEqual(saved.content.homeMerchandising.chairs,["bravo"]);
    assert.equal(saved.content.homeCopy.categoryHeading,"Edited sibling");
    assert.deepEqual(saved.content.campaigns,app.initial.campaigns);
    assert.deepEqual(saved.content.homeMerchandising.categories,merchandising.categories);
    assert.equal(container.textContent?.includes("Publish draft"),false);
    assert.match(container.textContent ?? "",/Draft saved/);
  } finally {await app.close();}
});

test("collection tiles edit images and enabled state, reorder and restore keyboard focus", async () => {
  const app = await setup({conflict:true});
  try {
    await click("Merchandising");
    await fill("Category tile 1 title","Room essentials");
    await fill("Category tile 1 collection handle","living-room");
    await fill("Category tile 1 image description","Warm living room");
    await act(async () => container.querySelector<HTMLInputElement>('[aria-label="Show category tile 1"]')!.click());
    const first = container.querySelector('[aria-label="Category tile 1"]')!;
    await click("Choose image",first);
    await act(async()=>{const use = [...first.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.startsWith("Use image"));assert.ok(use);use.click();});
    assert.equal(document.activeElement,button("Choose image",first));
    await click("Move category tile 1 down");
    assert.equal(document.activeElement?.getAttribute("aria-label"),"Category tile 2 title");
    await click("Add category tile");
    assert.equal(document.activeElement?.getAttribute("aria-label"),"Category tile 3 title");
    await click("Remove category tile 3");
    assert.equal(document.activeElement,button("Add category tile"));
    await fill("Offer tile 1 title","Autumn chairs");
    await click("Save draft");
    const saved = app.saved();assert.ok(saved);
    assert.deepEqual(saved.content.homeMerchandising.categories,[tile("beds"),{key:"sofas",title:"Room essentials",collectionHandle:"living-room",image:`/media/uploads/${"a".repeat(64)}.webp`,alt:"Warm living room",enabled:false}]);
    assert.equal(saved.content.homeMerchandising.offers[0].title,"Autumn chairs");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Category tile 2 title"]')?.value,"Room essentials");
    assert.match(container.textContent ?? "", /Another editor saved/);
    assert.equal(button("Save draft").disabled,true);
  } finally {await app.close();}
});

test("catalog failure retries, pagination and stale responses cannot replace newer results", async () => {
  let fail = true; let resolveOld: ((r:Response)=>void) | undefined;
  const app = await setup({catalog:async(input)=>{
    const url = new URL(String(input),"http://localhost");
    if(fail) return Response.json({error:"offline"},{status:503});
    if(url.searchParams.get("q")==="old")return new Promise<Response>(resolve=>{resolveOld=resolve;});
    if(url.searchParams.get("q")==="empty")return page([]);
    return page([url.searchParams.get("page")==="2"?"second":"newest"],Number(url.searchParams.get("page")),21);
  }});
  try {
    await click("Merchandising");
    assert.match(container.textContent ?? "",/couldn't load products/);
    fail=false;await click("Retry products");assert.ok(button("Add newest to Bestsellers"));
    await click("Next products");assert.ok(button("Add second to Bestsellers"));
    await click("Previous products");
    await fill("Search catalog","old");await click("Search products");
    assert.match(container.textContent ?? "",/Loading products/);
    await fill("Search catalog","new");await click("Search products");
    assert.ok(button("Add newest to Bestsellers"));
    await act(async()=>resolveOld!(page(["outdated"])));
    assert.equal(container.textContent?.includes("Product outdated"),false);
    await fill("Search catalog","empty");await click("Search products");
    assert.match(container.textContent ?? "",/No products found/);
    assert.equal(button("Save draft").disabled,true,"Browsing must not change content");
  } finally {await app.close();}
});

test("rails and tiles permit empty selections and stop at twelve", async()=>{
  const app=await setup({catalog:async()=>page(Array.from({length:13},(_,i)=>`item-${i}`))});
  try {
    await click("Merchandising");
    for(let i=0;i<12;i++)await click(`Add item-${i} to Chairs`);
    assert.equal(button("Add item-12 to Chairs").disabled,true);
    for(let i=0;i<12;i++)await click(`Remove item-${i} from Chairs`);
    for(let i=2;i<12;i++)await click("Add category tile");
    assert.equal(button("Add category tile").disabled,true);
    for(let i=12;i>0;i--)await click(`Remove category tile ${i}`);
    await click("Save draft");
    assert.deepEqual(app.saved().content.homeMerchandising.chairs,[]);
    assert.deepEqual(app.saved().content.homeMerchandising.categories,[]);
  } finally {await app.close();}
});

test("catalog search bounds outbound queries to the supported eighty characters", async()=>{
  const app=await setup();
  try {
    await click("Merchandising");
    await fill("Search catalog","x".repeat(81));
    await click("Search products");
    const last = new URL(app.calls.filter(path=>path.startsWith("/api/products?")).at(-1)!,"http://localhost");
    assert.equal(last.searchParams.get("q"),"x".repeat(80));
  } finally {await app.close();}
});

test("legacy drafts show original selections and browsing leaves the draft clean",async()=>{
  const app=await setup({legacy:true});
  try {
    await click("Merchandising");
    assert.deepEqual([...container.querySelectorAll('[aria-label="Bestsellers selection"] li')].map(node=>node.querySelector("p")?.textContent),["aera-swivel-lounge-chair","aero-dining-chair","aileron-signature-bed","aileron-upholstered-bench","alcyone-7-seater-sofa","alina-7-seater-sofa"]);
    assert.deepEqual([...container.querySelectorAll('[aria-label="Chairs selection"] li')].map(node=>node.querySelector("p")?.textContent),["caro","ario","nola","tara","arno","rollo"]);
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Category tile 1 collection handle"]')?.value,"sofas");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Offer tile 2 collection handle"]')?.value,"minimum-60-off");
    assert.equal(button("Save draft").disabled,true);
    await click("Homepage"); await fill("Category heading","Legacy sibling edit"); await click("Save draft");
    assert.equal(app.saved().content.homeMerchandising,undefined,"Unedited legacy selections remain implicit");
  } finally {await app.close();}
});

test("invalid collection links cannot be saved and malformed catalog payloads offer retry",async()=>{
  const app=await setup({catalog:async()=>Response.json({products:[{handle:"unsafe"}],total:1,page:1,limit:20,mode:"preview",checkoutEnabled:false})});
  try {
    await click("Merchandising");
    assert.match(container.textContent??"",/couldn't load products/);
    assert.ok(button("Retry products"));
    await fill("Category tile 1 collection handle","https://outside.example/collection");
    await click("Save draft");
    assert.equal(app.saved(),undefined);
    assert.match(container.textContent??"",/Check homeMerchandising/);
  } finally {await app.close();}
});

test("an empty rail explains itself and its one action moves focus to the catalog search",async()=>{
  const app=await setup();
  try {
    await click("Merchandising");
    const chairs=container.querySelector('[aria-label="Chairs selection"]')!;
    assert.ok(chairs.querySelector("[data-empty]"),"The empty Chairs rail shows an empty state");
    assert.equal(container.querySelector('[aria-label="Bestsellers selection"] [data-empty]'),null,"A rail with products has no empty state");
    await click("Find products for Chairs",chairs);
    assert.equal(document.activeElement?.getAttribute("aria-label"),"Search catalog");
    assert.equal(button("Save draft").disabled,true,"Moving focus does not change content");
  } finally {await app.close();}
});
