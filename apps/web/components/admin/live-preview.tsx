"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Monitor, Pause, Play, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import {
  previewDevices,
  previewFrameUrl,
  previewMessageSource,
  previewTokenLeadMs,
  previewTokenState,
  readPreviewMessage,
  type PreviewDevice,
  type PreviewTokenState,
  type PreviewView,
} from "@/lib/live-preview";
import { Skeleton } from "./crm-primitives";

export type MintedPreview = { token: string; expiresAt: string };

export type LivePreviewProps = {
  /** Storefront address being edited, as the frame route expects it ("home", "pages/sofas"). */
  path: string;
  title: string;
  version: number | null;
  publishedVersion: number | null;
  dirty: boolean;
  busy: boolean;
  /** Why the draft cannot be saved for the preview right now (an invalid field), or "". */
  blocked: string;
  auto: boolean;
  onAutoChange: (next: boolean) => void;
  onUpdateNow: () => void;
  onClose: () => void;
  /** Mints a token bound to this staff member and draft version; null when the editor handled a failure. */
  mint: (version: number) => Promise<MintedPreview | null>;
  focusedSection: string | null;
};

const emptyToken: PreviewTokenState = { token: "", version: null, expiresAt: null };

/**
 * The builder-style preview pane. It owns the preview token lifecycle (mint for the loaded
 * version, re-mint when the version changes or expiry nears), the device and view switches,
 * full-screen mode, and the origin-checked conversation with the frame.
 */
export function LivePreview({ path, title, version, publishedVersion, dirty, busy, blocked, auto, onAutoChange, onUpdateNow, onClose, mint, focusedSection }: LivePreviewProps) {
  const [tokenState, setTokenState] = useState<PreviewTokenState>(emptyToken);
  const [minting, setMinting] = useState(false);
  const [tick, setTick] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [view, setView] = useState<PreviewView>("draft");
  const [fullscreen, setFullscreen] = useState(false);
  const [frameStatus, setFrameStatus] = useState<"loading" | "ready">("loading");
  const [framePath, setFramePath] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const mintingFor = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Mint when the draft version has no valid token; a timer wakes this up before expiry.
  useEffect(() => {
    if (version === null || minting) return;
    if (previewTokenState(tokenState, version, Date.now()) !== "mint") return;
    if (mintingFor.current === version && tokenState.version === version) return;
    mintingFor.current = version;
    setMinting(true);
    void mint(version).then((result) => {
      if (!alive.current) return;
      setMinting(false);
      if (!result) return;
      const expiresAt = Date.parse(result.expiresAt);
      setTokenState({ token: result.token, version, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + previewTokenLeadMs * 2 });
    });
  }, [version, tokenState, minting, mint, tick]);
  useEffect(() => {
    if (tokenState.expiresAt === null) return;
    const delay = Math.max(0, tokenState.expiresAt - previewTokenLeadMs - Date.now());
    const timer = setTimeout(() => { mintingFor.current = null; setTick((value) => value + 1); }, delay);
    return () => clearTimeout(timer);
  }, [tokenState]);

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

  const state = blocked || unpublished ? "blocked" : busy ? "saving" : minting || !hasToken ? "loading" : frameStatus === "loading" ? "loading" : dirty ? "pending" : "ready";
  const statusLabel =
    unpublished ? "Nothing published yet"
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
    <aside className="admin-preview-pane" data-live-preview data-device={device} data-fullscreen={fullscreen ? "true" : "false"} aria-label="Live preview">
      <div className="admin-preview-toolbar">
        <div className="admin-segmented" role="group" aria-label="Preview device">
          {previewDevices.map((item) => (
            <button key={item.key} type="button" aria-pressed={device === item.key} onClick={() => setDevice(item.key)}>
              {item.key === "desktop" ? <Monitor aria-hidden="true" strokeWidth={1.5} /> : item.key === "tablet" ? <Tablet aria-hidden="true" strokeWidth={1.5} /> : <Smartphone aria-hidden="true" strokeWidth={1.5} />}
              {item.label}
            </button>
          ))}
        </div>
        <fieldset className="admin-segmented" aria-label="Preview version">
          <label><input type="radio" name="preview-view" value="draft" checked={view === "draft"} onChange={() => onViewChange("draft")} />Draft</label>
          <label><input type="radio" name="preview-view" value="published" checked={view === "published"} onChange={() => onViewChange("published")} />Published</label>
        </fieldset>
        <span className="admin-preview-status" data-preview-status data-state={state} role="status">{statusLabel}</span>
        <span className="admin-preview-toolbar-spacer" />
        <div className="admin-preview-toolbar-group">
          <button type="button" className="admin-quiet admin-small" aria-pressed={!auto} onClick={() => onAutoChange(!auto)}>
            {auto ? <Pause aria-hidden="true" strokeWidth={1.5} /> : <Play aria-hidden="true" strokeWidth={1.5} />}
            {auto ? "Pause live updates" : "Resume live updates"}
          </button>
          <button type="button" className="admin-small" disabled={busy || !dirty || Boolean(blocked)} onClick={onUpdateNow}>
            <RefreshCw aria-hidden="true" strokeWidth={1.5} />
            Update preview
          </button>
          <button type="button" className="admin-icon-button" aria-label={fullscreen ? "Exit full screen" : "Full screen"} aria-pressed={fullscreen} onClick={() => setFullscreen((value) => !value)}>
            {fullscreen ? <Minimize2 aria-hidden="true" strokeWidth={1.5} /> : <Maximize2 aria-hidden="true" strokeWidth={1.5} />}
          </button>
          <button type="button" className="admin-icon-button" aria-label="Close preview" onClick={onClose}>
            <X aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="admin-preview-stage">
        <div className="admin-device">
          {unpublished ? (
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
