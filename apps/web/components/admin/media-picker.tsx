"use client";
import { contentImageSchema } from "@shopmaple/contracts";
import { useRef, useState } from "react";
import type { StaffSession } from "./dashboard";
import { MediaLibrary } from "./media-library";
export function MediaPicker({ label, value, onChange, session, onExpired }: { label: string; value: string; onChange: (url: string) => void; session: StaffSession; onExpired: () => void }) {
 const [open,setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null);
 const close = ()=>{setOpen(false);trigger.current?.focus();};
 const match = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/.exec(value);
 return <div className="admin-media-picker"><p>{label}</p>
  {value&&contentImageSchema.safeParse(value).success&&<><img src={match?`/api/admin/media/${match[1]}/preview`:value} alt={`${label} preview`} width={160} height={100} style={{objectFit:"contain"}}/><p>{value}</p></>}
  <button type="button" ref={trigger} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Choose image</button>
  {value&&<button type="button" onClick={()=>onChange("")}>Clear image</button>}
  {open&&<div onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();close();}}}><button type="button" onClick={close}>Close library</button><MediaLibrary session={session} onExpired={onExpired} onSelect={asset=>{onChange(asset.url);close();}}/></div>}
 </div>;
}
