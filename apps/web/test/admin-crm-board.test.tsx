import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { detailOf, empty, fakeFetch, installDom, makeButton, session, setValue, staffA, summary, task } from "./support/crm-fixtures";
const { dom, container } = installDom();
const { createRoot } = await import("react-dom/client");
const { CrmBoard } = await import("../components/admin/crm-board");
const button = makeButton(container);
const columnWidth = 220, cardHeight = 100;
// JSDOM lays nothing out: columns sit side by side, cards stack inside their column.
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const element = this as HTMLElement;
  const column = element.closest<HTMLElement>("[data-stage-column]");
  const columns = [...document.querySelectorAll<HTMLElement>("[data-stage-column]")];
  const columnIndex = column ? columns.indexOf(column) : -1;
  const left = columnIndex >= 0 ? columnIndex * columnWidth : 0;
  const card = element.closest<HTMLElement>("[data-card]");
  if (card && column) {
    const cards = [...column.querySelectorAll<HTMLElement>("[data-card]")];
    const top = cards.indexOf(card) * cardHeight + 40;
    return { x: left + 10, y: top, left: left + 10, top, width: columnWidth - 20, right: left + columnWidth - 10, height: cardHeight - 10, bottom: top + cardHeight - 10, toJSON() { return this; } } as DOMRect;
  }
  const width = columnIndex >= 0 ? columnWidth : columns.length * columnWidth;
  return { x: left, y: 0, left, top: 0, width, right: left + width, height: 600, bottom: 600, toJSON() { return this; } } as DOMRect;
};
async function pointer(target: Element, type: string, x: number, y = 60) {
  await act(async () => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, "isPrimary", { value: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    target.dispatchEvent(event);
    // A browser emits a click after pointerup; dnd-kit consumes exactly one to suppress post-drag clicks.
    if (type === "pointerup") target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
const columnOf = (name: string) => container.querySelector(`[data-card][data-name="${name}"]`)?.closest<HTMLElement>("[data-stage-column]")?.dataset.stageColumn;
const rows = { new: [summary(1, { name: "Asha Rao", assignedToId: staffA.id }), summary(2, { name: "Rahul K", product: "" })], contacted: [summary(3, { name: "Meera Iyer", status: "contacted", version: 2 })], quoted: [], won: [], lost: [] };
function transport(onWrite: (path: string, body: any) => Response | Promise<Response>) {
  return fakeFetch((path, options) => {
    if (options?.method === "POST") return onWrite(path, JSON.parse(String(options.body)));
    if (path.includes("/assignees")) return Response.json({ items: [staffA], nextCursor: null });
    if (path.includes("/crm/tasks")) return Response.json({ items: [task("c000000000000000000000t01", { enquiryId: rows.new[0]!.id, dueOn: "2030-01-09" }), task("c000000000000000000000t02", { enquiryId: rows.new[1]!.id, dueOn: "2030-01-10" })], nextCursor: null });
    const stage = new URL(path, "http://localhost").searchParams.get("status") as keyof typeof rows | null;
    if (path.startsWith("/api/admin/enquiries?") && stage) return Response.json({ items: rows[stage], nextCursor: null });
    return Response.json(empty);
  });
}

test("board renders one column per stage with cards showing name, product, age, assignee initials and due indicators", async () => {
  const previous = fetch; const paths: string[] = [];
  globalThis.fetch = fakeFetch((path, options) => { paths.push(path); return transport(() => Response.json({}))(path, options); });
  const root = createRoot(container);
  const opened: string[] = [], contacts: string[] = [];
  try {
    await act(async () => root.render(<CrmBoard session={session} onDenied={() => {}} onOpenEnquiry={id => opened.push(id)} onOpenContact={id => contacts.push(id)} today="2030-01-10" />));
    const columns = [...container.querySelectorAll<HTMLElement>("[data-stage-column]")].map(column => column.dataset.stageColumn);
    assert.deepEqual(columns, ["new", "contacted", "quoted", "won", "lost"]);
    assert.ok(paths.some(path => path.includes("status=new") && path.includes("limit=50")));
    assert.ok(paths.some(path => path.includes("/crm/tasks?") && path.includes("view=open") && path.includes("today=2030-01-10")));
    const asha = container.querySelector<HTMLElement>('[data-card][data-name="Asha Rao"]')!;
    assert.ok(asha, "card for Asha");
    assert.match(asha.textContent!, /Nimbus sofa/);
    assert.match(asha.textContent!, /3d/, "age of the enquiry relative to today");
    assert.equal(asha.querySelector("[data-avatar]")?.textContent?.trim(), "PM", "assignee initials from the directory");
    assert.equal(asha.querySelector("[data-due]")?.getAttribute("data-due"), "overdue");
    const rahul = container.querySelector<HTMLElement>('[data-card][data-name="Rahul K"]')!;
    assert.equal(rahul.querySelector("[data-due]")?.getAttribute("data-due"), "today");
    assert.equal(rahul.querySelector("[data-avatar]"), null, "unassigned cards show no avatar");
    assert.match(rahul.textContent!, /no product/i);
    assert.match(container.querySelector('[data-stage-column="quoted"]')!.textContent!, /nothing quoted yet/i, "empty columns are composed, not blank");
    await act(async () => asha.querySelector<HTMLButtonElement>('button[aria-label="Open enquiry from Asha Rao"]')!.click());
    await act(async () => asha.querySelector<HTMLButtonElement>('button[aria-label="Open contact for Asha Rao"]')!.click());
    assert.deepEqual(opened, [rows.new[0]!.id]); assert.deepEqual(contacts, [rows.new[0]!.contactId]);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("dragging a card to another column saves the stage, and a server rejection rolls the card back", async () => {
  const previous = fetch; const writes: { path: string; body: any; csrf: string | null }[] = []; let reject = false;
  const inner = transport((_path, body) => reject ? Response.json({ code: "ENQUIRY_VERSION_CONFLICT" }, { status: 409 }) : Response.json(detailOf(rows.new[0]!, { status: body.stage, version: 1 })));
  globalThis.fetch = async (url, options) => { if (options?.method === "POST") writes.push({ path: String(url), body: JSON.parse(String(options.body)), csrf: new Headers(options.headers).get("X-CSRF-Token") }); return inner(url, options); };
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CrmBoard session={session} onDenied={() => {}} onOpenEnquiry={() => {}} onOpenContact={() => {}} today="2030-01-10" />));
    const card = container.querySelector<HTMLElement>('[data-card][data-name="Asha Rao"]')!;
    const handle = card.querySelector<HTMLElement>("[data-drag-handle]") ?? card;
    await pointer(handle, "pointerdown", 110);
    await pointer(document.body, "pointermove", 130);
    await pointer(document.body, "pointermove", 330);
    assert.equal(container.querySelector('[data-stage-column="contacted"]')?.getAttribute("data-drop-active"), "true", "the target column highlights while a card hovers over it");
    await pointer(document.body, "pointerup", 330);
    assert.equal(columnOf("Asha Rao"), "contacted");
    const write = writes[0]!;
    assert.equal(write.path, `/api/admin/enquiries/${rows.new[0]!.id}/stage`);
    assert.deepEqual(write.body, { expectedVersion: 0, stage: "contacted" });
    assert.equal(write.csrf, session.csrfToken);
    assert.equal(container.querySelector('[data-stage-column="contacted"] [data-card][data-name="Asha Rao"]')?.getAttribute("data-version"), "1", "the card adopts the server version");
    reject = true;
    const moved = container.querySelector<HTMLElement>('[data-card][data-name="Asha Rao"]')!;
    await pointer(moved.querySelector<HTMLElement>("[data-drag-handle]") ?? moved, "pointerdown", 330);
    await pointer(document.body, "pointermove", 350);
    await pointer(document.body, "pointermove", 550);
    await pointer(document.body, "pointerup", 550);
    assert.equal(columnOf("Asha Rao"), "contacted", "a rejected move returns the card to its previous column");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
    assert.equal(writes.length, 2);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("the keyboard move control needs a reason before a card becomes lost, and dropping in place changes nothing", async () => {
  const previous = fetch; const writes: any[] = [];
  globalThis.fetch = transport((path, body) => { writes.push({ path, body }); return Response.json(detailOf(rows.contacted[0]!, { status: body.stage, version: 3, lostReason: body.reason ?? null })); });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CrmBoard session={session} onDenied={() => {}} onOpenEnquiry={() => {}} onOpenContact={() => {}} today="2030-01-10" />));
    const card = container.querySelector<HTMLElement>('[data-card][data-name="Meera Iyer"]')!;
    await pointer(card.querySelector<HTMLElement>("[data-drag-handle]") ?? card, "pointerdown", 330);
    await pointer(document.body, "pointermove", 340);
    await pointer(document.body, "pointerup", 340);
    assert.equal(writes.length, 0, "dropping in the same column does not write");
    await setValue(dom, card.querySelector('select[aria-label="Move Meera Iyer to"]'), "lost", "change");
    assert.equal(writes.length, 0, "lost waits for a reason");
    const reason = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reason for losing"]');
    assert.ok(reason, "a reason field appears");
    assert.equal(button("Confirm lost").disabled, true);
    await setValue(dom, reason, "Went with another supplier");
    await act(async () => button("Confirm lost").click());
    assert.deepEqual(writes, [{ path: `/api/admin/enquiries/${rows.contacted[0]!.id}/stage`, body: { expectedVersion: 2, stage: "lost", reason: "Went with another supplier" } }]);
    assert.equal(columnOf("Meera Iyer"), "lost");
    assert.match(container.querySelector('[data-stage-column="lost"] [data-card]')?.textContent ?? "", /another supplier/);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("a failed column load shows an inline error with retry instead of an empty board", async () => {
  const previous = fetch; let failing = true;
  globalThis.fetch = fakeFetch((path) => { if (path.includes("status=won") && failing) return Response.json({}, { status: 500 }); return transport(() => Response.json({}))(path); });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CrmBoard session={session} onDenied={() => {}} onOpenEnquiry={() => {}} onOpenContact={() => {}} today="2030-01-10" />));
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /couldn't load/i);
    assert.ok(container.querySelector('[data-stage-column="new"] [data-card]'), "healthy columns still render");
    failing = false; await act(async () => button("Reload board").click());
    assert.equal(container.querySelector('[role="alert"]'), null);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
