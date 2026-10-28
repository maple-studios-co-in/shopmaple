import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  KeyboardEvent: dom.window.KeyboardEvent, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true,
  // dnd-kit restores focus after a drop on the next animation frame; JSDOM has no frame clock.
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
});
const { createRoot } = await import("react-dom/client");
const { SortableList } = await import("../components/admin/sortable-list");
const container = document.getElementById("root")!;
const rowHeight = 40;
// JSDOM lays nothing out. Rows are stacked 40px tall in DOM order so pointer and
// arrow-key positions have independent, predictable meaning.
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const row = (this as HTMLElement).closest("[data-sortable-row]");
  const rows = [...document.querySelectorAll("[data-sortable-row]")];
  const index = row ? rows.indexOf(row) : -1;
  const top = index >= 0 ? index * rowHeight : 0, height = index >= 0 ? rowHeight : rows.length * rowHeight;
  return { x: 0, y: top, top, left: 0, width: 300, right: 300, height, bottom: top + height, toJSON() { return this; } } as DOMRect;
};

type Section = { key: string; enabled: boolean };
const sections: Section[] = [
  { key: "hero", enabled: true }, { key: "announcement", enabled: true },
  { key: "categories", enabled: false }, { key: "ticker", enabled: true },
];
const labels: Record<string, string> = { hero: "Hero", announcement: "Announcement", categories: "Categories", ticker: "Ticker" };

function handle(name: string) {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="Drag ${name}"]`);
  assert.ok(found, `Missing Drag ${name} handle`);
  return found;
}
function order() {
  return [...container.querySelectorAll<HTMLElement>("[data-sortable-row]")].map(row => row.dataset.sectionKey);
}
function announcement() {
  return container.querySelector("[aria-live]")?.textContent?.trim() ?? "";
}
async function key(target: Element, code: string) {
  await act(async () => {
    target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code, key: code === "Space" ? " " : code, bubbles: true, cancelable: true }));
  });
}
async function pointer(target: Element, type: string, y: number) {
  await act(async () => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: y, button: 0 });
    Object.defineProperty(event, "isPrimary", { value: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    target.dispatchEvent(event);
  });
}
async function setup() {
  const root = createRoot(container);
  const reorders: { next: Section[]; moved: Section; from: number; to: number }[] = [];
  let current = sections.map(section => ({ ...section }));
  function render() {
    return <SortableList
      items={current}
      getId={section => section.key}
      getLabel={section => labels[section.key]!}
      className="admin-section-list"
      rowProps={section => ({ "data-section-key": section.key, "aria-label": `Section ${labels[section.key]}` })}
      onReorder={(next, moved, from, to) => { reorders.push({ next, moved, from, to }); current = next; root.render(render()); }}
      renderItem={(section, index, grip) => <><span>{index + 1}. {labels[section.key]}</span>{grip}</>}
    />;
  }
  await act(async () => root.render(render()));
  return { reorders, close: async () => { await act(async () => root.unmount()); } };
}

test("keyboard reordering lifts with space, moves with arrows, drops with space and announces each step", async () => {
  const app = await setup();
  try {
    assert.deepEqual(order(), ["hero", "announcement", "categories", "ticker"]);
    assert.equal(handle("Hero").getAttribute("aria-roledescription"), "sortable");
    assert.match(container.textContent ?? "", /press space or enter/i, "Screen-reader instructions explain the controls");
    handle("Hero").focus();
    await key(handle("Hero"), "Space");
    assert.match(announcement(), /Picked up Hero\. It is in position 1 of 4/);
    await key(handle("Hero"), "ArrowDown");
    assert.match(announcement(), /Hero is now in position 2 of 4/);
    await key(handle("Hero"), "ArrowDown");
    assert.match(announcement(), /Hero is now in position 3 of 4/);
    assert.equal(app.reorders.length, 0, "Nothing is saved until the item is dropped");
    await key(handle("Hero"), "Space");
    assert.equal(app.reorders.length, 1);
    assert.deepEqual(app.reorders[0]!.next.map(section => section.key), ["announcement", "categories", "hero", "ticker"],
      "Dropping produces the same array as pressing Move down twice");
    assert.deepEqual(app.reorders[0]!.next[2], { key: "hero", enabled: true });
    assert.deepEqual([app.reorders[0]!.moved.key, app.reorders[0]!.from, app.reorders[0]!.to], ["hero", 0, 2]);
    assert.match(announcement(), /Hero dropped in position 3 of 4/);
    assert.deepEqual(order(), ["announcement", "categories", "hero", "ticker"]);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(document.activeElement, handle("Hero"), "Focus stays on the moved item's handle");
  } finally { await app.close(); }
});

test("escape cancels a keyboard move and restores the original order", async () => {
  const app = await setup();
  try {
    handle("Ticker").focus();
    await key(handle("Ticker"), "Space");
    await key(handle("Ticker"), "ArrowUp");
    assert.match(announcement(), /Ticker is now in position 3 of 4/);
    await key(handle("Ticker"), "Escape");
    assert.equal(app.reorders.length, 0);
    assert.deepEqual(order(), ["hero", "announcement", "categories", "ticker"]);
    assert.match(announcement(), /cancelled.*Ticker.*position 4 of 4/i);
  } finally { await app.close(); }
});

test("pointer dragging shows a drop indicator and drops into the pointed position", async () => {
  const app = await setup();
  try {
    const grip = handle("Categories");
    await pointer(grip, "pointerdown", 100);
    await pointer(document.body, "pointermove", 90);
    await pointer(document.body, "pointermove", 15);
    const rows = [...container.querySelectorAll<HTMLElement>("[data-sortable-row]")];
    assert.equal(rows[2]!.dataset.dragging, "true");
    assert.equal(rows[0]!.dataset.dropTarget, "before", "The row under the pointer shows where the item will land");
    assert.equal(app.reorders.length, 0);
    await pointer(document.body, "pointerup", 15);
    assert.equal(app.reorders.length, 1);
    assert.deepEqual(app.reorders[0]!.next.map(section => section.key), ["categories", "hero", "announcement", "ticker"]);
    assert.deepEqual([app.reorders[0]!.from, app.reorders[0]!.to], [2, 0]);
    assert.equal(container.querySelector("[data-drop-target]"), null);
    assert.equal(container.querySelector('[data-dragging="true"]'), null);
  } finally { await app.close(); }
});

test("a short press without movement and a drop onto the same slot change nothing", async () => {
  const app = await setup();
  try {
    await pointer(handle("Hero"), "pointerdown", 20);
    await pointer(document.body, "pointerup", 20);
    assert.equal(app.reorders.length, 0);
    assert.deepEqual(order(), ["hero", "announcement", "categories", "ticker"]);
    handle("Hero").focus();
    await key(handle("Hero"), "Space");
    await key(handle("Hero"), "Space");
    assert.equal(app.reorders.length, 0, "Dropping in place is not a change");
  } finally { await app.close(); }
});
