import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";
// The upload control lives in a Radix dialog, which needs the browser APIs jsdom lacks.
const dom = installUiDom("http://localhost:3000");
const { createRoot } = await import("react-dom/client");
const { MediaLibrary, uploadType } = await import("../components/admin/media-library");
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
test("files are recognised by extension when the browser gives no type, and the picker offers extensions too", async () => {
 // Owner, 12 Nov 2026: the macOS picker in the desktop app's browser greyed out .mp4 films for a type-only accept list.
 assert.equal(uploadType({ name: "Nimbus Tour.MP4", type: "" }, "video"), "video/mp4");
 assert.equal(uploadType({ name: "tour.m4v", type: "video/x-m4v" }, "video"), "video/mp4");
 assert.equal(uploadType({ name: "tour.webm", type: "" }, "video"), "video/webm");
 assert.equal(uploadType({ name: "tour.mov", type: "video/quicktime" }, "video"), null, "QuickTime stays refused");
 assert.equal(uploadType({ name: "photo.jpg", type: "" }, "image"), "image/jpeg");
 assert.equal(uploadType({ name: "film.mp4", type: "video/mp4" }, "image"), null, "a film is never taken as an image");
 assert.equal(uploadType({ name: "photo.png", type: "image/png" }, "image"), "image/png");
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} />, async () => Response.json({ assets: [], nextCursor: null }));
 try {
  const input = (await openUpload(ui.container))!;
  for (const part of ["image/jpeg", ".jpg", ".jpeg", ".png", ".webp"]) assert.ok(input.accept.split(",").includes(part), part);
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

// Films (owner, 12 Nov 2026): MP4 or WebM up to 80 MB, uploaded with progress and picked only where a film belongs.
const filmSha = "f".repeat(64);
const film = { id: "film", sha256: filmSha, kind: "video", label: "Workshop film", width: 1920, height: 1080, bytes: 12_582_912, mimeType: "video/mp4", durationMs: 8000, faststart: false, createdAt: "2026-11-12T00:00:00Z", publicAt: null, url: `/media/uploads/${filmSha}.mp4`, previewUrl: `/api/admin/media/${filmSha}/preview` };
/** A stand-in for the browser's XMLHttpRequest, which film uploads use for their progress. */
function fakeUploads(reply: { status: number; body: unknown }) {
 const sent: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
 class FakeRequest {
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  status = 0; responseText = ""; timeout = 0;
  onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
  private request = { method: "", url: "", headers: {} as Record<string, string>, body: null as unknown };
  open(method: string, url: string) { this.request.method = method; this.request.url = url; }
  setRequestHeader(name: string, value: string) { this.request.headers[name] = value; }
  abort() { this.onabort?.(); }
  send(body: unknown) {
   this.request.body = body; sent.push(this.request);
   setTimeout(() => this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 }), 0);
   setTimeout(() => { this.status = reply.status; this.responseText = JSON.stringify(reply.body); this.onload?.(); }, 60);
  }
 }
 const previous = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
 Object.assign(globalThis, { XMLHttpRequest: FakeRequest });
 return { sent, restore: () => Object.assign(globalThis, { XMLHttpRequest: previous }) };
}
async function openFilmUpload(container: HTMLElement) {
 await act(async () => buttonByText(container, "Upload film")?.click());
 await settle();
 return document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]');
}
test("films upload through the streaming route with progress and appear with their running time", async () => {
 const uploads = fakeUploads({ status: 201, body: { asset: film } });
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({ assets: [asset], nextCursor: null }));
 try {
  const input = (await openFilmUpload(ui.container))!;
  assert.ok(input, "the library offers a film upload");
  assert.equal(input.getAttribute("accept"), "video/mp4,video/webm,.mp4,.m4v,.webm");
  assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /MP4 \(H\.264\) or WebM up to 80 MB/);
  const file = new File([new Uint8Array([0, 0, 0, 24])], "workshop.mp4", { type: "video/mp4" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)); });
  const bar = document.querySelector('[role="progressbar"]');
  assert.equal(bar?.getAttribute("aria-valuenow"), "40", "staff see how far the film has gone");
  assert.ok(buttonByText(document.querySelector('[role="dialog"]')!, "Cancel upload"), "a long upload can be stopped");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  assert.equal(uploads.sent.length, 1);
  const [request] = uploads.sent;
  assert.equal(request!.method, "POST"); assert.equal(request!.url, "/api/admin/media/films"); assert.equal(request!.body, file);
  assert.equal(request!.headers["Content-Type"], "video/mp4"); assert.equal(request!.headers["X-CSRF-Token"], session.csrfToken);
  assert.equal(document.querySelector('[role="dialog"]'), null, "a finished upload closes the dialog");
  const card = ui.container.querySelector("li");
  assert.equal(card?.querySelector("video")?.getAttribute("src"), film.previewUrl, "the private film previews through the staff route");
  assert.match(card?.textContent ?? "", /0:08 · 1920 × 1080 · 12\.0 MB/);
  assert.match(card?.textContent ?? "", /Starts slowly/, "a film without a fast start is pointed out");
 } finally { uploads.restore(); await ui.dispose(); }
});
test("films of the wrong kind or over 80 MB are refused before they are sent, and the server's reason is shown", async () => {
 const uploads = fakeUploads({ status: 400, body: { code: "MEDIA_INVALID_FILM", message: "Choose a complete MP4 or WebM film." } });
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async () => Response.json({ assets: [], nextCursor: null }));
 try {
  const input = (await openFilmUpload(ui.container))!;
  const huge = new File([new Uint8Array(1)], "long.mp4", { type: "video/mp4" }); Object.defineProperty(huge, "size", { value: 80 * 1024 * 1024 + 1 });
  for (const file of [new File(["x"], "clip.mov", { type: "video/quicktime" }), huge, new File(["x"], "room.png", { type: "image/png" })]) {
   Object.defineProperty(input, "files", { value: [file], configurable: true });
   await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
   assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? "", /MP4 or WebM film up to 80 MB/);
  }
  assert.equal(uploads.sent.length, 0);
  Object.defineProperty(input, "files", { value: [new File(["x"], "broken.mp4", { type: "video/mp4" })], configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 100)); });
  assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? "", /Choose a complete MP4 or WebM film/);
 } finally { uploads.restore(); await ui.dispose(); }
});
test("a film picker lists and uploads films only, and an image picker images only", async () => {
 const requested: string[] = [];
 let chosen = "";
 const ui = await render(<MediaPicker accept="video" session={session} onExpired={() => {}} label="Collection film" value="" onChange={v => chosen = v} />, async url => { requested.push(String(url)); return Response.json({ assets: [film], nextCursor: null }); });
 try {
  await act(async () => buttonByText(ui.container, "Choose film")?.click());
  assert.deepEqual(requested, ["/api/admin/media?kind=video"]);
  assert.equal(buttonByText(ui.container, "Upload image"), undefined, "a film slot never offers an image upload");
  assert.ok(buttonByText(ui.container, "Upload film"));
  await act(async () => Array.from(ui.container.querySelectorAll("button")).find(b => b.textContent?.includes("Use film"))?.click());
  assert.equal(chosen, film.url);
 } finally { await ui.dispose(); }
 const images = await render(<MediaPicker session={session} onExpired={() => {}} label="Banner" value="" onChange={() => {}} />, async url => { requested.push(String(url)); return Response.json({ assets: [asset], nextCursor: null }); });
 try {
  await act(async () => buttonByText(images.container, "Choose image")?.click());
  assert.equal(requested.at(-1), "/api/admin/media?kind=image");
  assert.equal(buttonByText(images.container, "Upload film"), undefined, "an image slot never offers a film upload");
 } finally { await images.dispose(); }
});
test("a chosen film previews privately, and an address that is not a library film does not play", async () => {
 const chosen = await render(<MediaPicker accept="video" session={session} onExpired={() => {}} label="Film" value={film.url} onChange={() => {}} />, async () => Response.json({ assets: [], nextCursor: null }));
 try { assert.equal(chosen.container.querySelector("video")?.getAttribute("src"), film.previewUrl); } finally { await chosen.dispose(); }
 for (const value of [asset.url, "https://tracker.example.invalid/film.mp4", "/media/films/bundled.mp4"]) {
  const ui = await render(<MediaPicker accept="video" session={session} onExpired={() => {}} label="Film" value={value} onChange={() => {}} />, async () => Response.json({ assets: [], nextCursor: null }));
  try {
   assert.equal(ui.container.querySelectorAll("video, img").length, 0, value);
   assert.match(ui.container.textContent ?? "", /not a film from the media library/);
  } finally { await ui.dispose(); }
 }
});
for (const [name, bad] of [["a film named for another container", { ...film, url: `/media/uploads/${filmSha}.webm` }], ["another video type", { ...film, mimeType: "video/quicktime" }],
 ["a film over 80 MB", { ...film, bytes: 80 * 1024 * 1024 + 1 }], ["an unknown kind", { ...film, kind: "audio" }]] as const)
 test(`malformed film metadata fails closed: ${name}`, async () => {
  const ui = await render(<MediaLibrary session={session} onExpired={() => {}} />, async () => Response.json({ assets: [bad], nextCursor: null }));
  try { assert.ok(ui.container.querySelector('[role="alert"]')); assert.equal(ui.container.querySelectorAll("video").length, 0); } finally { await ui.dispose(); }
 });
