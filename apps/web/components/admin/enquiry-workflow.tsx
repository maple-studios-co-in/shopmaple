"use client";
import { useEffect, useRef, useState } from "react";
import { enquiryAdminDetailSchema, enquiryAssigneeListSchema, enquiryActivityListSchema, enquiryStageLabels, type EnquiryAdminDetail, type EnquiryAssignee, type EnquiryActivity, type EnquiryStage } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { TaskPanel } from "./crm-tasks";
import { EnquiryReply } from "./enquiry-reply";
import { Notice, StageChip, formatDateTime, localToday, stageOptions } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

function describeActivity(item: EnquiryActivity, staff: (id: string) => string) {
  switch (item.action) {
    case "note": return "Internal note";
    case "assigned": return `Assigned to ${staff(item.assigneeId ?? "")}`;
    case "unassigned": return "Unassigned";
    case "status_changed": return `Moved to ${item.stage ? enquiryStageLabels[item.stage] : "a new stage"}`;
    case "task_created": return "Follow-up added";
    case "task_completed": return "Follow-up done";
    case "task_reopened": return "Follow-up reopened";
    case "email_sent": return `Email sent: ${item.subject ?? ""}`;
    case "email_failed": return `Email failed to send: ${item.subject ?? ""}`;
  }
}

export function EnquiryWorkflow({ detail, session, onChange, onDenied, onBusy, emailEnabled = null }: {
  detail: EnquiryAdminDetail; session: StaffSession; onChange: (value: EnquiryAdminDetail) => void;
  onDenied: (status: number) => void; onBusy: (busy: boolean) => void; emailEnabled?: boolean | null;
}) {
  const request = useAdminRequest();
  const [assignees, setAssignees] = useState<EnquiryAssignee[]>([]);
  const [assigneeCursor, setAssigneeCursor] = useState<string | null>(null);
  const [activity, setActivity] = useState<EnquiryActivity[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState(detail.assignedToId ?? "");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [error, setError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [lostPrompt, setLostPrompt] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const active = useRef(true);
  const writing = useRef(false);
  const activitySequence = useRef(0);
  const path = `/api/admin/enquiries/${encodeURIComponent(detail.id)}`;
  const callbacks = useRef({ onChange, onDenied, onBusy });
  callbacks.current = { onChange, onDenied, onBusy };
  function denied(response: Response) {
    if (response.status !== 401 && response.status !== 403) return false;
    active.current = false;
    setDraft(""); setActivity([]); setAssignees([]);
    callbacks.current.onDenied(response.status);
    return true;
  }
  const directorySequence = useRef(0);
  async function directory(cursor?: string | null) {
    const sequence = ++directorySequence.current;
    setDirectoryBusy(true); setDirectoryError("");
    try {
      const response = await request(`/api/admin/enquiries/assignees${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!active.current || sequence !== directorySequence.current || denied(response)) return;
      if (!response.ok) throw Error("directory");
      const value = enquiryAssigneeListSchema.parse(await response.json());
      if (!active.current || sequence !== directorySequence.current) return;
      setAssignees(rows => cursor ? [...rows, ...value.items.filter(item => !rows.some(row => row.id === item.id))] : value.items);
      setAssigneeCursor(value.nextCursor);
    } catch (failure) { if (active.current && sequence === directorySequence.current) setDirectoryError(failure instanceof AdminRequestTimeout ? "Loading assignees timed out. Retry the directory." : "We couldn't load assignees. Retry the directory."); }
    finally { if (active.current && sequence === directorySequence.current) setDirectoryBusy(false); }
  }
  async function history(cursor?: string | null) {
    const sequence = ++activitySequence.current;
    setActivityBusy(true); setActivityError("");
    try {
      const response = await request(`${path}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!active.current || sequence !== activitySequence.current || denied(response)) return;
      if (!response.ok) throw Error("history");
      const value = enquiryActivityListSchema.parse(await response.json());
      if (!active.current || sequence !== activitySequence.current) return;
      setActivity(rows => cursor ? [...rows, ...value.items.filter(item => !rows.some(row => row.id === item.id))] : value.items);
      setActivityCursor(value.nextCursor);
    } catch (failure) { if (active.current && sequence === activitySequence.current) setActivityError(failure instanceof AdminRequestTimeout ? "Loading activity timed out. Retry activity." : "We couldn't load activity. Retry activity."); }
    finally { if (active.current && sequence === activitySequence.current) setActivityBusy(false); }
  }
  useEffect(() => {
    active.current = true; void directory(); void history();
    return () => { active.current = false; activitySequence.current++; directorySequence.current++; };
  }, [request, path]);
  async function save(action: "assignment" | "notes" | "stage" | "reload", stage?: EnquiryStage) {
    if (writing.current || (stale && action !== "reload")) return;
    if (action === "notes" && (!draft.trim() || draft.length > 2000)) return;
    if (action === "stage" && stage === "lost" && !lostReason.trim()) return;
    writing.current = true; setBusy(true); callbacks.current.onBusy(true); setError(""); setNotice("");
    try {
      const response = await request(action === "reload" ? path : `${path}/${action}`, {
        cache: "no-store", credentials: "same-origin",
        ...(action === "reload" ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(action === "stage" ? { expectedVersion: detail.version, stage, ...(stage === "lost" ? { reason: lostReason.trim() } : {}) } : action === "assignment" ? { expectedVersion: detail.version, assigneeId: selected || null } : { expectedVersion: detail.version, body: draft.trim() }) }),
      });
      if (!active.current || denied(response)) return;
      if (response.status === 409) { setStale(true); setError("This enquiry changed. Reload the enquiry before saving again. Your unsaved note is retained."); return; }
      if (response.status === 400 && action === "assignment") { setError("That assignee is unavailable. Reload the assignee directory and choose an eligible account."); void directory(); return; }
      if (!response.ok) throw Error("save");
      const value = enquiryAdminDetailSchema.parse(await response.json());
      if (!active.current) return;
      if (value.id !== detail.id) throw Error("Wrong enquiry");
      callbacks.current.onChange(value); setSelected(value.assignedToId ?? ""); setStale(false);
      if (action === "notes") setDraft("");
      if (action === "stage") { setLostPrompt(false); setLostReason(""); }
      setNotice(action === "reload" ? "Enquiry reloaded. Your unsaved note is retained." : action === "notes" ? "Internal note added." : action === "stage" ? `Moved to ${enquiryStageLabels[value.status]}.` : "Assignment saved.");
      void history();
    } catch (failure) {
      if (active.current) { setStale(true); setError(failure instanceof AdminRequestTimeout ? "The request timed out. Your unsaved note is retained. Reload the enquiry and check activity before trying again." : "We couldn't complete the request. Your unsaved note is retained. Reload the enquiry and check activity before trying again."); }
    } finally { writing.current = false; if (active.current) { setBusy(false); callbacks.current.onBusy(false); } }
  }
  const current = detail.assignedToId ? assignees.find(item => item.id === detail.assignedToId)?.email ?? `Staff ${detail.assignedToId} (not in the loaded eligible directory)` : "Unassigned";
  const unavailable = !!selected && !assignees.some(item => item.id === selected);
  const staffName = (id: string) => assignees.find(item => item.id === id)?.email ?? `staff ${id}`;
  return <section className="crm" aria-label="Internal enquiry workflow" aria-busy={busy}>
    <div className="crm-section" style={{ marginTop: 0 }}>
      <h4>Pipeline stage</h4>
      <p className="crm-muted" style={{ marginBottom: 12 }}>Current: <StageChip stage={detail.status} /> Every change is recorded with your name. Lost needs a short reason.</p>
      <div role="group" aria-label="Pipeline stage" className="crm-stage-control">
        {stageOptions.map(([stage, label]) => <button key={stage} type="button" aria-pressed={detail.status === stage} disabled={busy || stale || replyBusy || detail.status === stage}
          onClick={() => { if (stage === "lost") { setLostPrompt(true); return; } setLostPrompt(false); void save("stage", stage); }}>{label}</button>)}
      </div>
      {detail.status === "lost" && detail.lostReason && <p className="crm-card-reason" style={{ marginTop: 10 }}>Reason: {detail.lostReason}</p>}
      {lostPrompt && detail.status !== "lost" && <div className="crm-lost-form" style={{ maxWidth: 480 }}>
        <label className="crm-field"><span>Why was this enquiry lost?</span><textarea aria-label="Reason for losing" value={lostReason} maxLength={500} rows={2} disabled={busy} onInput={event => setLostReason(event.currentTarget.value)} /></label>
        <div className="crm-lost-form-actions">
          <button type="button" className="admin-primary crm-button-small" disabled={busy || stale || !lostReason.trim()} onClick={() => void save("stage", "lost")}>Confirm lost</button>
          <button type="button" className="crm-button-small" disabled={busy} onClick={() => { setLostPrompt(false); setLostReason(""); }}>Cancel</button>
        </div>
      </div>}
    </div>
    <h4>Assignment</h4>
    <p style={{ overflowWrap: "anywhere" }}>Current assignee: {current}</p>
    <label>Assign to<select aria-label="Assign to" value={selected} disabled={busy || stale || directoryBusy} onChange={event => setSelected(event.target.value)}>
      <option value="">Unassigned</option>
      {unavailable && <option value={selected} disabled>Staff {selected} — not in loaded directory</option>}
      {assignees.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}
    </select></label>
    <button type="button" disabled={busy || stale || directoryBusy || unavailable || selected === (detail.assignedToId ?? "")} onClick={() => void save("assignment")}>Save assignment</button>
    {directoryBusy && <p role="status">Loading assignees…</p>}
    {directoryError && <p role="alert">{directoryError}</p>}
    <button type="button" disabled={busy || directoryBusy} onClick={() => void directory()}>Reload assignees</button>
    {assigneeCursor && <button type="button" disabled={busy || directoryBusy} onClick={() => void directory(assigneeCursor)}>More assignees</button>}
    <h4>Internal notes</h4><p id="enquiry-note-help">Visible to authorised staff only. Adding a note does not send a customer reply.</p>
    <label>Internal note<textarea aria-label="Internal note" aria-describedby="enquiry-note-help enquiry-note-count" value={draft} rows={4} maxLength={2000} disabled={busy} onInput={event => setDraft(event.currentTarget.value)} /></label>
    <p id="enquiry-note-count">{draft.length}/2000 characters</p>
    <button type="button" disabled={busy || stale || !draft.trim() || draft.length > 2000} onClick={() => void save("notes")}>Add internal note</button>
    <button type="button" disabled={busy} onClick={() => void save("reload")}>Reload enquiry</button>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="status">{notice}</Notice>}{busy && <p role="status" className="crm-faint">Saving or reloading enquiry…</p>}
    <h4>Internal activity</h4>
    {activityBusy && <p role="status">Loading activity…</p>}
    {activityError && <p role="alert">{activityError}</p>}
    {!activityBusy && !activityError && activity.length === 0 && <p>No internal activity yet.</p>}
    <ol className="crm-timeline">{activity.map(item => <li key={item.id}><div className="crm-timeline-entry" data-kind={item.action === "status_changed" ? "stage" : item.action.startsWith("email") ? "email" : item.action.startsWith("task") ? "task" : "plain"} style={{ overflowWrap: "anywhere" }}>
      <span className="crm-timeline-title">{describeActivity(item, staffName)}</span>
      {item.body !== null && <p className="crm-timeline-body">{item.body}</p>}
      <span className="crm-timeline-meta"><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> by {staffName(item.actorId)}</span>
    </div></li>)}</ol>
    <button type="button" disabled={busy || activityBusy} onClick={() => void history()}>Reload activity</button>
    {activityCursor && <button type="button" disabled={busy || activityBusy} onClick={() => void history(activityCursor)}>Older activity</button>}
    <TaskPanel session={session} onDenied={status => callbacks.current.onDenied(status)} parent={{ enquiryId: detail.id }} today={localToday()} onChanged={() => void history()} />
    <EnquiryReply detail={detail} session={session} emailEnabled={emailEnabled} onChange={value => { callbacks.current.onChange(value); void history(); }} onDenied={status => { active.current = false; setDraft(""); callbacks.current.onDenied(status); }} onBusy={value => { setReplyBusy(value); callbacks.current.onBusy(value); }} />
  </section>;
}
