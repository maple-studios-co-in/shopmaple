import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const container = document.getElementById("root")!;
function button(name: string) {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.getAttribute("aria-label") === name || item.textContent === name);
  assert.ok(result, `Missing ${name} button`);
  return result;
}
async function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} input`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function selectPage(value: string) {
  const select = container.querySelector<HTMLSelectElement>('[aria-label="Existing page"]');
  assert.ok(select, "Existing page selector must expose Nimbus alongside Our Story");
  await act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
for (const conflict of [false, true]) test(`staff edit and position Nimbus sections without publishing (${conflict ? "conflict" : "saved"})`, async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  delete (initial as Record<string, unknown>).nimbusPage;
  let saved: Record<string, any> | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "Only existing draft endpoint may be used");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      saved = JSON.parse(String(init.body));
      return conflict ? Response.json({error:"Version conflict"},{status:409})
        : Response.json({version:5,draft:saved!.content,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
    }
    return Response.json({version:4,draft:initial,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
  };
  try {
    await act(async () => root.render(<ContentEditor session={{user:{id:"editor",email:"editor@example.test",role:"editor"},csrfToken:"c".repeat(64)}} initialContent={defaultStorefrontContent} onExpired={()=>assert.fail("Unexpected expiry")} />));
    await act(async () => button("Existing pages").click());
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Our Story page title"]')?.value,"Our Story");
    await selectPage("nimbus");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Nimbus page title"]')?.value,"The Nimbus Collection");
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="Nimbus point of view heading"]')?.value,"Comfort is\nthe starting point.");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Nimbus room link 3"]')?.value,"Bedroom");
    const panels=[...container.querySelectorAll<HTMLDetailsElement>('[aria-label="Nimbus page content"] details')];
    assert.equal(panels.length,10,"one panel per region of the redesign");
    for(const panel of panels){assert.equal(panel.open,false);await act(async()=>panel.querySelector<HTMLElement>("summary")!.click());assert.equal(panel.open,true);}
    for(const [label,value] of [
      ["Nimbus page title","Nimbus, made for you"],
      ["Nimbus point of view heading","Meet Nimbus"],
      ["Nimbus point of view text","Comfort for your home."],
      ["Nimbus room link 3","Rest with Nimbus"],
      ["Nimbus origin text","<img src=x onerror=alert(1)> A considered collection."],
      ["Nimbus feeling heading","Our principles"],
      ["Nimbus feeling card 1 title","Comfort first"],
      ["Nimbus material note 1","Layered upholstery"],
      ["Nimbus edit heading","Explore the series"],
      ["Nimbus consultation heading","Tell us your idea"],
      ["Nimbus promise 1","Made around you, always"],
    ]) await fill(label!,value!);
    const move=button("Move Nimbus Room links up");
    move.focus();await act(async()=>move.click());
    assert.equal(document.activeElement,move,"Section movement keeps keyboard focus");
    assert.equal(move.disabled,true,"First section cannot move further up");
    const hero=container.querySelector<HTMLInputElement>('[aria-label="Show Nimbus Opening"]')!;
    await act(async()=>hero.click());
    await selectPage("story");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Our Story page title"]')?.value,"Our Story");
    await selectPage("nimbus");
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="Nimbus point of view heading"]')?.value,"Meet Nimbus","Switching pages must preserve edits");
    await act(async()=>button("Save draft").click());
    assert.ok(saved);assert.equal(saved.expectedVersion,4);
    const page=saved.content.nimbusPage;
    assert.equal(page.title,"Nimbus, made for you");
    assert.deepEqual(page.sections.slice(0,2),[{key:"room-nav",enabled:true},{key:"hero",enabled:false}]);
    assert.equal(page.sections.length,10);
    assert.equal(page.philosophy.heading,"Meet Nimbus");
    assert.equal(page.philosophy.body,"Comfort for your home.");
    assert.equal(page.roomNav[2].label,"Rest with Nimbus");
    assert.equal(page.origin.body,"<img src=x onerror=alert(1)> A considered collection.");
    assert.equal(page.feeling.heading,"Our principles");
    assert.equal(page.feeling.items[0].title,"Comfort first");
    assert.equal(page.material.notes[0].label,"Layered upholstery");
    assert.equal(page.pieces.heading,"Explore the series");
    assert.equal(page.consultation.heading,"Tell us your idea");
    assert.equal(page.promise[0].label,"Made around you, always");
    assert.equal(page.intro,undefined,"the redesign's copy, not the original template's");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Nimbus page title"]')?.value,"Nimbus, made for you","Conflict must preserve local input");
    assert.match(container.textContent??"",conflict?/another editor|changed|conflict/i:/Draft saved/);
    assert.match(container.textContent??"",/Published version 2/);
    assert.equal([...container.querySelectorAll("button")].some(b=>b.textContent==="Publish draft"),false);
    assert.equal(container.querySelector('img[onerror]'),null);
  } finally {await act(async()=>root.unmount());globalThis.fetch=previous;}
});
