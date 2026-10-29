import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { contactId, empty, enquiryId, fakeFetch, installDom, makeButton, session, setValue, staffA, task } from "./support/crm-fixtures";
const { dom, container } = installDom();
const { createRoot } = await import("react-dom/client");
const { TaskPanel, TaskViews } = await import("../components/admin/crm-tasks");
const button = makeButton(container);
const control = (label: string) => container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);

test("the enquiry panel lists open and done follow-ups, creates one with assignee and note, and completes it", async () => {
  const previous = fetch; const paths: string[] = []; const writes: { path: string; body: any; csrf: string | null }[] = [];
  let open = [task("c000000000000000000000t01", { title: "Send quote", dueOn: "2030-01-09", note: "Walnut finish" })];
  let done = [task("c000000000000000000000t02", { title: "Call back", dueOn: "2030-01-02", done: true, completedAt: "2030-01-02T10:00:00.000Z", version: 1 })];
  globalThis.fetch = fakeFetch((path, options) => {
    paths.push(path);
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body)); writes.push({ path, body, csrf: new Headers(options.headers).get("X-CSRF-Token") });
      if (path.endsWith("/complete")) { const id = path.split("/").at(-2)!; const current = open.find(t => t.id === id)!; open = open.filter(t => t.id !== id); const finished = { ...current, done: true, completedAt: "2030-01-10T10:00:00.000Z", version: 1 }; done = [finished, ...done]; return Response.json(finished); }
      const created = task("c000000000000000000000t03", { ...body, createdAt: "2030-01-10T00:00:00.000Z" }); open = [...open, created]; return Response.json(created, { status: 201 });
    }
    if (path.includes("/assignees")) return Response.json({ items: [staffA], nextCursor: null });
    if (path.includes("view=done")) return Response.json({ items: done, nextCursor: null });
    if (path.includes("/crm/tasks")) return Response.json({ items: open, nextCursor: null });
    return Response.json(empty);
  });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TaskPanel session={session} onDenied={() => {}} parent={{ enquiryId: enquiryId(1) }} today="2030-01-10" />));
    assert.ok(paths.some(path => path.includes(`view=open`) && path.includes(`enquiryId=${enquiryId(1)}`) && path.includes("today=2030-01-10")));
    const openRow = container.querySelector<HTMLElement>('[data-task="c000000000000000000000t01"]')!;
    assert.match(openRow.textContent!, /Send quote/); assert.match(openRow.textContent!, /Walnut finish/);
    assert.equal(openRow.getAttribute("data-due"), "overdue");
    assert.match(openRow.textContent!, /priya\.menon@example\.invalid/, "assignee resolved from the directory");
    assert.match(container.querySelector('[data-task="c000000000000000000000t02"]')?.textContent ?? "", /Call back/);
    assert.equal(button("Add follow-up").disabled, true, "needs a title and date first");
    await setValue(dom, control("Follow-up title"), "Confirm fabric");
    await setValue(dom, control("Due date"), "2030-01-12", "change");
    await setValue(dom, control("Assign follow-up to"), staffA.id, "change");
    await setValue(dom, control("Follow-up note"), "Ask about <b>teal</b>");
    await act(async () => button("Add follow-up").click());
    assert.deepEqual(writes[0], { path: "/api/admin/crm/tasks", body: { enquiryId: enquiryId(1), title: "Confirm fabric", dueOn: "2030-01-12", assigneeId: staffA.id, note: "Ask about <b>teal</b>" }, csrf: session.csrfToken });
    assert.match(container.querySelector('[data-task="c000000000000000000000t03"]')?.textContent ?? "", /Confirm fabric/);
    assert.equal(container.querySelector("b"), null, "notes render as text");
    assert.equal((control("Follow-up title") as HTMLInputElement).value, "", "the composer clears after saving");
    await act(async () => openRow.querySelector<HTMLButtonElement>('button[aria-label="Mark Send quote done"]')!.click());
    assert.deepEqual(writes[1]!.body, { expectedVersion: 0, done: true });
    assert.equal(writes[1]!.path, "/api/admin/crm/tasks/c000000000000000000000t01/complete");
    assert.equal(container.querySelector('[data-task="c000000000000000000000t01"]')?.getAttribute("data-done"), "true");
    assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /done/i);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("a stale completion explains the conflict and keeps the row until reload", async () => {
  const previous = fetch;
  globalThis.fetch = fakeFetch((path, options) => {
    if (options?.method === "POST") return Response.json({ code: "TASK_VERSION_CONFLICT" }, { status: 409 });
    if (path.includes("/assignees")) return Response.json({ items: [], nextCursor: null });
    if (path.includes("view=done")) return Response.json(empty);
    return Response.json({ items: [task("c000000000000000000000t01", { enquiryId: null, contactId })], nextCursor: null });
  });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TaskPanel session={session} onDenied={() => {}} parent={{ contactId }} today="2030-01-10" />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Mark Send quote done"]')!.click());
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
    assert.equal(container.querySelector('[data-task="c000000000000000000000t01"]')?.getAttribute("data-done"), "false");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("follow-up views switch between overdue, due today, open and done, filter to mine, and link to the parent", async () => {
  const previous = fetch; const paths: string[] = []; const opened: string[] = [], contacts: string[] = [];
  globalThis.fetch = fakeFetch((path, options) => {
    paths.push(path);
    if (options?.method === "POST") return Response.json({});
    if (path.includes("/assignees")) return Response.json({ items: [staffA], nextCursor: null });
    if (path.includes("view=today")) return Response.json(empty);
    if (path.includes("/crm/tasks")) return Response.json({ items: [task("c000000000000000000000t01", { dueOn: "2030-01-08" }), task("c000000000000000000000t04", { enquiryId: null, contactId, title: "Visit showroom", dueOn: "2030-01-09", assigneeId: null })], nextCursor: null });
    return Response.json(empty);
  });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TaskViews session={session} onDenied={() => {}} onOpenEnquiry={id => opened.push(id)} onOpenContact={id => contacts.push(id)} today="2030-01-10" />));
    assert.equal(paths.find(p => p.includes("/crm/tasks")), "/api/admin/crm/tasks?view=overdue&today=2030-01-10");
    const tabs = container.querySelector('[role="tablist"][aria-label="Follow-up filters"]')!;
    assert.deepEqual([...tabs.querySelectorAll('[role="tab"]')].map(tab => tab.textContent?.trim()), ["Overdue", "Due today", "Open", "Done"]);
    const first = container.querySelector<HTMLElement>('[data-task="c000000000000000000000t01"]')!;
    await act(async () => first.querySelector<HTMLButtonElement>('button[aria-label="Open enquiry for Send quote"]')!.click());
    const second = container.querySelector<HTMLElement>('[data-task="c000000000000000000000t04"]')!;
    await act(async () => second.querySelector<HTMLButtonElement>('button[aria-label="Open contact for Visit showroom"]')!.click());
    assert.deepEqual(opened, [enquiryId(1)]); assert.deepEqual(contacts, [contactId]);
    await act(async () => tabs.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(2)')!.click());
    assert.equal(paths.at(-1), "/api/admin/crm/tasks?view=today&today=2030-01-10");
    assert.ok(container.querySelector("[data-empty]")); assert.match(container.textContent!, /nothing due today/i);
    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Only mine"]')!.click());
    assert.equal(paths.at(-1), "/api/admin/crm/tasks?view=today&today=2030-01-10&assignment=mine");
    await act(async () => tabs.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(4)')!.click());
    assert.equal(paths.at(-1), "/api/admin/crm/tasks?view=done&today=2030-01-10&assignment=mine");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
