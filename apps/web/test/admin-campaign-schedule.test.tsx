import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { StorefrontContent } from "@shopmaple/contracts";
import { CampaignFields } from "../components/admin/forms";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/admin" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});

async function editor(initial = structuredClone(defaultStorefrontContent)) {
  let content = initial;
  let changes = 0;
  function Editor() {
    const [value, setValue] = useState(initial);
    return <CampaignFields content={value} onChange={(next) => {
      content = next;
      changes++;
      setValue(next);
    }} />;
  }
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  await act(async () => root.render(<Editor />));
  const button = (label: string) => {
    const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label);
    assert.ok(found, `Expected ${label} control`);
    return found;
  };
  const input = (label: string) => {
    const found = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
    assert.ok(found, label);
    return found;
  };
  return {
    container, input, button,
    get content() { return content; },
    get changes() { return changes; },
    click: async (label: string) => { await act(async () => button(label).click()); },
    fill: async (label: string, value: string) => {
      const field = input(label);
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
        field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    },
    select: async (index: number) => {
      await act(async () => {
        const select = container.querySelector<HTMLSelectElement>('[aria-label="Campaign"]')!;
        select.value = String(index);
        select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    },
    dispose: async () => { await act(async () => root.unmount()); },
  };
}

test("campaign copy editing preserves the selected campaign, artwork, and other draft content", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  const ui = await editor(initial);
  try {
    assert.equal(ui.changes, 0, "Opening campaigns must not edit the draft");
    await ui.select(1);
    await ui.fill("Campaign label", "Festival at home");
    assert.equal(ui.content.campaigns[1]!.label, "Festival at home");
    assert.equal(ui.input("Campaign label").value, "Festival at home");
    assert.deepEqual(ui.content.campaigns[0], initial.campaigns[0]);
    assert.deepEqual(ui.content.campaigns[1], { ...initial.campaigns[1], label: "Festival at home" });
    assert.deepEqual(ui.content.homeCopy, initial.homeCopy);
  } finally { await ui.dispose(); }
});

test("India schedule applies explicit instants to only the selected campaign and preserves copy edits", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  const ui = await editor(initial);
  try {
    assert.match(ui.container.textContent!, /Always visible/, "Legacy campaigns must be identified as always visible");
    await ui.select(1);
    await ui.click("Enable schedule");
    await ui.fill("Starts at (India time)", "2026-11-01T00:15");
    await ui.fill("Ends at (India time)", "2026-11-02T23:45");
    await ui.fill("Campaign label", "Scheduled festival");
    assert.equal(ui.input("Starts at (India time)").value, "2026-11-01T00:15");
    assert.equal(ui.changes, 1, "Pending schedule must not mutate the draft");
    await ui.click("Apply schedule to draft");
    assert.deepEqual(ui.content.campaigns[1], {
      ...initial.campaigns[1], label: "Scheduled festival",
      schedule: { startsAt: "2026-10-31T18:45:00.000Z", endsAt: "2026-11-02T18:15:00.000Z" },
    });
    assert.deepEqual(ui.content.campaigns[0], initial.campaigns[0]);
    assert.match(ui.container.textContent!, /Asia\/Kolkata.*UTC\+05:30/);
    assert.match(ui.container.textContent!, /Save draft.*Publish draft/);
    await ui.click("Edit schedule");
    assert.equal(ui.input("Starts at (India time)").value, "2026-11-01T00:15");
    assert.equal(ui.input("Ends at (India time)").value, "2026-11-02T23:45");
    await ui.fill("Ends at (India time)", "2026-11-01T00:15");
    assert.equal(ui.button("Apply schedule to draft").disabled, true);
    assert.match(ui.container.querySelector('[role="alert"]')!.textContent!, /after the start/i);
    await ui.fill("Ends at (India time)", "2026-10-31T23:45");
    assert.equal(ui.button("Apply schedule to draft").disabled, true);
    await ui.click("Cancel schedule edit");
    assert.equal(ui.content.campaigns[1]!.schedule!.endsAt, "2026-11-02T18:15:00.000Z");
    await ui.click("Clear schedule");
    assert.equal(ui.content.campaigns[1]!.schedule, null);
    assert.match(ui.container.textContent!, /Always visible/);
  } finally { await ui.dispose(); }
});

test("incomplete date entry cannot apply or accidentally clear a bound; blank bounds can be deliberately applied", async () => {
  const ui = await editor();
  try {
    await ui.click("Enable schedule");
    const start = ui.input("Starts at (India time)");
    Object.defineProperty(start, "validity", { configurable: true, value: { badInput: true, valid: false } });
    await ui.fill("Starts at (India time)", "");
    assert.equal(ui.button("Apply schedule to draft").disabled, true);
    assert.equal(ui.changes, 0);
    assert.match(ui.container.querySelector('[role="alert"]')!.textContent!, /complete.*date/i);
    delete (start as unknown as Record<string, unknown>).validity;
    await ui.fill("Starts at (India time)", "2026-11-01T00:15");
    await ui.fill("Starts at (India time)", "");
    await ui.click("Apply schedule to draft");
    assert.deepEqual(ui.content.campaigns[0]!.schedule, { startsAt: null, endsAt: null });
    assert.match(ui.container.textContent!, /Always visible/);
  } finally { await ui.dispose(); }
});

test("editing an existing schedule preserves seconds and milliseconds instead of shortening its visibility window", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  initial.campaigns[0]!.schedule = {
    startsAt: "2026-10-31T18:45:27.123Z",
    endsAt: "2026-11-02T18:15:09.000Z",
  };
  const ui = await editor(initial);
  try {
    await ui.click("Edit schedule");
    assert.equal(ui.input("Starts at (India time)").value, "2026-11-01T00:15:27.123");
    assert.equal(ui.input("Ends at (India time)").value, "2026-11-02T23:45:09.000");
    await ui.click("Apply schedule to draft");
    assert.deepEqual(ui.content.campaigns[0]!.schedule, initial.campaigns[0]!.schedule);
  } finally { await ui.dispose(); }
});

test("pending schedules block parent save and publish until cancelled or applied", async () => {
  const previous = globalThis.fetch;
  const initial = structuredClone(defaultStorefrontContent);
  const writes: StorefrontContent[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") writes.push(JSON.parse(String(init.body)).content);
    return Response.json({ version: 4 + writes.length, draft: writes.at(-1) ?? initial, publishedVersion: 3, updatedAt: null });
  };
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const button = (name: string) => {
    const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === name);
    assert.ok(found, `Expected ${name} control`);
    return found;
  };
  const click = async (name: string) => { await act(async () => button(name).click()); };
  try {
    await act(async () => root.render(<ContentEditor
      initialContent={initial}
      session={{ user: { id: "staff", email: "publisher@example.invalid", role: "publisher" }, csrfToken: "a".repeat(64) }}
      onExpired={() => {}}
    />));
    await click("Campaigns");
    assert.equal(button("Publish draft").disabled, false);
    await click("Enable schedule");
    assert.equal(button("Save draft").disabled, true);
    assert.equal(button("Publish draft").disabled, true);
    assert.equal(button("Homepage").disabled, true);
    assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="Campaign"]')!.disabled, true);
    await click("Save draft");
    await click("Publish draft");
    assert.equal(writes.length, 0);
    await click("Cancel schedule edit");
    assert.equal(button("Publish draft").disabled, false);
    await act(async () => {
      const label = container.querySelector<HTMLInputElement>('[aria-label="Campaign label"]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(label, "Saved festival");
      label.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(button("Save draft").disabled, false);
    await click("Enable schedule");
    assert.equal(button("Save draft").disabled, true, "Pending schedule must also block saving an already dirty draft");
    await act(async () => {
      const start = container.querySelector<HTMLInputElement>('[aria-label="Starts at (India time)"]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(start, "2026-11-01T00:15");
      start.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await click("Apply schedule to draft");
    assert.equal(button("Save draft").disabled, false);
    assert.equal(button("Publish draft").disabled, true);
    await click("Save draft");
    assert.deepEqual(writes[0]!.campaigns[0]!.schedule, { startsAt: "2026-10-31T18:45:00.000Z", endsAt: null });
    assert.equal(writes[0]!.campaigns[0]!.label, "Saved festival");
    assert.equal(button("Publish draft").disabled, false);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
