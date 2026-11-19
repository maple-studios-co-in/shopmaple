import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";

// Owner, 19 Nov 2026: the announcement's artwork says how the strip shows it, a finished banner shown whole or a photo
// beside the campaign's words. Only the announcement is drawn as a strip, so no other campaign offers the choice.
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { CampaignFields } = await import("../components/admin/forms");
const { defaultStorefrontContent } = await import("../lib/content-defaults");
const session = { user: { id: "editor", email: "editor@example.test", role: "editor" as const }, csrfToken: "c".repeat(64) };
const upload = `/media/uploads/${"a".repeat(64)}.webp`;

async function render(content: StorefrontContent, only: string[]) {
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const changes: StorefrontContent[] = [];
  await act(async () => root.render(<CampaignFields content={content} onChange={(next) => changes.push(next)} session={session} onExpired={() => {}} only={only} embedded />));
  const select = [...container.querySelectorAll<HTMLSelectElement>("select")].find((node) => node.closest("[data-announcement-display]"));
  return { container, select, changes, close: () => act(async () => root.unmount()) };
}
const withArtwork = (key: string, desktopImage: string) => {
  const content = structuredClone(defaultStorefrontContent);
  content.campaigns.find((campaign) => campaign.key === key)!.artwork = { desktopImage, mobileImage: desktopImage, alt: "Banner" };
  return content;
};

test("the announcement offers the choice: a library banner shows whole by default, and choosing a photo is saved on the artwork", async () => {
  const view = await render(withArtwork("landing-announcement", upload), ["landing-announcement"]);
  try {
    assert.ok(view.select, "the choice sits with the announcement's artwork");
    assert.equal(view.select.value, "banner");
    assert.match(view.container.querySelector("[data-announcement-display]")?.textContent ?? "", /1900 × 350 px banner and a 500 × 500 px mobile banner/);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(view.select, "photo");
      view.select!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(view.changes.at(-1)?.campaigns.find((campaign) => campaign.key === "landing-announcement")?.artwork?.display, "photo");
  } finally { await view.close(); }
});

test("the theme's own strip photo reads as a photo, and no other campaign shows the choice", async () => {
  const theme = await render(structuredClone(defaultStorefrontContent), ["landing-announcement"]);
  try { assert.equal(theme.select?.value, "photo"); } finally { await theme.close(); }
  const other = await render(withArtwork("landing-dining-table", upload), ["landing-dining-table"]);
  try { assert.equal(other.container.querySelector("[data-announcement-display]"), null); } finally { await other.close(); }
});
