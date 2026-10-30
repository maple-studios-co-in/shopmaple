"use client";
import { useEffect, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { followUpTaskListSchema, followUpTaskSchema, type FollowUpTask } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { CheckField, FieldGrid, SelectField, Subsection, TabBar, focusRing, rowCard, useLatest, usePaged, useWrite, withCursor } from "./kit";
import { DueBadge, EmptyState, Notice, Skeleton, dueState, formatDate, localToday, readJson, useDirectory, writeOptions } from "./crm-primitives";
import { useAdminRequest } from "./use-admin-request";

// Pieces shared by the CRM screens (inbox, board, follow-ups, contacts, summary).
export type CrmViewProps = { session: StaffSession; onDenied: (status: number) => void; onOpenEnquiry: (id: string) => void; onOpenContact: (id: string) => void;
  today?: string };
export const isDenied = (status: number) => status === 401 || status === 403;
export function RetryNotice({ children, label = "Try again", disabled, onRetry }: { children: ReactNode; label?: string; disabled?: boolean; onRetry?: () => void }) {
  return <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{children}</Notice>
    {onRetry && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onRetry}>{label}</Button>}</div>;
}
export function MoreButton({ list, disabled, children }: { list: { cursor: string | null; load: (cursor: string) => unknown }; disabled?: boolean; children: ReactNode }) {
  return list.cursor && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={disabled} onClick={() => void list.load(list.cursor!)}>{children}</Button>;
}
export function SearchField({ label, busy, onValue, ...props }: ComponentProps<typeof Input> & { label: string; busy: boolean; onValue: (value: string) => void }) {
  return <><label className="grid min-w-0 flex-[1_1_16rem] gap-1.5 text-xs font-medium text-muted-foreground">{label}
    <Input className="h-8 bg-card text-sm" maxLength={100} onInput={event => onValue(event.currentTarget.value)} onChange={() => {}} {...props} /></label>
    <Button type="submit" size="sm" disabled={busy}><Search aria-hidden="true" strokeWidth={1.5} />Search</Button></>;
}
export function DateField({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return <label className={cn("grid gap-2 text-xs font-medium text-foreground", className)}>{label}
    <Input aria-label={`${label} date`} type="date" className="h-10 bg-card text-sm" {...props} /></label>;
}
const tasksPath = "/api/admin/crm/tasks";
const byDue = (a: FollowUpTask, b: FollowUpTask) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id);
const checkButton = cn("mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border border-input bg-card text-transparent",
  "transition-[background-color,border-color,color] duration-150 ease-admin hover:border-primary hover:text-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
  "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground", focusRing);
function TaskList({ tasks, today, staff, busy, onToggle, onOpenEnquiry, onOpenContact }: Partial<Pick<CrmViewProps, "onOpenEnquiry" | "onOpenContact">> & {
  tasks: FollowUpTask[]; today: string; staff: ReturnType<typeof useDirectory>; busy: boolean; onToggle: (task: FollowUpTask) => void;
}) {
  return <ul className="grid gap-2">{tasks.map(task => {
    const state = dueState(task.dueOn, today), due = formatDate(task.dueOn);
    return <li key={task.id}><article className={cn(rowCard, "items-start data-[done=true]:bg-surface")} data-task={task.id} data-due={state} data-done={task.done ? "true" : "false"}>
      <button type="button" className={checkButton} disabled={busy} aria-pressed={task.done} aria-label={task.done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
        onClick={() => onToggle(task)}><Check className="size-3" strokeWidth={2.5} aria-hidden="true" /></button>
      <div className="grid min-w-0 flex-1 gap-1 [overflow-wrap:anywhere]">
        <p className={cn("text-sm leading-snug font-semibold text-foreground", task.done && "text-muted-foreground line-through decoration-line-soft")}>{task.title}</p>
        {task.note && <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{task.note}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.done && task.completedAt ? <span className="tabular-nums">Done {formatDate(task.completedAt)}</span>
            : <DueBadge state={state}>{state === "upcoming" ? `Due ${due}` : `${state === "overdue" ? "Overdue" : "Due today"}, ${due}`}</DueBadge>}
          <span>{task.assigneeId ? staff.get(task.assigneeId)?.email ?? `Staff ${task.assigneeId}` : "Unassigned"}</span></div></div>
      <div className="flex shrink-0 gap-1 empty:hidden">{([["Enquiry", task.enquiryId, onOpenEnquiry], ["Contact", task.contactId, onOpenContact]] as const).map(([text, id, open]) =>
        open && id && <Button key={text} type="button" size="xs" variant="ghost" aria-label={`Open ${text.toLowerCase()} for ${task.title}`} onClick={() => open(id)}>{text}</Button>)}</div>
    </article></li>;
  })}</ul>;
}
/** A completion request with busy, error and notice state; shared by both task lists, and its write runs the add form too. */
function useToggle(csrfToken: string, onDenied: (status: number) => void, onDone: (before: FollowUpTask, after: FollowUpTask) => void) {
  const request = useAdminRequest();
  const write = useWrite();
  const toggle = (task: FollowUpTask) => write.run(async () => {
    const response = await request(`${tasksPath}/${encodeURIComponent(task.id)}/complete`, writeOptions(csrfToken, { expectedVersion: task.version, done: !task.done }));
    if (!write.active.current) return;
    if (isDenied(response.status)) { onDenied(response.status); return; }
    if (response.status === 409) { write.setError("This follow-up changed. Reload follow-ups before trying again."); return; }
    if (!response.ok) throw Error("toggle");
    const value = followUpTaskSchema.parse(await response.json());
    if (value.id !== task.id) throw Error("Wrong follow-up");
    onDone(task, value); write.setNotice(value.done ? "Follow-up marked done." : "Follow-up reopened.");
  }, timedOut => timedOut ? "The request timed out. Reload follow-ups to see whether it was saved." : "We couldn't update the follow-up. Reload follow-ups and try again.");
  return { ...write, toggle };
}

export function TaskPanel({ session, onDenied, parent, today = localToday(), onChanged }: Pick<CrmViewProps, "session" | "onDenied" | "today"> & {
  parent: { enquiryId: string } | { contactId: string }; onChanged?: () => void;
}) {
  const request = useAdminRequest(), staff = useDirectory(onDenied), callbacks = useLatest({ onDenied, onChanged });
  const scope = "enquiryId" in parent ? `enquiryId=${encodeURIComponent(parent.enquiryId)}` : `contactId=${encodeURIComponent(parent.contactId)}`;
  const denied = (status: number) => { open.setItems([]); done.setItems([]); callbacks.current.onDenied(status); };
  const read = (view: string, limit: number) => () =>
    readJson(request, `${tasksPath}?view=${view}&today=${today}&${scope}&limit=${limit}`, followUpTaskListSchema, "Follow-ups");
  const open = usePaged(read("open", 50), denied), done = usePaged(read("done", 20), denied);
  const reload = () => { void open.load(); void done.load(); };
  useEffect(reload, [request, today, scope, open.load, done.load]);
  const blank = { title: "", dueOn: today, assigneeId: "", note: "" };
  const [draft, setDraft] = useState(blank), [adding, setAdding] = useState(false);
  const { busy, error, setError, notice, setNotice, toggle, active, run } = useToggle(session.csrfToken, denied, (task, value) => {
    open.setItems(rows => value.done ? rows.filter(row => row.id !== task.id) : [...rows, value].sort(byDue));
    done.setItems(rows => value.done ? [value, ...rows] : rows.filter(row => row.id !== task.id));
    callbacks.current.onChanged?.();
  });
  const set = (key: keyof typeof draft) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  const canAdd = !busy && draft.title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueOn);
  function add(event: FormEvent) {
    event.preventDefault(); if (!canAdd) return;
    const { title, dueOn, assigneeId, note } = draft;
    setAdding(true);
    void run(async () => {
      const response = await request(tasksPath, writeOptions(session.csrfToken, { ...parent, title: title.trim(), dueOn, assigneeId: assigneeId || null, note: note.trim() }));
      if (!active.current) return;
      if (isDenied(response.status)) { setDraft(current => ({ ...current, title: "", note: "" })); callbacks.current.onDenied(response.status); return; }
      if (response.status === 400) { setError("Choose an active staff member with enquiry access, or leave the follow-up unassigned."); return; }
      if (!response.ok) throw Error("create");
      const value = followUpTaskSchema.parse(await response.json());
      open.setItems(rows => [...rows, value].sort(byDue));
      setDraft(blank); setNotice("Follow-up added."); callbacks.current.onChanged?.();
    }, timedOut => timedOut ? "Adding the follow-up timed out. Reload follow-ups to see whether it was saved." : "We couldn't add the follow-up. Try again.").then(() => { if (active.current) setAdding(false); });
  }
  const loading = open.loading || done.loading, failure = error || open.error || done.error, none = open.items.length === 0 && done.items.length === 0;
  const list = (tasks: FollowUpTask[]) => <TaskList tasks={tasks} today={today} staff={staff} busy={busy} onToggle={toggle} />;
  return <Subsection title="Follow-ups" aria-label="Follow-ups" aria-busy={busy || loading}>
    {loading && none && <Skeleton rows={2} />}
    {!loading && !failure && none && <EmptyState title="No follow-ups yet.">Add the next step with a due date so it shows up in Overdue and Due today.</EmptyState>}
    {open.items.length > 0 && list(open.items)}
    {done.items.length > 0 && <><p className="mt-2 text-2xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Done</p>{list(done.items)}</>}
    {failure && <RetryNotice label="Reload follow-ups" disabled={busy} onRetry={() => { setError(""); reload(); }}>{failure}</RetryNotice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    <form className="mt-1 grid gap-4 rounded-lg border border-line-soft bg-surface p-4" onSubmit={add} aria-label="Add a follow-up">
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0"><FieldGrid>
        <Field label="Follow-up title" value={draft.title} maxLength={200} onChange={set("title")} />
        <DateField label="Due" className="min-w-0" value={draft.dueOn} disabled={busy} onChange={event => set("dueOn")(event.currentTarget.value)} />
        <SelectField label="Assign follow-up to" value={draft.assigneeId} disabled={busy} onChange={event => set("assigneeId")(event.currentTarget.value)}>
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {[...staff.values()].map(item => <NativeSelectOption key={item.id} value={item.id}>{item.email}</NativeSelectOption>)}</SelectField>
        <Field label="Follow-up note" value={draft.note} maxLength={2000} multiline onChange={set("note")} />
      </FieldGrid></fieldset>
      <Button type="submit" size="sm" className="justify-self-end" disabled={!canAdd} aria-busy={adding}>{adding ? "Adding follow-up…" : "Add follow-up"}</Button></form>
  </Subsection>;
}

const views = [
  ["overdue", "Overdue", "Nothing overdue.", "Every follow-up is on time. Anything that slips past its date lands here."],
  ["today", "Due today", "Nothing due today.", "Follow-ups dated today appear here for everyone, or just for you with Only mine."],
  ["open", "Open", "No open follow-ups.", "Add one from an enquiry or a contact to plan the next step."],
  ["done", "Done", "No completed follow-ups yet.", "Finished follow-ups are kept here with who closed them."],
] as const;
export function TaskViews({ session, onDenied, onOpenEnquiry, onOpenContact, today = localToday() }: CrmViewProps) {
  const request = useAdminRequest(), staff = useDirectory(onDenied);
  const [view, setView] = useState<(typeof views)[number][0]>("overdue"), [mine, setMine] = useState(false);
  const query = `${tasksPath}?view=${view}&today=${today}${mine ? "&assignment=mine" : ""}`;
  const list = usePaged(cursor => readJson(request, withCursor(query, cursor), followUpTaskListSchema, "Follow-ups"), onDenied);
  const { busy, error, setError, notice, setNotice, toggle } = useToggle(session.csrfToken, status => { list.setItems([]); onDenied(status); },
    task => list.setItems(rows => rows.filter(row => row.id !== task.id)));
  const reload = () => { setError(""); setNotice(""); list.setItems([]); void list.load(); };
  useEffect(reload, [query, list.load]);
  const [, , emptyTitle, emptyBody] = views.find(([key]) => key === view)!;
  const failure = error || list.error;
  return <section className="grid gap-4" aria-label="Follow-up views" aria-busy={list.loading || busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <TabBar label="Follow-up filters" tabs={views} value={view} onSelect={setView} disabled={busy} />
      <CheckField label="Only mine" aria-label="Only mine" checked={mine} disabled={busy} onChange={event => setMine(event.currentTarget.checked)} className="w-auto" /></div>
    {list.loading && list.items.length === 0 && <Skeleton rows={3} />}
    {failure && <RetryNotice onRetry={reload}>{failure}</RetryNotice>}
    {notice && <Notice tone="status">{notice}</Notice>}
    {!list.loading && !failure && list.items.length === 0 && <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>}
    {list.items.length > 0 && <TaskList tasks={list.items} today={today} staff={staff} busy={busy} onToggle={toggle} onOpenEnquiry={onOpenEnquiry} onOpenContact={onOpenContact} />}
    <MoreButton list={list} disabled={list.loading || busy}>More follow-ups</MoreButton>
  </section>;
}
