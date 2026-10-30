"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { enquiryActivityListSchema, enquiryAdminDetailSchema, enquiryAssigneeListSchema, enquiryStageLabels, type EnquiryAdminDetail, type EnquiryStage } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { LostReason } from "./crm-board";
import { TaskPanel } from "./crm-tasks";
import { EnquiryReply } from "./enquiry-reply";
import { SelectField, Subsection, useLatest, usePaged, useWrite, withCursor } from "./kit";
import { EmptyState, Notice, Skeleton, StageChip, formatDateTime, localToday, readJson, stageOptions, writeOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

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
const actionTitles: Record<string, string> = { enquiry_received: "Enquiry received", note: "Internal note", assigned: "Assigned", unassigned: "Unassigned", updated: "Contact details updated",
  task_created: "Follow-up added", task_completed: "Follow-up done", task_reopened: "Follow-up reopened", email_sending: "Email send unconfirmed", email_sent: "Email sent", email_failed: "Email failed to send" };
/** What an enquiry or contact activity entry records, and the timeline colour for it. */
export function describeActivity({ action, stage, subject }: { action: string; stage?: EnquiryStage | null; subject?: string | null }): { title: string; kind: TimelineKind } {
  const title = action === "status_changed" ? `Moved to ${stage ? enquiryStageLabels[stage] : "a new stage"}` : actionTitles[action] ?? action;
  const kind = action === "status_changed" ? "stage" : action.startsWith("email") ? "email" : action.startsWith("task") ? "task" : action === "note" ? "note" : "plain";
  return { title: subject ? `${title}: ${subject}` : title, kind };
}
type Action = "assignment" | "notes" | "stage" | "reload";
const saved: Record<Action, string> = { reload: "Enquiry reloaded. Your unsaved note is retained.", notes: "Internal note added.", stage: "", assignment: "Assignment saved." };

export function EnquiryWorkflow({ detail, session, onChange, onDenied, onBusy, emailEnabled = null }: {
  detail: EnquiryAdminDetail; session: StaffSession; onChange: (value: EnquiryAdminDetail) => void;
  onDenied: (status: number) => void; onBusy: (busy: boolean) => void; emailEnabled?: boolean | null;
}) {
  const request = useAdminRequest();
  const [selected, setSelected] = useState(detail.assignedToId ?? "");
  const [draft, setDraft] = useState("");
  const [stale, setStale] = useState(false);
  const [lostPrompt, setLostPrompt] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const writing = useRef(false);
  const path = `/api/admin/enquiries/${encodeURIComponent(detail.id)}`;
  const callbacks = useLatest({ onChange, onDenied, onBusy });
  const { busy, error, setError, notice, setNotice, active, run } = useWrite(onBusy);
  function denied(status: number) { active.current = false; setDraft(""); callbacks.current.onDenied(status); }
  const assignees = usePaged(cursor => readJson(request, withCursor("/api/admin/enquiries/assignees", cursor), enquiryAssigneeListSchema, "Assignees"), denied);
  const activity = usePaged(cursor => readJson(request, withCursor(`${path}/activity`, cursor), enquiryActivityListSchema, "Activity"), denied);
  const { load: directory } = assignees, { load: history } = activity;
  useEffect(() => { void directory(); void history(); }, [request, path, directory, history]);
  async function save(action: Action, stage?: EnquiryStage, reason?: string) {
    if (writing.current || (stale && action !== "reload")) return;
    if (action === "notes" && (!draft.trim() || draft.length > 2000)) return;
    writing.current = true; setPending(action);
    const body = action === "stage" ? { expectedVersion: detail.version, stage, ...(reason ? { reason } : {}) } : action === "assignment" ? { expectedVersion: detail.version, assigneeId: selected || null } : { expectedVersion: detail.version, body: draft.trim() };
    await run(async () => {
      const response = await request(action === "reload" ? path : `${path}/${action}`, action === "reload" ? { cache: "no-store", credentials: "same-origin" } : writeOptions(session.csrfToken, body));
      if (!active.current) return;
      if (response.status === 401 || response.status === 403) { denied(response.status); return; }
      if (response.status === 409) { setStale(true); setError("This enquiry changed. Reload the enquiry before saving again. Your unsaved note is retained."); return; }
      if (response.status === 400 && action === "assignment") { setError("That assignee is unavailable. Reload the assignee directory and choose an eligible account."); void directory(); return; }
      if (!response.ok) throw Error("save");
      const value = enquiryAdminDetailSchema.parse(await response.json());
      if (!active.current) return;
      if (value.id !== detail.id) throw Error("Wrong enquiry");
      callbacks.current.onChange(value); setSelected(value.assignedToId ?? ""); setStale(false);
      if (action === "notes") setDraft("");
      if (action === "stage") setLostPrompt(false);
      setNotice(saved[action] || `Moved to ${enquiryStageLabels[value.status]}.`);
      void history();
    }, timedOut => { setStale(true); return `${timedOut ? "The request timed out." : "We couldn't complete the request."} Your unsaved note is retained. Reload the enquiry and check activity before trying again.`; });
    writing.current = false;
    if (active.current) setPending(null);
  }
  function pick(stage: EnquiryStage) { if (stage !== detail.status) { setLostPrompt(stage === "lost"); if (stage !== "lost") void save("stage", stage); } }
  const staffName = (id: string) => assignees.items.find(item => item.id === id)?.email ?? `staff ${id}`;
  const current = detail.assignedToId ? assignees.items.find(item => item.id === detail.assignedToId)?.email ?? `Staff ${detail.assignedToId} (not in the loaded eligible directory)` : "Unassigned";
  const unavailable = !!selected && !assignees.items.some(item => item.id === selected);
  const stageLocked = busy || stale || replyBusy;
  const timeline: TimelineItem[] = activity.items.map(item => ({ id: item.id, ...describeActivity(item), body: item.body,
    ...(item.action === "assigned" ? { title: `Assigned to ${staffName(item.assigneeId ?? "")}` } : {}),
    meta: <><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> by {staffName(item.actorId)}</> }));
  return <section aria-label="Internal enquiry workflow" aria-busy={busy} className="grid gap-7 [&>*+*]:border-t [&>*+*]:border-line-soft [&>*+*]:pt-6">
    <Subsection title="Pipeline stage" description={<>Current: <StageChip stage={detail.status} /> Every change is recorded with your name. Lost needs a short reason.</>}>
      <SelectField label="Pipeline stage" hideLabel className="sm:hidden" value={detail.status} disabled={stageLocked} onChange={event => pick(event.target.value as EnquiryStage)}>
        {stageOptions.map(([stage, label]) => <NativeSelectOption key={stage} value={stage}>{label}</NativeSelectOption>)}
      </SelectField>
      <div role="group" aria-label="Pipeline stage" className="hidden w-fit flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 sm:flex">
        {stageOptions.map(([stage, label]) => <Button key={stage} type="button" size="sm" variant="ghost" aria-pressed={detail.status === stage} disabled={stageLocked || detail.status === stage}
          aria-busy={pending === "stage" ? true : undefined} className="h-7 px-3 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:disabled:opacity-100"
          onClick={() => pick(stage)}>{label}</Button>)}
      </div>
      {detail.status === "lost" && detail.lostReason && <p className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs text-muted-foreground">Reason: {detail.lostReason}</p>}
      {lostPrompt && detail.status !== "lost" && <LostReason name={detail.name || "enquiry"} busy={busy} locked={stale} className="max-w-[480px] rounded-lg border border-border bg-card p-3 shadow-xs"
        onConfirm={reason => void save("stage", "lost", reason)} onCancel={() => setLostPrompt(false)} />}
    </Subsection>
    <Subsection title="Assignment" description={`Current assignee: ${current}`}>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField label="Assign to" className="min-w-56 flex-1" value={selected} disabled={busy || stale || assignees.loading} onChange={event => setSelected(event.target.value)}>
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {unavailable && <NativeSelectOption value={selected} disabled>Staff {selected} (not in the loaded directory)</NativeSelectOption>}
          {assignees.items.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.email}</NativeSelectOption>)}
        </SelectField>
        <Button type="button" size="sm" aria-busy={pending === "assignment" ? true : undefined} disabled={busy || stale || assignees.loading || unavailable || selected === (detail.assignedToId ?? "")} onClick={() => void save("assignment")}>Save assignment</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || assignees.loading} onClick={() => void directory()}>Reload assignees</Button>
        {assignees.cursor && <Button type="button" size="sm" variant="ghost" disabled={busy || assignees.loading} onClick={() => void directory(assignees.cursor)}>More assignees</Button>}
      </div>
      {assignees.loading && <p role="status" className="text-xs text-muted-foreground">Loading assignees…</p>}
      {assignees.error && <Notice tone="error">{assignees.error}</Notice>}
    </Subsection>
    <Subsection title="Internal notes" description={<span id="enquiry-note-help">Visible to authorised staff only. Adding a note does not send a customer reply.</span>}>
      <label className="grid gap-1.5 text-xs font-medium text-foreground">Internal note<Textarea aria-label="Internal note" aria-describedby="enquiry-note-help enquiry-note-count" value={draft} rows={4} maxLength={2000} disabled={busy} className="min-h-24 bg-card text-sm leading-relaxed" onInput={event => setDraft(event.currentTarget.value)} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <p id="enquiry-note-count" className="mr-auto text-xs text-muted-foreground tabular-nums">{draft.length}/2000 characters</p>
        <Button type="button" size="sm" variant="ghost" aria-busy={pending === "reload" ? true : undefined} disabled={busy} onClick={() => void save("reload")}>Reload enquiry</Button>
        <Button type="button" size="sm" aria-busy={pending === "notes" ? true : undefined} disabled={busy || stale || !draft.trim() || draft.length > 2000} onClick={() => void save("notes")}>Add internal note</Button>
      </div>
      {(error || notice) && <Notice tone={error ? "error" : "status"}>{error || notice}</Notice>}
      {busy && <p role="status" className="text-xs text-muted-foreground">Saving or reloading enquiry…</p>}
    </Subsection>
    <Subsection title="Internal activity" actions={<Button type="button" size="sm" variant="ghost" disabled={busy || activity.loading} onClick={() => void history()}>Reload activity</Button>}>
      {activity.loading && <p role="status" className="sr-only">Loading activity…</p>}
      {activity.loading && activity.items.length === 0 && <Skeleton rows={2} />}
      {activity.error && <Notice tone="error">{activity.error}</Notice>}
      {!activity.loading && !activity.error && activity.items.length === 0 && <EmptyState title="No internal activity yet.">Stage changes, assignments, notes, follow-ups and emails on this enquiry appear here.</EmptyState>}
      {timeline.length > 0 && <Timeline items={timeline} label="Enquiry activity" />}
      {activity.cursor && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={busy || activity.loading} onClick={() => void history(activity.cursor)}>Older activity</Button>}
    </Subsection>
    <TaskPanel session={session} onDenied={status => callbacks.current.onDenied(status)} parent={{ enquiryId: detail.id }} today={localToday()} onChanged={() => void history()} />
    <EnquiryReply detail={detail} session={session} emailEnabled={emailEnabled} onChange={value => { callbacks.current.onChange(value); void history(); }} onDenied={denied} onBusy={value => { setReplyBusy(value); callbacks.current.onBusy(value); }} />
  </section>;
}
