import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { detailOf, fakeFetch, makeButton, session, setValue, summary } from "./support/crm-fixtures";
import { installUiDom } from "./support/ui-dom";
// The composer opens in a dialog, which portals to document.body when rendered without AdminRoot.
const dom = installUiDom();
const container = document.getElementById("root")!;
const page = document.body;
const { createRoot } = await import("react-dom/client");
const { EnquiryReply } = await import("../components/admin/enquiry-reply");
const button = makeButton(page);
const detail = detailOf(summary(1, { name: "Asha Rao" }));
const control = (label: string) => page.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);

test("without a configured sender the composer explains itself and refuses to send", async () => {
  const previous = fetch; let writes = 0;
  globalThis.fetch = fakeFetch((_path, options) => { if (options?.method === "POST") { writes++; return Response.json({ code: "EMAIL_NOT_CONFIGURED" }, { status: 503 }); } return undefined; });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryReply detail={detail as any} session={session} emailEnabled={false} onChange={() => {}} onDenied={() => {}} onBusy={() => {}} />));
    assert.match(container.querySelector('[aria-label="Reply by email"]')?.textContent ?? "", /not configured/i);
    await act(async () => button("Reply").click()); // the composer lives in a dialog
    assert.equal(button("Send reply").disabled, true);
    assert.equal(writes, 0);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("a configured sender sends subject and plain text with the current version and records the outcome", async () => {
  const previous = fetch; const writes: { path: string; body: any; csrf: string | null }[] = []; const changes: any[] = [];
  let outcome: "ok" | "limited" | "failed" | "unconfigured" = "ok";
  globalThis.fetch = fakeFetch((path, options) => {
    if (options?.method === "POST") {
      writes.push({ path, body: JSON.parse(String(options.body)), csrf: new Headers(options.headers).get("X-CSRF-Token") });
      if (outcome === "limited") return Response.json({ code: "REPLY_RATE_LIMITED" }, { status: 429 });
      if (outcome === "failed") return Response.json({ code: "EMAIL_SEND_FAILED" }, { status: 502 });
      if (outcome === "unconfigured") return Response.json({ code: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
      return Response.json({ ...detail, version: writes.length });
    }
    return undefined;
  });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryReply detail={detail as any} session={session} emailEnabled={true} onChange={value => changes.push(value)} onDenied={() => {}} onBusy={() => {}} />));
    await act(async () => button("Reply").click()); // the composer lives in a dialog
    assert.equal(button("Send reply").disabled, true, "needs a subject and a message");
    assert.match(page.textContent!, /customer@example\.invalid/, "shows who will receive the email");
    await setValue(dom, control("Reply subject"), "Your Nimbus sofa");
    await setValue(dom, control("Reply message"), "Hi Asha,\n\nThe sofa ships in 3 weeks. <b>Plain text</b>\n\nMaple");
    assert.match(page.textContent!, /\d+\/5000/, "the length budget is visible");
    await act(async () => button("Send reply").click());
    assert.deepEqual(writes[0], { path: `/api/admin/enquiries/${detail.id}/reply`, body: { expectedVersion: 0, subject: "Your Nimbus sofa", body: "Hi Asha,\n\nThe sofa ships in 3 weeks. <b>Plain text</b>\n\nMaple" }, csrf: session.csrfToken });
    assert.equal(changes.length, 1); assert.equal(changes[0].version, 1);
    assert.match(page.querySelector('[role="status"]')?.textContent ?? "", /sent/i);
    await act(async () => button("Reply").click()); // a send closes the dialog: reopen it to read the composer
    assert.equal((control("Reply message") as HTMLTextAreaElement).value, "", "the composer clears after a send");
    assert.equal(page.querySelector("b"), null);
    for (const [mode, pattern] of [["limited", /many replies|wait/i], ["failed", /did not accept|recorded/i], ["unconfigured", /not configured/i]] as const) {
      outcome = mode;
      await act(async () => root.render(<EnquiryReply detail={{ ...detail, version: 1 } as any} session={session} emailEnabled={true} onChange={value => changes.push(value)} onDenied={() => {}} onBusy={() => {}} />));
      await setValue(dom, control("Reply subject"), "Again");
      await setValue(dom, control("Reply message"), "Second message");
      await act(async () => button("Send reply").click());
      assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", pattern, mode);
      assert.equal((control("Reply message") as HTMLTextAreaElement).value, "Second message", `${mode} keeps the draft`);
    }
    assert.equal(changes.length, 1, "failures never report a changed enquiry");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("a 409 marks the draft stale and keeps it, and 401 clears everything", async () => {
  const previous = fetch; let status = 409; let expired = 0;
  globalThis.fetch = fakeFetch((_path, options) => options?.method === "POST" ? Response.json({}, { status }) : undefined);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryReply detail={detail as any} session={session} emailEnabled={null} onChange={() => {}} onDenied={code => { if (code === 401) expired++; }} onBusy={() => {}} />));
    await act(async () => button("Reply").click()); // the composer lives in a dialog
    await setValue(dom, control("Reply subject"), "Hello"); await setValue(dom, control("Reply message"), "Keep me");
    await act(async () => button("Send reply").click());
    assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
    assert.equal(button("Send reply").disabled, true);
    assert.equal((control("Reply message") as HTMLTextAreaElement).value, "Keep me");
    status = 401;
    await act(async () => root.render(<EnquiryReply detail={{ ...detail, version: 2 } as any} session={session} emailEnabled={null} onChange={() => {}} onDenied={code => { if (code === 401) expired++; }} onBusy={() => {}} />));
    await setValue(dom, control("Reply subject"), "Hello"); await setValue(dom, control("Reply message"), "Secret");
    await act(async () => button("Send reply").click());
    assert.equal(expired, 1);
    assert.equal(page.querySelector("textarea"), null, "denied access removes the draft");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("Reply opens the composer in a dialog, and a successful send closes it with a status", async () => {
  const previous = fetch; const writes: unknown[] = [];
  globalThis.fetch = fakeFetch((_path, options) => { if (options?.method === "POST") { writes.push(JSON.parse(String(options.body))); return Response.json({ ...detail, version: 1 }); } return undefined; });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryReply detail={detail as any} session={session} emailEnabled={true} onChange={() => {}} onDenied={() => {}} onBusy={() => {}} />));
    assert.equal(page.querySelector('[role="dialog"]'), null, "the composer starts closed");
    await act(async () => button("Reply").click());
    const dialog = page.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog, "Reply opens a dialog");
    assert.ok(dialog.querySelector('[aria-label="Reply subject"]') && dialog.querySelector('[aria-label="Reply message"]'), "the composer fields are in the dialog");
    assert.match(dialog.textContent!, /customer@example\.invalid/, "the dialog names the recipient");
    await setValue(dom, control("Reply subject"), "Your quote");
    await setValue(dom, control("Reply message"), "Attached.");
    await act(async () => button("Send reply").click());
    assert.equal(writes.length, 1);
    assert.equal(page.querySelector('[role="dialog"]'), null, "sending closes the dialog");
    assert.match(page.querySelector('[role="status"]')?.textContent ?? "", /sent/i, "the outcome stays visible after the dialog closes");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
