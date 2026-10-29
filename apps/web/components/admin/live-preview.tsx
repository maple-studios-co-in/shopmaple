"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Monitor, Pause, Play, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import {
  previewDevices,
  previewDeviceWidths,
  previewFrameUrl,
  previewMessageSource,
  previewTokenLeadMs,
  previewTokenState,
  readPreviewMessage,
  type PreviewDevice,
  type PreviewTokenState,
  type PreviewView,
} from "@/lib/live-preview";
import { EmptyState, Skeleton } from "./crm-primitives";

/** What minting a preview token came to; null means the session expired and the editor took over. */
export type MintResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; code: "draft-required" | "rate-limited" | "conflict" | "unavailable"; message: string };

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
  mint: (version: number) => Promise<MintResult | null>;
  focusedSection: string | null;
};

const emptyToken: PreviewTokenState = { token: "", version: null, expiresAt: null };
const draftRequiredMessage = "Save the draft once to start the live preview.";
/** Device frame outer widths (frame width plus the bezel padding) used to scale the frame to the pane. */
const deviceOuterWidth: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: (previewDeviceWidths.tablet ?? 820) + 8,
  phone: (previewDeviceWidths.phone ?? 390) + 12,
};

/**
 * The builder-style preview pane. It owns the preview token lifecycle (one mint per draft
 * version and attempt, a manual retry after a failure, re-mint when the version changes or
 * expiry nears), the device and view switches (device frames scale down to fit the pane so a
 * tablet is a true 820 px layout), full-screen mode, and the origin-checked conversation
 * with the frame.
 */
export function LivePreview({ path, title, version, publishedVersion, draftRequired, onSaveFirst, paused, dirty, busy, blocked, auto, onAutoChange, onUpdateNow, onClose, mint, focusedSection }: LivePreviewProps) {
  const [tokenState, setTokenState] = useState<PreviewTokenState>(emptyToken);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<Extract<MintResult, { ok: false }> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [view, setView] = useState<PreviewView>("draft");
  const [fullscreen, setFullscreen] = useState(false);
  const [frameStatus, setFrameStatus] = useState<"loading" | "ready">("loading");
  const [framePath, setFramePath] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  /** The (version, attempt) pair already sent to the API; a failure never re-sends it. */
  const sent = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Mint when the draft version has no valid token: once per version and attempt. A failure
  // leaves an error state with a manual retry; the expiry timer bumps the attempt in time.
  useEffect(() => {
    if (version === null || draftRequired || minting || mintError) return;
    if (previewTokenState(tokenState, version, Date.now()) !== "mint") return;
    const key = `${version}:${attempt}`;
    if (sent.current === key) return;
    sent.current = key;
    setMinting(true);
    void mint(version).then((result) => {
      if (!alive.current) return;
      setMinting(false);
      if (!result) return;
      if (!result.ok) { setMintError(result); return; }
      const expiresAt = Date.parse(result.expiresAt);
      setTokenState({ token: result.token, version, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + previewTokenLeadMs * 2 });
    });
  }, [version, draftRequired, tokenState, minting, mintError, attempt, mint]);
  useEffect(() => {
    if (tokenState.expiresAt === null) return;
    const delay = Math.max(0, tokenState.expiresAt - previewTokenLeadMs - Date.now());
    const timer = setTimeout(() => setAttempt((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [tokenState]);
  // A new version is a new attempt; an error from an older version no longer applies.
  useEffect(() => { setMintError(null); }, [version]);
  const retry = useCallback(() => { setMintError(null); setAttempt((value) => value + 1); }, []);

  const hasToken = tokenState.token !== "" && tokenState.version === version;
  const src = hasToken ? previewFrameUrl({ path, token: tokenState.token, view }) : null;
  const unpublished = view === "published" && publishedVersion === null;

  // Every new address starts a fresh load; the frame reports when it is ready.
  useEffect(() => { setFrameStatus("loading"); setFramePath(null); }, [src]);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = readPreviewMessage(event, window.location.origin, frame.current?.contentWindow ?? undefined);
      if (!message) return;
      if (message.type === "ready") { setFrameStatus("ready"); setFramePath(message.path); }
      else if (message.type === "navigate") { setFramePath(message.path); setFrameStatus("loading"); }
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
    if (!node || outer === null) { setScale(1); return; }
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

  const state = draftRequired ? "blocked"
    : mintError ? "error"
      : paused || blocked || unpublished ? "blocked"
        : busy ? "saving"
          : minting || !hasToken ? "loading"
            : frameStatus === "loading" ? "loading"
              : dirty ? "pending" : "ready";
  const statusLabel =
    draftRequired ? draftRequiredMessage
      : mintError ? mintError.message
        : paused ? "Live updates paused until the draft saves"
          : unpublished ? "Nothing published yet"
            : state === "blocked" ? blocked
              : state === "saving" ? "Saving draft"
                : minting || !hasToken ? "Preparing preview, loading"
                  : state === "loading" ? "Loading preview"
                    : state === "pending" ? (auto ? "Unsaved edits, updating shortly" : "Unsaved edits, update to refresh")
                      : `Preview ready${view === "published" ? ", published version" : ", draft version"} ${view === "published" ? publishedVersion ?? "" : version ?? ""}`;
  const viewLabel = view === "published" ? "Published storefront" : "Draft preview";
  const frameTitle = `${viewLabel} of ${title}${framePath && framePath !== "/" ? ` (${framePath})` : ""}`;
  const onViewChange = useCallback((next: PreviewView) => setView(next), []);

  return (
    <aside className="admin-preview-pane" data-live-preview data-device={device} data-fullscreen={fullscreen ? "true" : "false"} aria-label="Live preview" style={{ "--device-scale": scale } as React.CSSProperties}>
      <div className="admin-preview-toolbar">
        <div className="admin-segmented" role="group" aria-label="Preview device">
          {previewDevices.map((item) => (
            <button key={item.key} type="button" aria-pressed={device === item.key} title={item.label} onClick={() => setDevice(item.key)}>
              {item.key === "desktop" ? <Monitor aria-hidden="true" strokeWidth={1.5} /> : item.key === "tablet" ? <Tablet aria-hidden="true" strokeWidth={1.5} /> : <Smartphone aria-hidden="true" strokeWidth={1.5} />}
              <span className="admin-label-text">{item.label}</span>
            </button>
          ))}
        </div>
        <fieldset className="admin-segmented" aria-label="Preview version">
          <label><input type="radio" name="preview-view" value="draft" checked={view === "draft"} onChange={() => onViewChange("draft")} />Draft</label>
          <label><input type="radio" name="preview-view" value="published" checked={view === "published"} onChange={() => onViewChange("published")} />Published</label>
        </fieldset>
        <span className="admin-preview-status" data-preview-status data-state={state} role="status" title={statusLabel}>{statusLabel}</span>
        <div className="admin-preview-toolbar-group">
          <button type="button" className="admin-icon-button" aria-pressed={!auto} title={auto ? "Pause live updates" : "Resume live updates"} onClick={() => onAutoChange(!auto)}>
            {auto ? <Pause aria-hidden="true" strokeWidth={1.5} /> : <Play aria-hidden="true" strokeWidth={1.5} />}
            <span className="admin-sr-only">{auto ? "Pause live updates" : "Resume live updates"}</span>
          </button>
          <button type="button" className="admin-icon-button" disabled={busy || !dirty || Boolean(blocked) || draftRequired} title="Update preview" onClick={onUpdateNow}>
            <RefreshCw aria-hidden="true" strokeWidth={1.5} />
            <span className="admin-sr-only">Update preview</span>
          </button>
          <button type="button" className="admin-icon-button" aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"} aria-pressed={fullscreen} onClick={() => setFullscreen((value) => !value)}>
            {fullscreen ? <Minimize2 aria-hidden="true" strokeWidth={1.5} /> : <Maximize2 aria-hidden="true" strokeWidth={1.5} />}
          </button>
          <button type="button" className="admin-icon-button" aria-label="Close preview" title="Close preview" onClick={onClose}>
            <X aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="admin-preview-stage" ref={stage}>
        <div className="admin-device">
          {draftRequired ? (
            <div className="admin-preview-placeholder" data-preview-draft-required>
              <EmptyState title="No draft yet" action={<button type="button" className="admin-primary" disabled={busy} onClick={onSaveFirst}>Save draft to start the preview</button>}>{draftRequiredMessage} Saving creates the first draft version; nothing is published.</EmptyState>
            </div>
          ) : mintError ? (
            <div className="admin-preview-placeholder" data-preview-error>
              <EmptyState title="Preview unavailable" action={<button type="button" onClick={retry}>Retry preview</button>}>{mintError.message}</EmptyState>
            </div>
          ) : unpublished ? (
            <div className="admin-preview-placeholder"><p>Nothing is published yet. Publish the draft to compare it with the live storefront.</p></div>
          ) : src ? (
            <iframe ref={frame} className="admin-preview-frame" data-live-preview-frame title={frameTitle} src={src} referrerPolicy="same-origin" />
          ) : (
            <div className="admin-preview-placeholder" aria-busy="true"><Skeleton rows={3} variant="card" /></div>
          )}
        </div>
      </div>
    </aside>
  );
}
