"use client";
import type { ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton as SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";

// Shared admin pieces (notices, skeletons, empty states, bounded reads). The file keeps its old name
// so open branches that import from it still merge; the CRM screens it was written for are retired.

/** The viewer's local calendar date. */
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
export const ago = (createdAt: string, today: string) => { const age = ageLabel(createdAt, today); return age === "Today" ? "Today" : `${age} ago`; };
/** What the enquiry list holds, by kind: the store's forms, newsletter signups and reviews Keeri could not take. */
export const kindLabels: Record<string, string> = { contact: "Contact", project: "Project", bulk: "Bulk", newsletter: "Newsletter", review: "Review" };
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
export function Notice({ tone, children, className, ...props }: { tone: "error" | "status" | "info"; children: ReactNode; className?: string } & Record<`data-${string}`, unknown>) {
  return <p role={tone === "error" ? "alert" : tone === "status" ? "status" : undefined} data-notice={tone} {...props} className={cn("flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed font-medium [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2", noticeTone[tone], className)}>{children}</p>;
}
/** An error notice with an optional retry beside it. */
export function RetryNotice({ children, label = "Try again", disabled, onRetry }: { children: ReactNode; label?: string; disabled?: boolean; onRetry?: () => void }) {
  return <div className="flex flex-wrap items-center gap-2"><Notice tone="error" className="flex-1">{children}</Notice>
    {onRetry && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onRetry}>{label}</Button>}</div>;
}
export const isDenied = (status: number) => status === 401 || status === 403;

export type ReadResult<T> = { ok: true; value: T } | { ok: false; denied: 401 | 403 } | { ok: false; denied?: undefined; message: string };
/** One bounded, validated admin read with the three outcomes every admin panel has to handle. */
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
