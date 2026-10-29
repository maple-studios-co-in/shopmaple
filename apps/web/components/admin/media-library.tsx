"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Copy, ImageUp, LoaderCircle, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { EmptyState, Notice } from "./crm-primitives";
import { PanelHeader } from "./kit";
import { useAdminRequest } from "./use-admin-request";
export type MediaAsset = { id: string; sha256: string; label: string; width: number; height: number; bytes: number; mimeType: string; createdAt: string; publicAt: string | null; url: string; previewUrl: string };
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]{1,100}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
function parseAsset(value: unknown): MediaAsset {
 if (!value || typeof value !== "object") throw Error("Invalid image response");
 const row = value as Partial<MediaAsset>;
 if (!identifier(row.id) || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256) || typeof row.label !== "string" || row.label.length < 1 || row.label.length > 160 || !Number.isInteger(row.width) || !Number.isInteger(row.height) || row.width! < 1 || row.width! > 2560 || row.height! < 1 || row.height! > 2560 || !Number.isInteger(row.bytes) || row.bytes! < 1 || row.bytes! > 250 * 1024 * 1024 || row.mimeType !== "image/webp" || !timestamp(row.createdAt) || !(row.publicAt === null || timestamp(row.publicAt)) || row.url !== `/media/uploads/${row.sha256}.webp` || row.previewUrl !== `/api/admin/media/${row.sha256}/preview`) throw Error("Invalid image response");
 return { id: row.id, sha256: row.sha256, label: row.label, width: row.width!, height: row.height!, bytes: row.bytes!, mimeType: row.mimeType, createdAt: row.createdAt, publicAt: row.publicAt, url: row.url, previewUrl: row.previewUrl };
}
function parsePage(value: unknown) {
 if (!value || typeof value !== "object") throw Error("Invalid image page");
 const page = value as {assets?:unknown;nextCursor?:unknown};
 if (!Array.isArray(page.assets) || page.assets.length > 50 || !(page.nextCursor === null || identifier(page.nextCursor))) throw Error("Invalid image page");
 return {assets:page.assets.map(parseAsset),nextCursor:page.nextCursor};
}
const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";
const accepted = ["image/jpeg", "image/png", "image/webp"];
const description = "Upload JPEG, PNG or WebP images up to 8 MiB. Images stay private until you publish content that uses them.";
const grid = "grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4";
type CopyResult = { tone: "status" | "error"; text: string };

/** Loading shape: the same grid of cards, image frame and two lines of metadata. */
function MediaGridSkeleton() {
 return <div aria-hidden="true" className={grid}>
  {Array.from({ length: 6 }, (_, index) => <div key={index} data-skeleton className="overflow-hidden rounded-xl border border-border bg-card">
   <Skeleton className="aspect-[4/3] rounded-none motion-reduce:animate-none" />
   <div className="grid gap-2 p-3"><Skeleton className="h-3.5 w-3/4 motion-reduce:animate-none" /><Skeleton className="h-3 w-1/2 motion-reduce:animate-none" /></div>
  </div>)}
 </div>;
}

/** Arrow keys move between the bar's buttons, as a toolbar promises. */
function toolbarKeys(event: KeyboardEvent<HTMLDivElement>) {
 if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
 const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
 const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
 if (index < 0) return;
 event.preventDefault();
 buttons[(index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
}

export function MediaLibrary({ session, onExpired, onSelect, heading: Heading = "h3" }: { session: StaffSession; onExpired: () => void; onSelect?: (asset: MediaAsset) => void; heading?: "h2" | "h3" }) {
 const send = useAdminRequest();
 const [assets,setAssets] = useState<MediaAsset[]>([]), [cursor,setCursor] = useState<string|null>(null);
 const [busy,setBusy] = useState(false), [error,setError] = useState(""), [loaded,setLoaded] = useState(false);
 const [uploadOpen,setUploadOpen] = useState(false), [uploading,setUploading] = useState<string|null>(null), [uploadError,setUploadError] = useState("");
 const [selected,setSelected] = useState<ReadonlySet<string>>(() => new Set()), [copied,setCopied] = useState<CopyResult|null>(null);
 const active = useRef(true), expired = useRef(onExpired); expired.current = onExpired;
 const headerTrigger = useRef<HTMLButtonElement>(null), lastTrigger = useRef<HTMLElement|null>(null), hint = useId();
 // Picking one image for a field has no use for bulk selection; only the library screen offers it.
 const selectable = !onSelect;
 const chosen = selectable ? assets.filter(asset => selected.has(asset.id)) : [];
 async function load(next?:string) {
  setBusy(true);setError("");
  try {
   const response = await send(`/api/admin/media${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,{cache:"no-store",credentials:"same-origin"});
   if(!active.current)return;
   if(response.status===401){setAssets([]);expired.current();return;}
   if(!response.ok)throw Error("load");
   const result = parsePage(await response.json());
   setAssets(previous=>next?[...previous,...result.assets]:result.assets);setCursor(result.nextCursor);setLoaded(true);
  } catch(err) { if(active.current && !aborted(err))setError("We couldn't load your images. Please try again."); }
  finally { if(active.current)setBusy(false); }
 }
 useEffect(()=>{active.current=true;void load();return()=>{active.current=false;};},[send]);
 async function upload(file:File) {
  if(!accepted.includes(file.type)||file.size>8*1024*1024){setUploadError("Choose a JPEG, PNG or WebP image up to 8 MiB.");return;}
  setUploading(file.name);setUploadError("");
  try {
   const response = await send("/api/admin/media",{method:"POST",credentials:"same-origin",headers:{"Content-Type":file.type,"X-CSRF-Token":session.csrfToken,"X-Media-Label":encodeURIComponent(file.name.slice(0,160))},body:file});
   if(!active.current)return;
   if(response.status===401){setAssets([]);setUploadOpen(false);expired.current();return;}
   if(!response.ok){const result = await response.json().catch(()=>null);throw Error(result?.message || "Upload failed. Please try again.");}
   const body: unknown = await response.json();
   const asset = parseAsset(body && typeof body === "object" && "asset" in body ? body.asset : null);
   setAssets(previous=>[asset,...previous.filter(a=>a.id!==asset.id)]);setLoaded(true);setUploadOpen(false);
  } catch(err) { if(active.current && !aborted(err))setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again."); }
  finally {if(active.current)setUploading(null);}
 }
 function openUpload(trigger: HTMLElement) { lastTrigger.current = trigger; setUploadError(""); setUploadOpen(true); }
 function toggle(id: string, on: boolean) {
  setSelected(previous => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; });
  setCopied(null);
 }
 function clearSelection() { setSelected(new Set()); setCopied(null); }
 async function copyLinks() {
  const links = chosen.map(asset => new URL(asset.url, window.location.origin).href), count = links.length;
  try {
   if (!window.navigator.clipboard) throw Error("clipboard");
   await window.navigator.clipboard.writeText(links.join("\n"));
   if (active.current) setCopied({ tone: "status", text: `Copied ${count} ${count === 1 ? "link" : "links"}. Private images open only once a published page uses them.` });
  } catch { if (active.current) setCopied({ tone: "error", text: "We couldn't copy the links. Allow clipboard access and try again." }); }
 }
 const uploadButton = (ref?: Ref<HTMLButtonElement>) => <Button type="button" ref={ref} disabled={busy||uploading!==null} onClick={event=>openUpload(event.currentTarget)}><Upload aria-hidden="true" strokeWidth={1.5} />Upload image</Button>;
 const status = busy ? (assets.length ? "Loading more images" : "") : loaded ? `${assets.length} ${assets.length === 1 ? "image" : "images"}${cursor ? " loaded so far" : ""}` : "";
 return <section aria-label="Media library" aria-busy={busy||uploading!==null} className="min-w-0">
  {Heading === "h2"
   ? <PanelHeader title="Media library" description={description} actions={uploadButton(headerTrigger)} />
   : <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="grid max-w-[68ch] gap-1"><h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Media library</h3><p className="text-[12.5px] leading-relaxed text-muted-foreground">{description}</p></div>
    {uploadButton(headerTrigger)}
   </div>}
  <p aria-live="polite" className="mb-3 min-h-[18px] text-[12.5px] tabular-nums text-muted-foreground">{status}</p>
  {error&&<Notice tone="error" className="mb-4 items-center justify-between">{error} <Button type="button" size="xs" variant="outline" disabled={busy} onClick={()=>void load()}>Retry</Button></Notice>}
  {busy&&assets.length===0&&!error&&<><p role="status" className="sr-only">Loading images</p><MediaGridSkeleton /></>}
  {!busy&&!error&&loaded&&assets.length===0&&<EmptyState icon={<ImageUp strokeWidth={1.5} />} title="No images yet" action={uploadButton()}>Upload your first image. It stays private until a published page uses it.</EmptyState>}
  {assets.length>0&&<ul aria-label="Images" className={grid}>{assets.map(asset=>{
   const isSelected = selected.has(asset.id);
   return <li key={asset.id} className="min-w-0">
    <Card data-selected={selectable && isSelected ? "" : undefined} className="h-full gap-0 overflow-hidden py-0 shadow-xs transition-colors duration-150 ease-admin data-[selected]:border-primary data-[selected]:ring-2 data-[selected]:ring-primary/25">
     <div className="relative aspect-[4/3] border-b border-line-soft bg-sunken">
      <img src={asset.previewUrl} alt={asset.label} width={asset.width} height={asset.height} loading="lazy" className="size-full object-contain" />
      {selectable&&<label className="absolute top-2 left-2 grid size-8 cursor-pointer place-items-center rounded-md bg-card/95 shadow-xs"><NativeCheckbox aria-label={`Select ${asset.label}`} checked={isSelected} onChange={event=>toggle(asset.id,event.currentTarget.checked)} /></label>}
     </div>
     <div className="grid gap-1.5 p-3">
      <p title={asset.label} className="truncate text-[13px] font-medium text-foreground">{asset.label}</p>
      <div className="flex items-center justify-between gap-2">
       <span className="text-[12px] tabular-nums text-muted-foreground">{asset.width} × {asset.height} · {Math.ceil(asset.bytes/1024)} KB</span>
       <Badge variant="outline" className={cn("text-[11px]", asset.publicAt ? "border-success/20 bg-success-bg text-success" : "border-border bg-neutral-bg text-neutral")}>{asset.publicAt?"Published":"Private"}</Badge>
      </div>
      {onSelect&&<Button type="button" size="sm" variant="outline" className="mt-1 w-full" disabled={busy} onClick={()=>onSelect(asset)}>Use image<span className="sr-only">: {asset.label}</span></Button>}
     </div>
    </Card>
   </li>;
  })}</ul>}
  {cursor&&<div className="mt-6 flex justify-center"><Button type="button" variant="outline" disabled={busy} onClick={()=>void load(cursor)}>Load more</Button></div>}
  {chosen.length>0&&<div role="toolbar" aria-label="Selected images" onKeyDown={toolbarKeys} className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
   <span className="text-[13.5px] font-medium tabular-nums text-foreground">{chosen.length} selected</span>
   {copied&&<span role={copied.tone === "error" ? "alert" : "status"} className={cn("text-[12.5px]", copied.tone === "error" ? "text-danger" : "text-muted-foreground")}>{copied.text}</span>}
   <div className="ml-auto flex flex-wrap gap-2">
    <Button type="button" size="sm" variant="outline" onClick={()=>void copyLinks()}><Copy aria-hidden="true" strokeWidth={1.5} />Copy links</Button>
    <Button type="button" size="sm" variant="ghost" onClick={clearSelection}><X aria-hidden="true" strokeWidth={1.5} />Clear selection</Button>
   </div>
  </div>}
  <Dialog open={uploadOpen} onOpenChange={open=>{if(uploading===null){setUploadOpen(open);if(!open)setUploadError("");}}}>
   <DialogContent aria-busy={uploading!==null} className="bg-card sm:max-w-md" onKeyDown={event=>{if(event.key==="Escape")event.stopPropagation();}} onCloseAutoFocus={event=>{event.preventDefault();(lastTrigger.current?.isConnected?lastTrigger.current:headerTrigger.current)?.focus();}}>
    <DialogHeader>
     <DialogTitle className="text-[15px]">Upload an image</DialogTitle>
     <DialogDescription className="text-[12.5px]">JPEG, PNG or WebP up to 8 MiB. It stays private until you publish content that uses it.</DialogDescription>
    </DialogHeader>
    <label className="grid cursor-pointer justify-items-center gap-1.5 rounded-lg border border-dashed border-input bg-surface px-6 py-8 text-center transition-colors duration-150 ease-admin hover:bg-accent has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/60 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60">
     <ImageUp aria-hidden="true" strokeWidth={1.5} className="mb-1 size-6 text-primary" />
     <span className="text-[13.5px] font-medium text-foreground">Upload image</span>
     <span id={hint} className="text-[12.5px] text-muted-foreground">Choose a file from your computer</span>
     <input type="file" aria-label="Upload image" aria-describedby={hint} className="sr-only" accept={accepted.join(",")} disabled={uploading!==null} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void upload(file);}}/>
    </label>
    {uploading!==null&&<p role="status" className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><LoaderCircle aria-hidden="true" strokeWidth={1.5} className="size-4 motion-safe:animate-spin" /><span className="truncate">Uploading {uploading}</span></p>}
    {uploadError&&<Notice tone="error">{uploadError}</Notice>}
    <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={uploading!==null}>Cancel</Button></DialogClose></DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}
