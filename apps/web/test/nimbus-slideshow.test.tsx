import assert from "node:assert/strict";
import { shown } from "./support/rendered-src";
import type { TemplateMedia } from "@shopmaple/contracts";
import { test } from "node:test";
import React, { act, Children, isValidElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { NimbusLanding } from "../components/category-nimbus";
import { CategorySlideshow } from "../components/category-controls";

// Mount the actual client island emitted by the server component, retaining its
// real imported content. The unrelated async product server component stays out
// of the client root; neither the slideshow nor its content is mocked.
function slideshow(node: ReactNode): React.ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === CategorySlideshow) return child;
    const nested = slideshow(child.props.children);
    if (nested) return nested;
  }
}

const keeri = (id: string) => `https://store.maplefurnishers.com/media/keeri/${id}.webp`;
const upload = (name: string) => `/media/uploads/${name}.webp`;
// The rooms' original pictures were Shopify files; until staff upload their own, Keeri products' photos stand in.
const photos = new Map([["aurevo", keeri("aurevo")], ["altura-table", keeri("altura")], ["meridian-table", keeri("meridian")]]);
// Staff uploads with distinct desktop and mobile crops.
const uploads: TemplateMedia = [
  { key: "nimbus-slide-living", image: upload("living-wide"), mobileImage: upload("living-tall"), alt: "Living room" },
  { key: "nimbus-slide-bedroom", image: upload("bedroom-wide"), mobileImage: upload("bedroom-tall"), alt: "Bedroom" },
  { key: "nimbus-slide-dining", image: upload("dining-wide"), mobileImage: upload("dining-tall"), alt: "Dining room" },
];
async function withRooms(run: (room: HTMLElement) => Promise<void>, media?: TemplateMedia) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(document.getElementById("root")!);
  try {
    const island = slideshow(NimbusLanding({ media, photos }));
    assert.ok(island, "Nimbus must render its room slideshow");
    await act(async () => root.render(island));
    await run(document.querySelector<HTMLElement>('section[aria-label="Nimbus rooms"]')!);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
}

async function click(room: HTMLElement, name: string) {
  const button = room.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  assert.ok(button, `Missing ${name} control`);
  await act(async () => button.click());
}

test("Nimbus room controls preserve named selection and wrap in both directions", async () => {
  await withRooms(async (room) => {
    assert.equal(room.querySelector("img")?.alt, "Living room");
    assert.equal(room.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label"), "Show Living room");
    await click(room, "Previous room");
    assert.equal(room.querySelector("img")?.alt, "Dining room");
    await click(room, "Next room");
    assert.equal(room.querySelector("img")?.alt, "Living room");
    await click(room, "Show Bedroom");
    assert.equal(room.querySelector("img")?.alt, "Bedroom");
    assert.equal(room.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label"), "Show Bedroom");
  });
});

test("Nimbus rooms show Keeri photos until staff upload their own", async () => {
  await withRooms(async (room) => {
    for (const [alt, photo] of [["Living room", keeri("aurevo")], ["Bedroom", keeri("altura")], ["Dining room", keeri("meridian")]]) {
      assert.equal(room.querySelector("picture img")?.getAttribute("alt"), alt);
      assert.equal(shown(room.querySelector("picture img")!.getAttribute("src")!), photo);
      await click(room, "Next room");
    }
  });
});

test("Nimbus keeps uploaded desktop and mobile artwork paired after next, previous and dot navigation", async () => {
  await withRooms(async (room) => {
    const expected = [
      ["Living room", upload("living-wide"), upload("living-tall")],
      ["Bedroom", upload("bedroom-wide"), upload("bedroom-tall")],
      ["Dining room", upload("dining-wide"), upload("dining-tall")],
    ] as const;
    const check = (index: number) => {
      const [alt, desktop, mobile] = expected[index]!;
      const image = room.querySelector("picture img")!;
      const source = room.querySelector("picture source")!;
      assert.equal(image.getAttribute("alt"), alt);
      assert.equal(shown(image.getAttribute("src")!), desktop, `${alt} desktop artwork`);
      assert.equal(source.getAttribute("media"), "(max-width: 749px)");
      assert.equal(shown(source.getAttribute("srcset")!), mobile, `${alt} mobile artwork`);
    };
    check(0);
    await click(room, "Next room");
    check(1);
    await click(room, "Next room");
    check(2);
    await click(room, "Previous room");
    check(1);
    await click(room, "Show Living room");
    check(0);
    await click(room, "Show Dining room");
    check(2);
  }, uploads);
});
