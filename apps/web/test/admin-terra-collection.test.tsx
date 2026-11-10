import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultTerraPage } from "../lib/terra-content-defaults";
import { installUiDom } from "./support/ui-dom";

// Staff edit the Terra Collection (Figma 311:921; owner, 10 Nov 2026) under Existing pages, with the collection template's
// editor pieces that Nimbus shares. Its photos are under Artwork, Terra.
const dom = installUiDom();
const container = document.getElementById("root")!;
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
function field(label: string) {
  const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(found, `Missing ${label} field`);
  return found;
}
async function fill(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function openTerra() {
  await act(async () => button("Existing pages").click());
  const select = container.querySelector<HTMLSelectElement>('[aria-label="Existing page"]');
  assert.ok(select);
  assert.ok([...select.options].some(option => option.value === "terra" && option.textContent === "The Terra Collection"), "Terra is an existing page");
  await act(async () => { select.value = "terra"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  for (const details of container.querySelectorAll<HTMLDetailsElement>('[aria-label="Terra page content"] details')) {
    await act(async () => details.querySelector<HTMLElement>("summary")!.click());
  }
}

test("a draft without Terra opens on the frame's words, and staff edits save as Terra's own copy", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  assert.equal(initial.terraPage, undefined, "documents saved before Terra have no copy of their own");
  let saved: Record<string, any> | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "No publish or operational endpoint may be called");
    if (init?.method === "PUT") {
      saved = JSON.parse(String(init.body));
      return Response.json({ version: 5, draft: saved!.content, publishedVersion: 2, updatedAt: "2026-11-10T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-11-10T12:00:00Z" });
  };
  try {
    await act(async () => root.render(<ContentEditor session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }} initialContent={initial} onExpired={() => assert.fail("Unexpected expiry")} />));
    await openTerra();
    assert.equal(field("Terra page title").value, "The Terra Collection");
    assert.equal(field("Terra opening heading").value, "Grounded in earth.\nMade for belonging.");
    assert.equal(field("Terra room link 3").value, "The terrace");
    assert.equal(field("Terra room 2 heading").value, "Rest, close to the earth.");
    assert.equal(field("Terra room 1 tags").value, "Curved seating / Walnut / Travertine");
    assert.equal(field("Terra edit card 3 title").value, "Low leather bed");
    assert.equal(field("Terra edit card 4 line").value, "Outdoor / Lounge seating");
    assert.equal(button("Save draft").disabled, true, "opening the page changes nothing");

    await fill("Terra opening heading", "Grounded.\nWarm.");
    await fill("Terra room 1 tags", "Curved seating / Walnut");
    await fill("Terra room 2 heading", "Rest, close to earth.");
    await fill("Terra edit card 1 title", "Arc sofa");
    await fill("Terra consultation button", "Talk to us");
    await act(async () => (field("Show Terra Material story") as HTMLInputElement).click());
    const move = button("Move Terra Promise up");
    move.focus();
    await act(async () => move.click());
    assert.equal(document.activeElement, move, "keyboard focus stays on the Move button");
    await act(async () => button("Save draft").click());
    assert.ok(saved, "the draft is saved");
    assert.equal(storefrontContentSchema.safeParse(saved.content).success, true, "the saved draft passes the storefront contract");
    const page = saved.content.terraPage;
    assert.equal(page.hero.heading, "Grounded.\nWarm.");
    assert.equal(page.rooms.items[0].tags, "Curved seating / Walnut");
    assert.equal(page.rooms.items[1].heading, "Rest, close to earth.");
    assert.equal(page.pieces.items[0].title, "Arc sofa");
    assert.equal(page.consultation.cta, "Talk to us");
    assert.equal(page.pieces.items.length, 4, "Terra keeps its four concepts, one per photo");
    assert.deepEqual(page.sections, [
      ["hero", true], ["room-nav", true], ["philosophy", true], ["origin", true], ["rooms", true], ["feeling", true], ["material", false],
      ["browse", true], ["pieces", true], ["promise", true], ["consultation", true],
    ].map(([key, enabled]) => ({ key, enabled })));
    assert.equal(saved.content.nimbusPage === undefined || JSON.stringify(saved.content.nimbusPage) === JSON.stringify(initial.nimbusPage), true, "Nimbus is untouched");
    assert.deepEqual(defaultTerraPage.pieces.items[0], { title: "Curved lounge sofa", line: "Lobby / Upholstered seating" }, "the defaults are not mutated");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
