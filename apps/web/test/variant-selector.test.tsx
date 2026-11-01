import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { VariantSelector, type SelectorVariant } from "../components/store/variant-selector";

const variants: SelectorVariant[] = [
  { id: "a", name: "Deep Atlantic", slug: "deep-atlantic", image: "https://example.com/a.jpg" },
  { id: "b", name: "Desert Taupe", slug: "desert-taupe", code: "MF-B" },
];

async function render(props: Partial<React.ComponentProps<typeof VariantSelector>>, check: (doc: Document, selected: string[]) => void) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const selected: string[] = [];
  try {
    await act(async () => root.render(<VariantSelector variants={variants} selectedId="a" onSelect={(id) => selected.push(id)} {...props} />));
    check(dom.window.document, selected);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
}

test("the selector is fed plain variants: a name, an optional slug and an optional image", async () => {
  await render({}, (doc, selected) => {
    assert.equal(doc.querySelector("[data-variants] legend")?.textContent, "Personalise your finish");
    const tiles = [...doc.querySelectorAll<HTMLInputElement>('[data-variants] input[type="radio"]')];
    assert.deepEqual(tiles.map((input) => input.value), ["a", "b"]);
    assert.equal(doc.querySelector("[data-variant-image] img")?.getAttribute("alt"), "");
    assert.equal(doc.querySelectorAll("[data-variant-placeholder]").length, 1, "A variant without an image shows the placeholder");
    assert.equal(doc.querySelector("[data-variant-code]")?.textContent, "Item code: MF-B");
    assert.equal(doc.querySelector("[data-variant-slug]"), null, "Slugs are data for the URL, not shown");
    tiles[1]!.click();
    assert.deepEqual(selected, ["b"]);
  });
});

test("a swatch colour fills a circle that has no photo", async () => {
  await render({ variants: [variants[0]!, { ...variants[1]!, swatch: "#b59f86" }] }, (doc) => {
    assert.equal(doc.querySelectorAll("[data-variant-placeholder]").length, 0);
    assert.equal(doc.querySelector<HTMLElement>("[data-variant-swatch]")?.style.backgroundColor, "rgb(181, 159, 134)");
  });
});

test("text tiles drop the photo box entirely", async () => {
  await render({ layout: "text" }, (doc) => {
    assert.equal(doc.querySelector("[data-variants]")?.getAttribute("data-variants"), "text");
    assert.equal(doc.querySelector("[data-variant-image]"), null);
  });
});
