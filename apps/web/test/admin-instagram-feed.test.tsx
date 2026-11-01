import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { InstagramFeedStatus } from "@shopmaple/contracts";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { InstagramFeedPanel } = await import("../components/admin/instagram-feed-panel");
const container = document.getElementById("root")!;
const csrf = "c".repeat(64);
const publisher = { user: { id: "p", email: "publisher@example.test", role: "publisher" as const }, csrfToken: csrf };
const editor = { user: { id: "e", email: "editor@example.test", role: "editor" as const }, csrfToken: csrf };

const post = (id: string, hidden = false) => ({ id, href: `https://www.instagram.com/p/Post${id}/`, src: `/media/instagram-feed/${id.repeat(64).slice(0, 64)}.webp`, caption: `Caption ${id}`, postedAt: "2026-10-30T10:00:00.000Z", hidden });
const healthy: InstagramFeedStatus = { configured: true, status: "ok", lastAttemptAt: "2026-11-01T06:00:00.000Z", lastSuccessAt: "2026-11-01T06:00:00.000Z", errorCode: null, tokenExpiresAt: null, dataAccessExpiresAt: null, posts: [post("1"), post("2", true)] };

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; });
async function mount(session: typeof publisher | typeof editor, responses: (path: string, init?: RequestInit) => Response) {
  const previous = globalThis.fetch, root = createRoot(container), calls: { path: string; init?: RequestInit }[] = [];
  let expired = 0;
  globalThis.fetch = async (input, init) => { calls.push({ path: String(input), init }); return responses(String(input), init); };
  await act(async () => root.render(<InstagramFeedPanel session={session} onExpired={() => { expired++; }} />));
  cleanup = async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
  return { calls, expired: () => expired };
}
const text = () => container.textContent ?? "";
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name || b.getAttribute("aria-label") === name);

test("staff see that the feed is off and the staff-edited posts are in use", async () => {
  await mount(editor, () => Response.json({ ...healthy, configured: false, status: "not_configured", lastAttemptAt: null, lastSuccessAt: null, posts: [] }));
  assert.match(text(), /automatic feed is off/i);
  assert.match(text(), /staff-edited posts below/i);
  assert.equal(button("Refresh now"), undefined);
});

test("a publisher sees the last refresh and can hide or show each post and refresh now", async () => {
  let current = structuredClone(healthy);
  const { calls } = await mount(publisher, (path, init) => {
    if (init?.method === "POST" && path.endsWith("/visibility")) {
      const hidden = JSON.parse(String(init.body)).hidden;
      current = { ...current, posts: current.posts.map((item) => path.includes(`/posts/${item.id}/`) ? { ...item, hidden } : item) };
    }
    return Response.json(current);
  });
  assert.equal(calls[0]?.path, "/api/admin/instagram-feed", "The panel reads the feed status");
  assert.match(text(), /Last refreshed/);
  assert.ok(container.querySelector('time[datetime="2026-11-01T06:00:00.000Z"]'));
  assert.equal(container.querySelectorAll("[data-instagram-feed-post]").length, 2);
  assert.ok(container.querySelector('img[src^="/media/instagram-feed/"]'), "Thumbnails come from our copies");
  await act(async () => button("Hide post 1")!.click());
  const hide = calls.at(-1)!;
  assert.equal(hide.path, "/api/admin/instagram-feed/posts/1/visibility");
  assert.equal(new Headers(hide.init!.headers).get("X-CSRF-Token"), csrf);
  assert.deepEqual(JSON.parse(String(hide.init!.body)), { hidden: true });
  assert.ok(button("Show post 1"), "The post now offers to be shown again");
  await act(async () => button("Show post 2")!.click());
  assert.deepEqual(JSON.parse(String(calls.at(-1)!.init!.body)), { hidden: false });
  await act(async () => button("Refresh now")!.click());
  assert.equal(calls.at(-1)!.path, "/api/admin/instagram-feed/refresh");
  assert.equal(calls.at(-1)!.init!.method, "POST");
});

test("while a refresh runs the panel says so and offers to reload the status", async () => {
  let refreshing = true;
  const { calls } = await mount(publisher, () => Response.json({ ...healthy, status: refreshing ? "refreshing" : "ok" }));
  assert.match(text(), /Refreshing now/);
  assert.equal(button("Refresh now")?.disabled, true, "No second refresh while one runs");
  refreshing = false;
  await act(async () => button("Reload status")!.click());
  assert.equal(calls.at(-1)!.path, "/api/admin/instagram-feed");
  assert.doesNotMatch(text(), /Refreshing now/);
});

test("the panel warns before Meta's data access lapses", async () => {
  await mount(editor, () => Response.json({ ...healthy, dataAccessExpiresAt: "2026-11-20T00:00:00.000Z" }));
  assert.ok(container.querySelector('time[datetime="2026-11-20T00:00:00.000Z"]'));
  assert.match(text(), /data access/i);
});

test("an editor sees status and hidden posts but cannot change them", async () => {
  await mount(editor, () => Response.json(healthy));
  assert.equal(button("Hide post 1"), undefined);
  assert.equal(button("Refresh now"), undefined);
  assert.match(text(), /Hidden/);
});

test("a failing feed explains the problem and that the last good posts are still shown", async () => {
  await mount(editor, () => Response.json({ ...healthy, status: "error", errorCode: "token_invalid" }));
  assert.match(text(), /token/i);
  assert.match(text(), /last good posts/i);
});

test("an expired session signs the editor out", async () => {
  const harness = await mount(publisher, () => Response.json({ code: "AUTH_REQUIRED" }, { status: 401 }));
  assert.equal(harness.expired(), 1);
});
