import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { storyPageContentSchema } from "@shopmaple/contracts";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
});
const container = document.getElementById("root")!;
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function fill(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label} input`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA"
      ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype,
    "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
test("staff edit the existing Our Story template and save a typed unpublished draft with stable section controls", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  let saved: Record<string, any> | undefined;
  const initial = structuredClone(defaultStorefrontContent);
  delete initial.storyPage;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "No automatic publish or extra endpoint");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      saved = JSON.parse(String(init.body));
      return Response.json({ version: 5, draft: saved!.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  try {
    await act(async () => root.render(<ContentEditor
      session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
    await act(async () => button("Existing pages").click());
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Our Story page title"]')?.value, "Our Story");
    // The redesign's copy (Figma 293:1093) is what an untouched page shows and the editor starts from.
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="Our Story hero heading"]')?.value, "Made different,\nby design.");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Our Story hero eyebrow"]')?.value, "Our Story / Made in Delhi");
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="Our Story chapter 2 title"]')?.value, "Learning from\nIndian homes.");
    assert.equal(container.querySelector('[aria-label="Our Story film heading"]'), null, "the film left the page, so its heading is not offered");
    await fill("Our Story page title", "Our story, revisited");
    await fill("Our Story hero heading", "Our workshop\nYour home");
    await fill("Our Story hero eyebrow", "Our story / Since 2015");
    await fill("Our Story hero button", "See how we got here");
    await fill("Our Story principle 2 title", "Drawn for you");
    await fill("Our Story belief body", "<img src=x onerror=alert(1)> Built with care.");
    await fill("Our Story journey eyebrow", "Our timeline");
    await fill("Our Story chapter 1 date", "2014");
    await fill("Our Story chapter 1 title", "A new\nbeginning");
    await fill("Our Story chapter 1 body", "A personal journey.");
    await fill("Our Story invitation button", "Write to us");
    const move = button("Move Our Story Journey up");
    move.focus();
    await act(async () => move.click());
    assert.equal(document.activeElement, move, "Moving a region retains keyboard focus");
    await act(async () => container.querySelector<HTMLInputElement>('[aria-label="Show Our Story Cities"]')!.click());
    await act(async () => button("Save draft").click());
    assert.ok(saved, "Edited story must save through the existing draft endpoint");
    assert.equal(saved.expectedVersion, 4);
    assert.equal(saved.content.storyPage.title, "Our story, revisited");
    assert.deepEqual(saved.content.storyPage.heroHeading, ["Our workshop", "Your home"]);
    assert.equal(saved.content.storyPage.heroEyebrow, "Our story / Since 2015");
    assert.equal(saved.content.storyPage.heroCta, "See how we got here");
    assert.deepEqual(saved.content.storyPage.principles[1], { key: "unique-designs", title: "Drawn for you", body: "Considered for everyday living." });
    assert.equal(saved.content.storyPage.beliefBody, "<img src=x onerror=alert(1)> Built with care.");
    assert.equal(saved.content.storyPage.journeyEyebrow, "Our timeline");
    assert.equal(saved.content.storyPage.invitationCta, "Write to us");
    assert.deepEqual(saved.content.storyPage.sections, [
      { key: "hero", enabled: true }, { key: "principles", enabled: true }, { key: "journey", enabled: true },
      { key: "belief-film", enabled: true }, { key: "cities", enabled: false }, { key: "invitation", enabled: true },
    ]);
    assert.deepEqual(saved.content.storyPage.timeline[0], {
      key: "chapter-1", date: "2014", title: "A new\nbeginning", body: "A personal journey.",
    });
    assert.equal(saved.content.storyPage.timeline.length, 7);
    assert.equal(storyPageContentSchema.safeParse(saved.content.storyPage).success, true, "the saved draft is valid story content");
    assert.match(container.textContent ?? "", /Draft saved/);
    assert.match(container.textContent ?? "", /Published version 2/);
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Publish draft"), false);
    assert.equal(container.querySelector("img[onerror]"), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
