import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";
// The detail opens in a sheet, which portals to document.body when rendered without AdminRoot:
// queries read the whole page, and Radix needs the DOM in place before it is imported.
const dom = installUiDom();
const { createRoot } = await import("react-dom/client");
const { EnquiryInbox } = await import("../components/admin/enquiry-inbox");
const container = document.getElementById("root")!;
const page = document.body;
const session = { user: { id: "staff", email: "staff@example.invalid", role: "editor" as const, canManageEnquiries: true }, csrfToken: "a".repeat(64) };
const id = (n: number) => `enq_00000000-0000-4000-8000-00000000000${n}`;
const leadsUrl = "https://maplefurnishers.keeri.in/leads";
const rows = [
  { id: id(1), kind: "contact", createdAt: "2026-11-11T05:00:00.000Z", keeri: { state: "pending", leadUrl: null } },
  { id: id(2), kind: "project", createdAt: "2026-11-11T04:00:00.000Z", keeri: { state: "created", leadUrl: `${leadsUrl}/lead_2` } },
  { id: id(3), kind: "bulk", createdAt: "2026-11-11T03:00:00.000Z", keeri: { state: "matched", leadUrl: `${leadsUrl}/lead_3` } },
  { id: id(4), kind: "contact", createdAt: "2026-11-11T02:00:00.000Z", keeri: { state: "failed", leadUrl: null } },
  { id: id(5), kind: "newsletter", createdAt: "2026-11-11T01:00:00.000Z", keeri: null },
];
const list = (extra: object = {}) => ({ items: rows, nextCursor: null, keeriLeadsUrl: leadsUrl, ...extra });
const detail = { id: id(4), kind: "contact", name: "<img src=x onerror=alert(1)>", email: "synthetic@example.invalid", phone: "+91 90000 00000", message: "<script>alert(1)</script>", context: { product: "Nimbus sofa", variant: "Teal", sku: "NIM-1", pincode: "110015" }, createdAt: rows[3]!.createdAt };
const waiting = { state: "pending", status: "retry_wait", version: 2, attempts: 1, nextAttemptAt: "2026-11-11T03:00:00.000Z", acceptedAt: null, errorCode: "provider_unavailable", canRetry: true, leadUrl: null };
const delivery = (lead: object) => ({ enquiryId: id(4), enabled: false, delivery: null, keeri: { enabled: true, delivery: lead } });
function button(text: string) { const found = [...page.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); assert.ok(found, `Missing ${text}`); return found; }
const click = (text: string) => act(async () => button(text).click());
const row = (n: number) => { const found = container.querySelector<HTMLElement>(`[data-enquiry-row="${id(n)}"]`); assert.ok(found, `Missing row ${n}`); return found; };
type Call = { path: string; options?: RequestInit };
function transport(calls: Call[], handle: (path: string, options?: RequestInit) => unknown = () => undefined) {
  return async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url); calls.push({ path, options });
    const result = handle(path, options);
    if (result instanceof Response) return result;
    if (result !== undefined) return Response.json(result);
    if (path.endsWith("/delivery")) return Response.json(delivery(waiting));
    return Response.json(path.includes(id(4)) ? detail : list());
  };
}
async function mount(onExpired = () => {}) { const root = createRoot(container); await act(async () => root.render(<EnquiryInbox session={session} onExpired={onExpired}/>)); return root; }

test("the list is read-only: reference, kind, time and Keeri state per row, under a line that sends staff to Keeri", async () => {
  const previous = globalThis.fetch, calls: Call[] = [];
  globalThis.fetch = transport(calls);
  const root = await mount();
  try {
    assert.ok(page.querySelector('[aria-label="Website enquiries"]'));
    const handoff = page.querySelector<HTMLElement>("[data-keeri-handoff]");
    assert.equal(handoff?.textContent, "Website enquiries are handled in Keeri. Open a lead there to reply, assign or follow up.");
    const link = handoff!.querySelector<HTMLAnchorElement>("a")!;
    assert.equal(link.getAttribute("href"), leadsUrl);
    assert.equal(link.getAttribute("target"), "_blank");
    assert.match(link.getAttribute("rel") ?? "", /noopener/);
    const expected = [[1, "Contact", "Pending", null], [2, "Project", "Lead created", `${leadsUrl}/lead_2`], [3, "Bulk", "Matched a lead", `${leadsUrl}/lead_3`],
      [4, "Contact", "Failed", null], [5, "Newsletter", "Stays in the store", null]] as const;
    for (const [n, kind, state, url] of expected) {
      const text = row(n).textContent!;
      assert.ok(text.includes(id(n)), `row ${n} shows its reference`);
      assert.ok(text.includes(kind), `row ${n} shows its kind`);
      assert.ok(row(n).querySelector(`time[datetime="${rows[n - 1]!.createdAt}"]`), `row ${n} shows its time`);
      assert.equal(row(n).querySelector("[data-keeri-state]")?.textContent, state);
      const open = row(n).querySelector<HTMLAnchorElement>("a");
      assert.equal(open?.getAttribute("href") ?? null, url);
      if (open) { assert.equal(open.textContent, "Open in Keeri"); assert.equal(open.getAttribute("target"), "_blank"); }
    }
    // Nothing of the old CRM is left on the screen: no views, stages, assignment, notes, tasks, search or reply.
    for (const text of ["Board", "Follow-ups", "Contacts", "Search", "Contacted", "Save assignment", "Add internal note", "Send reply", "Add follow-up"])
      assert.equal([...page.querySelectorAll("button, [role=tab]")].some(item => item.textContent === text), false, `no ${text} control`);
    assert.equal(page.querySelector("textarea, input"), null, "the list takes no text input");
    assert.ok(!page.textContent!.includes(detail.email), "the list does not preload customer details");
    assert.deepEqual(calls.map(call => call.path), ["/api/admin/enquiries"]);
    assert.ok(calls.every(call => call.options?.cache === "no-store" && !call.options?.method));
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("opening a row shows the enquiry read-only with its Keeri delivery panel, and a lead waiting to retry can be resent", async () => {
  const previous = globalThis.fetch, calls: Call[] = []; let retried = false;
  globalThis.fetch = transport(calls, (path, options) => {
    if (path.endsWith("/delivery/retry")) { retried = true; return delivery({ ...waiting, version: 3, status: "queued", canRetry: false }); }
    if (path.endsWith("/delivery")) return delivery(retried ? { ...waiting, version: 4, state: "created", status: "accepted", canRetry: false, leadUrl: `${leadsUrl}/lead_4` } : waiting);
    return options?.method ? Response.json({}, { status: 500 }) : undefined;
  });
  const root = await mount();
  try {
    assert.equal(page.querySelector('[role="dialog"]'), null);
    await act(async () => row(4).querySelector<HTMLButtonElement>("button")!.click());
    const sheet = page.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(sheet, "the enquiry opens in a sheet");
    for (const value of [detail.id, detail.email, detail.phone, detail.message, detail.name, "Nimbus sofa", "Teal", "NIM-1", "110015"])
      assert.ok(sheet.textContent!.includes(value), `detail shows ${value}`);
    assert.equal(sheet.querySelector("script, img, textarea, input, select"), null, "customer text is rendered as text and nothing is editable");
    for (const text of ["Contacted", "Save assignment", "Add internal note", "Send reply", "Open contact"])
      assert.equal([...sheet.querySelectorAll("button")].some(item => item.textContent === text), false, `no ${text} control`);
    const lead = sheet.querySelector<HTMLElement>('[aria-label="Keeri lead"]');
    assert.ok(lead, "the delivery panel shows the Keeri lead");
    await click("Retry Keeri lead");
    const write = calls.find(call => call.options?.method === "POST")!;
    assert.equal(write.path, `/api/admin/enquiries/${id(4)}/delivery/retry`);
    assert.deepEqual(JSON.parse(String(write.options?.body)), { expectedVersion: 2, target: "keeri" });
    assert.equal(new Headers(write.options?.headers).get("X-CSRF-Token"), session.csrfToken);
    assert.equal(calls.filter(call => call.options?.method === "POST").length, 1, "the retry is the only write");
    assert.match(page.querySelector('[aria-label="Keeri lead"]')!.textContent!, /created in keeri/i);
    assert.equal(page.querySelector<HTMLAnchorElement>('[aria-label="Keeri lead"] a')?.getAttribute("href"), `${leadsUrl}/lead_4`);
    await click("Close enquiry");
    assert.equal(page.querySelector('[role="dialog"]'), null);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("newsletter signups and kept reviews stay viewable by kind, and paging keeps the kind", async () => {
  const previous = globalThis.fetch, calls: Call[] = [];
  globalThis.fetch = transport(calls, path => path.startsWith("/api/admin/enquiries?") || path === "/api/admin/enquiries" ? list({ nextCursor: "opaque" }) : undefined);
  const root = await mount();
  try {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Enquiry kind"]')!;
    assert.deepEqual([...select.options].map(option => option.textContent), ["All kinds", "Contact", "Project", "Bulk", "Newsletter", "Review"]);
    await act(async () => { select.value = "newsletter"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(calls.at(-1)!.path, "/api/admin/enquiries?kind=newsletter");
    await click("Next page");
    assert.equal(calls.at(-1)!.path, "/api/admin/enquiries?kind=newsletter&cursor=opaque");
    await act(async () => { select.value = "review"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(calls.at(-1)!.path, "/api/admin/enquiries?kind=review");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("without Keeri leads the line still says where enquiries are handled, with no link", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = transport([], () => list({ keeriLeadsUrl: null }));
  const root = await mount();
  try {
    const handoff = page.querySelector<HTMLElement>("[data-keeri-handoff]")!;
    assert.equal(handoff.textContent, "Website enquiries are handled in Keeri. Open a lead there to reply, assign or follow up.");
    assert.equal(handoff.querySelector("a"), null);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("access denial clears customer content, session expiry returns to sign in, and a malformed reply fails closed", async () => {
  const previous = globalThis.fetch;
  try {
    for (const status of [403, 401]) {
      let expired = 0;
      globalThis.fetch = async () => Response.json({}, { status });
      const root = await mount(() => { expired++; });
      try {
        if (status === 401) assert.equal(expired, 1);
        else assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /access/i);
        assert.equal(container.querySelector("[data-enquiry-row]"), null);
      } finally { await act(async () => root.unmount()); }
    }
    globalThis.fetch = transport([], () => list({ items: [{ ...rows[0], name: "Unexpected", email: "unexpected@example.invalid" }] }));
    const root = await mount();
    try {
      assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /couldn't load/i);
      assert.ok(!page.textContent!.includes("unexpected@example.invalid"));
    } finally { await act(async () => root.unmount()); }
  } finally { globalThis.fetch = previous; }
});
