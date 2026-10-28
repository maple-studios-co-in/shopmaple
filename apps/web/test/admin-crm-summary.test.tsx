import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { fakeFetch, installDom, makeButton, session } from "./support/crm-fixtures";
const { container } = installDom();
const { createRoot } = await import("react-dom/client");
const { CrmSummary } = await import("../components/admin/crm-summary");
const button = makeButton(container);
const payload = { stages: { new: 3, contacted: 2, quoted: 1, won: 4, lost: 1 }, overdueTasks: 2, dueTodayTasks: 1, newLastSevenDays: 5 };

test("summary shows a skeleton while loading, then one tile per stage plus follow-up and weekly counts", async () => {
  const previous = fetch; let resolve: (value: Response) => void = () => {}; const paths: string[] = [];
  globalThis.fetch = fakeFetch(path => { paths.push(path); return new Promise(r => { resolve = r; }); });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CrmSummary session={session} onExpired={() => { throw Error("unexpected"); }} today="2030-01-10" />));
    const section = container.querySelector('[aria-label="Pipeline summary"]')!;
    assert.equal(section.getAttribute("aria-busy"), "true");
    assert.ok(container.querySelector("[data-skeleton]"), "Loading renders a layout-shaped skeleton");
    assert.equal(paths[0], "/api/admin/crm/summary?today=2030-01-10");
    await act(async () => resolve(Response.json(payload)));
    assert.equal(section.getAttribute("aria-busy"), "false");
    assert.equal(container.querySelector("[data-skeleton]"), null);
    for (const [stage, count] of Object.entries(payload.stages)) assert.equal(container.querySelector(`[data-stat="${stage}"]`)?.textContent?.trim(), String(count), stage);
    assert.equal(container.querySelector('[data-stat="overdue"]')?.textContent?.trim(), "2");
    assert.equal(container.querySelector('[data-stat="today"]')?.textContent?.trim(), "1");
    assert.equal(container.querySelector('[data-stat="week"]')?.textContent?.trim(), "5");
    assert.match(container.textContent!, /overdue/i);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("an empty pipeline gets a composed empty state and a failed load offers a retry", async () => {
  const previous = fetch; let mode: "fail" | "empty" | "ok" = "fail"; let calls = 0;
  globalThis.fetch = fakeFetch(() => { calls++; if (mode === "fail") return Promise.reject(Error("offline")); return Response.json(mode === "empty" ? { stages: { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 }, overdueTasks: 0, dueTodayTasks: 0, newLastSevenDays: 0 } : payload); });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CrmSummary session={session} onExpired={() => {}} today="2030-01-10" />));
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /couldn't load/i);
    mode = "empty"; await act(async () => button("Try again").click());
    assert.equal(calls, 2);
    assert.equal(container.querySelector('[role="alert"]'), null);
    assert.ok(container.querySelector("[data-empty]"), "An empty pipeline is a designed state, not a row of zeros");
    assert.match(container.textContent!, /no enquiries yet/i);
    mode = "ok"; await act(async () => button("Refresh").click());
    assert.equal(container.querySelector("[data-empty]"), null);
    assert.equal(container.querySelector('[data-stat="won"]')?.textContent?.trim(), "4");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("session expiry hands back to sign-in and access denial explains itself", async () => {
  const previous = fetch;
  for (const status of [401, 403]) {
    let expired = 0;
    globalThis.fetch = fakeFetch(() => Response.json({}, { status }));
    const root = createRoot(container);
    try {
      await act(async () => root.render(<CrmSummary session={session} onExpired={() => { expired++; }} today="2030-01-10" />));
      if (status === 401) assert.equal(expired, 1);
      else assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /access/i);
      assert.equal(container.querySelector("[data-stat]"), null);
    } finally { await act(async () => root.unmount()); }
  }
  globalThis.fetch = previous;
});
