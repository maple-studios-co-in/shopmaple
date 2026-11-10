import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";
// The detail opens in a sheet that portals to document.body; Radix needs the DOM before it is imported.
installUiDom();
const { createRoot } = await import("react-dom/client");
const { EnquiryInbox } = await import("../components/admin/enquiry-inbox");
const container = document.getElementById("root")!;
const page = document.body;
const session = { user: { id: "staff", email: "staff@example.invalid", role: "editor" as const, canManageEnquiries: true }, csrfToken: "a".repeat(64) };
const row = { id: "enq_00000000-0000-4000-8000-000000000001", kind: "contact", status: "new", version: 0, assignedToId: null, contactId: null, name: "Synthetic", product: "", createdAt: "2026-10-26T00:00:00.000Z" };
const detail = { ...row, email: "synthetic@example.invalid", phone: "", message: "Synthetic enquiry", context: { product: "", variant: "", sku: "", pincode: "" }, reviews: [] };
const email = { status: "accepted", version: 2, attempts: 1, nextAttemptAt: null, acceptedAt: "2026-10-26T00:01:00.000Z", errorCode: null, canRetry: false };
const lead = { state: "pending", status: "queued", version: 0, attempts: 0, nextAttemptAt: "2026-10-26T00:00:00.000Z", acceptedAt: null, errorCode: null, canRetry: false, leadUrl: null };
const response = (keeri: unknown) => ({ enquiryId: row.id, enabled: true, delivery: email, ...(keeri === undefined ? {} : { keeri }) });
const panel = () => { const found = page.querySelector('[aria-label="Keeri lead"]'); assert.ok(found, "Keeri lead panel must be visible"); return found; };
function button(text: string) { const found = [...page.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); assert.ok(found, `Missing ${text}`); return found; }
const click = (text: string) => act(async () => button(text).click());
function transport(delivery: (path: string, options?: RequestInit) => unknown) {
  return async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url);
    if (path.includes("/delivery")) return Response.json(delivery(path, options));
    if (path.includes("/assignees") || path.includes("/activity")) return Response.json({ items: [], nextCursor: null });
    return Response.json(path.includes(row.id) ? detail : { items: [row], nextCursor: null });
  };
}
async function mount() { const root = createRoot(container); await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry"); return root; }

test("the enquiry shows its Keeri lead as pending, created, matched or failed, and links the lead once there is one", async () => {
  const previous = fetch;
  const cases = [
    { keeri: { enabled: true, delivery: lead }, text: /pending/i, link: null },
    { keeri: { enabled: true, delivery: { ...lead, state: "created", status: "accepted", attempts: 1, acceptedAt: email.acceptedAt, leadUrl: "https://maplefurnishers.keeri.in/leads/lead_1" } }, text: /created in keeri/i, link: "https://maplefurnishers.keeri.in/leads/lead_1" },
    { keeri: { enabled: true, delivery: { ...lead, state: "matched", status: "accepted", attempts: 1, acceptedAt: email.acceptedAt, leadUrl: "https://maplefurnishers.keeri.in/leads/lead_2" } }, text: /matched an existing keeri lead/i, link: "https://maplefurnishers.keeri.in/leads/lead_2" },
    { keeri: { enabled: true, delivery: { ...lead, state: "failed", status: "failed", attempts: 1, errorCode: "provider_rejected" } }, text: /not sent to keeri.*provider_rejected/i, link: null },
    { keeri: { enabled: true, delivery: null }, text: /not sent to keeri/i, link: null },
    { keeri: { enabled: false, delivery: { ...lead, state: "created", status: "accepted", attempts: 1, acceptedAt: email.acceptedAt } }, text: /created in keeri/i, link: null },
  ];
  try { for (const entry of cases) {
    globalThis.fetch = transport(() => response(entry.keeri));
    const root = await mount();
    try {
      assert.match(panel().textContent!, entry.text);
      const anchor = panel().querySelector<HTMLAnchorElement>("a");
      assert.equal(anchor?.getAttribute("href") ?? null, entry.link);
      if (anchor) { assert.equal(anchor.textContent, "Open in Keeri"); assert.equal(anchor.getAttribute("target"), "_blank"); assert.match(anchor.getAttribute("rel") ?? "", /noopener/); assert.match(anchor.getAttribute("rel") ?? "", /noreferrer/); }
      assert.match(page.querySelector('[aria-label="Enquiry notification"]')!.textContent!, /accepted by.*provider/i, "the email state is still shown");
    } finally { await act(async () => root.unmount()); }
  } } finally { globalThis.fetch = previous; }
});

test("a store without Keeri leads shows no Keeri section", async () => {
  const previous = fetch;
  globalThis.fetch = transport(() => response(undefined));
  const root = await mount();
  try { assert.equal(page.querySelector('[aria-label="Keeri lead"]'), null); }
  finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("retry covers a waiting Keeri lead: it posts the lead's version and target, then refreshes", async () => {
  const previous = fetch; const writes: unknown[] = []; let retried = false;
  const waiting = { ...lead, status: "retry_wait", attempts: 1, version: 2, errorCode: "provider_unavailable", canRetry: true };
  globalThis.fetch = transport((path, options) => {
    if (path.endsWith("/retry")) { writes.push(JSON.parse(String(options?.body))); retried = true; return response({ enabled: true, delivery: { ...waiting, version: 3, status: "queued", canRetry: false } }); }
    return response({ enabled: true, delivery: retried ? { ...waiting, version: 4, state: "created", status: "accepted", canRetry: false, leadUrl: "https://maplefurnishers.keeri.in/leads/lead_3" } : waiting });
  });
  const root = await mount();
  try {
    assert.equal([...page.querySelectorAll("button")].some(item => item.textContent === "Retry notification"), false, "the accepted email has no retry");
    await click("Retry Keeri lead");
    assert.deepEqual(writes, [{ expectedVersion: 2, target: "keeri" }]);
    assert.match(panel().textContent!, /created in keeri/i);
    assert.equal(panel().querySelector("a")?.getAttribute("href"), "https://maplefurnishers.keeri.in/leads/lead_3");
    assert.equal([...page.querySelectorAll("button")].some(item => item.textContent === "Retry Keeri lead"), false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
