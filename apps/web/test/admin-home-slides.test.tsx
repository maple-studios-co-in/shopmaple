import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { homeDetailsSchema, type HomeDetails } from "@shopmaple/contracts";
import { defaultHomeDetails } from "../lib/home-details-defaults";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { HomeDetailFields } = await import("../components/admin/home-details-fields");
const container = document.getElementById("root")!;
const upload = "/media/uploads/" + "a".repeat(64) + ".webp";

let latest: HomeDetails | undefined;
function Host({ section, initial }: { section: "hero" | "nimbus"; initial?: HomeDetails }) {
  const [value, setValue] = useState<HomeDetails | undefined>(initial);
  latest = value;
  return <HomeDetailFields section={section} value={value} session={{ user: { id: "editor", email: "editor@example.test", role: "editor" }, csrfToken: "c".repeat(64) }}
    onExpired={() => assert.fail("Unexpected expiry")} onChange={next => { latest = next; setValue(next); }} />;
}
async function mount(section: "hero" | "nimbus", initial?: HomeDetails) {
  const root = createRoot(container);
  await act(async () => root.render(<Host section={section} initial={initial} />));
  return async () => { await act(async () => root.unmount()); };
}
const field = <T extends HTMLElement = HTMLInputElement>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`);
function button(name: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
const click = (name: string) => act(async () => button(name).click());
async function fill(label: string, value: string) {
  const input = field<HTMLInputElement | HTMLTextAreaElement>(label);
  assert.ok(input, `Missing ${label} field`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function choose(label: string, value: string) {
  const select = field<HTMLSelectElement>(label);
  assert.ok(select, `Missing ${label} select`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}
const slides = () => latest?.hero.slides;

test("hero: editing other hero text never adds a slides field to an older document", async () => {
  const close = await mount("hero", structuredClone(defaultHomeDetails));
  try {
    await fill("Hero collection button", "See more");
    assert.equal(latest!.hero.cta, "See more");
    assert.equal("slides" in latest!.hero, false);
  } finally { await close(); }
});

test("nimbus: a fresh draft follows the Nimbus card with Terra, and nothing more", async () => {
  const close = await mount("nimbus");
  try {
    assert.equal(field("Nimbus collection 1 heading")?.value, "The Terra Collection");
    assert.equal(field("Nimbus collection 1 image")?.value, "/media/home/nimbus-terra.webp");
    assert.ok(!field("Nimbus collection 2 heading"));
  } finally { await close(); }
});

/** A document saved before Terra joined the defaults: the Nimbus card alone. */
function nimbusOnly() {
  const details = structuredClone(defaultHomeDetails);
  delete details.nimbus.slides;
  return details;
}

test("nimbus: more collections are added, filled in, moved and removed, up to five", async () => {
  const close = await mount("nimbus", nimbusOnly());
  try {
    assert.equal(field("Nimbus collection 1 heading"), null, "none until added");
    await click("Add nimbus collection");
    await fill("Nimbus collection 1 heading", "The Terra Collection");
    await fill("Nimbus collection 1 tagline", "Earthy and warm");
    await fill("Nimbus collection 1 button", "Shop Terra");
    await fill("Nimbus collection 1 link", "/collections/terra");
    for (const n of [1, 2, 3, 4]) await fill(`Nimbus collection 1 feature ${n}`, `Feature ${n}`);
    await fill("Nimbus collection 1 image", upload);
    await fill("Nimbus collection 1 mobile image", upload);
    await fill("Nimbus collection 1 image description", "Terra sofa");
    assert.deepEqual(latest!.nimbus.slides, [{
      heading: "The Terra Collection", tagline: "Earthy and warm", cta: "Shop Terra", href: "/collections/terra",
      features: ["Feature 1", "Feature 2", "Feature 3", "Feature 4"], image: upload, mobileImage: upload, alt: "Terra sofa",
    }]);
    assert.equal(homeDetailsSchema.safeParse(latest).success, true);
    await click("Add nimbus collection");
    await fill("Nimbus collection 2 heading", "Second");
    await click("Move nimbus collection 2 up");
    assert.deepEqual(latest!.nimbus.slides!.map(slide => slide.heading), ["Second", "The Terra Collection"]);
    for (let n = 0; n < 3; n++) await click("Add nimbus collection");
    assert.equal(latest!.nimbus.slides!.length, 5);
    assert.equal(button("Add nimbus collection").disabled, true, "at most five");
    for (let n = 0; n < 5; n++) await click("Remove nimbus collection 1");
    assert.equal("slides" in latest!.nimbus, false, "no extra collections means no field, as before");
    assert.equal(field("Nimbus heading")!.value, "The Nimbus Collection", "the base card's fields are untouched");
  } finally { await close(); }
});
