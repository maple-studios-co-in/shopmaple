import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { CategoryIntro } from "../components/store/category-intro";
import categories from "../data/landing-categories.json";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/pages/sofas" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import("react-dom/client");
const container = document.getElementById("root")!;

async function mount(description: string) {
  const root = createRoot(container);
  await act(async () => root.render(<CategoryIntro title="Sofas" description={description} />));
  return async () => { await act(async () => root.unmount()); };
}

test("original sofa introduction retains its initial excerpt and Read More control", async () => {
  const cleanup = await mount(categories.sofas.description);
  try {
    assert.equal(container.querySelector("h1")?.textContent, "Sofas");
    assert.equal(container.querySelector("[data-category-intro] p")?.textContent, "A sofa is not just the most used piece in a living room. It is where the home slows down. From morning coffee to family conversations, movie nights, guests, celebrations, and quiet moments alone, t...");
    assert.equal(container.querySelector("button")?.textContent, "Read more");
    assert.equal(container.querySelector("button")?.getAttribute("aria-expanded"), "false");
  } finally { await cleanup(); }
});

test("long normalized introduction expands completely and collapses through its accessible control", async () => {
  const prefix = "A".repeat(197);
  const cleanup = await mount(` \n${prefix}\t complete description. \n`);
  try {
    const paragraph = container.querySelector("[data-category-intro] p")!;
    const button = container.querySelector("button")!;
    assert.equal(paragraph.textContent, `${prefix}...`);
    assert.equal(button.getAttribute("aria-controls"), paragraph.id);
    assert.equal(button.textContent, "Read more");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    await act(async () => button.click());
    assert.equal(paragraph.textContent, `${prefix} complete description.`);
    assert.equal(button.textContent, "Read less");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    await act(async () => button.click());
    assert.equal(paragraph.textContent, `${prefix}...`);
    assert.equal(button.textContent, "Read more");
    assert.equal(button.getAttribute("aria-expanded"), "false");
  } finally { await cleanup(); }
});

for (const [label, description, expected] of [
  ["short sentence", "Made for your family and your home.", "Made for your family and your home."],
  ["198 characters", "A".repeat(198), "A".repeat(198)],
  ["200 characters", "B".repeat(200), "B".repeat(200)],
  ["empty description", "", ""],
  ["whitespace-only description", " \n\t ", ""],
  ["raw text longer than 200 but short normalized copy", `${" ".repeat(210)}Made\n\t for home.`, "Made for home."],
  ["normalized text exactly 200 characters", ` \n${"C".repeat(198)}\t D \n`, `${"C".repeat(198)} D`],
] as const) {
  test(`${label} displays completely without invented ellipsis or expansion control`, async () => {
    const cleanup = await mount(description);
    try {
      assert.equal(container.querySelector("[data-category-intro] p")?.textContent, expected);
      assert.equal(container.querySelectorAll("button").length, 0);
    } finally { await cleanup(); }
  });
}

test("raw whitespace does not invent an expansion control for a normalized short introduction", async () => {
  const cleanup = await mount(`${"\n ".repeat(110)}Welcome home.`);
  try {
    assert.equal(container.querySelectorAll("button").length, 0);
  } finally { await cleanup(); }
});
