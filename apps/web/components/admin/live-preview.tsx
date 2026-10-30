"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Monitor, Pause, Play, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import {
  previewDevices,
  previewDeviceWidths,
  previewFrameUrl,
  previewMessageSource,
  readPreviewMessage,
  type PreviewDevice,
  type PreviewView,
} from "@/lib/live-preview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState, Skeleton } from "./crm-primitives";
import type { PreviewToken } from "./use-preview-token";
export type { MintResult } from "./use-preview-token";

export type LivePreviewProps = {
  /** Storefront address being edited, as the frame route expects it ("home", "pages/sofas"). */
  path: string;
  title: string;
  version: number | null;
  publishedVersion: number | null;
  /** No draft has ever been saved (version 0): the API cannot mint until one explicit save happens. */
  draftRequired: boolean;
  /** Performs that first save when the user asks for it. */
  onSaveFirst: () => void;
  /** Live updates are paused after a failed quiet save until a manual save succeeds. */
  paused: boolean;
  dirty: boolean;
  busy: boolean;
  /** Why the draft cannot be saved for the preview right now (an invalid field), or "". */
  blocked: string;
  auto: boolean;
  onAutoChange: (next: boolean) => void;
  onUpdateNow: () => void;
  onClose: () => void;
  /** The token shared with the section thumbnails (usePreviewToken in the editor). */
  previewToken: PreviewToken;
  focusedSection: string | null;
  /** The staff member pressed "Edit" on a section inside the preview. */
  onSelectSection?: (section: string) => void;
};

const draftRequiredMessage = "Save the draft once to start the live preview.";
/**
 * Device frame outer widths (frame width plus the bezel padding). Every device renders at its
 * true width (desktop as a 1280 px storefront) and scales down to fit the pane.
 */
const deviceOuterWidth: Record<PreviewDevice, number> = {
  desktop: 1280 + 8,
  tablet: (previewDeviceWidths.tablet ?? 820) + 8,
  phone: (previewDeviceWidths.phone ?? 390) + 12,
};

/**
 * The builder-style preview pane. It owns the device and view switches (device frames scale
 * down to fit the pane so a tablet is a true 820 px layout), full-screen mode, and the
 * origin-checked conversation with the frame; the token comes from the editor's usePreviewToken.
 */
export function LivePreview({ path, title, version, publishedVersion, draftRequired, onSaveFirst, paused, dirty, busy, blocked, auto, onAutoChange, onUpdateNow, onClose, previewToken, focusedSection, onSelectSection }: LivePreviewProps) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [view, setView] = useState<PreviewView>("draft");
  const [fullscreen, setFullscreen] = useState(false);
  const [frameStatus, setFrameStatus] = useState<"loading" | "ready">("loading");
  const [framePath, setFramePath] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { token, minting, error: mintError, retry } = previewToken;
  const src = token ? previewFrameUrl({ path, token, view }) : null;
  const hasToken = token !== null;
  const unpublished = view === "published" && publishedVersion === null;
  // The message listener is registered once; it reads the latest callback from here.
  const selectRef = useRef(onSelectSection);
  useEffect(() => { selectRef.current = onSelectSection; }, [onSelectSection]);

  // Every new address starts a fresh load; the frame reports when it is ready.
  useEffect(() => { setFrameStatus("loading"); setFramePath(null); }, [src]);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = readPreviewMessage(event, window.location.origin, frame.current?.contentWindow ?? undefined);
      if (!message) return;
      if (message.type === "ready") { setFrameStatus("ready"); setFramePath(message.path); }
      else if (message.type === "navigate") { setFramePath(message.path); setFrameStatus("loading"); }
      else if (message.type === "select") selectRef.current?.(message.section);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // Scroll the frame to the section being edited.
  useEffect(() => {
    if (frameStatus !== "ready" || view !== "draft") return;
    frame.current?.contentWindow?.postMessage({ source: previewMessageSource, type: "focus", section: focusedSection }, window.location.origin);
  }, [focusedSection, frameStatus, view]);
  // Escape leaves full screen.
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setFullscreen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);
  // Scale a tablet or phone frame down to the stage width, so it keeps its true layout width.
  useLayoutEffect(() => {
    const node = stage.current;
    const outer = deviceOuterWidth[device];
    if (!node) { setScale(1); return; }
    const fit = () => {
      const styles = window.getComputedStyle(node);
      const available = node.clientWidth - parseFloat(styles.paddingLeft || "0") - parseFloat(styles.paddingRight || "0");
      setScale(available > 0 ? Math.min(1, available / outer) : 1);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [device, fullscreen]);

  const state = draftRequired ? "blocked" : mintError ? "error" : paused || blocked || unpublished ? "blocked" : busy ? "saving"
    : minting || !hasToken || frameStatus === "loading" ? "loading" : dirty ? "pending" : "ready";
  const statusLabel = draftRequired ? draftRequiredMessage : mintError ? mintError.message : paused ? "Live updates paused until the draft saves"
    : unpublished ? "Nothing published yet" : state === "blocked" ? blocked : state === "saving" ? "Saving draft"
    : minting || !hasToken ? "Preparing preview, loading" : state === "loading" ? "Loading preview"
    : state === "pending" ? (auto ? "Unsaved edits, updating shortly" : "Unsaved edits, update to refresh")
    : `Preview ready${view === "published" ? ", published version" : ", draft version"} ${view === "published" ? publishedVersion ?? "" : version ?? ""}`;
  const viewLabel = view === "published" ? "Published storefront" : "Draft preview";
  const frameTitle = `${viewLabel} of ${title}${framePath && framePath !== "/" ? ` (${framePath})` : ""}`;
  const onViewChange = useCallback((next: PreviewView) => setView(next), []);

  const full = fullscreen;
  const segment = "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-neutral focus-visible:outline-none transition-[color,background-color,box-shadow] duration-150 ease-admin hover:bg-white/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 [&_svg]:size-3.5";
  const segmentOn = "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs has-[input:checked]:bg-card has-[input:checked]:text-foreground has-[input:checked]:shadow-xs has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/60";
  const dot = { ready: "bg-success", loading: "bg-info motion-safe:animate-pulse", saving: "bg-info motion-safe:animate-pulse", blocked: "bg-warning", error: "bg-danger", pending: "bg-faint" }[state];
  const deviceFrame = cn("flex-none origin-top [height:calc(100%/var(--device-scale,1))] [transform:scale(var(--device-scale,1))]", device === "phone" && "rounded-[22px] p-1.5");
  return (
    <aside data-live-preview data-device={device} data-fullscreen={full ? "true" : "false"} aria-label="Live preview" style={{ "--device-scale": scale } as React.CSSProperties}
      className={cn(
        "flex min-w-0 flex-col bg-sunken shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] ring-1 ring-line-soft",
        full
          ? "fixed inset-0 z-40 rounded-none"
          : "relative h-[72dvh] min-h-[520px] rounded-xl md:h-[calc(100dvh-8.5rem)] xl:sticky xl:top-20",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 md:flex-nowrap">
        <div className="inline-flex shrink-0 gap-0.5 rounded-full bg-black/[0.07] p-[3px]" role="group" aria-label="Preview device">
          {previewDevices.map((item) => (
            <button key={item.key} type="button" aria-pressed={device === item.key} title={item.label} onClick={() => setDevice(item.key)} className={cn(segment, segmentOn, !full && "px-2")}>
              {item.key === "desktop" ? <Monitor aria-hidden="true" strokeWidth={1.5} /> : item.key === "tablet" ? <Tablet aria-hidden="true" strokeWidth={1.5} /> : <Smartphone aria-hidden="true" strokeWidth={1.5} />}
              <span className={cn(!full && "sr-only")}>{item.label}</span>
            </button>
          ))}
        </div>
        <fieldset className="inline-flex shrink-0 gap-0.5 rounded-full border-0 bg-black/[0.07] p-[3px]" aria-label="Preview version">
          {(["draft", "published"] as const).map((value) => (
            <label key={value} className={cn(segment, segmentOn, "relative cursor-pointer")}>
              <input type="radio" name="preview-view" value={value} checked={view === value} onChange={() => onViewChange(value)} className="pointer-events-none absolute size-px opacity-0" />
              {value === "draft" ? "Draft" : "Published"}
            </label>
          ))}
        </fieldset>
        <span data-preview-status data-state={state} role="status" title={statusLabel} className={cn("inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap text-muted-foreground", "max-md:order-last max-md:basis-full")}>
          <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", dot)} />
          <span className="truncate">{statusLabel}</span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" aria-pressed={!auto} title={auto ? "Pause live updates" : "Resume live updates"} onClick={() => onAutoChange(!auto)}>
            {auto ? <Pause aria-hidden="true" strokeWidth={1.5} /> : <Play aria-hidden="true" strokeWidth={1.5} />}
            <span className="sr-only">{auto ? "Pause live updates" : "Resume live updates"}</span>
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={busy || !dirty || Boolean(blocked) || draftRequired} title="Update preview" onClick={onUpdateNow}>
            <RefreshCw aria-hidden="true" strokeWidth={1.5} />
            <span className="sr-only">Update preview</span>
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"} aria-pressed={full} onClick={() => setFullscreen((value) => !value)}>
            {full ? <Minimize2 aria-hidden="true" strokeWidth={1.5} /> : <Maximize2 aria-hidden="true" strokeWidth={1.5} />}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close preview" title="Close preview" onClick={onClose}>
            <X aria-hidden="true" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch justify-center overflow-hidden px-3 pb-3" ref={stage}>
        <div data-device-frame style={{ width: deviceOuterWidth[device] }} className={cn("flex min-h-0 rounded-[14px] bg-black/10 p-1 shadow-lg", deviceFrame)}>
          {draftRequired ? (
            <div className={placeholder} data-preview-draft-required>
              <EmptyState title="No draft yet" action={<Button type="button" disabled={busy} onClick={onSaveFirst}>Save draft to start the preview</Button>}>{draftRequiredMessage} Saving creates the first draft version; nothing is published.</EmptyState>
            </div>
          ) : mintError ? (
            <div className={placeholder} data-preview-error>
              <EmptyState title="Preview unavailable" action={<Button type="button" variant="outline" onClick={retry}>Retry preview</Button>}>{mintError.message}</EmptyState>
            </div>
          ) : unpublished ? (
            <div className={placeholder}><p className="max-w-[36ch] text-sm text-muted-foreground">Nothing is published yet. Publish the draft to compare it with the live storefront.</p></div>
          ) : src ? (
            <iframe ref={frame} data-live-preview-frame title={frameTitle} src={src} referrerPolicy="same-origin" className={cn("block min-h-full w-full flex-1 border-0 bg-white", device === "phone" ? "rounded-2xl" : "rounded-[10px]")} />
          ) : (
            <div className={placeholder} aria-busy="true"><div className="w-full max-w-[420px]"><Skeleton rows={3} variant="card" /></div></div>
          )}
        </div>
      </div>
    </aside>
  );
}

const placeholder = "grid flex-1 place-items-center rounded-[10px] bg-surface p-8 text-center";
