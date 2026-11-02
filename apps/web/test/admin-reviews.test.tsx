import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { AdminReview, ReviewOrder } from "@shopmaple/contracts/reviews";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { ReviewsPanel } = await import("../components/admin/reviews-panel");
const container = document.getElementById("root")!;
const csrf = "c".repeat(64);
const session = { user: { id: "s", email: "staff@example.test", role: "editor" as const, canManageEnquiries: true }, csrfToken: csrf };

const pending: AdminReview = {
  id: "rev_00000000-0000-4000-8000-000000000001", status: "pending", version: 0, rating: 4, title: "Sturdy and lovely",
  body: "Comfortable for long dinners.", displayName: "Asha", city: "Pune", productTitle: "Aero Dining Chair", variantTitle: "Deep Atlantic",
  productHandle: "aero-dining-chair", orderReference: "SO-1001", createdAt: "2026-11-01T06:00:00.000Z", audit: [],
};
const order: ReviewOrder = {
  attemptId: "chk_1", orderReference: "SO-1001", customerName: "Asha Rao", placedAt: "2026-10-20T06:00:00.000Z",
  lines: [{ title: "Aero Dining Chair", variantTitle: "Deep Atlantic", reviewed: false }], delivery: null,
};

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; });
async function mount(responses: (path: string, init?: RequestInit) => Response) {
  const previous = globalThis.fetch, root = createRoot(container), calls: { path: string; init?: RequestInit }[] = [];
  let expired = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ path: String(input), init }); return responses(String(input), init); }) as typeof fetch;
  await act(async () => root.render(<ReviewsPanel session={session} onExpired={() => { expired++; }} />));
  cleanup = async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
  return { calls, expired: () => expired };
}
const text = () => container.textContent?.replace(/\s+/g, " ") ?? "";
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button, [role='tab']")].find((b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
const click = (name: string) => act(async () => {
  const target = button(name);
  assert.equal(target !== undefined, true, `button ${name}`);
  target!.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  target!.click();
});

test("staff read each pending review with its product and order, and approve it", async () => {
  let current = [pending];
  const { calls } = await mount((path, init) => {
    if (init?.method === "POST") {
      current = [];
      return Response.json({ ...pending, status: "approved", version: 1, audit: [{ action: "approved", actorEmail: "staff@example.test", note: null, createdAt: "2026-11-01T07:00:00.000Z" }] });
    }
    return Response.json({ items: path.includes("status=pending") ? current : [], nextCursor: null });
  });
  assert.equal(calls[0]!.path, "/api/admin/reviews?status=pending");
  const card = container.querySelector("[data-admin-review]")!;
  assert.match(card.textContent!, /Sturdy and lovely/);
  assert.match(card.textContent!, /Comfortable for long dinners\./);
  assert.match(card.textContent!, /Aero Dining Chair/);
  assert.match(card.textContent!, /SO-1001/);
  assert.match(card.textContent!, /Asha, Pune/);
  assert.equal(card.querySelector("[aria-label='Rated 4 out of 5']") !== null, true);
  await click("Approve review by Asha");
  const sent = calls.find((c) => c.init?.method === "POST")!;
  assert.equal(sent.path, `/api/admin/reviews/${pending.id}/moderation`);
  assert.equal(new Headers(sent.init!.headers).get("X-CSRF-Token"), csrf);
  assert.deepEqual(JSON.parse(String(sent.init!.body)), { decision: "approved", expectedVersion: 0, note: "" });
  assert.match(text(), /Approved\. It now shows on the product page\./);
  assert.equal(container.querySelector("[data-admin-review]") === null, true);
});

test("a decision someone else already made is reported and the list reloads", async () => {
  let reads = 0;
  await mount((_path, init) => {
    if (init?.method === "POST") return Response.json({ code: "REVIEW_VERSION_CONFLICT", message: "Someone else changed this review. Reload before trying again." }, { status: 409 });
    reads++;
    return Response.json({ items: [pending], nextCursor: null });
  });
  await click("Reject review by Asha");
  assert.match(text(), /Someone else changed this review/);
  assert.equal(reads, 2, "The queue is read again after a conflict");
});

test("approved reviews show who decided, and staff can withdraw one", async () => {
  const approved: AdminReview = { ...pending, status: "approved", version: 1, audit: [{ action: "approved", actorEmail: "owner@example.test", note: null, createdAt: "2026-11-01T07:00:00.000Z" }] };
  const { calls } = await mount((path, init) => {
    if (init?.method === "POST") return Response.json({ ...approved, status: "rejected", version: 2 });
    return Response.json({ items: path.includes("status=approved") ? [approved] : [], nextCursor: null });
  });
  assert.match(text(), /No reviews are waiting/);
  await click("Approved");
  assert.equal(calls.at(-1)!.path, "/api/admin/reviews?status=approved");
  assert.match(text(), /Approved by owner@example\.test/);
  await click("Reject review by Asha");
  assert.deepEqual(JSON.parse(String(calls.at(-1)!.init!.body)), { decision: "rejected", expectedVersion: 1, note: "" });
});

test("an order not yet delivered can be marked delivered, which invites the buyer to review", async () => {
  let current = order;
  const { calls } = await mount((path, init) => {
    if (path.startsWith("/api/admin/review-orders/") && init?.method === "POST") {
      current = { ...order, delivery: { deliveredAt: "2026-11-01T08:00:00.000Z", source: "staff", email: "pending" } };
      return Response.json(current);
    }
    if (path.startsWith("/api/admin/review-orders")) return Response.json({ items: [current], nextCursor: null });
    return Response.json({ items: [], nextCursor: null });
  });
  await click("Orders to invite");
  assert.equal(calls.at(-1)!.path, "/api/admin/review-orders");
  assert.match(text(), /SO-1001/);
  assert.match(text(), /Asha Rao/);
  await click("Mark SO-1001 delivered and invite review");
  const sent = calls.at(-1)!;
  assert.equal(sent.path, "/api/admin/review-orders/chk_1/delivered");
  assert.equal(new Headers(sent.init!.headers).get("X-CSRF-Token"), csrf);
  assert.match(text(), /Delivered/);
  assert.match(text(), /Review email queued/);
  assert.equal(button("Mark SO-1001 delivered and invite review"), undefined);
});

test("a signed-out session is handed back to sign-in", async () => {
  const view = await mount(() => new Response("", { status: 401 }));
  assert.equal(view.expired(), 1);
});
