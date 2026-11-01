import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Every rebuilt admin screen renders on the shared shell with a proper heading, without
// an alert, and with its designed loading state while its data is on the way.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const { AdminDashboard } = await import("../components/admin/dashboard");
const container = document.getElementById("root")!;

const screens: [string, RegExp][] = [
  ["Overview", /^Overview$/],
  ["Homepage", /^Homepage$/],
  ["Navigation & footer", /^Navigation & footer$/],
  ["Merchandising", /merchandising/i],
  ["Product highlights", /^Product highlights$/],
  ["Artwork", /^Artwork$/],
  ["Campaigns", /^Campaigns$/],
  ["Instagram", /^Instagram$/],
  ["Pages", /^Informational pages$/],
  ["Existing pages", /^Existing pages$/],
  ["Policies & blogs", /^Policies & blogs$/],
  ["Category pages", /^Category pages$/],
  ["Media", /^Media library$/],
  ["Enquiries", /^Customer enquiries$/],
  ["History", /^Revision history$/],
];

test("each screen renders its heading on the shell without raising an alert", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/admin/content") return Response.json({ version: 4, draft: structuredClone(defaultStorefrontContent), publishedVersion: 2, updatedAt: "2026-10-26T12:00:00Z" });
    if (path === "/api/admin/content/revisions") return Response.json({ revisions: [{ id: "r1", version: 4, action: "save", actorEmail: "priya.menon@example.test", createdAt: "2026-10-26T12:00:00Z" }] });
    if (path.startsWith("/api/admin/media")) return Response.json({ assets: [], nextCursor: null });
    if (path.startsWith("/api/products?")) return Response.json({ products: [], total: 0, page: 1, limit: 20, mode: "preview", checkoutEnabled: false });
    if (path.startsWith("/api/admin/crm/summary")) return Response.json({ stages: { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 }, overdueTasks: 0, dueTodayTasks: 0, newLastSevenDays: 0 });
    if (path.startsWith("/api/admin/enquiries/assignees")) return Response.json({ items: [], nextCursor: null });
    if (path.startsWith("/api/admin/enquiries")) return Response.json({ items: [], nextCursor: null });
    assert.fail(`Unexpected request ${path}`);
  };
  try {
    await act(async () => root.render(
      <ContentEditor
        session={{ user: { id: "staff-1", email: "priya.menon@example.test", role: "publisher", canManageEnquiries: true }, csrfToken: "c".repeat(64) }}
        initialContent={defaultStorefrontContent}
        onExpired={() => assert.fail("Unexpected expiry")}
        account={{ onSignOut: () => {}, busy: false }}
      />,
    ));
    for (const [name, heading] of screens) {
      const button = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Admin sections"] button')].find((b) => b.textContent === name);
      assert.ok(button, `Missing ${name} in the sidebar`);
      await act(async () => button.click());
      const title = container.querySelector<HTMLElement>("[data-admin-panel] h2");
      assert.ok(title, `${name} renders a heading`);
      assert.match(title.textContent ?? "", heading, `${name} heading`);
      assert.equal(container.querySelector('[role="alert"]'), null, `${name} renders without an alert`);
      assert.ok(container.querySelector('[data-admin-panel] > [data-admin-panel-body]') || container.querySelector('[data-admin-panel]'), `${name} renders inside the panel`);
    }
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("the dashboard shows a designed loading state while the session is checked, then the sign-in screen", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async () => { await gate; return new Response(null, { status: 401 }); };
  try {
    await act(async () => root.render(<AdminDashboard initialContent={defaultStorefrontContent} />));
    const loading = container.querySelector('[role="status"]');
    assert.ok(loading, "A loading status is announced");
    assert.ok(container.querySelector("[data-skeleton]"), "The loading state is a skeleton, not a bare sentence");
    await act(async () => { release(); });
    assert.ok(container.querySelector('input[type="password"]'), "Sign-in is offered when no session exists");
    assert.ok(container.querySelector('[data-admin-signin]'), "The sign-in screen uses the shell's designed layout");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
