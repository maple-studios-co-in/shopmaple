"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { enquiryAdminDetailSchema, enquiryAssigneeListSchema, enquiryActivityListSchema, enquiryStageLabels, type EnquiryAdminDetail, type EnquiryAssignee, type EnquiryActivity, type EnquiryStage } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { TaskPanel } from "./crm-tasks";
import { EnquiryReply } from "./enquiry-reply";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EmptyState, Notice, Skeleton, StageChip, formatDateTime, localToday, stageOptions } from "./crm-primitives";
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
    case "email_sending": return `Email send unconfirmed: ${item.subject ?? ""}`;
    case "email_sent": return `Email sent: ${item.subject ?? ""}`;
    case "email_failed": return `Email failed to send: ${item.subject ?? ""}`;
  }
}

export type TimelineKind = "stage" | "email" | "task" | "note" | "plain";
export type TimelineItem = { id: string; kind: TimelineKind; title: ReactNode; body?: string | null; meta: ReactNode };
const markerTone: Record<TimelineKind, string> = { stage: "bg-info", email: "bg-primary", task: "bg-success", note: "bg-warning", plain: "bg-neutral" };
/** A vertical activity list: a hairline rail with a dot per entry, coloured by what happened. Newest first. */
export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return <ol data-timeline aria-label={label} className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line-soft">
    {items.map(item => <li key={item.id} data-timeline-entry={item.id} data-kind={item.kind} className="relative grid min-w-0 gap-1 pl-6 [overflow-wrap:anywhere]">
      <span aria-hidden="true" data-timeline-marker className={cn("absolute top-[5px] left-0 size-[11px] rounded-full ring-[3px] ring-background", markerTone[item.kind])} />
      <span className="text-sm leading-snug font-semibold text-foreground">{item.title}</span>
      {item.body && <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{item.body}</p>}
      <span className="text-xs text-muted-foreground tabular-nums">{item.meta}</span>
    </li>)}
  </ol>;
}
const subheading = "text-sm font-semibold text-foreground";
const fieldLabel = "grid gap-1.5 text-xs font-medium text-foreground";
const activityKind = (action: EnquiryActivity["action"]): TimelineKind => action === "status_changed" ? "stage" : action.startsWith("email") ? "email" : action.startsWith("task") ? "task" : action === "note" ? "note" : "plain";

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
  const [pending, setPending] = useState<"assignment" | "notes" | "stage" | "reload" | null>(null);
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
    writing.current = true; setBusy(true); setPending(action); callbacks.current.onBusy(true); setError(""); setNotice("");
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
    } finally { writing.current = false; if (active.current) { setBusy(false); setPending(null); callbacks.current.onBusy(false); } }
  }
  const current = detail.assignedToId ? assignees.find(item => item.id === detail.assignedToId)?.email ?? `Staff ${detail.assignedToId} (not in the loaded eligible directory)` : "Unassigned";
  const unavailable = !!selected && !assignees.some(item => item.id === selected);
  const staffName = (id: string) => assignees.find(item => item.id === id)?.email ?? `staff ${id}`;
  const timeline: TimelineItem[] = activity.map(item => ({
    id: item.id, kind: activityKind(item.action), title: describeActivity(item, staffName), body: item.body,
    meta: <><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> by {staffName(item.actorId)}</>,
  }));
  return <section aria-label="Internal enquiry workflow" aria-busy={busy} className="grid gap-7">
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h4 className={subheading}>Pipeline stage</h4>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Current: <StageChip stage={detail.status} /> Every change is recorded with your name. Lost needs a short reason.</p>
      </div>
      <div role="group" aria-label="Pipeline stage" className="flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
        {stageOptions.map(([stage, label]) => <Button key={stage} type="button" size="sm" variant="ghost" aria-pressed={detail.status === stage} disabled={busy || stale || replyBusy || detail.status === stage}
          aria-busy={pending === "stage" ? true : undefined}
          className="h-7 px-3 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:disabled:opacity-100"
          onClick={() => { if (stage === "lost") { setLostPrompt(true); return; } setLostPrompt(false); void save("stage", stage); }}>{label}</Button>)}
      </div>
      {detail.status === "lost" && detail.lostReason && <p className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs text-muted-foreground">Reason: {detail.lostReason}</p>}
      {lostPrompt && detail.status !== "lost" && <div className="grid max-w-[480px] gap-2 rounded-lg border border-border bg-card p-3 shadow-xs">
        <label className={fieldLabel}>Why was this enquiry lost?<Textarea aria-label="Reason for losing" value={lostReason} maxLength={500} rows={2} disabled={busy} className="min-h-16 bg-card text-sm" onInput={event => setLostReason(event.currentTarget.value)} /></label>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy || stale || !lostReason.trim()} onClick={() => void save("stage", "lost")}>Confirm lost</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setLostPrompt(false); setLostReason(""); }}>Cancel</Button>
        </div>
      </div>}
    </div>
    <div className="grid gap-3 border-t border-line-soft pt-6">
      <div className="grid gap-1">
        <h4 className={subheading}>Assignment</h4>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Current assignee: {current}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className={cn(fieldLabel, "min-w-56 flex-1")}>Assign to<NativeSelect aria-label="Assign to" size="sm" containerClassName="w-full" className="bg-card" value={selected} disabled={busy || stale || directoryBusy} onChange={event => setSelected(event.target.value)}>
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {unavailable && <NativeSelectOption value={selected} disabled>Staff {selected} (not in the loaded directory)</NativeSelectOption>}
          {assignees.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.email}</NativeSelectOption>)}
        </NativeSelect></label>
        <Button type="button" size="sm" aria-busy={pending === "assignment" ? true : undefined} disabled={busy || stale || directoryBusy || unavailable || selected === (detail.assignedToId ?? "")} onClick={() => void save("assignment")}>Save assignment</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || directoryBusy} onClick={() => void directory()}>Reload assignees</Button>
        {assigneeCursor && <Button type="button" size="sm" variant="ghost" disabled={busy || directoryBusy} onClick={() => void directory(assigneeCursor)}>More assignees</Button>}
      </div>
      {directoryBusy && <p role="status" className="text-xs text-muted-foreground">Loading assignees…</p>}
      {directoryError && <Notice tone="error">{directoryError}</Notice>}
    </div>
    <div className="grid gap-3 border-t border-line-soft pt-6">
      <div className="grid gap-1">
        <h4 className={subheading}>Internal notes</h4>
        <p id="enquiry-note-help" className="text-xs text-muted-foreground">Visible to authorised staff only. Adding a note does not send a customer reply.</p>
      </div>
      <label className={fieldLabel}>Internal note<Textarea aria-label="Internal note" aria-describedby="enquiry-note-help enquiry-note-count" value={draft} rows={4} maxLength={2000} disabled={busy} className="min-h-24 bg-card text-sm leading-relaxed" onInput={event => setDraft(event.currentTarget.value)} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <p id="enquiry-note-count" className="mr-auto text-xs text-muted-foreground tabular-nums">{draft.length}/2000 characters</p>
        <Button type="button" size="sm" variant="ghost" aria-busy={pending === "reload" ? true : undefined} disabled={busy} onClick={() => void save("reload")}>Reload enquiry</Button>
        <Button type="button" size="sm" aria-busy={pending === "notes" ? true : undefined} disabled={busy || stale || !draft.trim() || draft.length > 2000} onClick={() => void save("notes")}>Add internal note</Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="status">{notice}</Notice>}
      {busy && <p role="status" className="text-xs text-muted-foreground">Saving or reloading enquiry…</p>}
    </div>
    <div className="grid gap-3 border-t border-line-soft pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={subheading}>Internal activity</h4>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={busy || activityBusy} onClick={() => void history()}>Reload activity</Button>
        </div>
      </div>
      {activityBusy && <p role="status" className="sr-only">Loading activity…</p>}
      {activityBusy && activity.length === 0 && <Skeleton rows={2} />}
      {activityError && <Notice tone="error">{activityError}</Notice>}
      {!activityBusy && !activityError && activity.length === 0 && <EmptyState title="No internal activity yet.">Stage changes, assignments, notes, follow-ups and emails on this enquiry appear here.</EmptyState>}
      {timeline.length > 0 && <Timeline items={timeline} label="Enquiry activity" />}
      {activityCursor && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={busy || activityBusy} onClick={() => void history(activityCursor)}>Older activity</Button>}
    </div>
    <div className="border-t border-line-soft pt-6">
      <TaskPanel session={session} onDenied={status => callbacks.current.onDenied(status)} parent={{ enquiryId: detail.id }} today={localToday()} onChanged={() => void history()} />
    </div>
    <div className="border-t border-line-soft pt-6">
      <EnquiryReply detail={detail} session={session} emailEnabled={emailEnabled} onChange={value => { callbacks.current.onChange(value); void history(); }} onDenied={status => { active.current = false; setDraft(""); callbacks.current.onDenied(status); }} onBusy={value => { setReplyBusy(value); callbacks.current.onBusy(value); }} />
    </div>
  </section>;
}
