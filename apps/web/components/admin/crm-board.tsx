"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, ArrowUpRight, GripVertical, RotateCw, UserRound } from "lucide-react";
import { enquiryAdminDetailSchema, enquiryAdminListSchema, enquiryStageLabels, enquiryStages, type EnquiryAdminSummary, type EnquiryStage } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ActionButton, focusRing, useLatest } from "./kit";
import { isDenied, type CrmViewProps } from "./crm-tasks";
import { Avatar, DueBadge, Notice, Skeleton, ageLabel, dueState, localToday, readJson, stageOptions, useDirectory, writeOptions } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

type BoardItem = EnquiryAdminSummary & { lostReason?: string | null; pending?: boolean };
type Columns = Record<EnquiryStage, BoardItem[]>;
const emptyColumns = (): Columns => ({ new: [], contacted: [], quoted: [], won: [], lost: [] });
const emptyCopy: Record<EnquiryStage, string> = { new: "No new enquiries. Fresh submissions land here.", contacted: "Nothing contacted yet. Drag a card here once you have replied.",
  quoted: "Nothing quoted yet. Move an enquiry here when a quote goes out.", won: "No wins yet.", lost: "Nothing lost. Each lost enquiry keeps a short reason." };
/** Cards per column; a column with more shows a pointer to the list view instead of loading everything. */
const columnLimit = 50;
const stageOf = (value: string): EnquiryStage => (enquiryStages as readonly string[]).includes(value) ? value as EnquiryStage : "new";
const columnNote = "text-xs leading-relaxed text-muted-foreground";
const iconButton = { type: "button", variant: "ghost", size: "icon-sm" } as const;
const cardClass = cn("relative gap-2 rounded-lg p-2.5 shadow-xs transition-[box-shadow,opacity] duration-200 ease-admin [overflow-wrap:anywhere]",
  "data-[dragging=true]:z-20 data-[dragging=true]:shadow-lg data-[pending=true]:opacity-60");
/** Asks why an enquiry was lost. A form, not a click handler: dnd-kit swallows clicks for 50ms after a drop, but not a submit. */
export function LostReason({ name, busy, locked = false, className, onConfirm, onCancel }: {
  name: string; busy: boolean; locked?: boolean; className?: string; onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState(""), ready = !busy && !locked && !!reason.trim();
  return <form className={cn("grid gap-2", className)} aria-label={`Reason for losing ${name}`} onSubmit={event => { event.preventDefault(); if (ready) onConfirm(reason.trim()); }}>
    <label className="grid gap-1.5 text-xs font-medium text-foreground">Why was this enquiry lost?
      <Textarea aria-label="Reason for losing" value={reason} maxLength={500} rows={2} disabled={busy} className="min-h-14 bg-card text-sm"
        onInput={event => setReason(event.currentTarget.value)} onChange={() => {}} /></label>
    <div className="flex gap-1.5"><Button type="submit" size="xs" disabled={!ready}>Confirm lost</Button>
      <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
function BoardCard({ card, today, staff, busy, lostPrompt, onMove, onLost, onCancelLost, onOpenEnquiry, onOpenContact }: Pick<CrmViewProps, "onOpenEnquiry" | "onOpenContact"> & {
  card: BoardItem; today: string; staff: ReturnType<typeof useDirectory>; busy: boolean; lostPrompt: boolean;
  onMove: (card: BoardItem, stage: EnquiryStage) => void; onLost: (card: BoardItem, reason: string) => void; onCancelLost: () => void;
}) {
  const locked = busy || card.pending, name = card.name || "enquiry";
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: locked });
  const assignee = card.assignedToId ? staff.get(card.assignedToId)?.email ?? card.assignedToId : null;
  return <Card ref={setNodeRef} data-card data-name={card.name} data-version={card.version} data-enquiry={card.id} data-dragging={isDragging ? "true" : undefined}
    data-pending={card.pending ? "true" : undefined} style={{ transform: CSS.Translate.toString(transform) }} className={cardClass}>
    <div className="flex items-start gap-1">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-sm leading-snug font-semibold text-foreground">{card.name || "No name given"}</p>
        <p className={cn("text-xs", card.product ? "text-muted-foreground" : "text-faint")}>{card.product || "No product noted"}</p></div>
      <Button {...iconButton} className="-mt-1 -mr-1 cursor-grab text-muted-foreground active:cursor-grabbing" data-drag-handle ref={setActivatorNodeRef} {...attributes} {...listeners}
        disabled={locked} aria-label={`Drag ${name}`}><GripVertical aria-hidden="true" strokeWidth={1.5} /></Button></div>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground tabular-nums" title={`Received ${new Date(card.createdAt).toLocaleDateString()}`}>{ageLabel(card.createdAt, today)}</span>
      {card.nextDueOn && <DueBadge state={dueState(card.nextDueOn, today)} />}
      {assignee && <Avatar email={assignee} title={`Assigned to ${staff.has(card.assignedToId!) ? assignee : `staff ${assignee}`}`} className="ml-auto" />}</div>
    {card.status === "lost" && card.lostReason && <p className="rounded-md bg-surface px-2.5 py-1.5 text-xs text-muted-foreground">{card.lostReason}</p>}
    {lostPrompt && <LostReason name={name} busy={busy} className="border-t border-line-soft pt-2.5" onConfirm={reason => onLost(card, reason)} onCancel={onCancelLost} />}
    <div className="flex items-center gap-0.5 border-t border-line-soft pt-2">
      <NativeSelect size="sm" aria-label={`Move ${name} to`} containerClassName="min-w-0 flex-1" className="h-7 bg-card pr-7 pl-2 text-xs" value={card.status} disabled={locked}
        onChange={event => onMove(card, stageOf(event.currentTarget.value))}>
        {stageOptions.map(([stage, label]) => <NativeSelectOption key={stage} value={stage}>{label}</NativeSelectOption>)}</NativeSelect>
      <Button {...iconButton} title="Open enquiry" aria-label={`Open enquiry from ${name}`} onClick={() => onOpenEnquiry(card.id)}><ArrowUpRight aria-hidden="true" strokeWidth={1.5} /></Button>
      {card.contactId && <Button {...iconButton} title="Open contact" aria-label={`Open contact for ${name}`} onClick={() => onOpenContact(card.contactId!)}>
        <UserRound aria-hidden="true" strokeWidth={1.5} /></Button>}</div>
  </Card>;
}
function BoardColumn({ stage, cards, loading, capped, children }: { stage: EnquiryStage; cards: BoardItem[]; loading: boolean; capped: boolean; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: stage });
  const label = enquiryStageLabels[stage];
  return <Card ref={setNodeRef} role="region" data-stage-column={stage} data-drop-active={isOver && active ? "true" : undefined} aria-label={`${label} column`}
    className={cn("w-64 shrink-0 gap-0 rounded-xl bg-surface py-0 shadow-xs transition-[box-shadow,border-color] duration-200 ease-admin @5xl:w-auto @5xl:min-w-0 @5xl:flex-1",
      "data-[drop-active=true]:border-primary data-[drop-active=true]:shadow-[0_0_0_1px_var(--primary)]")}>
    <header className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <span data-column-count className="rounded-md bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums"
        aria-label={`${capped ? "more than " : ""}${cards.length} in ${label}`}>{cards.length}{capped ? "+" : ""}</span></header>
    <div className="grid min-h-40 content-start gap-2 p-2">
      {loading && cards.length === 0 ? <Skeleton rows={2} variant="card" /> : children}
      {!loading && cards.length === 0 && <p className={cn(columnNote, "rounded-lg border border-dashed border-border px-3 py-4")}>{emptyCopy[stage]}</p>}
      {capped && <p className={cn(columnNote, "px-1")} data-column-capped={stage}>Showing the newest {cards.length}. More {label.toLowerCase()} enquiries are in the list view.</p>}
    </div>
  </Card>;
}

export function CrmBoard({ session, onDenied, onOpenEnquiry, onOpenContact, today = localToday() }: CrmViewProps) {
  const request = useAdminRequest(), staff = useDirectory(onDenied), contextId = useId();
  const [columns, setColumns] = useState<Columns>(emptyColumns), [capped, setCapped] = useState<Set<EnquiryStage>>(new Set());
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "status"; text: string } | null>(null);
  const [lostPrompt, setLostPrompt] = useState<string | null>(null), [liveMessage, setLiveMessage] = useState("");
  const active = useRef(true), sequence = useRef(0), denied = useLatest(onDenied);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setMessage(null);
    const read = (stage: EnquiryStage) => readJson(request, `/api/admin/enquiries?status=${stage}&limit=${columnLimit}`, enquiryAdminListSchema, "Pipeline board");
    const results = await Promise.all(enquiryStages.map(read));
    if (!active.current || current !== sequence.current) return;
    setLoading(false);
    const refused = results.find(result => !result.ok && result.denied);
    if (refused && !refused.ok && refused.denied) { setColumns(emptyColumns()); denied.current(refused.denied); return; }
    const next = emptyColumns(), full = new Set<EnquiryStage>(), failures: string[] = [];
    results.forEach((result, index) => { const stage = enquiryStages[index]!; if (!result.ok) failures.push(enquiryStageLabels[stage]);
      else { next[stage] = result.value.items; if (result.value.nextCursor) full.add(stage); } });
    setColumns(next); setCapped(full);
    if (failures.length) setMessage({ tone: "error", text: `We couldn't load part of the board (${failures.join(", ")}). Reload the board to try again.` });
  }, [request, today]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current++; }; }, [load, session.user.id]);
  function relocate(id: string, from: EnquiryStage, to: EnquiryStage, index: number | null, patch: Partial<BoardItem> = {}) {
    setColumns(current => {
      const card = current[from].find(item => item.id === id); if (!card) return current;
      const target = current[to].filter(item => item.id !== id);
      target.splice(index === null ? 0 : Math.min(index, target.length), 0, { ...card, ...patch, status: to });
      return { ...current, [from]: current[from].filter(item => item.id !== id), [to]: target };
    });
  }
  async function move(card: BoardItem, to: EnquiryStage, reason?: string) {
    const from = card.status as EnquiryStage, title = card.name || "Enquiry", target = enquiryStageLabels[to];
    if (from === to && !reason) return;
    const index = columns[from].findIndex(item => item.id === card.id);
    setLostPrompt(null); setBusy(true); setMessage(null);
    relocate(card.id, from, to, null, { pending: true, lostReason: reason ?? null });
    setLiveMessage(`Moving ${card.name || "enquiry"} to ${target}.`);
    try {
      const body = { expectedVersion: card.version, stage: to, ...(reason ? { reason } : {}) };
      const response = await request(`/api/admin/enquiries/${encodeURIComponent(card.id)}/stage`, writeOptions(session.csrfToken, body));
      if (!active.current) return;
      if (isDenied(response.status)) { setColumns(emptyColumns()); denied.current(response.status); return; }
      if (!response.ok) throw response.status;
      const { id, status, version, assignedToId, lostReason } = enquiryAdminDetailSchema.parse(await response.json());
      if (!active.current || id !== card.id) return;
      setColumns(current => ({ ...current, [to]: current[to].map(item => item.id === id ? { ...item, status, version, assignedToId, lostReason, pending: false } : item) }));
      setMessage({ tone: "status", text: `${title} moved to ${target}.` });
      setLiveMessage(`${title} is now in ${target}.`);
    } catch (failure) {
      if (!active.current) return;
      relocate(card.id, to, from, index, { pending: false, lostReason: card.lostReason ?? null });
      setMessage({ tone: "error", text: failure === 409 ? `${card.name || "This enquiry"} changed since the board loaded. Reload the board before moving it again.` : failure instanceof AdminRequestTimeout ? `Moving ${card.name || "the enquiry"} timed out. Reload the board to see its current stage.`
        : `We couldn't move ${card.name || "this enquiry"}. Reload the board and try again.` });
      setLiveMessage(`${title} returned to ${enquiryStageLabels[from]}.`);
    } finally { if (active.current) setBusy(false); }
  }
  function intent(card: BoardItem, to: EnquiryStage) { setLostPrompt(to === "lost" && to !== card.status ? card.id : null); if (to !== card.status && to !== "lost") void move(card, to); }
  const all = enquiryStages.flatMap(stage => columns[stage]);
  const nameOf = (id: string | number) => all.find(item => item.id === String(id))?.name || "enquiry";
  const labelOf = (id: string | number) => enquiryStageLabels[stageOf(String(id))];
  const announcements: Announcements = {
    onDragStart: ({ active: item }) => `Picked up ${nameOf(item.id)}. Move it over a column and drop to change its stage.`,
    onDragOver: ({ over }) => over ? `Over ${labelOf(over.id)}.` : "Not over a column.",
    onDragEnd: ({ over }) => over ? `Dropped in ${labelOf(over.id)}.` : "Drop cancelled.", onDragCancel: () => "Move cancelled.",
  };
  const dragEnd = ({ active: item, over }: DragEndEvent) => { const card = all.find(entry => entry.id === String(item.id)); if (card && over) intent(card, stageOf(String(over.id))); };
  const summary = `${all.length} ${all.length === 1 ? "enquiry" : "enquiries"} across ${enquiryStages.length} stages. Drag a card or use its Move to control.`;
  return <section className="@container grid min-w-0 gap-4" aria-label="Pipeline board" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">{loading && all.length === 0 ? "Loading the pipeline…" : summary}</p>
      <ActionButton icon={RotateCw} disabled={loading || busy} aria-busy={loading} onClick={() => void load()}>Reload board</ActionButton>
    </div>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <p className="sr-only" aria-live="polite">{liveMessage}</p>
    <p className="-mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground @5xl:hidden">Scroll for more stages<ArrowRight aria-hidden="true" strokeWidth={1.5} className="size-3.5" /></p>
    <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements }} onDragEnd={dragEnd}>
      {/* From 64rem of board width all five columns share the row; below it the region scrolls (keyboard too) with a faded edge. */}
      <div role="region" aria-label="Pipeline stages" tabIndex={0}
        className={cn("flex items-start gap-3 overflow-x-auto rounded-xl pr-8 pb-3 mask-r-from-[calc(100%-2rem)] @5xl:pr-0 @5xl:mask-none", focusRing)}>
        {enquiryStages.map(stage => <BoardColumn key={stage} stage={stage} cards={columns[stage]} loading={loading} capped={capped.has(stage)}>
          {columns[stage].map(card => <BoardCard key={card.id} card={card} today={today} staff={staff} busy={busy} lostPrompt={lostPrompt === card.id} onMove={intent}
            onLost={(item, reason) => void move(item, "lost", reason)} onCancelLost={() => setLostPrompt(null)} onOpenEnquiry={onOpenEnquiry} onOpenContact={onOpenContact} />)}
        </BoardColumn>)}
      </div></DndContext>
  </section>;
}
