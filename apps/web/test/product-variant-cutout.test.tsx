import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VariantSelector } from "../components/store/variant-selector";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

test("a variant tile with the piece on white shows it whole on white; a room photo still fills its tile", async () => {
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<VariantSelector selectedId="ivory" onSelect={() => {}} variants={[
    { id: "ivory", name: "Ivory Walnut", image: "https://example.com/ivory-cutout.png", cutout: true },
    { id: "grey", name: "Grey Ebony", image: "https://example.com/grey-room.jpg" },
  ]} />));
  const [ivory, grey] = [...document.querySelectorAll<HTMLElement>("[data-variant-image]")];
  assert.ok(ivory && grey, "both tiles show their photo");
  assert.equal(ivory.dataset.cutout, "true");
  assert.match(ivory.parentElement!.className, /bg-white/);
  assert.match(ivory.parentElement!.className, /\[&_img\]:object-contain/);
  assert.doesNotMatch(ivory.parentElement!.className, /object-cover/);
  assert.equal(grey.dataset.cutout, undefined);
  assert.match(grey.parentElement!.className, /\[&_img\]:object-cover/);
  await act(async () => root.unmount());
});
