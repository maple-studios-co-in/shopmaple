import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The admin shell: a grouped sidebar with a clear current section, a phone-width section
// picker that mirrors it, and a top bar that shows draft/published status, the signed-in
// staff member and the publishing actions.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ContentEditor } = await import("../components/admin/editor");
const container = document.getElementById("root")!;

async function setup(options: { role?: "editor" | "publisher"; canManageEnquiries?: boolean; publishedVersion?: number | null; signOut?: () => void } = {}) {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path.startsWith("/api/admin/crm/")) return Response.json({ stages: { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 }, overdueTasks: 0, dueTodayTasks: 0, newLastSevenDays: 0 });
    assert.equal(path, "/api/admin/content", `Unexpected request ${path}`);
    return Response.json({ version: 4, draft: structuredClone(defaultStorefrontContent), publishedVersion: options.publishedVersion === undefined ? 2 : options.publishedVersion, updatedAt: "2026-10-26T12:00:00Z" });
  };
  await act(async () => root.render(
    <ContentEditor
      session={{ user: { id: "staff-1", email: "priya.menon@example.test", role: options.role ?? "publisher", canManageEnquiries: options.canManageEnquiries ?? false }, csrfToken: "c".repeat(64) }}
      initialContent={defaultStorefrontContent}
      onExpired={() => assert.fail("Unexpected expiry")}
      account={{ onSignOut: options.signOut ?? (() => {}), busy: false }}
    />,
  ));
  return { close: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const nav = () => {
  const found = container.querySelector<HTMLElement>('nav[aria-label="Admin sections"]');
  assert.ok(found, "The sidebar navigation is labelled");
  return found;
};
const current = () => [...nav().querySelectorAll<HTMLButtonElement>('button[aria-current="page"]')].map((b) => b.textContent);
const navButton = (name: string) => {
  const found = [...nav().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name);
  assert.ok(found, `Missing ${name} in the sidebar`);
  return found;
};

test("the sidebar groups sections, marks exactly one current section and moves it on click", async () => {
  const app = await setup({ canManageEnquiries: true });
  try {
    const groups = [...nav().querySelectorAll<HTMLElement>("[data-nav-group]")].map((g) => g.dataset.navGroup);
    assert.deepEqual(groups, ["Storefront", "Pages", "Library", "Customers", "Publishing"]);
    assert.deepEqual(current(), ["Overview"]);
    const inGroup = (name: string) => [...nav().querySelectorAll<HTMLElement>("[data-nav-group]")].find((g) => [...g.querySelectorAll("button")].some((b) => b.textContent === name))?.dataset.navGroup;
    assert.equal(inGroup("Campaigns"), "Storefront");
    assert.equal(inGroup("Policies & blogs"), "Pages");
    assert.equal(inGroup("Media"), "Library");
    assert.equal(inGroup("Enquiries"), "Customers");
    assert.equal(inGroup("History"), "Publishing");
    await act(async () => navButton("Campaigns").click());
    assert.deepEqual(current(), ["Campaigns"]);
    assert.equal(container.querySelector("h2")?.textContent, "Campaigns");
    const picker = container.querySelector<HTMLSelectElement>('select[aria-label="Admin section"]');
    assert.ok(picker, "A phone-width section picker mirrors the sidebar");
    assert.equal(picker.value, "Campaigns");
    await act(async () => { picker.value = "Media"; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.deepEqual(current(), ["Media"]);
  } finally { await app.close(); }
});

test("staff without enquiry access see no Customers group", async () => {
  const app = await setup({ canManageEnquiries: false });
  try {
    assert.equal([...nav().querySelectorAll("button")].some((b) => b.textContent === "Enquiries"), false);
    assert.equal(nav().querySelector('[data-nav-group="Customers"]'), null);
  } finally { await app.close(); }
});

test("the top bar shows the draft and published versions, the signed-in staff member and sign out", async () => {
  let signedOut = 0;
  const app = await setup({ signOut: () => { signedOut++; } });
  try {
    const bar = container.querySelector<HTMLElement>('[data-admin-topbar]');
    assert.ok(bar, "A top bar is rendered");
    assert.match(bar.querySelector("[data-draft-status]")?.textContent ?? "", /Draft version 4/);
    assert.match(bar.querySelector("[data-publish-status]")?.textContent ?? "", /Published version 2/);
    assert.equal(bar.querySelector("[data-publish-status]")?.getAttribute("data-tone"), "published");
    const account = bar.querySelector<HTMLElement>("[data-staff-account]");
    assert.ok(account, "The signed-in staff member is shown");
    assert.match(account.textContent ?? "", /priya\.menon@example\.test/);
    assert.match(account.textContent ?? "", /Publisher/);
    assert.equal(account.querySelector("[data-avatar]")?.textContent, "PM");
    // Sign out lives in the staff menu opened from the account in the top bar (a Radix menu opens on Enter).
    await act(async () => { account.focus(); account.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    const signOut = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === "Sign out");
    assert.ok(signOut, "Sign out lives in the top bar's staff menu");
    await act(async () => signOut.click());
    assert.equal(signedOut, 1);
    assert.equal([...bar.querySelectorAll("button")].some((b) => b.textContent === "Publish draft"), true, "Publishers can publish from the top bar");
  } finally { await app.close(); }
});

test("an unpublished store and an editor role are reflected in the top bar", async () => {
  const app = await setup({ role: "editor", publishedVersion: null });
  try {
    const bar = container.querySelector<HTMLElement>('[data-admin-topbar]')!;
    assert.equal(bar.querySelector("[data-publish-status]")?.getAttribute("data-tone"), "unpublished");
    assert.match(bar.querySelector("[data-publish-status]")?.textContent ?? "", /Not published/i);
    assert.equal([...bar.querySelectorAll("button")].some((b) => b.textContent === "Publish draft"), false);
    assert.match(bar.querySelector("[data-staff-account]")?.textContent ?? "", /Editor/);
  } finally { await app.close(); }
});

test("the command palette moves focus to the chosen screen's heading", async () => {
  const app = await setup({ canManageEnquiries: true });
  // cmdk scrolls the active item into view; jsdom has no layout.
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); });
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Jump to a screen or action"]');
    assert.ok(input, "Ctrl+K opens the palette");
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "media"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    assert.deepEqual(current(), ["Media"]);
    const heading = container.querySelector<HTMLElement>("[data-admin-panel] h2");
    assert.ok(heading && document.activeElement === heading, "Focus lands on the Media heading, not the page body");
  } finally { await app.close(); }
});

test("draft actions show only on screens that edit the draft", async () => {
  const app = await setup({ canManageEnquiries: true });
  try {
    const bar = () => container.querySelector<HTMLElement>("[data-admin-topbar]")!;
    const actions = () => [...bar().querySelectorAll("button")].map((b) => b.textContent).filter((text) => ["Save draft", "Preview draft", "Publish draft", "Live preview"].includes(text ?? ""));
    await act(async () => navButton("Homepage").click());
    assert.deepEqual(actions().sort(), ["Live preview", "Preview draft", "Publish draft", "Save draft"]);
    for (const screen of ["Media", "Enquiries"]) {
      await act(async () => navButton(screen).click());
      assert.deepEqual(actions(), [], `${screen} has no draft actions`);
    }
  } finally { await app.close(); }
});
