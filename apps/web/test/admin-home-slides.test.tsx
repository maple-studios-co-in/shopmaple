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

test("hero: with no slides staff see the default stills are in use, and adding a slide adds one blank slide", async () => {
  const close = await mount("hero");
  try {
    assert.match(container.textContent ?? "", /four stills/i);
    assert.doesNotMatch(container.textContent ?? "", /shop film/i, "the Shopify film is gone, so it is never offered");
    assert.equal(field("Hero slide 1 headline"), null, "no slide rows until one is added");
    await click("Add hero slide");
    assert.equal(slides()?.length, 1);
    assert.deepEqual(slides()![0], { kind: "image", src: "", alt: "", headline: "", intro: "" });
    assert.equal(field("Hero slide 1 headline")!.value, "", "the new slide starts blank");
    assert.equal(field("Hero slide 2 headline"), null);
  } finally { await close(); }
});

test("hero: editing a slide's kind, media, description and words, and a video's poster", async () => {
  const close = await mount("hero");
  try {
    await click("Add hero slide");
    assert.equal(field("Hero slide 1 kind")!.value, "image", "a new slide is an image");
    assert.equal(field("Hero slide 1 poster address"), null, "an image has no poster field");
    await fill("Hero slide 1 media address", upload);
    await fill("Hero slide 1 image description", "A walnut sofa");
    await fill("Hero slide 1 headline", "Sofas that last");
    await fill("Hero slide 1 intro", "Built to be lived in.");
    await choose("Hero slide 1 kind", "video");
    assert.equal(slides()![0]!.kind, "video");
    assert.ok(field("Hero slide 1 poster address"), "a video needs a poster");
    assert.match(container.textContent ?? "", /Maple media address \(one starting \/media\/\)/);
    assert.doesNotMatch(container.textContent ?? "", /Shopify/, "staff are never told to host on Shopify");
    assert.match(container.textContent ?? "", /media library only uploads images/);
    await fill("Hero slide 1 media address", "/media/films/workshop.mp4");
    await fill("Hero slide 1 poster address", upload);
    assert.deepEqual(slides()![0], { kind: "video", src: "/media/films/workshop.mp4", poster: upload, alt: "A walnut sofa", headline: "Sofas that last", intro: "Built to be lived in." });
    assert.equal(homeDetailsSchema.safeParse(latest).success, true, "what staff entered is valid content");
    await fill("Hero slide 1 media address", "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/x/x.mp4");
    assert.equal(homeDetailsSchema.safeParse(latest).success, false, "a film on Shopify is no longer valid content");
  } finally { await close(); }
});

test("hero: slides move, are removed down to one, stop at six, and can go back to the default stills", async () => {
  const close = await mount("hero");
  try {
    await click("Add hero slide");
    await fill("Hero slide 1 headline", "First");
    await click("Add hero slide");
    await fill("Hero slide 2 headline", "Second");
    await click("Move hero slide 2 up");
    assert.deepEqual(slides()!.map(slide => slide.headline), ["Second", "First"]);
    assert.equal(field("Hero slide 1 headline")!.value, "Second");
    for (let n = 0; n < 4; n++) await click("Add hero slide");
    assert.equal(slides()!.length, 6);
    assert.equal(button("Add hero slide").disabled, true, "at most six");
    for (let n = 0; n < 5; n++) await click("Remove hero slide 1");
    assert.equal(slides()!.length, 1);
    assert.equal(button("Remove hero slide 1").disabled, true, "the last slide stays; use the button that goes back to the defaults instead");
    await click("Use the default stills");
    assert.equal(latest!.hero.slides, undefined);
    assert.equal("slides" in latest!.hero, false, "the key is gone, as in documents published before slides");
    assert.equal(field("Hero slide 1 headline"), null);
  } finally { await close(); }
});

test("hero: an image slide can take its picture from the media library", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(String(input), "/api/admin/media");
    return Response.json({ assets: [{ id: "asset1", sha256: "a".repeat(64), label: "Living room", width: 100, height: 100, bytes: 100, mimeType: "image/webp", createdAt: "2026-10-26T00:00:00Z", publicAt: null, url: upload, previewUrl: `/api/admin/media/${"a".repeat(64)}/preview` }], nextCursor: null });
  };
  const close = await mount("hero");
  try {
    await click("Add hero slide");
    await click("Add hero slide");
    await choose("Hero slide 1 kind", "video");
    assert.equal(container.querySelectorAll('[data-slide-picker="src"]').length, 1, "only the image slide offers the library for its picture");
    assert.equal(container.querySelectorAll('[data-slide-picker="poster"]').length, 1, "the video slide offers it for its poster");
    await act(async () => container.querySelector<HTMLElement>('[data-slide-picker="src"] button')!.click());
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    await click("Use image: Living room");
    assert.equal(slides()![1]!.src, upload);
  } finally { globalThis.fetch = previous; await close(); }
});

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
