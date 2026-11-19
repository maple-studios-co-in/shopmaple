"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Monitor, MousePointer2, MousePointerClick, Pause, Play, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import {
  previewDevices,
  previewDeviceWidths,
  previewFrameUrl,
  previewRouteFor,
  keepPreviewMode,
  previewMessageSource,
  readPreviewMessage,
  readPreviewMode,
  type PreviewDevice,
  type PreviewPicture,
  type PreviewSlider,
  type PreviewView,
} from "@/lib/live-preview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState, Skeleton } from "./crm-primitives";
import type { PreviewToken } from "./use-preview-token";
import type { TextEditMessage, TextReply, TextSelectMessage } from "./use-click-to-edit";
import type { TemplateMediaKey } from "@shopmaple/contracts";
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
  /** What the last save for the preview left out because it is still unfinished ("Instagram post 3"). */
  leftOut?: string[];
  /** What the last save for the preview showed with a stand-in ("Campaign “Sofas hero” banner: phone picture"). */
  standIns?: string[];
  /** Pictures just chosen in the editor (a new `nonce` each time): swapped in on the page at once, before the save. */
  pictures?: { nonce: number; items: PreviewPicture[] } | null;
  auto: boolean;
  onAutoChange: (next: boolean) => void;
  onUpdateNow: () => void;
  onClose: () => void;
  /** The token shared with the section thumbnails (usePreviewToken in the editor). */
  previewToken: PreviewToken;
  focusedSection: string | null;
  /** The slide a slider's editor has open: the frame shows it and holds it in view; `index: null` lets the slider run. */
  slide?: { slider: PreviewSlider; index: number | null };
  /** The staff member pressed "Edit" on a section inside the preview. */
  onSelectSection?: (section: string) => void;
  /** Click-to-edit is offered (Edit or Publish access); View access only browses. */
  textEditing?: boolean;
  /** Click-to-edit: they clicked these words on the page; reply whether a field holds them. */
  onTextSelect?: (message: TextSelectMessage, reply: TextReply) => void;
  /** Click-to-edit: they typed over those words and kept them; reply whether the field took them. */
  onTextEdit?: (message: TextEditMessage, reply: TextReply) => void;
  /** Click-to-edit: they clicked a picture staff chose (an Artwork placement, or a banner, card, slide, post or film), on this page. */
  onMediaSelect?: (picture: { slot: TemplateMediaKey } | { target: string }, path: string) => void;
  /**
   * Whether the page in the frame already shows the draft: every change since it loaded was typed on the page itself.
   * Then a newer token is handed to the page instead of reloading it (owner, 14 Nov 2026: "on edit the page keep reloading").
   */
  isFrameCurrent?: () => boolean;
  /** The draft page in the frame finished loading at this version. */
  onFrameReady?: (version: number) => void;
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
export function LivePreview({ path, title, version, publishedVersion, draftRequired, onSaveFirst, paused, dirty, busy, blocked, leftOut = [], standIns = [], pictures = null, auto, onAutoChange, onUpdateNow, onClose, previewToken, focusedSection, slide, onSelectSection, textEditing = false, onTextSelect, onTextEdit, onMediaSelect, isFrameCurrent, onFrameReady }: LivePreviewProps) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [view, setView] = useState<PreviewView>("draft");
  /** Edit (the default) or Browse, where clicks follow links as a shopper's would; kept for the tab (lib/live-preview.ts). */
  const [editMode, setEditMode] = useState(() => readPreviewMode() === "edit");
  const chooseMode = (edit: boolean) => { setEditMode(edit); keepPreviewMode(edit ? "edit" : "browse"); };
  /** Words on the page are being typed over: a newer draft waits, so a reload never wipes them. */
  const [frameEditing, setFrameEditing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [frameStatus, setFrameStatus] = useState<"loading" | "ready">("loading");
  const [framePath, setFramePath] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { token, minting, error: mintError, retry } = previewToken;
  const src = token ? previewFrameUrl({ path, token, view }) : null;
  // The address the frame shows. It follows `src`, except: while words on the page are being typed over (the reload
  // waits), and when only the token moved on for a page that already shows the draft (the page takes the new token in
  // place, so it never reloads after a click-to-edit save). A real reload of the same page keeps its scroll position.
  const [shownSrc, setShownSrc] = useState(src);
  const shownPage = useRef(`${path}|${view}`);
  const restoreScroll = useRef(0);
  const currentRef = useRef(isFrameCurrent), readyRef = useRef(onFrameReady), viewRef = useRef(view), pathRef = useRef(path);
  currentRef.current = isFrameCurrent;
  readyRef.current = onFrameReady;
  viewRef.current = view;
  pathRef.current = path;
  /**
   * The page the frame shows when it was browsed to inside the frame (its frame route, and its own query: a collection's
   * sort, a product's variant), or null while it shows `path`. A save reloads that page, so the change shows where staff
   * are looking; before, every save took the frame back to the screen's own page, the homepage for most screens (owner,
   * 17 Nov 2026: a new Sofas banner never showed while the preview sat on the Sofas page). Choosing another page in the
   * editor (`path`) still goes there.
   */
  const browsed = useRef<{ route: string; query: string } | null>(null);
  const shownPath = useRef(path);
  useEffect(() => {
    if (frameEditing || src === shownSrc) return;
    // Every save mints a token for the new version, and the token is empty meanwhile. Before, that emptied the frame and
    // loaded the page again from the top after each save. Keep showing the page until the new token arrives.
    if (src === null && shownSrc !== null && !draftRequired && !mintError) return;
    const page = `${path}|${view}`;
    const samePage = page === shownPage.current && src !== null && shownSrc !== null;
    // The same page, loaded and listening: it never reloads. When it already shows the draft (words typed on it) it only
    // takes the new token; otherwise it redraws itself from the new version in place, keeping where it is scrolled and
    // whatever is open on it (owner, 17 Nov 2026: a footer icon changed and the preview jumped back to the hero).
    if (samePage && token && version && frameStatus === "ready") {
      const type = view === "draft" && currentRef.current?.() ? "token" : "refresh";
      frame.current?.contentWindow?.postMessage({ source: previewMessageSource, type, token, version }, window.location.origin);
      return;
    }
    let scrolled = 0;
    try { scrolled = samePage ? frame.current?.contentWindow?.scrollY ?? 0 : 0; } catch { scrolled = 0; }
    restoreScroll.current = scrolled;
    const stay = path === shownPath.current ? browsed.current : null;
    if (!stay) browsed.current = null;
    shownPage.current = page;
    shownPath.current = path;
    setShownSrc(stay && token ? `${previewFrameUrl({ path: stay.route, token, view })}${stay.query ? `&${stay.query}` : ""}` : src);
  }, [src, frameEditing]);
  const hasToken = token !== null;
  const unpublished = view === "published" && publishedVersion === null;
  // The message listener is registered once; it reads the latest callbacks from here.
  const selectRef = useRef(onSelectSection);
  useEffect(() => { selectRef.current = onSelectSection; }, [onSelectSection]);
  const textSelectRef = useRef(onTextSelect), textEditRef = useRef(onTextEdit);
  useEffect(() => { textSelectRef.current = onTextSelect; textEditRef.current = onTextEdit; }, [onTextSelect, onTextEdit]);
  const mediaSelectRef = useRef(onMediaSelect);
  useEffect(() => { mediaSelectRef.current = onMediaSelect; }, [onMediaSelect]);

  // Every new address starts a fresh load; the frame reports when it is ready.
  useEffect(() => { setFrameStatus("loading"); setFramePath(null); setFrameEditing(false); }, [shownSrc]);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only the mounted frame may talk to the pane; with no frame there is no one to listen to.
      const source = frame.current?.contentWindow;
      if (!source) return;
      const message = readPreviewMessage(event, window.location.origin, source);
      if (!message) return;
      if (message.type === "ready") {
        setFrameStatus("ready");
        setFramePath(message.path);
        setFrameEditing(false);
        // Where the frame is now, with its own query when the frame's address can be read, so the next reload comes back to
        // it (see `browsed`).
        const route = previewRouteFor(message.path);
        let extra = "";
        try {
          const here = new URL(source.location.href);
          if (here.origin === window.location.origin && here.pathname === `/admin/preview-frame/${route}`) {
            const query = new URLSearchParams(here.search);
            for (const own of ["token", "view", "section"]) query.delete(own);
            extra = query.toString();
          }
        } catch { extra = ""; }
        browsed.current = route === pathRef.current && !extra ? null : { route, query: extra };
        // A reload of the same page: put it back where it was scrolled.
        if (restoreScroll.current > 0) source.postMessage({ source: previewMessageSource, type: "scroll", y: restoreScroll.current }, window.location.origin);
        restoreScroll.current = 0;
        if (viewRef.current === "draft") readyRef.current?.(message.version);
      }
      else if (message.type === "navigate") { setFramePath(message.path); setFrameStatus("loading"); }
      else if (message.type === "select") selectRef.current?.(message.section);
      else if (message.type === "editing") setFrameEditing(message.active);
      else if (message.type === "media-select") mediaSelectRef.current?.(message.slot ? { slot: message.slot } : { target: message.target! }, message.path);
      else if (message.type === "text-select" || message.type === "text-edit") {
        const phase = message.type === "text-select" ? "select" : "edit";
        const reply: TextReply = ({ ok, message: reason }) => source.postMessage(
          { source: previewMessageSource, type: "text-result", phase, ok, ...(reason ? { message: reason.slice(0, 300) } : {}) }, window.location.origin);
        if (message.type === "text-select") {
          if (textSelectRef.current) textSelectRef.current(message, reply); else reply({ ok: false });
        } else if (textEditRef.current) textEditRef.current(message, reply); else reply({ ok: false });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // Tell the frame whether clicks edit words or browse, whenever it (re)loads or the switch changes.
  useEffect(() => {
    if (frameStatus !== "ready" || view !== "draft") return;
    frame.current?.contentWindow?.postMessage({ source: previewMessageSource, type: "mode", mode: textEditing && editMode ? "edit" : "browse" }, window.location.origin);
  }, [textEditing, editMode, frameStatus, view]);
  // A picture chosen in the editor shows on the page at once, swapped in where it is; the save and the redraw follow.
  useEffect(() => {
    if (!pictures?.items.length || frameStatus !== "ready" || view !== "draft") return;
    frame.current?.contentWindow?.postMessage({ source: previewMessageSource, type: "pictures", items: pictures.items }, window.location.origin);
  }, [pictures?.nonce]);
  // The slide being edited shows in the frame and stays there; told again after each redraw, which may attach the slider anew.
  useEffect(() => {
    if (!slide || frameStatus !== "ready" || view !== "draft") return;
    frame.current?.contentWindow?.postMessage({ source: previewMessageSource, type: "slide", slider: slide.slider, index: slide.index }, window.location.origin);
  }, [slide?.slider, slide?.index, frameStatus, view, version]);
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
          : "relative h-[72dvh] min-h-[520px] rounded-xl md:h-[calc(100dvh-8.5rem)] lg:sticky lg:top-20",
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
          {view === "draft" && textEditing && (
            // Two plain choices, never one toggle: the single button read "Click to edit" while editing was on, so pressing
            // it turned editing off and the next click on the page opened that page (owner, 16 Nov 2026).
            <div role="group" aria-label="What a click on the page does" data-click-mode={editMode ? "edit" : "browse"}
              className="flex items-center gap-0.5 rounded-full border border-line-soft bg-sunken p-0.5">
              <Button type="button" variant="ghost" size="sm" aria-pressed={editMode} data-click-to-edit="edit" onClick={() => chooseMode(true)}
                title="Edit: a click changes the words or the picture you click. Links, buttons and forms on the page do nothing."
                className="h-6 gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-xs">
                <MousePointerClick aria-hidden="true" strokeWidth={1.5} /><span>Edit</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" aria-pressed={!editMode} data-click-to-edit="browse" onClick={() => chooseMode(false)}
                title="Browse: a click opens pages and works as it does for visitors. Nothing on the page is edited."
                className="h-6 gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-xs">
                <MousePointer2 aria-hidden="true" strokeWidth={1.5} /><span>Browse</span>
              </Button>
            </div>
          )}
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
      {/* What keeps the preview from showing every edit, in full: the status line above has room for a few words only, and
          a cut-off "Check campaig…" was all the owner saw while the preview waited (17 Nov 2026). */}
      {view === "draft" && (blocked || leftOut.length > 0 || standIns.length > 0) && !draftRequired && (
        <div data-preview-attention aria-live="polite" className="mx-3 mb-2 grid max-h-28 gap-1 overflow-y-auto rounded-lg border border-line-soft bg-surface px-3 py-2 text-xs leading-relaxed text-foreground">
          {blocked && <p data-preview-blocked><span className="font-semibold">The preview is waiting for one fix.</span> {blocked} Everything else shows once it is fixed.</p>}
          {standIns.length > 0 && <p data-preview-stand-ins><span className="font-semibold">Shown with a stand-in until you add your own:</span> {standIns.join("; ")}. Add {standIns.length === 1 ? "it" : "them"} before you save or publish.</p>}
          {leftOut.length > 0 && <p data-preview-left-out><span className="font-semibold">Not shown until finished:</span> {leftOut.join("; ")}. Finish or remove {leftOut.length === 1 ? "it" : "them"} to show {leftOut.length === 1 ? "it" : "them"} and to publish.</p>}
        </div>
      )}
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
          ) : shownSrc ? (
            <iframe ref={frame} data-live-preview-frame title={frameTitle} src={shownSrc} referrerPolicy="same-origin" className={cn("block min-h-full w-full flex-1 border-0 bg-white", device === "phone" ? "rounded-2xl" : "rounded-[10px]")} />
          ) : (
            <div className={placeholder} aria-busy="true"><div className="w-full max-w-[420px]"><Skeleton rows={3} variant="card" /></div></div>
          )}
        </div>
      </div>
    </aside>
  );
}

const placeholder = "grid flex-1 place-items-center rounded-[10px] bg-surface p-8 text-center";
