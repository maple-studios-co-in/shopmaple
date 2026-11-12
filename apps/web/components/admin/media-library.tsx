"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Clapperboard, Copy, ImageUp, LoaderCircle, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { EmptyState, Notice } from "./crm-primitives";
import { ActionButton, PanelHeader, SectionHeading, useLatest, withCursor } from "./kit";
import { useAdminRequest } from "./use-admin-request";
/** A library file: a WebP image the server made, or a film (MP4 or WebM) kept as uploaded, with the facts its file states. */
export type MediaAsset = {
 id: string; sha256: string; kind: MediaKind; label: string; width: number | null; height: number | null; bytes: number; mimeType: string;
 durationMs: number | null; faststart: boolean | null; createdAt: string; publicAt: string | null; url: string; previewUrl: string;
};
export type MediaKind = "image" | "video";
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]{1,100}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const count = (n: unknown, max: number) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= max;
const filmExtensions: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
function parseAsset(value: unknown): MediaAsset {
 const { id, sha256, label, width, height, bytes, mimeType, durationMs, faststart, createdAt, publicAt, url, previewUrl } = (value ?? {}) as Partial<MediaAsset>;
 // Responses from before films carry no kind: they are images.
 const kind = (value as { kind?: unknown } | null)?.kind ?? "image";
 const common = identifier(id) && typeof sha256 === "string" && /^[a-f0-9]{64}$/.test(sha256) && typeof label === "string" && label.length >= 1 && label.length <= 160
  && timestamp(createdAt) && (publicAt === null || timestamp(publicAt)) && previewUrl === `/api/admin/media/${sha256}/preview`;
 const image = kind === "image" && count(width, 2560) && count(height, 2560) && count(bytes, 250 * 1024 * 1024) && mimeType === "image/webp" && url === `/media/uploads/${sha256}.webp`;
 const film = kind === "video" && (width === null || count(width, 16384)) && (height === null || count(height, 16384)) && count(bytes, maxFilmBytes)
  && typeof mimeType === "string" && filmExtensions[mimeType] !== undefined && url === `/media/uploads/${sha256}.${filmExtensions[mimeType]}`
  && (durationMs === null || durationMs === undefined || count(durationMs, 86_400_000)) && (faststart === null || faststart === undefined || typeof faststart === "boolean");
 if (!(common && (image || film))) throw Error("Invalid media response");
 return { id, sha256, kind, label, width: width ?? null, height: height ?? null, bytes, mimeType, durationMs: durationMs ?? null, faststart: faststart ?? null, createdAt, publicAt, url, previewUrl } as MediaAsset;
}
const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";
/** Films are stored as uploaded, so they must already play on the web (docs/media-library.md); 80 MB each (owner, 12 Nov 2026). */
export const maxFilmBytes = 80 * 1024 * 1024;
const acceptedTypes: Record<MediaKind, string[]> = { image: ["image/jpeg", "image/png", "image/webp"], video: ["video/mp4", "video/webm"] };
/** Extensions offered beside the types: some file pickers (the macOS one in embedded browsers) grey out every file for a type-only list. */
const acceptedExtensions: Record<MediaKind, string[]> = { image: [".jpg", ".jpeg", ".png", ".webp"], video: [".mp4", ".m4v", ".webm"] };
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
const descriptions = {
 image: "Upload JPEG, PNG or WebP images up to 8 MiB. Images stay private until you publish content that uses them.",
 video: "Upload MP4 or WebM films up to 80 MB, ready for the web. Films stay private until you publish content that uses them.",
 all: "Upload JPEG, PNG or WebP images up to 8 MiB, and MP4 or WebM films up to 80 MB. Both stay private until you publish content that uses them.",
};
/** "0:08", "2:15": a film's running time on its card. */
const runningTime = (ms: number) => { const total = Math.round(ms / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; };
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
type FilmReply = { status: number; body: unknown };
/**
 * Sends a film to the web app's streaming upload route with progress. Fetch cannot report upload progress, and an 80 MB
 * film can take minutes, so this is the one admin request made with XMLHttpRequest.
 */
function sendFilm(file: File, csrfToken: string, onProgress: (fraction: number) => void, signal: { abort?: () => void }): Promise<FilmReply> {
 return new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("POST", "/api/admin/media/films");
  request.setRequestHeader("Content-Type", uploadType(file, "video") ?? file.type);
  request.setRequestHeader("X-CSRF-Token", csrfToken);
  request.setRequestHeader("X-Media-Label", encodeURIComponent(file.name.slice(0, 160)));
  request.timeout = 11 * 60_000;
  request.upload.onprogress = event => { if (event.lengthComputable && event.total) onProgress(event.loaded / event.total); };
  request.onload = () => { let body: unknown = null; try { body = JSON.parse(request.responseText); } catch { /* not JSON */ } resolve({ status: request.status, body }); };
  request.onerror = () => reject(Error("The upload was interrupted. Check your connection and try again."));
  request.ontimeout = () => reject(Error("The upload took too long. Try a smaller film or a faster connection."));
  request.onabort = () => { const error = Error("Upload cancelled"); error.name = "AbortError"; reject(error); };
  signal.abort = () => request.abort();
  request.send(file);
 });
}
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
/**
 * The media library: images and films. `accept` narrows it to one kind, as a picker for an image or a film slot does: it
 * lists and uploads only that kind, so an image slot is never offered a film nor a film slot an image.
 */
export function MediaLibrary({ session, onExpired, onSelect, accept, heading: Heading = "h3" }: { session: StaffSession; onExpired: () => void; onSelect?: (asset: MediaAsset) => void; accept?: MediaKind; heading?: "h2" | "h3" }) {
 const send = useAdminRequest();
 const [assets, setAssets] = useState<MediaAsset[]>([]), [cursor, setCursor] = useState<string | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [loaded, setLoaded] = useState(false);
 const [uploadOpen, setUploadOpen] = useState(false), [uploading, setUploading] = useState<string | null>(null), [uploadError, setUploadError] = useState("");
 const [uploadKind, setUploadKind] = useState<MediaKind>(accept ?? "image"), [progress, setProgress] = useState<number | null>(null), filmRequest = useRef<{ abort?: () => void }>({});
 const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set()), [copied, setCopied] = useState<{ tone: "status" | "error"; text: string } | null>(null);
 const active = useRef(true), expired = useLatest(onExpired), headerTrigger = useRef<HTMLButtonElement>(null), lastTrigger = useRef<HTMLElement | null>(null), hint = useId();
 // Picking one image for a field has no use for bulk selection; only the library screen offers it.
 const selectable = !onSelect, chosen = selectable ? assets.filter(asset => selected.has(asset.id)) : [], working = busy || uploading !== null;
 async function load(next: string | null = null) {
  setBusy(true); setError("");
  try {
   const response = await send(withCursor(accept ? `/api/admin/media?kind=${accept}` : "/api/admin/media", next), { cache: "no-store", credentials: "same-origin" });
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
 useEffect(() => { active.current = true; void load(); return () => { active.current = false; filmRequest.current.abort?.(); }; }, [send, accept]);
 async function upload(file: File) {
  const film = uploadKind === "video";
  const type = uploadType(file, uploadKind);
  if (!type || file.size > (film ? maxFilmBytes : 8 * 1024 * 1024)) {
   setUploadError(film ? "Choose an MP4 or WebM film up to 80 MB." : "Choose a JPEG, PNG or WebP image up to 8 MiB."); return;
  }
  setUploading(file.name); setUploadError(""); setProgress(film ? 0 : null);
  try {
   let status: number, body: unknown;
   if (film) ({ status, body } = await sendFilm(file, session.csrfToken, fraction => { if (active.current) setProgress(fraction); }, filmRequest.current));
   else {
    const headers = { "Content-Type": type, "X-CSRF-Token": session.csrfToken, "X-Media-Label": encodeURIComponent(file.name.slice(0, 160)) };
    const response = await send("/api/admin/media", { method: "POST", credentials: "same-origin", headers, body: file });
    status = response.status; body = await response.json().catch(() => null);
   }
   if (!active.current) return;
   if (status === 401) { setAssets([]); setUploadOpen(false); expired.current(); return; }
   const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "";
   if (status === 413) throw Error(film ? "This film is larger than 80 MB. Export a shorter or smaller film and try again." : message || "Upload failed. Please try again.");
   if (status < 200 || status >= 300) throw Error(message || "Upload failed. Please try again.");
   const asset = parseAsset(body && typeof body === "object" && "asset" in body ? body.asset : null);
   setAssets(previous => [asset, ...previous.filter(a => a.id !== asset.id)]); setLoaded(true); setUploadOpen(false);
  } catch (err) { if (active.current && !aborted(err)) setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again."); }
  finally { if (active.current) { setUploading(null); setProgress(null); } }
 }
 function openUpload(trigger: HTMLElement, kind: MediaKind) { lastTrigger.current = trigger; setUploadKind(kind); setUploadError(""); setUploadOpen(true); }
 function toggle(id: string, on: boolean) { setSelected(previous => new Set(on ? [...previous, id] : [...previous].filter(item => item !== id))); setCopied(null); }
 async function copyLinks() {
  const links = chosen.map(asset => new URL(asset.url, window.location.origin).href), count = links.length;
  try {
   await window.navigator.clipboard.writeText(links.join("\n"));
   if (active.current) setCopied({ tone: "status", text: `Copied ${count} ${count === 1 ? "link" : "links"}. Private images open only once a published page uses them.` });
  } catch { if (active.current) setCopied({ tone: "error", text: "We couldn't copy the links. Allow clipboard access and try again." }); }
 }
 const kinds: MediaKind[] = accept ? [accept] : ["image", "video"];
 const uploadButtons = (ref?: Ref<HTMLButtonElement>) => kinds.map((kind, index) => <ActionButton key={kind} icon={kind === "video" ? Clapperboard : Upload} variant={index ? "outline" : "default"} size="default"
  ref={index ? undefined : ref} disabled={working} onClick={event => openUpload(event.currentTarget, kind)}>{kind === "video" ? "Upload film" : "Upload image"}</ActionButton>);
 const uploadButton = (ref?: Ref<HTMLButtonElement>) => kinds.length === 1 ? uploadButtons(ref) : <div className="flex flex-wrap gap-2">{uploadButtons(ref)}</div>;
 const noun = (n: number) => accept === "video" ? (n === 1 ? "film" : "films") : accept === "image" ? (n === 1 ? "image" : "images") : (n === 1 ? "file" : "files");
 const status = busy ? (assets.length ? `Loading more ${noun(2)}` : "") : loaded ? `${assets.length} ${noun(assets.length)}${cursor ? " loaded so far" : ""}` : "";
 const description = descriptions[accept ?? "all"], filmUpload = uploadKind === "video";
 return <section aria-label="Media library" aria-busy={working} className="min-w-0">
  {Heading === "h2" ? <PanelHeader title="Media library" description={description} actions={uploadButton(headerTrigger)} />
   : <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <SectionHeading className="m-0" description={description}>Media library</SectionHeading>{uploadButton(headerTrigger)}</div>}
  <p aria-live="polite" className="mb-3 min-h-[18px] text-xs tabular-nums text-muted-foreground">{status}</p>
  {error && <Notice tone="error" className="mb-4 items-center justify-between">{error} <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => void load()}>Retry</Button></Notice>}
  {busy && assets.length === 0 && !error && <><p role="status" className="sr-only">Loading {noun(2)}</p>{gridSkeleton}</>}
  {!busy && !error && loaded && assets.length === 0 && (accept === "video"
   ? <EmptyState icon={<Clapperboard strokeWidth={1.5} />} title="No films yet" action={uploadButtons()}>Upload your first film. It stays private until a published page uses it.</EmptyState>
   : <EmptyState icon={<ImageUp strokeWidth={1.5} />} title="No images yet" action={uploadButtons()}>Upload your first image. It stays private until a published page uses it.</EmptyState>)}
  {assets.length > 0 && <ul aria-label={accept === "video" ? "Films" : "Images"} className={grid}>{assets.map(asset => <li key={asset.id} className="min-w-0">
   <Card data-selected={selectable && selected.has(asset.id) ? "" : undefined}
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
     {onSelect && <Button type="button" size="sm" variant="outline" className="mt-1 w-full" disabled={busy} onClick={() => onSelect(asset)}>{asset.kind === "video" ? "Use film" : "Use image"}<span className="sr-only">: {asset.label}</span></Button>}
    </div>
   </Card>
  </li>)}</ul>}
  {cursor && <div className="mt-6 flex justify-center"><Button type="button" variant="outline" disabled={busy} onClick={() => void load(cursor)}>Load more</Button></div>}
  {chosen.length > 0 && <div role="toolbar" aria-label="Selected images" onKeyDown={toolbarKeys} className={cn("sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2",
   "rounded-xl border border-border bg-card px-4 py-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200")}>
   <span className="text-sm font-medium tabular-nums text-foreground">{chosen.length} selected</span>
   {copied && <span role={copied.tone === "error" ? "alert" : "status"} className={cn("text-xs", copied.tone === "error" ? "text-danger" : "text-muted-foreground")}>{copied.text}</span>}
   <div className="ml-auto flex flex-wrap gap-2"><ActionButton icon={Copy} onClick={() => void copyLinks()}>Copy links</ActionButton>
    <ActionButton icon={X} variant="ghost" onClick={() => { setSelected(new Set()); setCopied(null); }}>Clear selection</ActionButton></div>
  </div>}
  <Dialog open={uploadOpen} onOpenChange={open => { if (uploading === null) { setUploadOpen(open); if (!open) setUploadError(""); } }}>
   <DialogContent aria-busy={uploading !== null} className="bg-card sm:max-w-md" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
    onCloseAutoFocus={event => { event.preventDefault(); (lastTrigger.current?.isConnected ? lastTrigger.current : headerTrigger.current)?.focus(); }}>
    <DialogHeader><DialogTitle className="text-base">{filmUpload ? "Upload a film" : "Upload an image"}</DialogTitle>
     <DialogDescription className="text-xs">{filmUpload
      ? "MP4 (H.264) or WebM up to 80 MB, exported for the web: the store plays it exactly as uploaded. It stays private until you publish content that uses it."
      : "JPEG, PNG or WebP up to 8 MiB. It stays private until you publish content that uses it."}</DialogDescription></DialogHeader>
    <label className={cn("grid cursor-pointer justify-items-center gap-1.5 rounded-lg border border-dashed border-input bg-surface px-6 py-8 text-center transition-colors duration-150 ease-admin hover:bg-accent",
     "has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/60 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60")}>
     {filmUpload ? <Clapperboard aria-hidden="true" strokeWidth={1.5} className="mb-1 size-6 text-primary" /> : <ImageUp aria-hidden="true" strokeWidth={1.5} className="mb-1 size-6 text-primary" />}
     <span className="text-sm font-medium text-foreground">{filmUpload ? "Upload film" : "Upload image"}</span>
     <span id={hint} className="text-xs text-muted-foreground">Choose a file from your computer</span>
     <input type="file" aria-label={filmUpload ? "Upload film" : "Upload image"} aria-describedby={hint} className="sr-only" accept={[...acceptedTypes[uploadKind], ...acceptedExtensions[uploadKind]].join(",")} disabled={uploading !== null}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} />
    </label>
    {uploading !== null && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
     <LoaderCircle aria-hidden="true" strokeWidth={1.5} className="size-4 motion-safe:animate-spin" /><span className="truncate">Uploading {uploading}</span>
     {progress !== null && <span className="ml-auto tabular-nums">{Math.floor(progress * 100)}%</span>}</p>}
    {progress !== null && <div role="progressbar" aria-label={`Uploading ${uploading}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)}
     className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-primary transition-[width] duration-150 ease-admin" style={{ width: `${progress * 100}%` }} /></div>}
    {uploadError && <Notice tone="error">{uploadError}</Notice>}
    <DialogFooter>{uploading !== null && progress !== null
     // A film can take minutes; staff may stop it, and nothing of it is kept.
     ? <Button type="button" variant="outline" onClick={() => filmRequest.current.abort?.()}>Cancel upload</Button>
     : <DialogClose asChild><Button type="button" variant="outline" disabled={uploading !== null}>Cancel</Button></DialogClose>}</DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}
