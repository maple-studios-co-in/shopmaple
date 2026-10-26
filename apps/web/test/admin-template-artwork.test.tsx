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
const image = `/media/uploads/${"a".repeat(64)}.webp`;
const preview = `/api/admin/media/${"a".repeat(64)}/preview`;
const originalDesktop = "https://shop.maplefurnishers.com/cdn/shop/files/Chairs_9.svg";
const originalMobile = "https://shop.maplefurnishers.com/cdn/shop/files/Chairs_300_x_600_px.webp?width=900";
const sibling = { key: "story-hero", image: "/media/story.webp", alt: "Story room" };
function button(name: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string, scope: ParentNode = container) { await act(async () => button(name, scope).click()); }
function input(label: string) {
  const field = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} input`); return field;
}
async function fill(label: string, value: string) {
  await act(async () => {
    const field = input(label);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  const field = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} selector`);
  await act(async () => { field.value = value; field.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
async function setup(options: { conflict?: boolean; legacy?: boolean; role?: "editor" | "publisher" } = {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  if (options.legacy) delete (initial as any).templateMedia;
  else (initial as any).templateMedia = [sibling];
  let saved: any;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url); calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/api/admin/media") return Response.json({assets:[{id:"asset",sha256:"a".repeat(64),label:"Living room",width:100,height:100,bytes:100,mimeType:"image/webp",createdAt:"2026-10-26T00:00:00Z",publicAt:null,url:image,previewUrl:preview}],nextCursor:null});
    if (path === "/api/admin/content/publish") {
      assert.equal(options.role, "publisher");
      assert.deepEqual(JSON.parse(String(init?.body)), {expectedVersion:5});
      assert.equal(new Headers(init?.headers).get("X-CSRF-Token"), "c".repeat(64));
      return Response.json({version:5,draft:saved.content,publishedVersion:5,updatedAt:"2026-10-26T12:00:00Z"});
    }
    assert.equal(path, "/api/admin/content", "Only explicit content writes are allowed");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      assert.equal(init.credentials, "same-origin");
      saved = JSON.parse(String(init.body));
      return options.conflict ? Response.json({error:"Version conflict"},{status:409}) : Response.json({version:5,draft:saved.content,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
    }
    return Response.json({version:4,draft:initial,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
  };
  await act(async () => root.render(<ContentEditor session={{user:{id:"editor",email:"editor@example.test",role:options.role ?? "editor"},csrfToken:"c".repeat(64)}} initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
  return {initial,calls,saved:()=>saved,close:async()=>{await act(async()=>root.unmount());globalThis.fetch=previous;}};
}

test("legacy Artwork browsing shows grouped original placements without creating draft overrides", async () => {
  const app = await setup({legacy:true});
  try {
    assert.equal(button("Save draft").disabled, true, "Existing clean drafts remain clean");
    await click("Artwork");
    assert.deepEqual([...container.querySelectorAll('select[aria-label="Artwork group"] option')].map(o=>o.textContent), ["Homepage", "Homepage icons", "Cities", "Nimbus", "Our Story"]);
    assert.equal(container.querySelector('select[aria-label="Artwork placement"]')?.children.length, 8);
    await select("Artwork placement", "home-nimbus");
    assert.equal(input("Desktop image URL").value, originalDesktop);
    assert.equal(input("Mobile image URL").value, originalMobile);
    assert.equal(button("Restore original").disabled, true);
    await select("Artwork group", "Nimbus");
    assert.equal(container.querySelector('select[aria-label="Artwork placement"]')?.children.length, 11);
    await select("Artwork group", "Our Story");
    assert.equal(container.querySelector('select[aria-label="Artwork placement"]')?.children.length, 2);
    assert.equal(button("Save draft").disabled, true);
    await click("Homepage"); await fill("Category heading", "Sibling text"); await click("Save draft");
    assert.equal(app.saved().content.templateMedia, undefined);
    assert.equal(container.textContent?.includes("Publish draft"), false, "Editors cannot publish");
  } finally { await app.close(); }
});

test("Artwork media selection saves one complete responsive override and unsaved sibling content", async () => {
  const app = await setup();
  try {
    await click("Homepage"); await fill("Category heading", "Preserve local heading");
    await click("Artwork"); await select("Artwork placement", "home-nimbus");
    const desktop = container.querySelector('[aria-label="Desktop artwork"]')!;
    assert.ok(desktop);
    await click("Choose image", desktop);
    assert.equal(desktop.querySelector('img[alt="Living room"]')?.getAttribute("src"), preview);
    await click("Use image: Living room", desktop);
    assert.equal(document.activeElement, button("Choose image", desktop));
    assert.equal(input("Desktop image URL").value, image);
    assert.equal(desktop.querySelector("img")?.getAttribute("src"), preview);
    await fill("Image description", "Cloud sofa in a warm room");
    await select("Artwork placement", "home-newsletter");
    assert.equal(container.querySelector('input[aria-label="Mobile image URL"]'), null);
    await select("Artwork placement", "home-nimbus");
    assert.equal(input("Desktop image URL").value, image);
    assert.equal(app.calls.filter(c=>c.startsWith("PUT") || c.startsWith("POST")).length, 0);
    await click("Save draft");
    assert.equal(app.saved().expectedVersion, 4);
    assert.deepEqual(app.saved().content.templateMedia, [sibling, {key:"home-nimbus",image,mobileImage:originalMobile,alt:"Cloud sofa in a warm room"}]);
    assert.equal(app.saved().content.homeCopy.categoryHeading, "Preserve local heading");
    assert.deepEqual(app.saved().content.campaigns, app.initial.campaigns);
    assert.match(container.textContent ?? "", /Draft saved/);
  } finally { await app.close(); }
});

test("restoring one artwork placement preserves other overrides and moves focus to its selector", async () => {
  const app = await setup();
  try {
    await click("Artwork"); await select("Artwork placement", "home-nimbus");
    await fill("Mobile image URL", "/media/mobile.webp");
    await fill("Desktop image URL", "/media/desktop.webp");
    await click("Restore original");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Artwork placement");
    assert.equal(input("Desktop image URL").value, originalDesktop);
    assert.equal(input("Mobile image URL").value, originalMobile);
    await click("Save draft");
    assert.deepEqual(app.saved().content.templateMedia, [sibling]);
  } finally { await app.close(); }
});

test("invalid artwork URLs, missing mobile crops and blank descriptions block saving without rendering unsafe previews", async () => {
  const app = await setup();
  try {
    await click("Artwork"); await select("Artwork placement", "home-nimbus");
    await fill("Desktop image URL", "https://tracker.example.invalid/track.png");
    assert.equal(container.querySelector('[aria-label="Desktop artwork"] img'), null);
    await click("Save draft"); assert.equal(app.saved(), undefined);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /templateMedia/);
    await fill("Desktop image URL", "/media/room.webp");
    await fill("Mobile image URL", "");
    await click("Save draft"); assert.equal(app.saved(), undefined);
    await fill("Mobile image URL", "/media/room-mobile.webp");
    await fill("Image description", "   ");
    await click("Save draft"); assert.equal(app.saved(), undefined);
    await fill("Image description", "Room scene"); await click("Save draft");
    assert.equal(app.saved().content.templateMedia[1].alt, "Room scene");
    await select("Artwork placement", "home-hero-sofas");
    await fill("Desktop image URL", "/media/sofa.webp");
    await fill("Image description", ""); await click("Save draft");
    assert.equal(app.saved().content.templateMedia.find((item: any)=>item.key === "home-hero-sofas").alt, "");
  } finally { await app.close(); }
});

test("a draft conflict retains artwork edits and prevents additional writes", async () => {
  const app = await setup({conflict:true});
  try {
    await click("Artwork"); await select("Artwork placement", "home-newsletter");
    await fill("Desktop image URL", "/media/newsletter.webp");
    await click("Save draft");
    assert.match(container.textContent ?? "", /Another editor saved/);
    assert.equal(input("Desktop image URL").value, "/media/newsletter.webp");
    assert.equal(button("Save draft").disabled, true);
    assert.equal(container.querySelector(".admin-panel > fieldset")?.hasAttribute("disabled"), true);
    assert.equal(app.calls.filter(c=>c.startsWith("PUT")).length, 1);
  } finally { await app.close(); }
});

test("video posters explain the unchanged video and publishing requires an explicit saved-draft action", async () => {
  const app = await setup({role:"publisher"});
  try {
    await click("Artwork"); await select("Artwork placement", "home-testimonial-poster");
    assert.match(container.textContent ?? "", /poster.*video.*unchanged/is);
    await fill("Desktop image URL", "/media/poster.webp");
    await fill("Image description", "Customer at home");
    assert.equal(button("Publish draft").disabled, true);
    await click("Save draft");
    assert.equal(app.calls.includes("POST /api/admin/content/publish"), false);
    assert.equal(button("Publish draft").disabled, false);
    await click("Publish draft");
    assert.equal(app.calls.includes("POST /api/admin/content/publish"), true);
    assert.match(container.textContent ?? "", /Draft published/);
  } finally { await app.close(); }
});

test("homepage icons and city artwork support independent media, descriptions and restoration", async () => {
  const app = await setup();
  try {
    await click("Artwork");
    await select("Artwork group", "Homepage icons");
    assert.equal(container.querySelector('select[aria-label="Artwork placement"]')?.children.length, 8);
    await select("Artwork placement", "home-difference-1");
    assert.match(container.textContent ?? "", /description blank.*decorative/i);
    await fill("Desktop image URL", "/media/quality.webp");
    await fill("Image description", "");
    await select("Artwork placement", "home-value-strength");
    assert.match(container.textContent ?? "", /description blank.*decorative/i);
    const desktop = container.querySelector('[aria-label="Desktop artwork"]')!;
    await click("Choose image", desktop);
    await click("Use image: Living room", desktop);
    assert.equal(document.activeElement, button("Choose image", desktop));
    await fill("Image description", "A strong wooden joint");
    await select("Artwork group", "Cities");
    assert.equal(container.querySelector('select[aria-label="Artwork placement"]')?.children.length, 18);
    await select("Artwork placement", "home-city-artwork-1");
    assert.match(container.textContent ?? "", /description blank.*decorative/i);
    await fill("Desktop image URL", "/media/skyline.webp");
    await fill("Image description", "");
    await select("Artwork placement", "home-city-delhi");
    assert.match(container.textContent ?? "", /description is required/i);
    const originalDelhi = input("Desktop image URL").value;
    await fill("Desktop image URL", "/media/delhi.webp");
    await fill("Image description", "");
    await click("Save draft");
    assert.equal(app.saved(), undefined, "Named city artwork still requires a screen-reader description");
    await fill("Image description", "Delhi skyline");
    await click("Save draft");
    assert.deepEqual(app.saved().content.templateMedia, [sibling,
      {key:"home-difference-1",image:"/media/quality.webp",alt:""},
      {key:"home-value-strength",image,alt:"A strong wooden joint"},
      {key:"home-city-artwork-1",image:"/media/skyline.webp",alt:""},
      {key:"home-city-delhi",image:"/media/delhi.webp",alt:"Delhi skyline"},
    ]);
    await click("Restore original");
    assert.equal(input("Desktop image URL").value, originalDelhi);
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Artwork placement");
    await click("Save draft");
    assert.deepEqual(app.saved().content.templateMedia.map((item: any) => item.key), ["story-hero", "home-difference-1", "home-value-strength", "home-city-artwork-1"]);
  } finally { await app.close(); }
});
