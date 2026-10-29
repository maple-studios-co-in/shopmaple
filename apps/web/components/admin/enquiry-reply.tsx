"use client";
import { useEffect, useRef, useState } from "react";
import { enquiryAdminDetailSchema, type EnquiryAdminDetail } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { Notice, writeOptions } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

const bodyLimit = 5000, subjectLimit = 150;
const messages = {
  unconfigured: "Email replies are not configured on this server. Contact the customer by phone or from your own mailbox.",
  limited: "You have sent many replies recently. Wait a while before sending more.",
  failed: "The email provider did not accept the reply. It was recorded as failed in activity; check there before trying again.",
  stale: "This enquiry changed. Reload the enquiry before sending again. Your draft is kept.",
  generic: "We couldn't send the reply. Your draft is kept; reload the enquiry and check activity before trying again.",
  timeout: "The reply request timed out. Your draft is kept; check activity before sending again so the customer is not emailed twice.",
};

export function EnquiryReply({ detail, session, emailEnabled, onChange, onDenied, onBusy }: {
  detail: EnquiryAdminDetail; session: StaffSession;
  /** From the notification panel's delivery status: false refuses sends up front, null means unknown (the server decides). */
  emailEnabled: boolean | null;
  onChange: (value: EnquiryAdminDetail) => void; onDenied: (status: number) => void; onBusy: (busy: boolean) => void;
}) {
  const request = useAdminRequest();
  const [refused, setRefused] = useState(false);
  const enabled = refused ? false : emailEnabled;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const callbacks = useRef({ onChange, onDenied, onBusy });
  callbacks.current = { onChange, onDenied, onBusy };
  const path = `/api/admin/enquiries/${encodeURIComponent(detail.id)}`;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // A newer enquiry version from elsewhere clears a stale marker so the draft can be sent again.
  useEffect(() => { setStale(false); }, [detail.version]);
  const ready = enabled !== false && !denied && !stale && !busy && subject.trim().length > 0 && body.trim().length > 0 && subject.length <= subjectLimit && body.length <= bodyLimit;
  async function send() {
    if (!ready) return;
    setBusy(true); callbacks.current.onBusy(true); setError(""); setNotice("");
    try {
      const response = await request(`${path}/reply`, writeOptions(session.csrfToken, { expectedVersion: detail.version, subject: subject.trim(), body: body.trim() }));
      if (!active.current) return;
      if (response.status === 401 || response.status === 403) { setDenied(true); setSubject(""); setBody(""); callbacks.current.onDenied(response.status); return; }
      if (response.status === 409) { setStale(true); setError(messages.stale); return; }
      if (response.status === 429) { setError(messages.limited); return; }
      if (response.status === 502) { setError(messages.failed); return; }
      if (response.status === 503) { setRefused(true); setError(messages.unconfigured); return; }
      if (!response.ok) throw Error("send");
      const value = enquiryAdminDetailSchema.parse(await response.json());
      if (!active.current) return;
      if (value.id !== detail.id) throw Error("Wrong enquiry");
      callbacks.current.onChange(value);
      setSubject(""); setBody("");
      setNotice("Reply sent to the customer and recorded in activity.");
    } catch (failure) {
      if (active.current) setError(failure instanceof AdminRequestTimeout ? messages.timeout : messages.generic);
    } finally {
      if (active.current) { setBusy(false); callbacks.current.onBusy(false); }
    }
  }
  if (denied) return <section className="crm crm-section" aria-label="Reply by email"><Notice tone="info">Replies are unavailable for this account.</Notice></section>;
  return <section className="crm crm-section" aria-label="Reply by email" aria-busy={busy}>
    <h4>Reply by email</h4>
    <p className="crm-muted" style={{ marginBottom: 12 }}>Plain text goes to <strong>{detail.email}</strong> from the shop&apos;s configured sender. The full message is kept in activity.</p>
    {enabled === false && <Notice tone="info">{messages.unconfigured}</Notice>}
    <div className="crm-reply">
      <label className="crm-field"><span>Subject</span><input aria-label="Reply subject" value={subject} maxLength={subjectLimit} disabled={busy || enabled === false} onInput={event => setSubject(event.currentTarget.value)} /></label>
      <label className="crm-field"><span>Message</span><textarea aria-label="Reply message" aria-describedby="crm-reply-count" value={body} maxLength={bodyLimit} disabled={busy || enabled === false} onInput={event => setBody(event.currentTarget.value)} /></label>
      <div className="crm-reply-foot">
        <span id="crm-reply-count" className="crm-faint crm-num">{body.length}/{bodyLimit}</span>
        <button type="button" className="admin-primary" disabled={!ready} onClick={() => void send()}>{busy ? "Sending reply…" : "Send reply"}</button>
      </div>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="status">{notice}</Notice>}
  </section>;
}
