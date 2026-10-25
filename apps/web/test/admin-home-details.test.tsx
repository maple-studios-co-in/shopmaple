import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";

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
for (const conflict of [false, true]) test(`staff edit homepage details from a legacy draft (${conflict ? "conflict" : "saved"})`, async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const initial = structuredClone(defaultStorefrontContent);
  delete initial.homeDetails;
  let saved: Record<string, any> | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/admin/content", "No automatic publishing or other endpoint");
    if (init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "c".repeat(64));
      saved = JSON.parse(String(init.body));
      if (conflict) return Response.json({ error: "Version conflict" }, { status: 409 });
      return Response.json({ version: 5, draft: saved!.content, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    }
    return Response.json({ version: 4, draft: initial, publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
  };
  try {
    await act(async () => root.render(<ContentEditor
      session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent} onExpired={() => assert.fail("Unexpected expiry")} />));
    await act(async () => button("Homepage").click());
    const panels = [...container.querySelectorAll<HTMLDetailsElement>('[aria-label="Homepage section content"] details')];
    assert.equal(panels.length, 8);
    for (const panel of panels) {
      assert.equal(panel.open, false);
      await act(async () => panel.querySelector<HTMLElement>("summary")!.click());
      assert.equal(panel.open, true);
    }
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Hero collection button"]')?.value, "Explore Collection");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Sofas starting-price label"]')?.value, "Starting from ₹25,000");
    for (const [label, value] of [
      ["Hero collection button", "Explore Maple"],
      ["Sofas tile label", "Sofas for your space"],
      ["Sofas starting-price label", "Ask about our sofas"],
      ["Difference heading", "Built around your home"],
      ["Nimbus tagline", "Soft shapes, lasting comfort"],
      ["Testimonial title", "A personal experience"],
      ["Testimonial paragraph 1", "<img src=x onerror=alert(1)> Real words."],
      ["Newsletter heading", "Stay close to Maple"],
      ["Quiet luxury title", "A quieter home"],
      ["Cities heading", "Across India"],
      ["Project response time", "two working days"],
    ]) await fill(label!, value!);
    button("Add testimonial paragraph").focus();
    await act(async () => button("Add testimonial paragraph").click());
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Testimonial paragraph 5");
    await fill("Testimonial paragraph 5", "One more detail.");
    await act(async () => button("Add testimonial paragraph").click());
    assert.equal(button("Add testimonial paragraph").disabled, true);
    await act(async () => button("Remove testimonial paragraph 6").click());
    assert.equal(document.activeElement, button("Add testimonial paragraph"));
    await act(async () => button("Save draft").click());
    assert.ok(saved);
    assert.equal(saved.expectedVersion, 4);
    const details = saved.content.homeDetails;
    assert.equal(details.hero.cta, "Explore Maple");
    assert.deepEqual(details.hero.tiles.find((tile: any) => tile.key === "sofas"), {key:"sofas",label:"Sofas for your space",priceLabel:"Ask about our sofas"});
    assert.equal(details.difference.heading, "Built around your home");
    assert.equal(details.nimbus.tagline, "Soft shapes, lasting comfort");
    assert.equal(details.testimonial.title, "A personal experience");
    assert.equal(details.testimonial.paragraphs.length, 5);
    assert.equal(details.testimonial.paragraphs[4], "One more detail.");
    assert.equal(details.testimonial.paragraphs[0], "<img src=x onerror=alert(1)> Real words.");
    assert.equal(details.newsletter.heading, "Stay close to Maple");
    assert.equal(details.values.find((item:any) => item.key === "quiet-luxury").title, "A quieter home");
    assert.equal(details.cities.heading, "Across India");
    assert.equal(details.project.responseTime, "two working days");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Hero collection button"]')?.value, "Explore Maple", "Conflict must retain local changes");
    assert.match(container.textContent ?? "", conflict ? /another editor|changed|conflict/i : /Draft saved/);
    assert.equal(container.querySelector("img[onerror]"), null);
    assert.equal([...container.querySelectorAll("button")].some(b => b.textContent === "Publish draft"), false);
    assert.match(container.textContent ?? "", /Published version 2/);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = previous;
  }
});
