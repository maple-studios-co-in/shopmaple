"use client";
import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { StaffSession } from "./dashboard";
import { EmptyState, Notice, Skeleton } from "./crm-primitives";
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
export function MediaLibrary({ session, onExpired, onSelect, heading: Heading = "h3" }: { session: StaffSession; onExpired: () => void; onSelect?: (asset: MediaAsset) => void; heading?: "h2" | "h3" }) {
 const send = useAdminRequest();
 const [assets,setAssets] = useState<MediaAsset[]>([]), [cursor,setCursor] = useState<string|null>(null);
 const [busy,setBusy] = useState(false), [error,setError] = useState(""), [loaded,setLoaded] = useState(false);
 const active = useRef(true), expired = useRef(onExpired); expired.current = onExpired;
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
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){setError("Choose a JPEG, PNG or WebP image up to 8 MiB.");return;}
  setBusy(true);setError("");
  try {
   const response = await send("/api/admin/media",{method:"POST",credentials:"same-origin",headers:{"Content-Type":file.type,"X-CSRF-Token":session.csrfToken,"X-Media-Label":encodeURIComponent(file.name.slice(0,160))},body:file});
   if(!active.current)return;
   if(response.status===401){setAssets([]);expired.current();return;}
   if(!response.ok){const result = await response.json().catch(()=>null);throw Error(result?.message || "Upload failed. Please try again.");}
   const body: unknown = await response.json();
   const asset = parseAsset(body && typeof body === "object" && "asset" in body ? body.asset : null);
   setAssets(previous=>[asset,...previous.filter(a=>a.id!==asset.id)]);
  } catch(err) { if(active.current && !aborted(err))setError(err instanceof Error ? err.message : "Upload failed. Please try again."); }
  finally {if(active.current)setBusy(false);}
 }
 return <section aria-label="Media library" aria-busy={busy} className="admin-media-library">
  <div className="admin-panel-head"><div><Heading>Media library</Heading><p>Upload JPEG, PNG or WebP images up to 8 MiB. Images stay private until you publish content that uses them.</p></div></div>
  <div className="admin-media-toolbar">
   <label className="admin-upload"><Upload aria-hidden="true" strokeWidth={1.5} size={16} />Upload image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void upload(file);}}/></label>
   <span className="admin-inline-status">{busy ? <><span className="admin-busy-dot" aria-hidden="true" />Working</> : loaded ? `${assets.length} ${assets.length === 1 ? "image" : "images"}${cursor ? " loaded so far" : ""}` : ""}</span>
  </div>
  {error&&<Notice tone="error">{error} <button type="button" className="admin-small admin-quiet" disabled={busy} onClick={()=>void load()}>Retry</button></Notice>}
  {busy&&assets.length===0&&!error&&<><p role="status" className="admin-sr-only">Loading images</p><Skeleton rows={2} variant="card" /></>}
  {!busy&&!error&&loaded&&assets.length===0&&<EmptyState title="No images yet">Upload your first image with the control above. It stays private until a published page uses it.</EmptyState>}
  {assets.length>0&&<div className="admin-media-grid">{assets.map(asset=><article key={asset.id}>
   <img src={asset.previewUrl} alt={asset.label} width={asset.width} height={asset.height} loading="lazy"/>
   <p title={asset.label}>{asset.label}</p><small>{asset.width} x {asset.height}, {Math.ceil(asset.bytes/1024)} KB, {asset.publicAt?"Published":"Private"}</small>
   {onSelect&&<button type="button" disabled={busy} onClick={()=>onSelect(asset)}>Use image<span className="sr-only">: {asset.label}</span></button>}
  </article>)}</div>}
  {cursor&&<button type="button" className="admin-quiet" disabled={busy} onClick={()=>void load(cursor)}>Load more</button>}
 </section>;
}
