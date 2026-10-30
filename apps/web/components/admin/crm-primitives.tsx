"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { enquiryAssigneeListSchema, enquiryStageLabels, type EnquiryAssignee, type EnquiryStage } from "@shopmaple/contracts";
import { Badge } from "@/components/ui/badge";
import { Skeleton as SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

/** The viewer's local calendar date; the API never guesses a timezone. */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const dayOf = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
/** Whole calendar days from an ISO timestamp's date to the viewer's date. */
export function ageLabel(createdAt: string, today: string) {
  // Both sides are the viewer's local calendar dates: a timestamp after midnight UTC is still "today" in Kolkata.
  const days = Math.round((dayOf(today) - dayOf(localToday(new Date(createdAt)))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days < 28) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
export type DueState = "overdue" | "today" | "upcoming";
export function dueState(dueOn: string, today: string): DueState {
  return dueOn < today ? "overdue" : dueOn === today ? "today" : "upcoming";
}
export const dueLabels: Record<DueState, string> = { overdue: "Overdue", today: "Due today", upcoming: "Upcoming" };
/** Two letters from a staff email's local part: "priya.menon" becomes "PM", "staff" becomes "ST". */
export function initials(email: string) {
  const parts = email.split("@")[0]!.split(/[._+-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
export function formatDate(value: string) {
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const stageTone: Record<string, string> = {
  new: "bg-neutral-bg text-neutral",
  contacted: "bg-info-bg text-info",
  quoted: "bg-warning-bg text-warning",
  won: "bg-success-bg text-success",
  lost: "bg-danger-bg text-danger",
};
export function StageChip({ stage, children }: { stage: string; children?: ReactNode }) {
  const label = (enquiryStageLabels as Record<string, string>)[stage] ?? stage;
  return <Badge variant="secondary" data-stage={stage} className={cn("rounded-md border-0 font-semibold", stageTone[stage] ?? stageTone.new)}>{label}{children}</Badge>;
}
export function Avatar({ email, title, className }: { email: string; title?: string; className?: string }) {
  return <span data-avatar title={title ?? email} aria-label={title ?? email} className={cn("inline-grid size-7 shrink-0 place-items-center rounded-[9px] bg-primary text-2xs font-bold tracking-[0.04em] text-primary-foreground", className)}>{initials(email)}</span>;
}
const dueTone: Record<DueState, string> = { overdue: "bg-danger-bg text-danger", today: "bg-warning-bg text-warning", upcoming: "bg-neutral-bg text-neutral" };
export function DueBadge({ state, children }: { state: DueState; children?: ReactNode }) {
  return <Badge variant="secondary" data-due={state} className={cn("rounded-md border-0 font-semibold tabular-nums", dueTone[state])}>{children ?? dueLabels[state]}</Badge>;
}
/** Placeholder rows, tiles or cards shaped like the content that is loading. */
export function Skeleton({ rows = 3, variant = "row" }: { rows?: number; variant?: "row" | "tile" | "card" }) {
  return <div aria-hidden="true" className={cn("grid gap-3", variant === "tile" && "grid-cols-2 sm:grid-cols-3", variant === "card" && "sm:grid-cols-2")}>
    {Array.from({ length: rows }, (_, index) => <SkeletonBlock key={index} data-skeleton className={cn("rounded-lg", variant === "row" ? "h-12" : variant === "tile" ? "h-24" : "h-40")} style={{ animationDelay: `${index * 90}ms` }} />)}
  </div>;
}
/** A composed empty state: what is missing, why, and the one action that fills it. */
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return <div data-empty className="grid justify-items-start gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-8">
    {icon && <span aria-hidden="true" className="mb-1 grid size-9 place-items-center rounded-lg bg-accent-tint text-primary [&_svg]:size-[18px]">{icon}</span>}
    <p className="text-base font-semibold text-foreground">{title}</p>
    {children && <p className="max-w-[56ch] text-sm leading-relaxed text-muted-foreground">{children}</p>}
    {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
  </div>;
}
const noticeTone = {
  error: "border-danger/20 bg-danger-bg text-danger",
  status: "border-success/20 bg-success-bg text-success",
  info: "border-border bg-sunken text-muted-foreground",
} as const;
/** An inline message: errors are alerts, confirmations are statuses, info is neither. */
export function Notice({ tone, children, className }: { tone: "error" | "status" | "info"; children: ReactNode; className?: string }) {
  return <p role={tone === "error" ? "alert" : tone === "status" ? "status" : undefined} data-notice={tone} className={cn("flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed font-medium [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2", noticeTone[tone], className)}>{children}</p>;
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; denied: 401 | 403 } | { ok: false; denied?: undefined; message: string };
/** One bounded, validated admin read with the three outcomes every CRM panel has to handle. */
export async function readJson<T>(request: ReturnType<typeof useAdminRequest>, path: string, schema: z.ZodType<T>, failure: string, body?: object, csrfToken?: string): Promise<ReadResult<T>> {
  try {
    const response = await request(path, body && csrfToken ? writeOptions(csrfToken, body) : { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) return { ok: false, denied: response.status };
    if (!response.ok) throw Error("request");
    return { ok: true, value: schema.parse(await response.json()) };
  } catch (error) {
    return { ok: false, message: error instanceof AdminRequestTimeout ? `${failure} timed out. Try again.` : `We couldn't load ${failure.toLowerCase()}. Try again.` };
  }
}
export function writeOptions(csrfToken: string, body: object): RequestInit {
  return { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(body) };
}

/** Every active staff member with enquiry access, keyed by id, for assignee names and avatars. */
export function useDirectory(onDenied: (status: number) => void) {
  const request = useAdminRequest();
  const [staff, setStaff] = useState<Map<string, EnquiryAssignee>>(new Map());
  const denied = useRef(onDenied);
  denied.current = onDenied;
  useEffect(() => {
    let active = true;
    void (async () => {
      const found = new Map<string, EnquiryAssignee>();
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const result: ReadResult<z.infer<typeof enquiryAssigneeListSchema>> = await readJson(request, `/api/admin/enquiries/assignees?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, enquiryAssigneeListSchema, "Staff directory");
        if (!active) return;
        if (!result.ok) { if (result.denied) denied.current(result.denied); break; }
        for (const item of result.value.items) found.set(item.id, item);
        cursor = result.value.nextCursor;
        if (!cursor) break;
      }
      if (active) setStaff(found);
    })();
    return () => { active = false; };
  }, [request]);
  return staff;
}
export const stageOptions = Object.entries(enquiryStageLabels) as Array<[EnquiryStage, string]>;
