import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { installUiDom } from "./support/ui-dom";

// Staff edit the Nimbus redesign (Figma 311:548; owner, 10 Nov 2026) in the existing Nimbus editor, built from the
// collection template's editor pieces that Terra shares.
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
async function openNimbus() {
  await act(async () => button("Existing pages").click());
  const select = container.querySelector<HTMLSelectElement>('[aria-label="Existing page"]');
  assert.ok(select);
  await act(async () => { select.value = "nimbus"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  for (const details of container.querySelectorAll<HTMLDetailsElement>('[aria-label="Nimbus page content"] details')) {
    await act(async () => details.querySelector<HTMLElement>("summary")!.click());
  }
}
const legacyNimbus = {
  title: "The Nimbus Collection",
  sections: ["hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises"].map(key => ({ key, enabled: true })),
  intro: { heading: "Introducing nimbus", body: "We created an atmosphere where your home breathe in shades of clouds" },
  roomTiles: [{ key: "bedroom", title: "Bedroom" }, { key: "living", title: "Our lounge" }, { key: "dining", title: "Dining Room" }],
  origin: { eyebrow: "Origin & Philosophy", heading: "Nimbus", body: "Shaped by how people live." },
  principles: {
    heading: "THE NIMBUS PRINCIPLES",
    items: [
      { key: "comfort", title: "Cloud Like Comfort", body: "Where nature begins the story — raw, real, and rooted in beauty." },
      { key: "silhouettes", title: "Soft Silhouettes", body: "Precision that defines perfection. Every line, intentional." },
      { key: "luxury", title: "Airy Luxury", body: "Softness you can feel before you even touch it." },
      { key: "spaces", title: "Modern Spaces", body: "The quiet glow of craftsmanship perfected." },
    ],
  },
  roomSlides: [{ key: "living", label: "Living room" }, { key: "bedroom", label: "Bedroom" }, { key: "dining", label: "Dining room" }],
  series: { eyebrow: "Inspired by floating forms and quiet modern living.", heading: "Nimbus Series" },
  project: { heading: "If the project sounds good", body: "Whether you have a question about our products, custom orders, or collaborations — our team is here to help." },
  promises: [
    { key: "custom", title: "Fully Customizable" }, { key: "delivery", title: "Delivery Across India" },
    { key: "craft", title: "In-House Crafted in Delhi" }, { key: "warranty", title: "36-Month Warranty" },
  ],
};

test("a draft still holding the original Nimbus copy opens on the redesign and saves the redesign's words", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const initial = { ...structuredClone(defaultStorefrontContent), nimbusPage: legacyNimbus } as typeof defaultStorefrontContent;
  assert.equal(storefrontContentSchema.safeParse(initial).success, true);
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
    await openNimbus();
    // The original template's words read as the redesign's; a word staff wrote stays where its region went.
    assert.equal(field("Nimbus page title").value, "The Nimbus Collection");
    assert.equal(field("Nimbus opening heading").value, "A softer way\nto come home.");
    assert.equal(field("Nimbus point of view heading").value, "Comfort is\nthe starting point.");
    assert.equal(field("Nimbus room link 1").value, "Our lounge");
    assert.equal(field("Nimbus origin text").value, "Shaped by how people live.");
    assert.equal(field("Nimbus edit card 3 line").value, "Living / Centre tables");
    assert.equal(field("Nimbus consultation button").value, "Start a conversation");
    assert.equal(button("Save draft").disabled, true, "opening the page changes nothing");

    await fill("Nimbus opening heading", "Softly,\nhome.");
    await fill("Nimbus feeling card 2 title", "Space to breathe");
    await fill("Nimbus edit card 1 line", "Living / Modular seating");
    await fill("Nimbus consultation button", "Talk to us");
    await fill("Nimbus promise 3", "Delivered across India");
    await act(async () => (field("Show Nimbus Material story") as HTMLInputElement).click());
    const move = button("Move Nimbus Promise up");
    move.focus();
    await act(async () => move.click());
    assert.equal(document.activeElement, move, "keyboard focus stays on the Move button");
    await act(async () => button("Save draft").click());
    assert.ok(saved, "the draft is saved");
    const page = saved.content.nimbusPage;
    assert.equal(storefrontContentSchema.safeParse(saved.content).success, true, "the saved draft passes the storefront contract");
    for (const retired of ["intro", "roomTiles", "principles", "roomSlides", "series", "project", "promises"]) assert.equal(page[retired], undefined, retired);
    assert.equal(page.hero.heading, "Softly,\nhome.");
    assert.equal(page.feeling.items[1].title, "Space to breathe");
    assert.equal(page.pieces.items[0].line, "Living / Modular seating");
    assert.equal(page.consultation.cta, "Talk to us");
    assert.deepEqual(page.promise.map((item: { label: string }) => item.label), ["Made around you", "Crafted in Delhi", "Delivered across India"]);
    assert.equal(page.roomNav[0].label, "Our lounge");
    assert.equal(page.origin.body, "Shaped by how people live.");
    assert.deepEqual(page.sections, [
      ["hero", true], ["room-nav", true], ["philosophy", true], ["origin", true], ["feeling", true], ["material", false],
      ["browse", true], ["pieces", true], ["promise", true], ["consultation", true],
    ].map(([key, enabled]) => ({ key, enabled })));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
