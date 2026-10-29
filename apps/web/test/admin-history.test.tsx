import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { installUiDom } from "./support/ui-dom";

// History is a table of revisions; a revision's changes against the current draft open in a
// sheet, read from the revision endpoint, with the restore action beside them for publishers.
installUiDom();
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;
const revisions = [
  { id: "rev-5", version: 5, action: "publish", actorEmail: "anil.rao@example.test", createdAt: "2026-10-27T09:30:00Z" },
  { id: "rev-4", version: 4, action: "save", actorEmail: "priya.menon@example.test", createdAt: "2026-10-26T12:00:00Z" },
];

async function open(role: "editor" | "publisher", detail: (id: string) => Response) {
  const previous = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    requests.push(path);
    if (path === "/api/admin/content") return Response.json({ version: 6, draft: structuredClone(defaultStorefrontContent), publishedVersion: 5, updatedAt: "2026-10-27T10:00:00Z" });
    if (path === "/api/admin/content/revisions") return Response.json({ revisions });
    if (path.startsWith("/api/admin/content/revisions/")) return detail(path.split("/").at(-1)!);
    if (path.startsWith("/api/admin/crm/")) return Response.json({ stages: { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 }, overdueTasks: 0, dueTodayTasks: 0, newLastSevenDays: 0 });
    throw new Error(`Unexpected request ${path}`);
  };
  const root = createRoot(container);
  await act(async () => root.render(
    <ContentEditor
      session={{ user: { id: "staff-1", email: "priya.menon@example.test", role, canManageEnquiries: false }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent}
      onExpired={() => assert.fail("Unexpected expiry")}
    />,
  ));
  const history = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Admin sections"] button')].find((b) => b.textContent === "History")!;
  await act(async () => history.click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return { requests, close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

test("history lists revisions in a table and previews a revision's changes in a sheet", async () => {
  const changed = structuredClone(defaultStorefrontContent);
  changed.homeCopy.chairsHeading = "Lounge chairs";
  const app = await open("publisher", (id) => Response.json({ ...revisions.find((revision) => revision.id === id), content: changed }));
  try {
    const table = container.querySelector<HTMLTableElement>('table[aria-label="Revisions"]');
    assert.ok(table, "Revisions are a labelled table");
    const rows = [...table.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");
    assert.equal(rows.length, 2);
    assert.match(rows[1]!, /4.*Save.*priya\.menon@example\.test/);
    const preview = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === "Preview changes in version 4");
    assert.ok(preview, "Each revision offers a preview of its changes");
    await act(async () => preview.click());
    await settle();
    assert.ok(app.requests.includes("/api/admin/content/revisions/rev-4"), "The revision's content is read on demand");
    const sheet = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
    assert.ok(sheet, "The changes open in a sheet");
    assert.match(sheet.querySelector('[data-slot="sheet-title"]')?.textContent ?? "", /Version 4/);
    const change = [...sheet.querySelectorAll<HTMLElement>("[data-change]")].find((row) => row.dataset.change === "homeCopy > chairsHeading");
    assert.ok(change, "The changed field is listed");
    assert.match(change.textContent ?? "", /Lounge chairs/);
    assert.match(change.textContent ?? "", /Chairs/);
    assert.ok([...sheet.querySelectorAll("button")].some((b) => b.textContent === "Restore version 4"), "Publishers can restore from the sheet");
  } finally { await app.close(); }
});

test("a revision with no differences says so, editors see no restore, and a failed read offers a retry", async () => {
  let fail = true;
  const app = await open("editor", (id) => fail
    ? new Response(null, { status: 500 })
    : Response.json({ ...revisions.find((revision) => revision.id === id), content: structuredClone(defaultStorefrontContent) }));
  try {
    assert.equal([...container.querySelectorAll("button")].some((b) => /^Restore version/.test(b.textContent ?? "")), false, "Editors cannot restore");
    const preview = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === "Preview changes in version 5")!;
    await act(async () => preview.click());
    await settle();
    const sheet = () => document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    assert.match(sheet().querySelector('[role="alert"]')?.textContent ?? "", /couldn't load/i);
    fail = false;
    const retry = [...sheet().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Try again")!;
    await act(async () => retry.click());
    await settle();
    assert.match(sheet().textContent ?? "", /same as the current draft/i);
  } finally { await app.close(); }
});
