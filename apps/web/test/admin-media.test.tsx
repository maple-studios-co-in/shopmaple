import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";
// The upload control lives in a Radix dialog, which needs the browser APIs jsdom lacks.
const dom = installUiDom("http://localhost:3000");
const { createRoot } = await import("react-dom/client");
const { MediaLibrary } = await import("../components/admin/media-library");
const { MediaPicker } = await import("../components/admin/media-picker");
const session = { user: { id: "staff", email: "editor@example.invalid", role: "editor" as const }, csrfToken: "a".repeat(64) };
const asset = { id: "asset", sha256: "a".repeat(64), label: "Living room", width: 120, height: 80, bytes: 400, mimeType: "image/webp", createdAt: "2026-10-26T00:00:00Z", publicAt: null, url: `/media/uploads/${"a".repeat(64)}.webp`, previewUrl: `/api/admin/media/${"a".repeat(64)}/preview` };
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const buttonByText = (root: ParentNode, text: string) => Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.trim() === text);
/** Opens the upload dialog (it portals to document.body when rendered standalone) and returns its file input. */
async function openUpload(container: HTMLElement) {
 await act(async () => buttonByText(container, "Upload image")?.click());
 await settle();
 return document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]');
}
async function render(element: React.ReactNode, transport: typeof fetch) {
 const old = globalThis.fetch; globalThis.fetch = transport;
 const container = document.getElementById("root")!; const root = createRoot(container);
 await act(async () => root.render(element));
 return { container, dispose: async () => { await act(async () => root.unmount()); globalThis.fetch = old; } };
}
test("library displays private authenticated previews and selects the canonical image URL", async () => {
 let selected = "";
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} onSelect={a => selected = a.url} />, async () => Response.json({ assets: [asset], nextCursor: null }));
 try {
  assert.equal(ui.container.querySelector("img")?.getAttribute("src"), asset.previewUrl);
  assert.match(ui.container.textContent!, /Private/);
  await act(async () => (Array.from(ui.container.querySelectorAll("button")).find(b => b.textContent?.includes("Use image")))?.click());
  assert.equal(selected, asset.url);
 } finally { await ui.dispose(); }
});
test("expired library session signs staff out instead of showing stale images", async () => {
 let expired = false;
 const ui = await render(<MediaLibrary session={session} onExpired={() => { expired = true; }} />, async () => Response.json({}, {status:401}));
 try { assert.equal(expired, true); assert.equal(ui.container.querySelectorAll("img").length, 0); } finally { await ui.dispose(); }
});
test("failed library request offers retry and recovers", async () => {
 let fail = true;
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} />, async () => { if(fail) throw new Error("offline"); return Response.json({assets:[asset],nextCursor:null}); });
 try {
  assert.ok(ui.container.querySelector('[role="alert"]'));
  fail = false;
  await act(async () => Array.from(ui.container.querySelectorAll("button")).find(b => b.textContent === "Retry")?.click());
  assert.equal(ui.container.querySelector("img")?.alt, "Living room");
 } finally { await ui.dispose(); }
});
test("picker opens the library, chooses an image and closes", async () => {
 let chosen = "";
 const ui = await render(<MediaPicker session={session} onExpired={() => {}} label="Banner image" value="" onChange={v => chosen=v} />, async () => Response.json({assets:[asset],nextCursor:null}));
 try {
  await act(async () => Array.from(ui.container.querySelectorAll("button")).find(b => b.textContent === "Choose image")?.click());
  assert.equal(ui.container.querySelector("img")?.getAttribute("src"), asset.previewUrl);
  await act(async () => Array.from(ui.container.querySelectorAll("button")).find(b => b.textContent?.includes("Use image"))?.click());
  assert.equal(chosen, asset.url);
  assert.equal(ui.container.querySelector('[aria-label="Media library"]'), null);
 } finally { await ui.dispose(); }
});
test("upload sends the selected bytes with CSRF and adds the returned private asset", async () => {
 let uploaded: RequestInit | undefined;
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} />, async (_url, init) => { if(init?.method === "POST") { uploaded = init; return Response.json({asset}, {status:201}); } return Response.json({assets:[],nextCursor:null}); });
 try {
  const input = (await openUpload(ui.container))!;
  assert.ok(input, "Upload control must be available");
  const file = new File([new Uint8Array([1,2,3])], "room.png", {type:"image/png"});
  Object.defineProperty(input, "files", {value:[file],configurable:true});
  await act(async () => input.dispatchEvent(new dom.window.Event("change", {bubbles:true})));
  assert.equal(uploaded?.body, file);
  assert.equal(new Headers(uploaded?.headers).get("X-CSRF-Token"),session.csrfToken);
  assert.equal(ui.container.querySelector("img")?.getAttribute("src"),asset.previewUrl);
 } finally { await ui.dispose(); }
});
test("invalid or oversized uploads are rejected before transport", async () => {
 let uploads = 0;
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} />, async (_url, init) => { if(init?.method === "POST") uploads++; return Response.json({assets:[],nextCursor:null}); });
 try {
  const input = (await openUpload(ui.container))!;
  assert.ok(input, "Upload control must be available");
  for(const file of [new File(["svg"], "bad.svg", {type:"image/svg+xml"}), new File([new Uint8Array(8*1024*1024+1)],"large.png", {type:"image/png"})]) {
   Object.defineProperty(input,"files",{value:[file],configurable:true});
   await act(async()=> input.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
   assert.ok(document.querySelector('[role="alert"]'));
  }
  assert.equal(uploads,0);
 } finally { await ui.dispose(); }
});
test("pagination appends the next page without losing previous images", async () => {
 const second = {...asset,id:"second",label:"Dining room",sha256:"b".repeat(64),url:`/media/uploads/${"b".repeat(64)}.webp`,previewUrl:`/api/admin/media/${"b".repeat(64)}/preview`};
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} />, async url => Response.json(String(url).includes("cursor=")?{assets:[second],nextCursor:null}:{assets:[asset],nextCursor:"asset"}));
 try {
  assert.equal(ui.container.querySelectorAll("img").length,1);
  await act(async()=>Array.from(ui.container.querySelectorAll("button")).find(b=>b.textContent === "Load more")?.click());
  assert.equal(ui.container.querySelectorAll("img").length,2);
 } finally { await ui.dispose(); }
});
for(const response of [{assets:null,nextCursor:null},{assets:[{...asset,previewUrl:"https://tracker.example.invalid/image"}],nextCursor:null},{assets:[{...asset,url:`/media/uploads/${"b".repeat(64)}.webp`}],nextCursor:null},{assets:[asset],nextCursor:"../bad"}])test("malformed media metadata fails closed with a recoverable error",async()=>{
 const ui=await render(<MediaLibrary session={session} onExpired={()=>{}}/>,async()=>Response.json(response));
 try{assert.ok(ui.container.querySelector('[role="alert"]'));assert.equal(ui.container.querySelectorAll("img").length,0);}finally{await ui.dispose();}
});
test("picker does not render an unapproved manually entered preview URL",async()=>{
 const ui=await render(<MediaPicker session={session} onExpired={()=>{}} label="Banner" value="https://tracker.example.invalid/image" onChange={()=>{}}/>,async()=>Response.json({assets:[],nextCursor:null}));
 try{assert.equal(ui.container.querySelectorAll("img").length,0);}finally{await ui.dispose();}
});

const second = {...asset,id:"second",label:"Dining room",sha256:"b".repeat(64),url:`/media/uploads/${"b".repeat(64)}.webp`,previewUrl:`/api/admin/media/${"b".repeat(64)}/preview`};
const bar = () => document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Selected images"]');
const checkbox = (root: ParentNode, label: string) => root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="Select ${label}"]`);
test("upload opens in a dialog, closes on success and shows the new image first", async () => {
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (_url, init) => init?.method === "POST" ? Response.json({asset}, {status:201}) : Response.json({assets:[second],nextCursor:null}));
 try {
  assert.equal(document.querySelector('[role="dialog"]'), null, "The upload dialog starts closed");
  const input = await openUpload(ui.container);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(dialog, "Upload image opens a dialog");
  assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Upload an image");
  assert.ok(input, "The dialog holds the file input");
  assert.match(input.closest("label")?.textContent ?? "", /Upload image/, "The file input keeps its accessible name");
  Object.defineProperty(input, "files", {value:[new File([new Uint8Array([1])], "room.png", {type:"image/png"})],configurable:true});
  await act(async () => input.dispatchEvent(new dom.window.Event("change", {bubbles:true})));
  await settle();
  assert.equal(document.querySelector('[role="dialog"]'), null, "A successful upload closes the dialog");
  assert.deepEqual(Array.from(ui.container.querySelectorAll("img")).map(img => img.alt), ["Living room", "Dining room"], "The new image appears first");
 } finally { await ui.dispose(); }
});
test("an empty library offers the upload dialog as its one action", async () => {
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({assets:[],nextCursor:null}));
 try {
  const empty = ui.container.querySelector<HTMLElement>("[data-empty]");
  assert.ok(empty, "The empty state renders");
  await act(async () => buttonByText(empty, "Upload image")?.click());
  await settle();
  assert.ok(document.querySelector('[role="dialog"] input[type="file"]'), "The empty state action opens the upload dialog");
 } finally { await ui.dispose(); }
});
test("selecting images shows the floating bar with the count", async () => {
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({assets:[asset,second],nextCursor:null}));
 try {
  assert.equal(bar(), null, "No bar until something is selected");
  await act(async () => checkbox(ui.container, "Living room")?.click());
  assert.match(bar()?.textContent ?? "", /1 selected/);
  await act(async () => checkbox(ui.container, "Dining room")?.click());
  assert.match(bar()?.textContent ?? "", /2 selected/);
  await act(async () => checkbox(ui.container, "Living room")?.click());
  assert.match(bar()?.textContent ?? "", /1 selected/);
 } finally { await ui.dispose(); }
});
test("Copy links puts the selected images' links on the clipboard", async () => {
 let copied = "";
 Object.defineProperty(window.navigator, "clipboard", {value:{writeText: async (text: string) => { copied = text; }},configurable:true});
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({assets:[asset,second],nextCursor:null}));
 try {
  await act(async () => checkbox(ui.container, "Living room")?.click());
  await act(async () => checkbox(ui.container, "Dining room")?.click());
  assert.ok(bar(), "Selecting shows the bar");
  await act(async () => buttonByText(bar()!, "Copy links")?.click());
  assert.equal(copied, `http://localhost:3000${asset.url}\nhttp://localhost:3000${second.url}`);
  assert.match(bar()?.querySelector('[role="status"]')?.textContent ?? "", /Copied 2 links/);
 } finally { await ui.dispose(); }
});
test("Copy links reports a blocked clipboard instead of claiming success", async () => {
 Object.defineProperty(window.navigator, "clipboard", {value:{writeText: async () => { throw new Error("denied"); }},configurable:true});
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({assets:[asset],nextCursor:null}));
 try {
  await act(async () => checkbox(ui.container, "Living room")?.click());
  assert.ok(bar(), "Selecting shows the bar");
  await act(async () => buttonByText(bar()!, "Copy links")?.click());
  assert.ok(bar()?.querySelector('[role="alert"]'), "The failure is announced");
  assert.equal(bar()?.querySelector('[role="status"]'), null);
 } finally { await ui.dispose(); }
});
test("Clear selection unchecks every image and hides the bar", async () => {
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({assets:[asset,second],nextCursor:null}));
 try {
  await act(async () => checkbox(ui.container, "Living room")?.click());
  await act(async () => checkbox(ui.container, "Dining room")?.click());
  assert.ok(bar(), "Selecting shows the bar");
  await act(async () => buttonByText(bar()!, "Clear selection")?.click());
  assert.equal(bar(), null, "The bar hides");
  assert.equal(checkbox(ui.container, "Living room")?.checked, false);
  assert.equal(checkbox(ui.container, "Dining room")?.checked, false);
 } finally { await ui.dispose(); }
});
