import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin", pretendToBeVisual: true });
const w = dom.window;
Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
// JSDOM has no layout: rows report a 48px-tall rectangle in DOM order so collision
// detection and keyboard sorting see the same geometry a browser would.
const rowHeight = 48;
w.HTMLElement.prototype.getBoundingClientRect = function () {
  const row = (this as HTMLElement).closest<HTMLElement>("[data-sortable-key]");
  const index = row ? [...row.parentElement!.children].indexOf(row) : -1;
  const top = index < 0 ? 0 : index * rowHeight, height = index < 0 ? 0 : rowHeight;
  return { x: 0, y: top, top, bottom: top + height, left: 0, right: 600, width: 600, height, toJSON() { return {}; } } as DOMRect;
};
w.HTMLElement.prototype.scrollIntoView = () => {};
const { createRoot } = await import("react-dom/client");
const { SortableList, moveItem } = await import("../components/admin/sortable-list");
const container = document.getElementById("root")!;

const swapMove = <T,>(items: readonly T[], from: number, to: number) => {
  const next = [...items];
  for (let index = from; index !== to; index += Math.sign(to - from)) {
    const neighbour = index + Math.sign(to - from);
    [next[index], next[neighbour]] = [next[neighbour]!, next[index]!];
  }
  return next;
};

test("moveItem produces exactly the array the Move up/Move down buttons would after repeated presses", () => {
  for (let length = 1; length <= 6; length++) {
    const items = Array.from({ length }, (_, i) => `item-${i}`);
    for (let from = 0; from < length; from++) for (let to = 0; to < length; to++) {
      assert.deepEqual(moveItem(items, from, to), swapMove(items, from, to), `${length} items, ${from} -> ${to}`);
    }
    assert.deepEqual(items, Array.from({ length }, (_, i) => `item-${i}`), "input is not mutated");
  }
});

const initial = ["Alpha", "Bravo", "Charlie", "Delta"];
function Harness({ onReorder }: { onReorder: (next: string[], move: { from: number; to: number }) => void }) {
  const [items, setItems] = useState(initial);
  return <SortableList items={items} getKey={item => item} getLabel={item => item}
    onReorder={(next, move) => { setItems(next); onReorder(next, move); }}
    renderItem={(item, _index, { handle }) => <>{handle}<span>{item}</span></>} />;
}
const order = () => [...container.querySelectorAll<HTMLElement>("[data-sortable-key]")].map(row => row.dataset.sortableKey);
function handle(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === `Reorder ${label}`);
  assert.ok(found, `Missing Reorder ${label} handle`); return found;
}
const live = () => [...document.querySelectorAll<HTMLElement>('[aria-live="assertive"], [role="status"]')].map(n => n.textContent).join(" ");
async function key(target: Element, code: string, keyName = code === "Space" ? " " : code) {
  await act(async () => { target.dispatchEvent(new w.KeyboardEvent("keydown", { code, key: keyName, bubbles: true, cancelable: true })); });
}
function pointer(type: string, target: Element, clientY: number) {
  const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY, button: 0 });
  Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: 1 }, pointerType: { value: "mouse" } });
  target.dispatchEvent(event);
}
async function mount() {
  const root = createRoot(container); const moves: { next: string[]; move: { from: number; to: number } }[] = [];
  await act(async () => root.render(<Harness onReorder={(next, move) => moves.push({ next, move })} />));
  return { moves, close: async () => { await act(async () => root.unmount()); } };
}

test("keyboard: space lifts, arrows move with position announcements, space drops and saves the new order", async () => {
  const app = await mount();
  try {
    assert.deepEqual(order(), initial);
    const grip = handle("Bravo"); grip.focus();
    await key(grip, "Space");
    assert.match(live(), /Bravo.*position 2 of 4/i);
    await key(grip, "ArrowDown");
    assert.match(live(), /Bravo.*position 3 of 4/i);
    await key(grip, "ArrowDown");
    assert.match(live(), /Bravo.*position 4 of 4/i);
    assert.deepEqual(app.moves, [], "Nothing is saved until the item is dropped");
    await key(grip, "Space");
    assert.deepEqual(app.moves, [{ next: ["Alpha", "Charlie", "Delta", "Bravo"], move: { from: 1, to: 3 } }]);
    assert.deepEqual(order(), ["Alpha", "Charlie", "Delta", "Bravo"]);
    assert.match(live(), /Bravo.*dropped.*position 4 of 4/i);
    assert.equal(document.activeElement, handle("Bravo"), "Focus stays on the moved item's handle");
    await key(handle("Delta"), "Space");
    await key(handle("Delta"), "ArrowUp");
    await key(handle("Delta"), "Space");
    assert.deepEqual(app.moves.at(-1), { next: ["Alpha", "Delta", "Charlie", "Bravo"], move: { from: 2, to: 1 } });
  } finally { await app.close(); }
});

test("keyboard: escape cancels a lift and restores the original order without saving", async () => {
  const app = await mount();
  try {
    const grip = handle("Charlie"); grip.focus();
    await key(grip, "Space");
    await key(grip, "ArrowUp");
    assert.match(live(), /Charlie.*position 2 of 4/i);
    await key(grip, "Escape");
    assert.deepEqual(app.moves, []);
    assert.deepEqual(order(), initial);
    assert.match(live(), /cancel/i);
    assert.match(live(), /Charlie.*position 3/i);
    await key(grip, "Space"); await key(grip, "Space");
    assert.deepEqual(app.moves, [], "Dropping in place changes nothing");
  } finally { await app.close(); }
});

test("pointer: dragging a handle shows a drop indicator on the target row and drops with the same reorder", async () => {
  const app = await mount();
  try {
    const grip = handle("Delta");
    const centre = (index: number) => index * rowHeight + rowHeight / 2;
    await act(async () => pointer("pointerdown", grip, centre(3)));
    await act(async () => pointer("pointermove", document.body, centre(3) - 12));
    await act(async () => pointer("pointermove", document.body, centre(0)));
    const target = container.querySelector<HTMLElement>('[data-sortable-key="Alpha"]');
    assert.equal(target?.dataset.dropTarget, "true", "The row under the pointer is marked as the drop target");
    assert.equal(container.querySelector<HTMLElement>('[data-sortable-key="Delta"]')?.dataset.dragging, "true");
    assert.deepEqual(app.moves, []);
    await act(async () => pointer("pointerup", document.body, centre(0)));
    assert.deepEqual(app.moves, [{ next: ["Delta", "Alpha", "Bravo", "Charlie"], move: { from: 3, to: 0 } }]);
    assert.deepEqual(order(), ["Delta", "Alpha", "Bravo", "Charlie"]);
    assert.equal(container.querySelector("[data-drop-target]"), null, "Indicator clears after the drop");
    assert.equal(container.querySelector("[data-dragging]"), null);
  } finally { await app.close(); }
});

test("handles explain the keyboard controls and are not form submit buttons", async () => {
  const app = await mount();
  try {
    const grip = handle("Alpha");
    assert.equal(grip.type, "button");
    const described = grip.getAttribute("aria-describedby");
    assert.ok(described, "Handle references keyboard instructions");
    assert.match(document.getElementById(described!)?.textContent ?? "", /space.*arrow.*escape/is);
  } finally { await app.close(); }
});
