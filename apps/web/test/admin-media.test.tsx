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
 await act(async () => buttonByText(container, "Upload images")?.click());
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
  assert.ok(dialog, "Upload images opens a dialog");
  assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Upload images");
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
  await act(async () => buttonByText(empty, "Upload images")?.click());
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
 await act(async () => buttonByText(container, "Upload films")?.click());
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
  assert.equal(buttonByText(ui.container, "Upload images"), undefined, "a film slot never offers an image upload");
  assert.ok(buttonByText(ui.container, "Upload films"));
  await act(async () => Array.from(ui.container.querySelectorAll("button")).find(b => b.textContent?.includes("Use film"))?.click());
  assert.equal(chosen, film.url);
 } finally { await ui.dispose(); }
 const images = await render(<MediaPicker session={session} onExpired={() => {}} label="Banner" value="" onChange={() => {}} />, async url => { requested.push(String(url)); return Response.json({ assets: [asset], nextCursor: null }); });
 try {
  await act(async () => buttonByText(images.container, "Choose image")?.click());
  assert.equal(requested.at(-1), "/api/admin/media?kind=image");
  assert.equal(buttonByText(images.container, "Upload films"), undefined, "an image slot never offers a film upload");
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

// Bulk upload (owner, 23 Nov 2026): a folder's worth of pictures at once, chosen or dropped, each listed with how it ended,
// and the banner sizes Settings allows checked before anything is sent.
const { forgetMediaUploadRules } = await import("../components/admin/media-upload-rules");
const bulkAsset = (n: number, name = `bulk-${n}.png`) => { const sha = n.toString(16).repeat(64); return { ...asset, id: `bulk${n}`, sha256: sha, label: name, url: `/media/uploads/${sha}.webp`, previewUrl: `/api/admin/media/${sha}/preview` }; };
const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const noRules = (url: unknown) => String(url).startsWith("/api/admin/settings/");
async function waitFor(check: () => boolean, ms = 3000) {
 const end = Date.now() + ms;
 while (!check()) { if (Date.now() > end) throw Error("timed out waiting"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); }
}
async function choose(input: HTMLInputElement, files: File[]) {
 Object.defineProperty(input, "files", { value: files, configurable: true });
 await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)); });
}
const rows = () => Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] [data-upload-status]')).map(row => [row.querySelector("[title]")?.getAttribute("title"), row.dataset.uploadStatus]));
const settledDialog = () => !document.querySelector('[role="dialog"] [data-upload-status="waiting"], [role="dialog"] [data-upload-status="uploading"], [role="dialog"] [data-upload-status="retrying"]');
const rowText = (name: string) => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] [data-upload-status]')).find(row => row.querySelector("[title]")?.getAttribute("title") === name)?.textContent ?? "";
test("several images chosen at once all upload, two at a time, and the library says how many", async () => {
 const sent: string[] = []; let inFlight = 0, most = 0;
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url, init) => {
  if (noRules(url)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (init?.method !== "POST") return Response.json({ assets: [], nextCursor: null });
  const name = decodeURIComponent(new Headers(init.headers).get("X-Media-Label")!); sent.push(name); const n = sent.length;
  inFlight++; most = Math.max(most, inFlight); await new Promise(resolve => setTimeout(resolve, 15)); inFlight--;
  return Response.json({ asset: bulkAsset(n, name) }, { status: 201 });
 });
 try {
  const input = (await openUpload(ui.container))!;
  assert.equal(input.multiple, true, "the picker takes many files at once");
  await choose(input, [png("a.png"), png("b.png"), png("c.png"), png("d.png")]);
  await waitFor(() => document.querySelector('[role="dialog"]') === null);
  assert.deepEqual([...sent].sort(), ["a.png", "b.png", "c.png", "d.png"]);
  assert.equal(most, 2, "two at a time, as the library decodes two at once");
  assert.match(ui.container.querySelector("[data-upload-finished]")?.textContent ?? "", /Uploaded 4 images\./);
  assert.equal(ui.container.querySelectorAll("ul[aria-label='Images'] img").length, 4, "every new image is in the library");
 } finally { await ui.dispose(); }
});
test("a busy library is waited out and the file sent again", async () => {
 let posts = 0;
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url, init) => {
  if (noRules(url)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (init?.method !== "POST") return Response.json({ assets: [], nextCursor: null });
  if (++posts === 1) return new Response(JSON.stringify({ code: "MEDIA_UPLOAD_BUSY", message: "Other images are uploading. Please try again shortly." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "0" } });
  return Response.json({ asset: bulkAsset(7, "retry.png") }, { status: 201 });
 });
 try {
  await choose((await openUpload(ui.container))!, [png("retry.png")]);
  await waitFor(() => document.querySelector('[role="dialog"]') === null);
  assert.equal(posts, 2, "sent again once the library was free");
 } finally { await ui.dispose(); }
});
test("files that cannot go in are listed with the reason while the rest upload, and the failed ones can be sent again", async () => {
 const sent: string[] = []; let broken = true;
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url, init) => {
  if (noRules(url)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (init?.method !== "POST") return Response.json({ assets: [], nextCursor: null });
  const name = decodeURIComponent(new Headers(init.headers).get("X-Media-Label")!); sent.push(name);
  if (name === "broken.png" && broken) return Response.json({ code: "MEDIA_INVALID_IMAGE", message: "Choose a valid, non-animated JPEG, PNG or WebP image up to 24 million pixels." }, { status: 400 });
  return Response.json({ asset: bulkAsset(sent.length, name) }, { status: 201 });
 });
 try {
  await choose((await openUpload(ui.container))!, [png("good.png"), new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }), png("broken.png")]);
  await waitFor(settledDialog);
  assert.deepEqual(rows(), { "good.png": "done", "logo.svg": "refused", "broken.png": "failed" });
  const alert = document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? "";
  assert.match(alert, /2 files were not uploaded\./);
  // Each reason once in the alert, each file's own in its row (owner, 23 Nov 2026: the window had grown taller than the screen).
  assert.match(alert, /Choose a JPEG, PNG or WebP image up to 5 MB\./, "a file of another kind is refused before it is sent, with the Settings limit");
  assert.match(alert, /Choose a valid, non-animated JPEG/, "the server's reason");
  assert.match(rowText("logo.svg"), /Choose a JPEG, PNG or WebP image up to 5 MB\./);
  assert.match(rowText("broken.png"), /Choose a valid, non-animated JPEG/);
  assert.ok(document.querySelector('[role="dialog"]'), "the dialog stays open to show what did not go in");
  broken = false;
  await act(async () => buttonByText(document.querySelector('[role="dialog"]')!, "Try the failed ones again")!.click());
  await waitFor(() => document.querySelector('[role="dialog"]') === null);
  assert.deepEqual(sent, ["good.png", "broken.png", "broken.png"], "the refused file is never sent; the failed one is sent again");
 } finally { await ui.dispose(); }
});
test("while Settings allow only some sizes, a picture of another size is refused with an alert before it is sent", async () => {
 const sizes: Record<string, [number, number]> = { "banner.png": [2784, 400], "photo.png": [3000, 1500] };
 const previousBitmap = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
 Object.assign(globalThis, { createImageBitmap: async (file: File) => ({ width: sizes[file.name]![0], height: sizes[file.name]![1], close() {} }) });
 const sent: string[] = [];
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url, init) => {
  if (noRules(url)) return Response.json({ rules: { restrictSizes: true, sizes: [{ width: 2784, height: 400, label: "Collection banner" }] }, updatedAt: "2026-11-23T06:30:00.000Z", updatedBy: "Priya Menon" });
  if (init?.method !== "POST") return Response.json({ assets: [], nextCursor: null });
  const name = decodeURIComponent(new Headers(init.headers).get("X-Media-Label")!); sent.push(name);
  return Response.json({ asset: bulkAsset(sent.length, name) }, { status: 201 });
 });
 try {
  const input = (await openUpload(ui.container))!;
  await waitFor(() => Boolean(document.querySelector("[data-allowed-sizes]")));
  assert.match(document.querySelector("[data-allowed-sizes]")!.textContent ?? "", /Only this size can be uploaded \(Settings, Banner sizes\): 2784 × 400 px/, "the dialog says which sizes go in");
  await choose(input, [png("banner.png"), png("photo.png")]);
  await waitFor(settledDialog);
  assert.deepEqual(sent, ["banner.png"], "the other size is never sent");
  assert.deepEqual(rows(), { "banner.png": "done", "photo.png": "refused" });
  const alert = document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? "";
  assert.match(alert, /1 file was not uploaded\./);
  assert.match(alert, /Only this size can be uploaded: 2784 × 400 px\. A publisher can change the list under Settings, Banner sizes\./, "the rule, said once");
  assert.match(rowText("photo.png"), /3000 × 1500 px: not an allowed size\./, "the picture's own size in its row");
 } finally { Object.assign(globalThis, { createImageBitmap: previousBitmap }); forgetMediaUploadRules(); await ui.dispose(); }
});
test("the API's own size refusal shows as not allowed, with its reason", async () => {
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url, init) => {
  if (noRules(url)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (init?.method !== "POST") return Response.json({ assets: [], nextCursor: null });
  return Response.json({ code: "MEDIA_SIZE_NOT_ALLOWED", message: "This picture is 1200 × 800 px. Only this size can be uploaded: 2784 × 400 px. A publisher can change the list under Settings, Banner sizes." }, { status: 422 });
 });
 try {
  await choose((await openUpload(ui.container))!, [png("room.png")]);
  await waitFor(settledDialog);
  assert.deepEqual(rows(), { "room.png": "refused" });
  assert.match(rowText("room.png"), /1200 × 800 px: not an allowed size\./);
  assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? "", /Only this size can be uploaded: 2784 × 400 px\./);
 } finally { await ui.dispose(); }
});
test("pictures dropped on the upload area upload as chosen ones do", async () => {
 const sent: string[] = [];
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url, init) => {
  if (noRules(url)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (init?.method !== "POST") return Response.json({ assets: [], nextCursor: null });
  const name = decodeURIComponent(new Headers(init.headers).get("X-Media-Label")!); sent.push(name);
  return Response.json({ asset: bulkAsset(sent.length, name) }, { status: 201 });
 });
 try {
  const zone = (await openUpload(ui.container))!.closest("label")!;
  const drop = new dom.window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: { files: [png("dropped-1.png"), png("dropped-2.png")] } });
  await act(async () => { zone.dispatchEvent(drop); });
  await waitFor(() => document.querySelector('[role="dialog"]') === null);
  assert.deepEqual([...sent].sort(), ["dropped-1.png", "dropped-2.png"]);
 } finally { await ui.dispose(); }
});

// Managing the library (owner, 23 Nov 2026: "where is the delete and edit options?"): Edit and Remove on every card of the
// library screen, with Delete permanently beside them for a publisher; Restore under Removed.
const publisherSession = { ...session, user: { ...session.user, role: "publisher" as const } };
const sha = (n: number) => n.toString(16).repeat(64);
const libraryFile = (n: number, extra: Record<string, unknown> = {}) => ({ ...asset, id: `file${n}`, sha256: sha(n), label: `File ${n}`, url: `/media/uploads/${sha(n)}.webp`, previewUrl: `/api/admin/media/${sha(n)}/preview`, removedAt: null, ...extra });
function manageTransport(state: { library: ReturnType<typeof libraryFile>[]; removed: ReturnType<typeof libraryFile>[]; usage?: { draft: string[]; published: string[] }; deleteRefusal?: string }, calls: string[]) {
 return (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? "GET";
  if (!url.startsWith("/api/admin/media") || method !== "GET" || !url.includes("?") || url.includes("removed")) calls.push(`${method} ${url}`);
  if (url.startsWith("/api/admin/settings/")) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const id = /\/api\/admin\/media\/([a-z0-9]+)/.exec(url)?.[1];
  if (method === "GET" && url.endsWith("/usage")) return Response.json(state.usage ?? { draft: [], published: [] });
  if (method === "GET") return Response.json({ assets: url.includes("removed=1") ? state.removed : state.library, nextCursor: null });
  const all = [...state.library, ...state.removed], file = all.find(item => item.id === id)!;
  if (method === "POST" && url.endsWith("/remove")) return Response.json({ asset: { ...file, removedAt: "2026-11-23T08:00:00.000Z" } });
  if (method === "POST" && url.endsWith("/restore")) return Response.json({ asset: { ...file, removedAt: null } });
  if (method === "PATCH") return Response.json({ asset: { ...file, label: JSON.parse(String(init!.body)).label } });
  if (method === "DELETE") return state.deleteRefusal ? Response.json({ code: "MEDIA_IN_USE", message: state.deleteRefusal }, { status: 409 }) : Response.json({ deleted: id });
  if (method === "POST" && url === "/api/admin/media") return Response.json({ asset: libraryFile(9, { label: decodeURIComponent(new Headers(init!.headers).get("X-Media-Label")!), width: 1200, height: 800 }) }, { status: 201 });
  return Response.json({ code: "UNEXPECTED" }, { status: 500 });
 }) as typeof fetch;
}
const cardOf = (label: string) => Array.from(document.querySelectorAll<HTMLElement>("[data-media-card]")).find(card => card.querySelector("[title]")?.getAttribute("title") === label);
const cardButton = (label: string, text: string) => Array.from(cardOf(label)?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(button => button.textContent?.replace(/:.*$/, "").trim() === text);
const dialogButton = (text: string) => buttonByText(document.querySelector('[role="dialog"]')!, text);
test("the library screen has Edit and Remove on every card, never Delete permanently, even for a publisher; a picker has neither", async () => {
 const calls: string[] = [];
 const ui = await render(<MediaLibrary session={publisherSession} onExpired={() => {}} heading="h2" />, manageTransport({ library: [libraryFile(1)], removed: [] }, calls));
 try {
  await settle();
  assert.ok(cardButton("File 1", "Edit"), "Edit");
  assert.ok(cardButton("File 1", "Remove"), "Remove");
  // Owner, 23 Nov 2026: "do not put permanent delete on every card keep it on a separate tab on left".
  assert.equal(cardButton("File 1", "Delete permanently"), undefined, "deleting permanently is on the Removed media screen alone");
  assert.equal(document.querySelector('[role="tab"]'), null, "no tabs inside the Media screen");
  await act(async () => (ui.container.querySelector<HTMLInputElement>('input[aria-label="Select File 1"]')!).click());
  assert.equal(buttonByText(ui.container, "Delete permanently"), undefined, "nor in the bar for selected files");
  assert.ok(buttonByText(ui.container, "Remove from library"));
 } finally { await ui.dispose(); }
 const picker = await render(<MediaPicker session={session} onExpired={() => {}} label="Banner" value="" onChange={() => {}} />, manageTransport({ library: [libraryFile(1)], removed: [] }, calls));
 try {
  await act(async () => buttonByText(picker.container, "Choose image")?.click());
  await settle();
  assert.equal(cardButton("File 1", "Remove"), undefined, "choosing a picture never removes one");
  assert.equal(document.querySelector('[role="tab"]'), null);
 } finally { await picker.dispose(); }
});
test("Remove asks first, says where the picture is used, and moves it to Removed, from where it is restored", async () => {
 const calls: string[] = [];
 const state = { library: [libraryFile(1), libraryFile(2)], removed: [] as ReturnType<typeof libraryFile>[], usage: { draft: ["Campaign “beds-hero”, wide picture"], published: [] } };
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, manageTransport(state, calls));
 try {
  await settle();
  await act(async () => cardButton("File 1", "Remove")!.click());
  await settle();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  assert.match(dialog.textContent ?? "", /Remove “File 1” from the library\?/);
  assert.match(dialog.textContent ?? "", /Pages that already use it keep showing it/);
  assert.match(dialog.textContent ?? "", /In the draftCampaign “beds-hero”, wide picture/, "where it is used");
  await act(async () => dialogButton("Remove")!.click());
  await settle();
  assert.ok(calls.includes("POST /api/admin/media/file1/remove"));
  assert.equal(cardOf("File 1"), undefined, "gone from the library");
  assert.match(document.querySelector("[data-media-notice]")?.textContent ?? "", /Removed 1 picture from the library\. Pages that use it keep showing it; find it under Removed media in the left menu\./);
 } finally { await ui.dispose(); }
 state.library = [libraryFile(2)]; state.removed = [libraryFile(1, { removedAt: "2026-11-23T08:00:00.000Z" })];
 const removed = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" mode="removed" />, manageTransport(state, calls));
 try {
  await settle();
  assert.equal(removed.container.querySelector("h2")?.textContent, "Removed media");
  assert.match(removed.container.textContent ?? "", /Only a publisher can delete files permanently\./);
  assert.match(cardOf("File 1")?.textContent ?? "", /Removed 23 Nov 2026/);
  assert.equal(cardButton("File 1", "Delete permanently"), undefined, "an editor is not offered it at all");
  assert.equal(buttonByText(removed.container, "Upload images"), undefined, "nothing is uploaded from Removed media");
  await act(async () => cardButton("File 1", "Restore")!.click());
  await settle();
  assert.ok(calls.includes("POST /api/admin/media/file1/restore"));
  assert.equal(cardOf("File 1"), undefined, "back in the library, so no longer under Removed");
  assert.match(document.querySelector("[data-media-notice]")?.textContent ?? "", /Restored 1 picture to the library\./);
 } finally { await removed.dispose(); }
});
test("a publisher deletes permanently only after saying they understand, and never a file that is still used", async () => {
 const calls: string[] = [];
 const state: { library: ReturnType<typeof libraryFile>[]; removed: ReturnType<typeof libraryFile>[]; usage: { draft: string[]; published: string[] }; deleteRefusal?: string } = { library: [], removed: [libraryFile(3, { removedAt: "2026-11-23T08:00:00.000Z" }), libraryFile(4, { removedAt: "2026-11-23T08:00:00.000Z" })], usage: { draft: [], published: ["Instagram, post 2"] } };
 const ui = await render(<MediaLibrary session={publisherSession} onExpired={() => {}} heading="h2" mode="removed" />, manageTransport(state, calls));
 try {
  await settle();
  assert.match(ui.container.querySelector("h2")?.nextElementSibling?.textContent ?? ui.container.textContent ?? "", /or delete it permanently once nothing uses it\./);
  await act(async () => cardButton("File 3", "Delete permanently")!.click());
  await settle();
  assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /On the live websiteInstagram, post 2/);
  assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? "", /It is still used, so it cannot be deleted/);
  assert.equal(dialogButton("Delete permanently")!.disabled, true, "nothing to confirm while it is used");
  await act(async () => dialogButton("Cancel")!.click());
  state.usage = { draft: [], published: [] };
  await act(async () => cardButton("File 4", "Delete permanently")!.click());
  await settle();
  assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /It cannot be undone, except from the server's backup/);
  assert.equal(dialogButton("Delete permanently")!.disabled, true, "not until they say they understand");
  await act(async () => (document.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')!).click());
  await act(async () => dialogButton("Delete permanently")!.click());
  await settle();
  assert.ok(calls.includes("DELETE /api/admin/media/file4"));
  assert.equal(cardOf("File 4"), undefined);
  assert.match(document.querySelector("[data-media-notice]")?.textContent ?? "", /Deleted 1 picture permanently\./);
  state.deleteRefusal = "It is still used: Instagram, post 1 (live). Choose another picture there and save and publish first.";
  await act(async () => cardButton("File 3", "Delete permanently")!.click());
  await settle();
  await act(async () => (document.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')!).click());
  await act(async () => dialogButton("Delete permanently")!.click());
  await settle();
  assert.match(document.querySelector('[role="dialog"] [data-confirm-body]')?.textContent ?? "", /It is still used: Instagram, post 1 \(live\)/, "the server's refusal is shown and the file stays");
  assert.ok(cardOf("File 3"));
 } finally { await ui.dispose(); }
});
test("Edit renames a file, says where it is used, and saves a cropped copy that the draft can use instead", async () => {
 const calls: string[] = [];
 const state = { library: [libraryFile(5, { width: 1200, height: 800 })], removed: [] as ReturnType<typeof libraryFile>[], usage: { draft: ["Homepage hero, slide 2"], published: ["Homepage hero, slide 2"] } };
 const replaced: [string, string][] = [];
 const draft = { uses: (url: string) => (url === state.library[0]!.url ? 2 : 0), replace: (from: string, to: string) => { replaced.push([from, to]); return 2; } };
 // jsdom has no images or canvas: a picture that loads at once, and a canvas that hands back a WebP.
 const previous = { Image: (globalThis as { Image?: unknown }).Image, getContext: dom.window.HTMLCanvasElement.prototype.getContext, toBlob: dom.window.HTMLCanvasElement.prototype.toBlob };
 class LoadedImage { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 1200; naturalHeight = 800; set src(_value: string) { setTimeout(() => this.onload?.(), 0); } }
 const context = new Proxy({}, { get: () => () => {} });
 Object.assign(globalThis, { Image: LoadedImage });
 dom.window.HTMLCanvasElement.prototype.getContext = (() => context) as never;
 dom.window.HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string) { callback(new Blob(["webp"], { type: type ?? "image/png" })); };
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" draft={draft} />, manageTransport(state, calls));
 try {
  await settle();
  await act(async () => cardButton("File 5", "Edit")!.click());
  await settle();
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
  assert.equal(document.getElementById(dialog().getAttribute("aria-labelledby")!)?.textContent, "Edit picture");
  assert.match(dialog().textContent ?? "", /On the live websiteHomepage hero, slide 2In the draftHomepage hero, slide 2/);
  const name = dialog().querySelector<HTMLInputElement>("form input")!;
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(name, "Hero, Diwali night");
  await act(async () => name.dispatchEvent(new dom.window.Event("input", { bubbles: true })));
  await act(async () => dialogButton("Save name")!.click());
  await settle();
  assert.ok(calls.some(call => call === "PATCH /api/admin/media/file5"));
  assert.match(dialog().textContent ?? "", /Renamed to “Hero, Diwali night”\./);
  assert.ok(cardOf("Hero, Diwali night"), "the card takes the new name");
  await act(async () => dialogButton("Crop, turn or flip")!.click());
  await settle();
  assert.match(dialog().querySelector("[data-crop-result]")?.textContent ?? "", /The copy will be 1200 × 800 px\./, "free: the whole picture to begin with");
  await act(async () => dialogButton("Turn right")!.click());
  assert.match(dialog().querySelector("[data-crop-result]")?.textContent ?? "", /The copy will be 800 × 1200 px\./, "turned a quarter");
  await act(async () => dialogButton("Save as a new picture")!.click());
  await settle(); await settle();
  assert.ok(calls.includes("POST /api/admin/media"), "the copy is uploaded");
  assert.match(dialog().textContent ?? "", /Saved as a new picture, “Hero, Diwali night \(edited\)\.webp” \(1200 × 800 px\)\. The original is unchanged\./);
  assert.match(dialog().querySelector("[data-use-copy]")?.textContent ?? "", /The draft uses the original in 2 places\./);
  await act(async () => dialogButton("Use the copy there instead")!.click());
  assert.deepEqual(replaced, [[state.library[0]!.url, libraryFile(9).url]]);
  assert.match(dialog().textContent ?? "", /The draft now uses the copy in 2 places\. Save the draft, then publish to show it on the website\./);
 } finally {
  Object.assign(globalThis, { Image: previous.Image });
  dom.window.HTMLCanvasElement.prototype.getContext = previous.getContext; dom.window.HTMLCanvasElement.prototype.toBlob = previous.toBlob;
  await ui.dispose();
 }
});
test("the upload window never grows past the screen: its title, close button and buttons stay in view and the list scrolls", async () => {
 const ui = await render(<MediaLibrary session={session} onExpired={() => {}} heading="h2" />, async (url) => noRules(url) ? Response.json({ code: "NOT_FOUND" }, { status: 404 }) : Response.json({ assets: [], nextCursor: null }));
 try {
  await openUpload(ui.container);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  assert.match(dialog.className, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(dialog.className, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  const body = dialog.querySelector<HTMLElement>("[data-upload-body]")!;
  assert.match(body.className, /overflow-y-auto/);
  assert.equal(body.contains(dialog.querySelector("h2")), false, "the title stays outside the scrolling part");
  assert.ok(dialog.querySelector('[data-slot="dialog-close"]'), "the close button");
 } finally { await ui.dispose(); }
});
