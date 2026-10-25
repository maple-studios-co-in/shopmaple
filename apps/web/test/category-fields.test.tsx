import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CategoryPageContent } from "@shopmaple/contracts";
import { CategoryFields } from "../components/admin/category-fields";

const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost/admin",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const container = document.getElementById("root")!;
test("category editor starts with original copy and emits only the selected page after editing, moving, and hiding sections", async () => {
  let changed: CategoryPageContent[] = [];
  function Editor() {
    const [value, setValue] = useState<CategoryPageContent[]>([]);
    return (
      <CategoryFields
        value={value}
        onChange={(next) => {
          changed = next;
          setValue(next);
        }}
      />
    );
  }
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Editor />));
    assert.equal(
      container.querySelector<HTMLInputElement>('[aria-label="Sofas title"]')
        ?.value,
      "Sofas",
    );
    assert.equal(
      container.querySelector<HTMLInputElement>('[aria-label="Tables title"]')
        ?.value,
      "Tables",
    );
    assert.equal(
      changed.length,
      0,
      "Opening the editor must not turn defaults into draft edits",
    );
    const fill = async (label: string, value: string) => {
      const input = container.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >(`[aria-label="${label}"]`)!;
      assert.ok(input, label);
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          input.tagName === "TEXTAREA"
            ? dom.window.HTMLTextAreaElement.prototype
            : dom.window.HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    };
    await fill("Sofas title", "Seating made personal");
    await fill("Sofas introduction", "Furniture made for your everyday life.");
    await fill("Sofas wooden-sofas label", "Natural wood sofas");
    await fill("Sofas bestsellers heading", "Your favourites");
    await fill("Sofas grain body", "Beautiful materials that last.");
    const up = container.querySelector<HTMLButtonElement>(
      '[aria-label="Move Sofas sale up"]',
    )!;
    assert.ok(up);
    await act(async () => up.click());
    const show = container.querySelector<HTMLInputElement>(
      '[aria-label="Show Sofas hero"]',
    )!;
    await act(async () => show.click());
    assert.equal(changed.length, 1);
    assert.equal(changed[0]!.slug, "sofas");
    assert.equal(changed[0]!.title, "Seating made personal");
    assert.equal(
      changed[0]!.introduction,
      "Furniture made for your everyday life.",
    );
    assert.deepEqual(
      changed[0]!.sections.slice(0, 3).map((section) => section.key),
      ["hero", "sale", "categories"],
    );
    assert.equal(
      changed[0]!.sections.find((section) => section.key === "hero")!.enabled,
      false,
    );
    assert.equal(
      changed[0]!.sections
        .find((section) => section.key === "categories")!
        .items!.find((item) => item.key === "wooden-sofas")!.title,
      "Natural wood sofas",
    );
    assert.equal(
      changed[0]!.sections.find((section) => section.key === "bestsellers")!
        .heading,
      "Your favourites",
    );
    assert.equal(
      changed[0]!.sections.find((section) => section.key === "values")!
        .items![0]!.body,
      "Beautiful materials that last.",
    );
    assert.equal(
      container.querySelector<HTMLInputElement>('[aria-label="Tables title"]')
        ?.value,
      "Tables",
    );
    assert.equal(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Move Sofas hero up"]',
      )!.disabled,
      true,
    );
    assert.equal(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Move Sofas paired-products down"]',
      )!.disabled,
      true,
    );
  } finally {
    await act(async () => root.unmount());
  }
});
