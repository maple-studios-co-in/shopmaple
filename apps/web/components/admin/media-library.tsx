"use client";
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type Ref } from "react";
import { Archive, CircleCheck, Clapperboard, Clock, Copy, Crop, ImageUp, LoaderCircle, Pencil, RotateCcw, Trash2, TriangleAlert, Undo2, Upload, X } from "lucide-react";
import { describeFileSize, describeImageSize, imageFileProblem, imageSizeProblem, suggestedBannerSizes } from "@shopmaple/contracts/media-upload-rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { EmptyState, Notice } from "./crm-primitives";
import { ActionButton, PanelHeader, SectionHeading, useLatest, withCursor } from "./kit";
import { loadMediaUploadRules, measureImage, rulesOrDefault, useMediaUploadRules, type MediaUploadRulesState } from "./media-upload-rules";
import { PictureEditor } from "./picture-editor";
import { useAdminRequest } from "./use-admin-request";
/** A library file: a WebP image the server made, or a film (MP4 or WebM) kept as uploaded, with the facts its file states. */
export type MediaAsset = {
 id: string; sha256: string; kind: MediaKind; label: string; width: number | null; height: number | null; bytes: number; mimeType: string;
 durationMs: number | null; faststart: boolean | null; createdAt: string; publicAt: string | null; removedAt: string | null; url: string; previewUrl: string;
};
export type MediaKind = "image" | "video";
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]{1,100}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const count = (n: unknown, max: number) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= max;
const filmExtensions: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
function parseAsset(value: unknown): MediaAsset {
 const { id, sha256, label, width, height, bytes, mimeType, durationMs, faststart, createdAt, publicAt, removedAt, url, previewUrl } = (value ?? {}) as Partial<MediaAsset>;
 // Responses from before films carry no kind: they are images. Responses from before removal carry no removedAt.
 const kind = (value as { kind?: unknown } | null)?.kind ?? "image";
 const common = identifier(id) && typeof sha256 === "string" && /^[a-f0-9]{64}$/.test(sha256) && typeof label === "string" && label.length >= 1 && label.length <= 160
  && timestamp(createdAt) && (publicAt === null || timestamp(publicAt)) && (removedAt === undefined || removedAt === null || timestamp(removedAt)) && previewUrl === `/api/admin/media/${sha256}/preview`;
 const image = kind === "image" && count(width, 2560) && count(height, 2560) && count(bytes, 250 * 1024 * 1024) && mimeType === "image/webp" && url === `/media/uploads/${sha256}.webp`;
 const film = kind === "video" && (width === null || count(width, 16384)) && (height === null || count(height, 16384)) && count(bytes, maxFilmBytes)
  && typeof mimeType === "string" && filmExtensions[mimeType] !== undefined && url === `/media/uploads/${sha256}.${filmExtensions[mimeType]}`
  && (durationMs === null || durationMs === undefined || count(durationMs, 86_400_000)) && (faststart === null || faststart === undefined || typeof faststart === "boolean");
 if (!(common && (image || film))) throw Error("Invalid media response");
 return { id, sha256, kind, label, width: width ?? null, height: height ?? null, bytes, mimeType, durationMs: durationMs ?? null, faststart: faststart ?? null, createdAt, publicAt, removedAt: removedAt ?? null, url, previewUrl } as MediaAsset;
}
const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";
/** Films are stored as uploaded, so they must already play on the web (docs/media-library.md); 80 MB each (owner, 12 Nov 2026). */
export const maxFilmBytes = 80 * 1024 * 1024;
/** The most the API takes for one picture file, whatever Settings allow below it. */
export const serverMaxImageBytes = 8 * 1024 * 1024;
const acceptedTypes: Record<MediaKind, string[]> = { image: ["image/jpeg", "image/png", "image/webp"], video: ["video/mp4", "video/webm"] };
/** Extensions offered beside the types: some file pickers (the macOS one in embedded browsers) grey out every file for a type-only list. */
const acceptedExtensions: Record<MediaKind, string[]> = { image: [".jpg", ".jpeg", ".png", ".webp"], video: [".mp4", ".m4v", ".webm"] };
/** A file input's `accept` for one kind: its types and their extensions. */
export const uploadAccept = (kind: MediaKind) => [...acceptedTypes[kind], ...acceptedExtensions[kind]].join(",");
const typeByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm" };
/**
 * The file's type as the upload sends it: the browser's own when it is one we take, else the one its extension names
 * (some browsers report no type, or QuickTime's, for an .mp4). The server still checks the bytes themselves.
 */
export function uploadType(file: Pick<File, "name" | "type">, kind: MediaKind): string | null {
 if (acceptedTypes[kind].includes(file.type)) return file.type;
 const named = typeByExtension[file.name.toLowerCase().split(".").pop() ?? ""];
 return named && acceptedTypes[kind].includes(named) ? named : null;
}
const description = (accept: MediaKind | undefined, maxImage: string) => accept === "video"
 ? "Upload MP4 or WebM films up to 80 MB each, ready for the web. Films stay private until you publish content that uses them."
 : accept === "image" ? `Upload JPEG, PNG or WebP images up to ${maxImage} each, one or many at a time. Images stay private until you publish content that uses them.`
 : `Upload JPEG, PNG or WebP images up to ${maxImage}, and MP4 or WebM films up to 80 MB, one or many at a time. Both stay private until you publish content that uses them.`;
/** "0:08", "2:15": a film's running time on its card. */
const runningTime = (ms: number) => { const total = Math.round(ms / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; };
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
type FilmReply = { status: number; body: unknown; retryAfter: string | null };
/**
 * Sends a film to the web app's streaming upload route with progress. Fetch cannot report upload progress, and an 80 MB
 * film can take minutes, so this is the one admin request made with XMLHttpRequest.
 */
function sendFilm(file: File, csrfToken: string, onProgress: (fraction: number) => void, signal: { abort?: () => void }, label = file.name): Promise<FilmReply> {
 return new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("POST", "/api/admin/media/films");
  request.setRequestHeader("Content-Type", uploadType(file, "video") ?? file.type);
  request.setRequestHeader("X-CSRF-Token", csrfToken);
  request.setRequestHeader("X-Media-Label", encodeURIComponent(label.slice(0, 160)));
  request.timeout = 11 * 60_000;
  request.upload.onprogress = event => { if (event.lengthComputable && event.total) onProgress(event.loaded / event.total); };
  request.onload = () => {
   let body: unknown = null; try { body = JSON.parse(request.responseText); } catch { /* not JSON */ }
   resolve({ status: request.status, body, retryAfter: typeof request.getResponseHeader === "function" ? request.getResponseHeader("Retry-After") : null });
  };
  request.onerror = () => reject(Error("The upload was interrupted. Check your connection and try again."));
  request.ontimeout = () => reject(Error("The upload took too long. Try a smaller film or a faster connection."));
  request.onabort = () => { const error = Error("Upload cancelled"); error.name = "AbortError"; reject(error); };
  signal.abort = () => request.abort();
  request.send(file);
 });
}
/** The upload was refused because the staff session has ended. */
export class MediaSessionExpired extends Error {
 constructor() { super("Your session has ended. Sign in again, then upload the file again."); this.name = "MediaSessionExpired"; }
}
/** A refusal's two parts: the file's own fact, for its row, and the rule, said once for every file it refused. */
function refusalParts(message: string): { short: string; reason: string } {
 const pixels = /^This picture is (\d+) × (\d+) px\. (.+)$/.exec(message);
 if (pixels) return { short: `${pixels[1]} × ${pixels[2]} px: not an allowed size.`, reason: pixels[3]! };
 const file = /^This file is ([\d.]+) MB\. (.+)$/.exec(message);
 if (file) return { short: `${file[1]} MB: larger than allowed.`, reason: file[2]! };
 return { short: message, reason: message };
}
/** The picture's size or its file's size is not one Settings allow (owner, 23 Nov 2026): refused before it is sent, or by the API. */
export class MediaSizeRefused extends Error {
 readonly short: string; readonly reason: string;
 constructor(message: string) { super(message); this.name = "MediaSizeRefused"; const parts = refusalParts(message); this.short = parts.short; this.reason = parts.reason; }
}
/** The library is busy, or this minute's uploads are used up: worth sending again after `retryAfterMs`. */
export class MediaUploadThrottled extends Error {
 constructor(message: string, readonly retryAfterMs: number) { super(message); this.name = "MediaUploadThrottled"; }
}
/**
 * Why a file cannot go into the library as `kind` (its type, or a size over `maxImageBytes` or the films' 80 MB), checked
 * before anything is sent; "" when it can. Settings may allow pictures smaller than the server's 8 MB.
 */
export function uploadProblem(file: Pick<File, "name" | "type" | "size">, kind: MediaKind, maxImageBytes = serverMaxImageBytes): string {
 const film = kind === "video";
 return !uploadType(file, kind) || file.size > (film ? maxFilmBytes : maxImageBytes)
  ? film ? "Choose an MP4 or WebM film up to 80 MB." : `Choose a JPEG, PNG or WebP image up to ${describeFileSize(maxImageBytes)}.` : "";
}
type AdminSend = (path: string, options?: Omit<RequestInit, "signal">) => Promise<Response>;
/** How long to wait before sending again: the server's Retry-After, else a moment for a busy library or a minute for the limit. */
function retryDelay(retryAfter: string | null, code: unknown) {
 const seconds = Number(retryAfter);
 if (retryAfter && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 120) * 1000;
 return code === "MEDIA_UPLOAD_LIMIT" ? 60_000 : 2_000;
}
/**
 * Puts one file into the media library and returns it as the library lists it: an image through `send` (the admin's own
 * bounded request), a film with progress (XMLHttpRequest, as an 80 MB film can take minutes). The library's Upload buttons,
 * its picture editor and the hero slide editor's own (owner, 19 Nov 2026) all use it. A picture over the file size Settings
 * allow (5 MB unless a publisher chose otherwise), or of a banner size they do not allow, is refused before it is sent
 * (MediaSizeRefused); `rules` are the upload rules already read, else they are read here. Throws MediaSessionExpired when
 * the session has ended, MediaUploadThrottled when the library asks to wait, and an Error with the reason otherwise.
 */
export async function uploadToLibrary(file: File, kind: MediaKind, { csrfToken, send, onProgress, abort, label = file.name, rules, measure = measureImage }: {
 csrfToken: string; send: AdminSend; onProgress?: (fraction: number) => void; abort?: { abort?: () => void }; label?: string;
 rules?: MediaUploadRulesState | null; measure?: (file: File) => Promise<{ width: number; height: number } | null>;
}): Promise<MediaAsset> {
 const film = kind === "video";
 if (film) { const problem = uploadProblem(file, kind); if (problem) throw Error(problem); }
 else {
  const set = rulesOrDefault(rules === undefined ? await loadMediaUploadRules(send) : rules);
  if (!uploadType(file, kind)) throw Error(uploadProblem(file, kind, set.maxImageBytes));
  const tooLarge = imageFileProblem(set, file.size);
  if (tooLarge) throw new MediaSizeRefused(tooLarge);
  if (set.restrictSizes) {
   const size = await measure(file);
   const refusal = size ? imageSizeProblem(set, size) : "";
   if (refusal) throw new MediaSizeRefused(refusal);
  }
 }
 let status: number, body: unknown, retryAfter: string | null;
 if (film) ({ status, body, retryAfter } = await sendFilm(file, csrfToken, onProgress ?? (() => {}), abort ?? {}, label));
 else {
  const headers = { "Content-Type": uploadType(file, kind)!, "X-CSRF-Token": csrfToken, "X-Media-Label": encodeURIComponent(label.slice(0, 160)) };
  const response = await send("/api/admin/media", { method: "POST", credentials: "same-origin", headers, body: file });
  status = response.status; body = await response.json().catch(() => null); retryAfter = response.headers.get("Retry-After");
 }
 if (status === 401) throw new MediaSessionExpired();
 const reply = body && typeof body === "object" ? body as { code?: unknown; message?: unknown } : {};
 const message = typeof reply.message === "string" ? reply.message : "";
 if (!film && (reply.code === "MEDIA_SIZE_NOT_ALLOWED" || reply.code === "MEDIA_TOO_LARGE") && message) throw new MediaSizeRefused(message);
 if (status === 413) throw Error(film ? "This film is larger than 80 MB. Export a shorter or smaller film and try again." : message || "Upload failed. Please try again.");
 if (status === 429) throw new MediaUploadThrottled(message || "The library is busy. Please try again shortly.", retryDelay(retryAfter, reply.code));
 if (status < 200 || status >= 300) throw Error(message || "Upload failed. Please try again.");
 return parseAsset(body && typeof body === "object" && "asset" in body ? body.asset : null);
}
/** One file of an upload: waiting its turn, on its way, or settled, with its own fact and the rule behind a refusal. */
type UploadStatus = "waiting" | "uploading" | "retrying" | "done" | "refused" | "failed" | "stopped";
type QueuedUpload = { key: number; file: File; status: UploadStatus; message: string; reason: string; progress: number | null };
const settled = (status: UploadStatus) => status === "done" || status === "refused" || status === "failed" || status === "stopped";
/** Images go two at a time (the API decodes two at once); films one at a time, each with its progress and its own cancel. */
const parallelUploads: Record<MediaKind, number> = { image: 2, video: 1 };
/** Attempts per file when the library asks to wait (busy, or the minute's uploads used up). */
const throttledAttempts = 6;
/** A dialog never taller than the window: its title and close button, and its buttons, stay in view; the middle scrolls (owner, 23 Nov 2026). */
const boundedDialog = "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden";
const dialogBody = "-mx-6 grid min-h-0 content-start gap-4 overflow-y-auto px-6 py-1";
const grid = "grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4";
/** Loading shape: the same grid of cards, image frame and two lines of metadata. */
const gridSkeleton = <div aria-hidden="true" className={grid}>
 {Array.from({ length: 6 }, (_, index) => <div key={index} data-skeleton className="overflow-hidden rounded-xl border border-border bg-card">
  <Skeleton className="aspect-[4/3] rounded-none motion-reduce:animate-none" />
  <div className="grid gap-2 p-3"><Skeleton className="h-3.5 w-3/4 motion-reduce:animate-none" /><Skeleton className="h-3 w-1/2 motion-reduce:animate-none" /></div>
 </div>)}
</div>;
/** Arrow keys move between the bar's buttons, as a toolbar promises. */
function toolbarKeys(event: KeyboardEvent<HTMLDivElement>) {
 const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
 const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
 const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
 if (!step || index < 0) return;
 event.preventDefault(); buttons[(index + step + buttons.length) % buttons.length]?.focus();
}
const statusWords: Record<UploadStatus, string> = { waiting: "Waiting", uploading: "Uploading", retrying: "Waiting for the library", done: "Uploaded", refused: "Not allowed", failed: "Failed", stopped: "Not uploaded" };
function StatusIcon({ status }: { status: UploadStatus }) {
 const shared = "size-4 shrink-0";
 if (status === "done") return <CircleCheck aria-hidden="true" strokeWidth={1.75} className={cn(shared, "text-success")} />;
 if (status === "refused" || status === "failed") return <TriangleAlert aria-hidden="true" strokeWidth={1.75} className={cn(shared, "text-danger")} />;
 if (status === "uploading") return <LoaderCircle aria-hidden="true" strokeWidth={1.5} className={cn(shared, "text-primary motion-safe:animate-spin")} />;
 return <Clock aria-hidden="true" strokeWidth={1.5} className={cn(shared, "text-muted-foreground")} />;
}
type Usage = { draft: string[]; published: string[] };
const parseUsage = (value: unknown): Usage => {
 const { draft, published } = (value ?? {}) as Partial<Usage>;
 const places = (list: unknown) => Array.isArray(list) && list.length <= 500 && list.every(item => typeof item === "string" && item.length <= 200);
 if (!places(draft) || !places(published)) throw Error("Invalid usage response");
 return { draft: draft as string[], published: published as string[] };
};
/** What the draft editor lends the library: how often the draft uses an address, and swapping one address for another. */
export type DraftMedia = { uses: (url: string) => number; replace: (from: string, to: string) => number };
type Act = (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>;
function UsageList({ usage }: { usage: Usage | null | "error" }) {
 if (usage === null) return <p className="m-0 text-xs text-muted-foreground">Looking where it is used…</p>;
 if (usage === "error") return <p className="m-0 text-xs text-danger">We couldn&apos;t check where it is used.</p>;
 if (!usage.draft.length && !usage.published.length) return <p data-usage="none" className="m-0 text-xs text-muted-foreground">Not used on the website or in the draft.</p>;
 return <div data-usage className="grid gap-2 text-xs">
  {usage.published.length > 0 && <div><p className="m-0 font-medium text-foreground">On the live website</p><ul className="m-0 grid gap-0.5 pl-4 text-muted-foreground">{usage.published.map(place => <li key={place}>{place}</li>)}</ul></div>}
  {usage.draft.length > 0 && <div><p className="m-0 font-medium text-foreground">In the draft</p><ul className="m-0 grid gap-0.5 pl-4 text-muted-foreground">{usage.draft.map(place => <li key={place}>{place}</li>)}</ul></div>}
 </div>;
}
/**
 * Editing one library file (owner, 23 Nov 2026): its name, where it is used, and for a picture a cropped, turned or flipped
 * copy, which the draft can then use everywhere it used the original.
 */
function EditMediaDialog({ asset, act, send, csrfToken, rules, draft, onRenamed, onCreated, onClose, onExpired }: {
 asset: MediaAsset; act: Act; send: AdminSend; csrfToken: string; rules: MediaUploadRulesState | null; draft?: DraftMedia;
 onRenamed: (asset: MediaAsset) => void; onCreated: (asset: MediaAsset) => void; onClose: () => void; onExpired: () => void;
}) {
 const [name, setName] = useState(asset.label), [savedName, setSavedName] = useState(asset.label), [naming, setNaming] = useState(false);
 const [usage, setUsage] = useState<Usage | null | "error">(null), [cropping, setCropping] = useState(false);
 const [copy, setCopy] = useState<MediaAsset | null>(null), [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
 const nameId = useId();
 useEffect(() => {
  let live = true;
  void send(`/api/admin/media/${asset.id}/usage`, { cache: "no-store", credentials: "same-origin" })
   .then(async response => { if (response.status === 401) { onExpired(); return; } if (!response.ok) throw Error("usage"); const parsed = parseUsage(await response.json()); if (live) setUsage(parsed); })
   .catch(() => { if (live) setUsage("error"); });
  return () => { live = false; };
 }, [asset.id]);
 async function rename() {
  const label = name.trim();
  if (!label || label === savedName) return;
  setNaming(true); setMessage(null);
  const result = await act(`/api/admin/media/${asset.id}`, "PATCH", { label });
  setNaming(false);
  if (!result.ok) { if (result.message) setMessage({ tone: "error", text: result.message }); return; }
  const renamed = parseAsset((result.data as { asset?: unknown }).asset);
  setSavedName(renamed.label); setName(renamed.label); onRenamed(renamed);
  setMessage({ tone: "status", text: `Renamed to “${renamed.label}”.` });
 }
 async function saveCopy(picture: File) {
  try {
   const made = await uploadToLibrary(picture, "image", { csrfToken, send, rules, label: picture.name });
   setCopy(made); setCropping(false); onCreated(made);
   setMessage({ tone: "status", text: `Saved as a new picture, “${made.label}” (${made.width} × ${made.height} px). The original is unchanged.` });
  } catch (err) {
   if (err instanceof MediaSessionExpired) { onExpired(); return; }
   throw err instanceof MediaSizeRefused ? Error(err.message) : err;
  }
 }
 const inDraft = copy && draft ? draft.uses(asset.url) : 0;
 const film = asset.kind === "video";
 const sizeList = rules?.rules.sizes.length ? rules.rules.sizes : suggestedBannerSizes;
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
  <DialogContent className={cn("bg-card sm:max-w-2xl", boundedDialog, cropping && "grid-rows-[auto_minmax(0,1fr)] pb-0")}>
   <DialogHeader><DialogTitle className="text-base">{film ? "Edit film" : "Edit picture"}</DialogTitle>
    <DialogDescription className="text-xs">Rename it, see where it is used{film ? "" : ", or save a cropped, turned or flipped copy"}.</DialogDescription></DialogHeader>
   <div data-edit-media className={dialogBody}>
    {!cropping && <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
     <div className="overflow-hidden rounded-lg border border-border bg-sunken">
      {film ? <video src={asset.previewUrl} aria-label={savedName} controls muted playsInline preload="metadata" className="aspect-[4/3] w-full object-contain" />
       : <img src={asset.previewUrl} alt={savedName} className="aspect-[4/3] w-full object-contain" />}
     </div>
     <div className="grid content-start gap-3">
      <p className="m-0 text-xs tabular-nums text-muted-foreground">{asset.width && asset.height ? `${describeImageSize({ width: asset.width, height: asset.height })} px · ` : ""}{megabytes(asset.bytes)} · {asset.publicAt ? "Published" : "Private"}</p>
      <form className="grid gap-1.5" onSubmit={event => { event.preventDefault(); void rename(); }}>
       <label htmlFor={nameId} className="text-xs font-medium text-foreground">Name</label>
       <div className="flex gap-2"><Input id={nameId} value={name} maxLength={160} disabled={naming} onChange={event => setName(event.currentTarget.value)} />
        <Button type="submit" variant="outline" disabled={naming || !name.trim() || name.trim() === savedName}>{naming ? "Saving…" : "Save name"}</Button></div>
      </form>
      <div className="grid gap-1.5"><p className="m-0 text-xs font-medium text-foreground">Where it is used</p><UsageList usage={usage} /></div>
      {!film && <div><ActionButton icon={Crop} variant="outline" onClick={() => { setCropping(true); setMessage(null); }}>Crop, turn or flip</ActionButton></div>}
     </div>
    </div>}
    {cropping && asset.width && asset.height && <PictureEditor source={asset.previewUrl} width={asset.width} height={asset.height} label={savedName}
     sizes={{ list: sizeList, required: Boolean(rules?.rules.restrictSizes) }} onCancel={() => setCropping(false)} onSave={saveCopy} />}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {copy && draft && inDraft > 0 && <div data-use-copy className="grid gap-2 rounded-lg border border-border bg-surface p-3">
     <p className="m-0 text-xs text-foreground">The draft uses the original in {inDraft === 1 ? "1 place" : `${inDraft} places`}.</p>
     <div><Button type="button" onClick={() => {
      const changed = draft.replace(asset.url, copy.url);
      setMessage({ tone: "status", text: `The draft now uses the copy in ${changed === 1 ? "1 place" : `${changed} places`}. Save the draft, then publish to show it on the website.` });
     }}>Use the copy there instead</Button></div>
    </div>}
   </div>
   {/* While cropping, the editor's own Cancel and Save stand at the foot instead. */}
   {!cropping && <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Done</Button></DialogClose></DialogFooter>}
  </DialogContent>
 </Dialog>;
}
type Confirming = { action: "remove" | "delete"; assets: MediaAsset[] };
/**
 * The media library: images and films. `accept` narrows it to one kind, as a picker for an image or a film slot does: it
 * lists and uploads only that kind, so an image slot is never offered a film nor a film slot an image. Its upload takes one
 * file or a whole folder's worth at once (owner, 23 Nov 2026: bulk upload), chosen or dropped, and lists each file's fate.
 * The library screen itself (no `onSelect`) also manages the files (owner, 23 Nov 2026): Edit and Remove on every card.
 * `mode="removed"` is the separate Removed media screen in the left menu: what was removed, with Restore and, for a
 * publisher only, Delete permanently (the row and the file, never while used).
 */
export function MediaLibrary({ session, onExpired, onSelect, accept, heading: Heading = "h3", draft, mode = "library" }: {
 session: StaffSession; onExpired: () => void; onSelect?: (asset: MediaAsset) => void; accept?: MediaKind; heading?: "h2" | "h3"; draft?: DraftMedia;
 mode?: "library" | "removed";
}) {
 const send = useAdminRequest();
 const [assets, setAssets] = useState<MediaAsset[]>([]), [cursor, setCursor] = useState<string | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [loaded, setLoaded] = useState(false);
 const [uploadOpen, setUploadOpen] = useState(false), [queue, setQueue] = useState<QueuedUpload[]>([]), [dragging, setDragging] = useState(false);
 const [uploadKind, setUploadKind] = useState<MediaKind>(accept ?? "image"), filmRequest = useRef<{ abort?: () => void }>({});
 const [notice, setNotice] = useState<{ tone: "status" | "error"; text: string; upload?: boolean } | null>(null);
 const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set()), [copied, setCopied] = useState<{ tone: "status" | "error"; text: string } | null>(null);
 const [editing, setEditing] = useState<MediaAsset | null>(null);
 const [confirming, setConfirming] = useState<Confirming | null>(null), [confirmUsage, setConfirmUsage] = useState<Usage | null | "error">(null);
 const [confirmBusy, setConfirmBusy] = useState(false), [confirmError, setConfirmError] = useState(""), [understood, setUnderstood] = useState(false);
 const active = useRef(true), expired = useLatest(onExpired), headerTrigger = useRef<HTMLButtonElement>(null), lastTrigger = useRef<HTMLElement | null>(null), hint = useId();
 const keys = useRef(0), stopping = useRef(false);
 const rules = useMediaUploadRules();
 const maxImage = rulesOrDefault(rules).maxImageBytes;
 // Picking one image for a field has no use for bulk selection or for managing files; only the library screen offers them.
 const manage = !onSelect, removedView = manage && mode === "removed", publisher = session.user.role === "publisher";
 const uploading = queue.some(item => !settled(item.status));
 const selectable = !onSelect, chosen = selectable ? assets.filter(asset => selected.has(asset.id)) : [], working = busy || uploading;
 async function load(next: string | null = null) {
  setBusy(true); setError("");
  try {
   const query = [accept ? `kind=${accept}` : "", removedView ? "removed=1" : ""].filter(Boolean).join("&");
   const response = await send(withCursor(`/api/admin/media${query ? `?${query}` : ""}`, next), { cache: "no-store", credentials: "same-origin" });
   if (!active.current) return;
   if (response.status === 401) { setAssets([]); expired.current(); return; }
   if (!response.ok) throw Error("load");
   const page = ((await response.json()) ?? {}) as { assets?: unknown; nextCursor?: unknown };
   if (!Array.isArray(page.assets) || page.assets.length > 50 || !(page.nextCursor === null || identifier(page.nextCursor))) throw Error("Invalid image page");
   const items = page.assets.map(parseAsset);
   setAssets(previous => next ? [...previous, ...items] : items); setCursor(page.nextCursor); setLoaded(true);
  } catch (err) { if (active.current && !aborted(err)) setError(accept === "video" ? "We couldn't load your films. Please try again." : "We couldn't load your images. Please try again."); }
  finally { if (active.current) setBusy(false); }
 }
 // The library screen reads the upload rules for its words (the largest file); pickers read them when their upload opens.
 useEffect(() => { active.current = true; if (Heading === "h2" && accept !== "video") void loadMediaUploadRules(send); void load(); return () => { active.current = false; stopping.current = true; filmRequest.current.abort?.(); }; }, [send, accept, mode]);
 const act: Act = async (path, method, body) => {
  try {
   const response = await send(path, { method, credentials: "same-origin", headers: { "X-CSRF-Token": session.csrfToken, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
   if (response.status === 401) { expired.current(); return { ok: false, message: "" }; }
   const data: unknown = await response.json().catch(() => null);
   if (!response.ok) return { ok: false, message: data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string" ? (data as { message: string }).message : "That did not work. Please try again." };
   return { ok: true, data };
  } catch (err) { return { ok: false, message: aborted(err) ? "" : "That did not work. Check your connection and try again." }; }
 };
 const patch = (key: number, change: Partial<QueuedUpload>) => setQueue(items => items.map(item => item.key === key ? { ...item, ...change } : item));
 /** Sends one file, waiting and trying again while the library asks to; returns how it ended. */
 async function sendOne(item: QueuedUpload, kind: MediaKind, state: MediaUploadRulesState | null): Promise<UploadStatus> {
  for (let attempt = 1; ; attempt++) {
   patch(item.key, { status: "uploading", message: "", progress: kind === "video" ? 0 : null });
   try {
    const asset = await uploadToLibrary(item.file, kind, { csrfToken: session.csrfToken, send, rules: state, abort: filmRequest.current, onProgress: fraction => { if (active.current) patch(item.key, { progress: fraction }); } });
    if (!active.current) return "done";
    if (!removedView) setAssets(previous => [asset, ...previous.filter(a => a.id !== asset.id)]);
    setLoaded(true);
    patch(item.key, { status: "done", progress: null });
    return "done";
   } catch (err) {
    if (err instanceof MediaSessionExpired) throw err;
    if (!active.current) return "stopped";
    if (aborted(err)) { patch(item.key, { status: "stopped", message: "Cancelled", progress: null }); return "stopped"; }
    if (err instanceof MediaUploadThrottled && attempt < throttledAttempts && !stopping.current) {
     const seconds = Math.ceil(err.retryAfterMs / 1000);
     patch(item.key, { status: "retrying", message: seconds > 5 ? `This minute's uploads are used up: trying again in ${seconds} s` : "The library is busy: trying again in a moment", progress: null });
     await new Promise(resolve => setTimeout(resolve, err.retryAfterMs));
     if (stopping.current || !active.current) { patch(item.key, { status: "stopped", message: "Not uploaded", progress: null }); return "stopped"; }
     continue;
    }
    if (err instanceof MediaSizeRefused) { patch(item.key, { status: "refused", message: err.short, reason: err.reason, progress: null }); return "refused"; }
    const text = err instanceof Error ? err.message : "Upload failed. Please try again.";
    patch(item.key, { status: "failed", message: text, reason: text, progress: null });
    return "failed";
   }
  }
 }
 /**
  * Uploads every chosen or dropped file: a type or file size that cannot go in is refused at once, the rest go in turn,
  * and each file shows how it ended. When all of them went in, the dialog closes and the library says how many.
  */
 async function uploadFiles(files: File[]) {
  if (!files.length || uploading) return;
  const kind = uploadKind;
  stopping.current = false; setNotice(null);
  // Read again as the upload starts, so a publisher's latest change applies; the API checks each picture too.
  const state = kind === "image" ? await loadMediaUploadRules(send, true) : null;
  if (!active.current) return;
  const set = rulesOrDefault(state);
  const items: QueuedUpload[] = files.map(file => {
   // A file of another kind, or a film over 80 MB, says what the library takes; a picture over the Settings size says its own size.
   if (!uploadType(file, kind) || (kind === "video" && file.size > maxFilmBytes)) {
    const problem = uploadProblem(file, kind, set.maxImageBytes);
    return { key: ++keys.current, file, status: "refused", message: problem, reason: problem, progress: null };
   }
   const tooLarge = kind === "image" ? imageFileProblem(set, file.size) : "";
   if (tooLarge) { const parts = refusalParts(tooLarge); return { key: ++keys.current, file, status: "refused", message: parts.short, reason: parts.reason, progress: null }; }
   return { key: ++keys.current, file, status: "waiting", message: "", reason: "", progress: null };
  });
  setQueue(items);
  const ready = items.filter(item => item.status === "waiting");
  if (!ready.length) return;
  const outcomes = new Map<number, UploadStatus>(items.filter(item => item.status === "refused").map(item => [item.key, "refused"]));
  let next = 0, sessionEnded = false;
  const worker = async () => {
   while (active.current && !stopping.current && !sessionEnded && next < ready.length) {
    const item = ready[next++]!;
    try { outcomes.set(item.key, await sendOne(item, kind, state)); }
    catch (err) { if (err instanceof MediaSessionExpired) sessionEnded = true; else throw err; }
   }
  };
  await Promise.all(Array.from({ length: Math.min(parallelUploads[kind], ready.length) }, worker));
  if (!active.current) return;
  if (sessionEnded) { setAssets([]); setQueue([]); setUploadOpen(false); expired.current(); return; }
  // Files left waiting when staff stopped the upload were never sent.
  if (stopping.current) setQueue(list => list.map(item => item.status === "waiting" ? { ...item, status: "stopped", message: "Not uploaded" } : item));
  const done = items.filter(item => outcomes.get(item.key) === "done").length;
  if (done === items.length) {
   const noun = kind === "video" ? (done === 1 ? "film" : "films") : (done === 1 ? "image" : "images");
   setQueue([]); setUploadOpen(false); setNotice({ tone: "status", text: `Uploaded ${done} ${noun}.`, upload: true });
  }
 }
 function stopUploads() { stopping.current = true; filmRequest.current.abort?.(); }
 function retryFailed() { void uploadFiles(queue.filter(item => item.status === "failed" || item.status === "stopped").map(item => item.file)); }
 function openUpload(trigger: HTMLElement, kind: MediaKind) { lastTrigger.current = trigger; setUploadKind(kind); setQueue([]); setNotice(null); setUploadOpen(true); if (kind === "image") void loadMediaUploadRules(send, true); }
 function drop(event: DragEvent<HTMLElement>) {
  event.preventDefault(); setDragging(false);
  if (!uploading) void uploadFiles(Array.from(event.dataTransfer?.files ?? []));
 }
 function toggle(id: string, on: boolean) { setSelected(previous => new Set(on ? [...previous, id] : [...previous].filter(item => item !== id))); setCopied(null); }
 async function copyLinks() {
  const links = chosen.map(asset => new URL(asset.url, window.location.origin).href), count = links.length;
  try {
   await window.navigator.clipboard.writeText(links.join("\n"));
   if (active.current) setCopied({ tone: "status", text: `Copied ${count} ${count === 1 ? "link" : "links"}. Private images open only once a published page uses them.` });
  } catch { if (active.current) setCopied({ tone: "error", text: "We couldn't copy the links. Allow clipboard access and try again." }); }
 }
 const fileWord = (items: MediaAsset[]) => items.every(asset => asset.kind === "video") ? (items.length === 1 ? "film" : "films") : items.every(asset => asset.kind === "image") ? (items.length === 1 ? "picture" : "pictures") : (items.length === 1 ? "file" : "files");
 const leave = (ids: string[]) => { setAssets(previous => previous.filter(asset => !ids.includes(asset.id))); setSelected(previous => new Set([...previous].filter(id => !ids.includes(id)))); };
 function askFirst(action: Confirming["action"], items: MediaAsset[]) {
  setConfirming({ action, assets: items }); setConfirmError(""); setUnderstood(false); setConfirmUsage(null);
  if (items.length !== 1) return;
  void send(`/api/admin/media/${items[0]!.id}/usage`, { cache: "no-store", credentials: "same-origin" })
   .then(async response => { if (!response.ok) throw Error("usage"); const usage = parseUsage(await response.json()); if (active.current) setConfirmUsage(usage); })
   .catch(() => { if (active.current) setConfirmUsage("error"); });
 }
 /** Remove or delete permanently, one file after another; files that cannot go stay, with the reason. */
 async function confirmAction() {
  if (!confirming) return;
  const { action, assets: items } = confirming;
  setConfirmBusy(true); setConfirmError("");
  const done: string[] = [], refused: string[] = [];
  for (const asset of items) {
   const result = await act(action === "remove" ? `/api/admin/media/${asset.id}/remove` : `/api/admin/media/${asset.id}`, action === "remove" ? "POST" : "DELETE");
   if (!active.current) return;
   if (result.ok) done.push(asset.id); else if (result.message) refused.push(items.length === 1 ? result.message : `${asset.label}: ${result.message}`);
   else break;
  }
  setConfirmBusy(false);
  leave(done);
  const word = fileWord(items.filter(asset => done.includes(asset.id)));
  if (done.length) setNotice({ tone: "status", text: action === "remove"
   ? `Removed ${done.length} ${word} from the library. Pages that use ${done.length === 1 ? "it" : "them"} keep showing ${done.length === 1 ? "it" : "them"}; find ${done.length === 1 ? "it" : "them"} under Removed media in the left menu.`
   : `Deleted ${done.length} ${word} permanently.` });
  if (refused.length) setConfirmError(refused.join(" ")); else setConfirming(null);
 }
 async function restore(items: MediaAsset[]) {
  const done: string[] = [];
  let problem = "";
  for (const asset of items) {
   const result = await act(`/api/admin/media/${asset.id}/restore`, "POST");
   if (!active.current) return;
   if (result.ok) done.push(asset.id); else { problem = result.message; break; }
  }
  leave(done);
  if (done.length) setNotice({ tone: "status", text: `Restored ${done.length} ${fileWord(items.filter(asset => done.includes(asset.id)))} to the library.` });
  if (problem) setNotice({ tone: "error", text: problem });
 }
 const kinds: MediaKind[] = accept ? [accept] : ["image", "video"];
 const uploadButtons = (ref?: Ref<HTMLButtonElement>) => kinds.map((kind, index) => <ActionButton key={kind} icon={kind === "video" ? Clapperboard : Upload} variant={index ? "outline" : "default"} size="default"
  ref={index ? undefined : ref} disabled={working} onClick={event => openUpload(event.currentTarget, kind)}>{kind === "video" ? "Upload films" : "Upload images"}</ActionButton>);
 const uploadButton = (ref?: Ref<HTMLButtonElement>) => removedView ? null : kinds.length === 1 ? uploadButtons(ref) : <div className="flex flex-wrap gap-2">{uploadButtons(ref)}</div>;
 const noun = (n: number) => accept === "video" ? (n === 1 ? "film" : "films") : accept === "image" ? (n === 1 ? "image" : "images") : (n === 1 ? "file" : "files");
 const status = busy ? (assets.length ? `Loading more ${noun(2)}` : "") : loaded ? `${assets.length} ${removedView ? "removed " : ""}${noun(assets.length)}${cursor ? " loaded so far" : ""}` : "";
 const words = description(accept, describeFileSize(maxImage)), filmUpload = uploadKind === "video";
 const sizesRule = !filmUpload && rules?.rules.restrictSizes ? rules.rules.sizes : null;
 const problems = queue.filter(item => item.status === "refused" || item.status === "failed");
 const uploadedSoFar = queue.filter(item => item.status === "done").length;
 const confirmWord = confirming ? fileWord(confirming.assets) : "";
 const stillUsed = confirmUsage && confirmUsage !== "error" && (confirmUsage.draft.length > 0 || confirmUsage.published.length > 0);
 return <section aria-label="Media library" aria-busy={working} className="min-w-0">
  {removedView ? <PanelHeader title="Removed media" description={`Files removed from the media library. They are kept, and pages that use them keep showing them, but pickers no longer offer them. Restore one to use it again${publisher ? ", or delete it permanently once nothing uses it." : ". Only a publisher can delete files permanently."}`} />
   : Heading === "h2" ? <PanelHeader title="Media library" description={words} actions={uploadButton(headerTrigger)} />
   : <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <SectionHeading className="m-0" description={words}>Media library</SectionHeading>{uploadButton(headerTrigger)}</div>}
  <p aria-live="polite" className="mb-3 min-h-[18px] text-xs tabular-nums text-muted-foreground">{status}</p>
  {notice && <Notice tone={notice.tone} className="mb-4" {...(notice.upload ? { "data-upload-finished": "" } : { "data-media-notice": "" })}>{notice.text}</Notice>}
  {error && <Notice tone="error" className="mb-4 items-center justify-between">{error} <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => void load()}>Retry</Button></Notice>}
  {busy && assets.length === 0 && !error && <><p role="status" className="sr-only">Loading {noun(2)}</p>{gridSkeleton}</>}
  {!busy && !error && loaded && assets.length === 0 && (removedView
   ? <EmptyState icon={<Trash2 strokeWidth={1.5} />} title="Nothing removed">Files you remove from the library are kept here until you restore them or delete them permanently.</EmptyState>
   : accept === "video"
   ? <EmptyState icon={<Clapperboard strokeWidth={1.5} />} title="No films yet" action={uploadButtons()}>Upload your first films. They stay private until a published page uses them.</EmptyState>
   : <EmptyState icon={<ImageUp strokeWidth={1.5} />} title="No images yet" action={uploadButtons()}>Upload your first images, one or many at a time. They stay private until a published page uses them.</EmptyState>)}
  {assets.length > 0 && <ul aria-label={removedView ? "Removed files" : accept === "video" ? "Films" : "Images"} className={grid}>{assets.map(asset => <li key={asset.id} className="min-w-0">
   <Card data-selected={selectable && selected.has(asset.id) ? "" : undefined} data-media-card={asset.id}
    className="h-full gap-0 overflow-hidden py-0 shadow-xs transition-colors duration-150 ease-admin data-[selected]:border-primary data-[selected]:ring-2 data-[selected]:ring-primary/25">
    <div className="relative aspect-[4/3] border-b border-line-soft bg-sunken">
     {asset.kind === "video"
      // Staff preview a private film through the same authenticated route the draft preview uses; it loads only when played.
      ? <video src={asset.previewUrl} aria-label={asset.label} controls muted playsInline preload="metadata" className="size-full object-contain" data-media-film="" />
      : <img src={asset.previewUrl} alt={asset.label} width={asset.width ?? undefined} height={asset.height ?? undefined} loading="lazy" className="size-full object-contain" />}
     {selectable && <label className="absolute top-2 left-2 grid size-8 cursor-pointer place-items-center rounded-md bg-card/95 shadow-xs">
      <NativeCheckbox aria-label={`Select ${asset.label}`} checked={selected.has(asset.id)} onChange={event => toggle(asset.id, event.currentTarget.checked)} />
     </label>}
    </div>
    <div className="grid gap-1.5 p-3">
     <p title={asset.label} className="truncate text-sm font-medium text-foreground">{asset.label}</p>
     <div className="flex items-center justify-between gap-2">
      <span className="text-xs tabular-nums text-muted-foreground">{asset.kind === "video"
       ? [asset.durationMs ? runningTime(asset.durationMs) : "Film", asset.width && asset.height ? `${asset.width} × ${asset.height}` : "", megabytes(asset.bytes)].filter(Boolean).join(" · ")
       : `${asset.width} × ${asset.height} · ${Math.ceil(asset.bytes / 1024)} KB`}</span>
      <Badge variant="outline" className={cn("text-2xs", asset.publicAt ? "border-success/20 bg-success-bg text-success" : "border-border bg-neutral-bg text-neutral")}>{asset.publicAt ? "Published" : "Private"}</Badge>
     </div>
     {asset.kind === "video" && asset.faststart === false && <p className="text-xs text-muted-foreground">Starts slowly: export with “fast start” for quicker playback.</p>}
     {removedView && asset.removedAt && <p className="text-xs text-muted-foreground">Removed {day(asset.removedAt)}</p>}
     {onSelect && <Button type="button" size="sm" variant="outline" className="mt-1 w-full" disabled={busy} onClick={() => onSelect(asset)}>{asset.kind === "video" ? "Use film" : "Use image"}<span className="sr-only">: {asset.label}</span></Button>}
     {/* The library's cards edit and remove (owner, 23 Nov 2026); deleting permanently is kept to the separate Removed media
         screen, and to a publisher, so it is never one click away from editing. */}
     {manage && (removedView
      ? <div className="mt-1 grid gap-1.5">
       <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void restore([asset])}><Undo2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Restore<span className="sr-only">: {asset.label}</span></Button>
       {publisher && <Button type="button" size="sm" variant="outline" className="text-danger hover:bg-danger-bg hover:text-danger" disabled={busy} title="Erases it from the database and the server"
        onClick={() => askFirst("delete", [asset])}><Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Delete permanently<span className="sr-only">: {asset.label}</span></Button>}
      </div>
      : <div className="mt-1 grid grid-cols-2 gap-1.5">
       <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(asset)}><Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Edit<span className="sr-only">: {asset.label}</span></Button>
       <Button type="button" size="sm" variant="outline" disabled={busy} title="Takes it out of the library; it can be restored from Removed media" onClick={() => askFirst("remove", [asset])}><Archive aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Remove<span className="sr-only">: {asset.label}</span></Button>
      </div>)}
    </div>
   </Card>
  </li>)}</ul>}
  {cursor && <div className="mt-6 flex justify-center"><Button type="button" variant="outline" disabled={busy} onClick={() => void load(cursor)}>Load more</Button></div>}
  {chosen.length > 0 && <div role="toolbar" aria-label="Selected images" onKeyDown={toolbarKeys} className={cn("sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2",
   "rounded-xl border border-border bg-card px-4 py-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200")}>
   <span className="text-sm font-medium tabular-nums text-foreground">{chosen.length} selected</span>
   {copied && <span role={copied.tone === "error" ? "alert" : "status"} className={cn("text-xs", copied.tone === "error" ? "text-danger" : "text-muted-foreground")}>{copied.text}</span>}
   <div className="ml-auto flex flex-wrap gap-2">{removedView
    ? <>
     <ActionButton icon={Undo2} variant="outline" onClick={() => void restore(chosen)}>Restore</ActionButton>
     {publisher && <ActionButton icon={Trash2} variant="outline" className="text-danger hover:bg-danger-bg hover:text-danger" onClick={() => askFirst("delete", chosen)}>Delete permanently</ActionButton>}
    </>
    : <>
     <ActionButton icon={Copy} onClick={() => void copyLinks()}>Copy links</ActionButton>
     {manage && <ActionButton icon={Archive} variant="outline" onClick={() => askFirst("remove", chosen)}>Remove from library</ActionButton>}
    </>}
    <ActionButton icon={X} variant="ghost" onClick={() => { setSelected(new Set()); setCopied(null); }}>Clear selection</ActionButton></div>
  </div>}
  <Dialog open={uploadOpen} onOpenChange={open => { if (!uploading) { setUploadOpen(open); if (!open) setQueue([]); } }}>
   <DialogContent aria-busy={uploading} className={cn("bg-card sm:max-w-lg", boundedDialog)} onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
    onCloseAutoFocus={event => { event.preventDefault(); (lastTrigger.current?.isConnected ? lastTrigger.current : headerTrigger.current)?.focus(); }}>
    <DialogHeader><DialogTitle className="text-base">{filmUpload ? "Upload films" : "Upload images"}</DialogTitle>
     <DialogDescription className="text-xs">{filmUpload
      ? "MP4 (H.264) or WebM up to 80 MB each, exported for the web: the store plays it exactly as uploaded. Choose one film or several; they upload one after another and stay private until you publish content that uses them."
      : `JPEG, PNG or WebP up to ${describeFileSize(maxImage)} each. Choose one image or many at once; they stay private until you publish content that uses them.`}</DialogDescription></DialogHeader>
    <div data-upload-body className={dialogBody}>
     {sizesRule && <p data-allowed-sizes className="m-0 rounded-md bg-neutral-bg px-3 py-2 text-xs text-muted-foreground">
      Only {sizesRule.length === 1 ? "this size" : "these sizes"} can be uploaded (Settings, Banner sizes): <span className="font-medium tabular-nums text-foreground">{sizesRule.map(describeImageSize).join(", ")} px</span>.</p>}
     <label data-dragging={dragging ? "" : undefined} onDragOver={event => { if (uploading) return; event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}
      className={cn("grid cursor-pointer justify-items-center gap-1.5 rounded-lg border border-dashed border-input bg-surface px-6 text-center transition-colors duration-150 ease-admin hover:bg-accent data-[dragging]:border-primary data-[dragging]:bg-accent",
      queue.length ? "py-3" : "py-8", "has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/60 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60")}>
      {!queue.length && (filmUpload ? <Clapperboard aria-hidden="true" strokeWidth={1.5} className="mb-1 size-6 text-primary" /> : <ImageUp aria-hidden="true" strokeWidth={1.5} className="mb-1 size-6 text-primary" />)}
      <span className="text-sm font-medium text-foreground">{filmUpload ? "Upload films" : "Upload images"}</span>
      <span id={hint} className="text-xs text-muted-foreground">Choose files from your computer, or drop them here</span>
      <input type="file" multiple aria-label={filmUpload ? "Upload films" : "Upload images"} aria-describedby={hint} className="sr-only" accept={[...acceptedTypes[uploadKind], ...acceptedExtensions[uploadKind]].join(",")} disabled={uploading}
       onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void uploadFiles(files); }} />
     </label>
     {queue.length > 0 && <>
      <p role="status" className="m-0 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
       {uploading && <LoaderCircle aria-hidden="true" strokeWidth={1.5} className="size-4 motion-safe:animate-spin" />}
       <span>{uploading ? `Uploading: ${uploadedSoFar} of ${queue.length} done` : `${uploadedSoFar} of ${queue.length} uploaded`}</span></p>
      <ul aria-label={filmUpload ? "Films in this upload" : "Images in this upload"} className="m-0 grid gap-1 rounded-lg border border-border p-1.5">
       {queue.map(item => <li key={item.key} data-upload-status={item.status} className="grid gap-0.5 rounded-md px-2 py-1.5 text-xs data-[upload-status=failed]:bg-danger-bg/60 data-[upload-status=refused]:bg-danger-bg/60">
        <div className="flex min-w-0 items-center gap-2">
         <StatusIcon status={item.status} />
         <span title={item.file.name} className="min-w-0 flex-1 truncate font-medium text-foreground">{item.file.name}</span>
         <span className="shrink-0 tabular-nums text-muted-foreground">{item.status === "uploading" && item.progress !== null ? `${Math.floor(item.progress * 100)}%` : statusWords[item.status]}</span>
        </div>
        {item.message && item.status !== "done" && <p className={cn("m-0 pl-6", item.status === "refused" || item.status === "failed" ? "text-danger" : "text-muted-foreground")}>{item.message}</p>}
        {item.status === "uploading" && item.progress !== null && <div role="progressbar" aria-label={`Uploading ${item.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(item.progress * 100)}
         className="ml-6 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-primary transition-[width] duration-150 ease-admin" style={{ width: `${item.progress * 100}%` }} /></div>}
       </li>)}
      </ul>
     </>}
     {problems.length > 0 && !uploading && <Notice tone="error" data-upload-problems="">
      <span className="grid gap-1">
       <span>{problems.length === 1 ? "1 file was not uploaded." : `${problems.length} files were not uploaded.`}</span>
       {[...new Set(problems.map(item => item.reason))].map(reason => <span key={reason} className="font-normal">{reason}</span>)}
      </span>
     </Notice>}
    </div>
    <DialogFooter>{uploading
     // Staff may stop a long upload: a film in flight is cancelled and nothing of it is kept; files not yet sent stay out.
     ? <Button type="button" variant="outline" onClick={stopUploads}>Cancel upload</Button>
     : <>
      {queue.some(item => item.status === "failed" || item.status === "stopped") && <ActionButton icon={RotateCcw} variant="outline" onClick={retryFailed}>Try the failed ones again</ActionButton>}
      <DialogClose asChild><Button type="button" variant={queue.length ? "default" : "outline"}>{queue.length ? "Done" : "Cancel"}</Button></DialogClose>
     </>}</DialogFooter>
   </DialogContent>
  </Dialog>
  {confirming && <Dialog open onOpenChange={open => { if (!open && !confirmBusy) setConfirming(null); }}>
   <DialogContent className={cn("bg-card sm:max-w-md", boundedDialog)}>
    <DialogHeader><DialogTitle className="text-base">{confirming.action === "remove"
     ? `Remove ${confirming.assets.length === 1 ? `“${confirming.assets[0]!.label}”` : `${confirming.assets.length} ${confirmWord}`} from the library?`
     : `Delete ${confirming.assets.length === 1 ? `“${confirming.assets[0]!.label}”` : `${confirming.assets.length} ${confirmWord}`} permanently?`}</DialogTitle>
     <DialogDescription className="text-xs">{confirming.action === "remove"
      ? confirming.assets.length === 1
       ? "It leaves the library and its pickers. Pages that already use it keep showing it, and you can restore it from Removed at any time."
       : "They leave the library and its pickers. Pages that already use them keep showing them, and you can restore them from Removed at any time."
      : confirming.assets.length === 1
       ? "This erases it from the database and its file from the server. It cannot be undone, except from the server's backup."
       : "This erases them from the database and their files from the server. Any still in use are kept. It cannot be undone, except from the server's backup."}</DialogDescription></DialogHeader>
    <div data-confirm-body className={dialogBody}>
     {confirming.assets.length === 1 && <div className="grid gap-1.5"><p className="m-0 text-xs font-medium text-foreground">Where it is used</p><UsageList usage={confirmUsage} /></div>}
     {confirming.action === "delete" && stillUsed && <Notice tone="error">It is still used, so it cannot be deleted. Choose another {confirmWord === "film" ? "film" : "picture"} in those places, save and publish, then delete it.</Notice>}
     {confirming.action === "delete" && !stillUsed && <>
      <p className="m-0 text-xs text-muted-foreground">Older saved versions in History that used it would need a new {confirmWord === "film" ? "film" : "picture"} if you restore one.</p>
      <label className="flex items-start gap-2 text-xs text-foreground"><NativeCheckbox checked={understood} onChange={event => setUnderstood(event.currentTarget.checked)} />I understand this cannot be undone.</label>
     </>}
     {confirmError && <Notice tone="error">{confirmError}</Notice>}
    </div>
    <DialogFooter>
     <Button type="button" variant="outline" disabled={confirmBusy} onClick={() => setConfirming(null)}>Cancel</Button>
     <Button type="button" variant={confirming.action === "delete" ? "destructive" : "default"} disabled={confirmBusy || (confirming.action === "delete" && (!understood || Boolean(stillUsed)))} onClick={() => void confirmAction()}>
      {confirmBusy ? "Working…" : confirming.action === "remove" ? "Remove" : "Delete permanently"}</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>}
  {editing && <EditMediaDialog asset={editing} act={act} send={send} csrfToken={session.csrfToken} rules={rules} draft={draft} onExpired={() => expired.current()}
   onRenamed={renamed => setAssets(previous => previous.map(asset => asset.id === renamed.id ? renamed : asset))}
   onCreated={made => { if (!removedView) setAssets(previous => [made, ...previous.filter(asset => asset.id !== made.id)]); }}
   onClose={() => setEditing(null)} />}
 </section>;
}
