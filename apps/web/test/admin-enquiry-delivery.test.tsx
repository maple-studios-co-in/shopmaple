import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EnquiryInbox } from "../components/admin/enquiry-inbox";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const container = document.getElementById("root")!;
const session = { user: { id: "staff", email: "staff@example.invalid", role: "editor" as const, canManageEnquiries: true }, csrfToken: "a".repeat(64) };
const row = { id: "enq_00000000-0000-4000-8000-000000000001", kind: "contact", status: "new", version: 0, createdAt: "2026-10-26T00:00:00.000Z" };
const detail = { ...row, name: "Synthetic", email: "synthetic@example.invalid", phone: "", message: "Synthetic enquiry", context: { product: "", variant: "", sku: "", pincode: "" }, reviews: [] };
const retryable = { status: "retry_wait", version: 3, attempts: 1, nextAttemptAt: "2026-10-26T01:00:00.000Z", acceptedAt: null, errorCode: "rate_limited", canRetry: true };
const response = (delivery: unknown = retryable, enabled = true, enquiryId = row.id) => ({ enquiryId, enabled, delivery });
function button(text: string) { const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); assert.ok(found, `Missing ${text}`); return found; }
const click = (text: string) => act(async () => button(text).click());
const panel = () => { const found = container.querySelector('[aria-label="Enquiry notification"]'); assert.ok(found, "Enquiry notification panel must be visible"); return found; };
function transport(overrides?: (path: string, options?: RequestInit) => Response | Promise<Response> | undefined) {
  return async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url); const result = overrides?.(path, options); if (result) return result;
    if (path.endsWith("/delivery")) return Response.json(response());
    if (path.includes("/assignees") || path.includes("/activity")) return Response.json({ items: [], nextCursor: null });
    return Response.json(path.includes(row.id) ? detail : { items: [row], nextCursor: null });
  };
}
async function mount() { const root = createRoot(container); await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry"); return root; }

test("notification states distinguish provider acceptance and allow only eligible waiting retries", async () => {
  const previous = fetch;
  const cases = [
    { data: response(null, false), text: /notifications.*disabled/i, retry: false },
    { data: response(null), text: /no notification.*queued/i, retry: false },
    ...[
      ["queued", /queued/i], ["sending", /sending/i], ["retry_wait", /waiting.*retry/i], ["accepted", /accepted by.*provider/i], ["failed", /needs attention/i], ["uncertain", /uncertain.*reconciliation/i],
    ].map(([status, text]) => ({ data: response({ ...retryable, status, canRetry: status === "retry_wait" }), text: text as RegExp, retry: status === "retry_wait" })),
    { data: response({ ...retryable, canRetry: false }), text: /waiting.*retry/i, retry: false },
    { data: response(retryable, false), text: /notifications.*disabled/i, retry: false },
  ];
  try { for (const entry of cases) {
    globalThis.fetch = transport(path => path.endsWith("/delivery") ? Response.json(entry.data) : undefined); const root = await mount();
    try { assert.match(panel().textContent!, entry.text); assert.match(panel().textContent!, /does not confirm.*inbox delivery/i); assert.equal([...panel().querySelectorAll("button")].some(item => item.textContent === "Retry notification" && !item.disabled), entry.retry); }
    finally { await act(async () => root.unmount()); }
  } } finally { globalThis.fetch = previous; }
});

test("manual retry sends the loaded version and CSRF once, then refreshes current status", async () => {
  const previous = fetch; const writes: { path: string; options?: RequestInit }[] = []; let queued = false; let reads = 0;
  globalThis.fetch = transport((path, options) => {
    if (path.endsWith("/delivery/retry")) { writes.push({ path, options }); queued = true; return Response.json(response({ ...retryable, version: 4, status: "queued", canRetry: false })); }
    if (path.endsWith("/delivery")) { reads++; return Response.json(response(queued ? { ...retryable, version: 5, status: "accepted", acceptedAt: row.createdAt, canRetry: false } : retryable)); }
  });
  const root = await mount();
  try { await click("Retry notification"); assert.equal(writes.length, 1); assert.equal(writes[0]!.path, `/api/admin/enquiries/${row.id}/delivery/retry`); assert.equal(writes[0]!.options?.method, "POST"); assert.deepEqual(JSON.parse(String(writes[0]!.options?.body)), { expectedVersion: 3 }); assert.equal(new Headers(writes[0]!.options?.headers).get("X-CSRF-Token"), session.csrfToken); assert.equal(writes[0]!.options?.credentials, "same-origin"); assert.equal(reads, 2); assert.match(panel().textContent!, /accepted by.*provider/i); }
  finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("conflict or failed retry removes eligibility until deliberate refresh", async () => {
  const previous = fetch;
  try { for (const status of [409, 400, 500]) {
    let writes = 0; globalThis.fetch = transport(path => path.endsWith("/delivery/retry") ? (writes++, Response.json({}, { status })) : undefined);
    const root = await mount();
    try { await click("Retry notification"); assert.match(panel().textContent!, /reload.*notification/i); assert.equal([...panel().querySelectorAll("button")].some(item => item.textContent === "Retry notification" && !item.disabled), false); assert.equal(writes, 1); await click("Reload notification"); assert.equal(button("Retry notification").disabled, false); }
    finally { await act(async () => root.unmount()); }
  } } finally { globalThis.fetch = previous; }
});

test("malformed and wrong-enquiry replies cannot enable retries or expose provider content", async () => {
  const previous = fetch;
  try { for (const malformed of [response(retryable, true, "enq_00000000-0000-4000-8000-000000000099"), { ...response(), providerId: "PRIVATE PROVIDER" }, response({ ...retryable, attempts: 6 }), response({ ...retryable, errorCode: "PRIVATE PROVIDER" })]) {
    globalThis.fetch = transport(path => path.endsWith("/delivery") ? Response.json(malformed) : undefined); const root = await mount();
    try { assert.match(panel().textContent!, /couldn't load.*notification/i); assert.ok(!panel().textContent!.includes("PRIVATE PROVIDER")); assert.equal([...panel().querySelectorAll("button")].some(item => item.textContent === "Retry notification"), false); }
    finally { await act(async () => root.unmount()); }
  } } finally { globalThis.fetch = previous; }
});

test("denied delivery reads and retries clear private detail and drafts", async () => {
  const previous = fetch;
  try { for (const status of [401, 403]) { for (const phase of ["read", "retry"]) {
    let expired = 0;
    globalThis.fetch = transport(path => (phase === "read" ? path.endsWith("/delivery") : path.endsWith("/delivery/retry")) ? Response.json({}, { status }) : undefined);
    const root = createRoot(container);
    try { await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { expired++; }}/>)); await click("Open enquiry"); if (phase === "retry") await click("Retry notification"); assert.ok(container.querySelector("textarea") === null); assert.ok(!container.textContent!.includes(detail.email)); assert.equal(expired, status === 401 ? 1 : 0); }
    finally { await act(async () => root.unmount()); }
  } } } finally { globalThis.fetch = previous; }
});

test("late delivery from a closed enquiry cannot populate the next enquiry", async () => {
  const previous = fetch; let resolveOld: (value: Response) => void = () => {}; const other = { ...detail, id: "enq_00000000-0000-4000-8000-000000000002" };
  globalThis.fetch = transport(path => {
    if (path === `/api/admin/enquiries/${row.id}/delivery`) return new Promise(resolve => { resolveOld = resolve; });
    if (path === `/api/admin/enquiries/${other.id}/delivery`) return Response.json(response(null, true, other.id));
    if (path.endsWith(other.id)) return Response.json(other);
    if (path === "/api/admin/enquiries") return Response.json({ items: [row, { ...row, id: other.id }], nextCursor: null });
  });
  const root = await mount();
  try { await click("Close enquiry"); await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].filter(item => item.textContent === "Open enquiry")[1]!.click()); await act(async () => resolveOld(Response.json(response({ ...retryable, status: "accepted", canRetry: false })))); assert.match(panel().textContent!, /no notification.*queued/i); assert.ok(!panel().textContent!.includes("Accepted by")); }
  finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("completed workflow cannot unlock inbox while notification retry remains pending", async () => {
  const previous = fetch; let resolveRetry: (value: Response) => void = () => {}; let resolveWorkflow: (value: Response) => void = () => {}; let writes = 0;
  globalThis.fetch = transport(path => { if (path.endsWith("/delivery/retry")) { writes++; return new Promise(resolve => { resolveRetry = resolve; }); } if (path.endsWith("/review")) return new Promise(resolve => { resolveWorkflow = resolve; }); });
  const root = await mount();
  try {
    await click("Mark reviewed"); await click("Retry notification"); await click("Retry notification"); assert.equal(writes, 1);
    await act(async () => resolveWorkflow(Response.json({ ...detail, status: "reviewed", version: 1 })));
    for (const label of ["Close enquiry", "Reload inbox", "Open enquiry"]) assert.equal(button(label).disabled, true, label);
    await act(async () => resolveRetry(Response.json(response({ ...retryable, version: 4, status: "queued", canRetry: false }))));
    assert.equal(button("Close enquiry").disabled, false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("retry timeout unlocks navigation but requires a status refresh before another attempt", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const previous = fetch; let writes = 0;
  globalThis.fetch = transport((path, options) => path.endsWith("/delivery/retry") ? (writes++, new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(Error("aborted"))))) : undefined);
  const root = await mount();
  try {
    await click("Retry notification"); assert.equal(button("Close enquiry").disabled, true);
    await act(async () => t.mock.timers.tick(15_000));
    assert.match(panel().textContent!, /timed out/); assert.equal(button("Close enquiry").disabled, false);
    assert.equal([...panel().querySelectorAll("button")].some(item => item.textContent === "Retry notification"), false);
    assert.equal(writes, 1); await click("Reload notification"); assert.equal(button("Retry notification").disabled, false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; t.mock.timers.reset(); }
});

test("invalid retry response and failed post-retry refresh cannot leave stale eligibility", async () => {
  const previous = fetch;
  try { for (const failure of ["wrong_id", "refresh_failure", "refresh_denial"]) {
    let requested = false;
    globalThis.fetch = transport(path => {
      if (path.endsWith("/delivery/retry")) { requested = true; return Response.json(response(retryable, true, failure === "wrong_id" ? "enq_00000000-0000-4000-8000-000000000099" : row.id)); }
      if (path.endsWith("/delivery") && requested) return Response.json({}, { status: failure === "refresh_denial" ? 403 : 500 });
    });
    const root = await mount();
    try { await click("Retry notification"); assert.equal([...container.querySelectorAll("button")].some(item => item.textContent === "Retry notification"), false); if (failure === "refresh_denial") assert.ok(!container.textContent!.includes(detail.email)); else assert.match(panel().textContent!, /couldn't confirm.*retry/i); }
    finally { await act(async () => root.unmount()); }
  } } finally { globalThis.fetch = previous; }
});

test("session identity change discards a pending retry and ignores its eventual denial", async () => {
  const previous = fetch; let resolveOld: (value: Response) => void = () => {}; let denied = 0;
  globalThis.fetch = transport(path => path.endsWith("/delivery/retry") ? new Promise(resolve => { resolveOld = resolve; }) : undefined);
  const root = await mount();
  try {
    await click("Retry notification");
    await act(async () => root.render(<EnquiryInbox session={{ ...session, csrfToken: "b".repeat(64), user: { ...session.user, id: "second" } }} onExpired={() => { denied++; }}/>));
    await click("Open enquiry");
    await act(async () => resolveOld(Response.json({}, { status: 401 })));
    assert.equal(denied, 0); assert.match(container.textContent!, /synthetic@example.invalid/); assert.equal(button("Retry notification").disabled, false); assert.equal(button("Close enquiry").disabled, false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("completed notification retry cannot unlock inbox while workflow remains pending", async () => {
  const previous = fetch; let resolveWorkflow: (value: Response) => void = () => {};
  globalThis.fetch = transport(path => { if (path.endsWith("/delivery/retry")) return Response.json(response({ ...retryable, status: "queued", canRetry: false })); if (path.endsWith("/review")) return new Promise(resolve => { resolveWorkflow = resolve; }); });
  const root = await mount();
  try {
    await click("Mark reviewed"); await click("Retry notification");
    assert.equal(button("Close enquiry").disabled, true); assert.equal(button("Reload inbox").disabled, true);
    await act(async () => resolveWorkflow(Response.json({ ...detail, status: "reviewed", version: 1 })));
    assert.equal(button("Close enquiry").disabled, false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
