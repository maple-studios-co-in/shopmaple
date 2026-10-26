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
const cityKeys = ["delhi", "kolkata", "hyderabad", "varanasi", "mumbai", "jaipur", "bengaluru", "chennai", "gujarat", "artwork-1", "artwork-2", "artwork-3", "artwork-4", "artwork-5", "artwork-6", "artwork-7", "artwork-8", "agra"];
const cityNames = ["Delhi", "Kolkata", "Hyderabad", "Varanasi", "Mumbai", "Jaipur", "Bengaluru", "Chennai", "Gujarat", "City artwork 1", "City artwork 2", "City artwork 3", "City artwork 4", "City artwork 5", "City artwork 6", "City artwork 7", "City artwork 8", "Agra"];
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`); return found;
}
async function click(name: string) { await act(async () => button(name).click()); }
function cities() {
  const section = container.querySelector<HTMLElement>('[aria-label="Homepage cities layout"]');
  assert.ok(section, "Homepage exposes city artwork ordering and visibility"); return section;
}
function show(name: string) {
  const field = cities().querySelector<HTMLInputElement>(`input[aria-label="Show ${name}"]`);
  assert.ok(field, `Missing Show ${name} checkbox`); return field;
}
async function setup(options: { expire?: boolean; customized?: boolean } = {}) {
  const previous = globalThis.fetch, root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  delete initial.homeCitiesLayout;
  initial.templateMedia = [
    { key: "story-hero", image: "/media/story.webp", alt: "Story room" },
    { key: "home-city-delhi", image: "/media/delhi.webp", alt: "Delhi skyline" },
  ];
  if (options.customized) initial.homeCitiesLayout = cityKeys.map(key => ({key, enabled: key !== "delhi"})).reverse() as any;
  let saved: any, expired = 0;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "/api/admin/content", "City presentation does not publish or change serviceability");
    calls.push(init?.method ?? "GET");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      assert.equal(init.credentials, "same-origin");
      saved = JSON.parse(String(init.body));
      return options.expire ? Response.json({error:"Session expired"}, {status:401}) : Response.json({version:5,draft:saved.content,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
    }
    return Response.json({version:4,draft:initial,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
  };
  await act(async () => root.render(<ContentEditor session={{user:{id:"editor",email:"editor@example.test",role:"editor"},csrfToken:"c".repeat(64)}} initialContent={defaultStorefrontContent} onExpired={() => { expired++; }} />));
  await click("Homepage");
  return {initial,calls,saved:()=>saved,expired:()=>expired,close:async()=>{await act(async()=>root.unmount());globalThis.fetch=previous;}};
}

test("legacy city layout browsing stays clean and moving or hiding saves complete stable identities", async () => {
  const app = await setup();
  try {
    assert.deepEqual([...cities().querySelectorAll('input[type="checkbox"]')].map(e => e.getAttribute("aria-label")), cityNames.map(name => `Show ${name}`));
    assert.deepEqual([...cities().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(e => e.checked), cityKeys.map(key => !key.startsWith("artwork-")));
    assert.equal(button("Save draft").disabled, true);
    assert.equal(button("Move Delhi up").disabled, true);
    assert.equal(button("Move Agra down").disabled, true);
    assert.equal(button("Restore original city layout").disabled, true);
    assert.match(cities().textContent ?? "", /presentation/i);
    assert.match(cities().textContent ?? "", /delivery serviceability.*Keeri/i);
    button("Move Kolkata up").focus();
    await click("Move Kolkata up");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "City artwork Kolkata", "Moving to a boundary retains keyboard focus on the moved row");
    assert.equal(button("Move Kolkata up").disabled, true);
    assert.equal(button("Move Delhi up").disabled, false);
    await click("Move Kolkata down");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "City artwork Kolkata");
    assert.equal(button("Move Delhi up").disabled, true);
    await click("Move Kolkata up");
    await act(async () => {
      const heading = container.querySelector<HTMLInputElement>('[aria-label="Category heading"]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(heading, "Unsaved sibling heading");
      heading.dispatchEvent(new dom.window.Event("input", {bubbles:true}));
    });
    show("Delhi").focus();
    await act(async () => show("Delhi").click());
    assert.equal(document.activeElement, show("Delhi"));
    assert.equal(app.calls.includes("PUT"), false);
    await click("Save draft");
    assert.equal(app.saved().expectedVersion, 4);
    assert.deepEqual(app.saved().content.homeCitiesLayout, [
      {key:"kolkata",enabled:true}, {key:"delhi",enabled:false},
      ...cityKeys.slice(2).map(key => ({key,enabled:!key.startsWith("artwork-")})),
    ]);
    assert.deepEqual(app.saved().content.templateMedia, app.initial.templateMedia);
    assert.deepEqual(app.saved().content.homeDetails, app.initial.homeDetails);
    assert.deepEqual(app.saved().content.homeCopy, {...app.initial.homeCopy, categoryHeading:"Unsaved sibling heading"});
    assert.equal(container.textContent?.includes("Publish draft"), false);
  } finally { await app.close(); }
});

test("all cities may be hidden and restoring layout resets only order and visibility", async () => {
  const app = await setup({customized:true});
  try {
    assert.equal(cities().querySelector('input[type="checkbox"]')?.getAttribute("aria-label"), "Show Agra");
    assert.equal(show("Delhi").checked, false);
    for (const name of cityNames) if (show(name).checked) await act(async () => show(name).click());
    await click("Save draft");
    assert.equal(app.saved().content.homeCitiesLayout.length, 18);
    assert.ok(app.saved().content.homeCitiesLayout.every((item: any) => item.enabled === false));
    button("Restore original city layout").focus();
    await click("Restore original city layout");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "City artwork Delhi");
    assert.deepEqual([...cities().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(e => e.checked), cityKeys.map(key => !key.startsWith("artwork-")));
    await click("Save draft");
    assert.deepEqual(app.saved().content.homeCitiesLayout, cityKeys.map(key => ({key,enabled:!key.startsWith("artwork-")})));
    assert.deepEqual(app.saved().content.templateMedia, app.initial.templateMedia);
    assert.deepEqual(app.saved().content.homeSections, app.initial.homeSections);
  } finally { await app.close(); }
});

test("expired sessions during city layout saving invoke the existing expiry boundary and retain edits", async () => {
  const app = await setup({expire:true});
  try {
    await act(async () => show("Delhi").click());
    await click("Save draft");
    assert.equal(app.expired(), 1);
    assert.equal(show("Delhi").checked, false);
    assert.equal(container.textContent?.includes("Draft saved"), false);
    assert.deepEqual(app.calls, ["GET", "PUT"]);
  } finally { await app.close(); }
});
