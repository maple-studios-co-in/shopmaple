import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { detailOf, fakeFetch, installDom, makeButton, session, setValue, summary } from "./support/crm-fixtures";
const { dom, container } = installDom();
const { createRoot } = await import("react-dom/client");
const { EnquiryReply } = await import("../components/admin/enquiry-reply");
const button = makeButton(container);
const detail = detailOf(summary(1, { name: "Asha Rao" }));
const control = (label: string) => container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);

test("without a configured sender the composer explains itself and refuses to send", async () => {
  const previous = fetch; let writes = 0;
  globalThis.fetch = fakeFetch((_path, options) => { if (options?.method === "POST") { writes++; return Response.json({ code: "EMAIL_NOT_CONFIGURED" }, { status: 503 }); } return undefined; });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryReply detail={detail as any} session={session} emailEnabled={false} onChange={() => {}} onDenied={() => {}} onBusy={() => {}} />));
    assert.match(container.querySelector('[aria-label="Reply by email"]')?.textContent ?? "", /not configured/i);
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
    assert.equal(button("Send reply").disabled, true, "needs a subject and a message");
    assert.match(container.textContent!, /customer@example\.invalid/, "shows who will receive the email");
    await setValue(dom, control("Reply subject"), "Your Nimbus sofa");
    await setValue(dom, control("Reply message"), "Hi Asha,\n\nThe sofa ships in 3 weeks. <b>Plain text</b>\n\nMaple");
    assert.match(container.textContent!, /\d+\/5000/, "the length budget is visible");
    await act(async () => button("Send reply").click());
    assert.deepEqual(writes[0], { path: `/api/admin/enquiries/${detail.id}/reply`, body: { expectedVersion: 0, subject: "Your Nimbus sofa", body: "Hi Asha,\n\nThe sofa ships in 3 weeks. <b>Plain text</b>\n\nMaple" }, csrf: session.csrfToken });
    assert.equal(changes.length, 1); assert.equal(changes[0].version, 1);
    assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /sent/i);
    assert.equal((control("Reply message") as HTMLTextAreaElement).value, "", "the composer clears after a send");
    assert.equal(container.querySelector("b"), null);
    for (const [mode, pattern] of [["limited", /many replies|wait/i], ["failed", /did not accept|recorded/i], ["unconfigured", /not configured/i]] as const) {
      outcome = mode;
      await act(async () => root.render(<EnquiryReply detail={{ ...detail, version: 1 } as any} session={session} emailEnabled={true} onChange={value => changes.push(value)} onDenied={() => {}} onBusy={() => {}} />));
      await setValue(dom, control("Reply subject"), "Again");
      await setValue(dom, control("Reply message"), "Second message");
      await act(async () => button("Send reply").click());
      assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", pattern, mode);
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
    await setValue(dom, control("Reply subject"), "Hello"); await setValue(dom, control("Reply message"), "Keep me");
    await act(async () => button("Send reply").click());
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
    assert.equal(button("Send reply").disabled, true);
    assert.equal((control("Reply message") as HTMLTextAreaElement).value, "Keep me");
    status = 401;
    await act(async () => root.render(<EnquiryReply detail={{ ...detail, version: 2 } as any} session={session} emailEnabled={null} onChange={() => {}} onDenied={code => { if (code === 401) expired++; }} onBusy={() => {}} />));
    await setValue(dom, control("Reply subject"), "Hello"); await setValue(dom, control("Reply message"), "Secret");
    await act(async () => button("Send reply").click());
    assert.equal(expired, 1);
    assert.equal(container.querySelector("textarea"), null, "denied access removes the draft");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
