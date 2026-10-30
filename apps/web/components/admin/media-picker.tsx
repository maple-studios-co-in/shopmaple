"use client";
import { contentImageSchema } from "@shopmaple/contracts";
import { useId, useRef, useState } from "react";
import { ImageIcon, Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StaffSession } from "./dashboard";
import { ActionButton } from "./kit";
import { MediaLibrary } from "./media-library";

/** Library uploads stay private until published, so the admin previews them through its own route. */
export function mediaPreviewUrl(src: string) {
  const match = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/.exec(src);
  return match ? `/api/admin/media/${match[1]}/preview` : src;
}

/** Choose an approved image from the media library; previews go through the private admin transport. */
export function MediaPicker({ label, value, onChange, session, onExpired }: {
  label: string; value: string; onChange: (url: string) => void; session: StaffSession; onExpired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const previewable = Boolean(value) && contentImageSchema.safeParse(value).success;
  return (
    <div role="group" aria-labelledby={labelId} data-span="full" className="grid min-w-0 gap-3 rounded-lg border border-line-soft bg-surface p-3 [overflow-wrap:anywhere] sm:p-4">
      <p id={labelId} className="text-xs font-medium text-foreground">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="grid h-[100px] w-[160px] shrink-0 place-items-center overflow-hidden rounded-md border border-line-soft bg-sunken">
          {previewable
            ? <img src={mediaPreviewUrl(value)} alt={`${label} preview`} width={160} height={100} className="size-full object-contain" />
            : <ImageIcon aria-hidden="true" strokeWidth={1.5} className="size-5 text-muted-foreground" />}
        </span>
        <div className="grid min-w-0 flex-1 basis-48 gap-2">
          <p className="text-xs text-muted-foreground">{previewable ? value : value ? "This address is not an approved image, so it is not previewed." : "No image chosen."}</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={Images} ref={trigger} aria-expanded={open} onClick={() => setOpen(v => !v)}>Choose image</ActionButton>
            {value && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange("")}>Clear image</Button>}
          </div>
        </div>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-line-soft pt-3" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
          <ActionButton icon={X} variant="ghost" className="justify-self-end text-muted-foreground" onClick={close}>Close library</ActionButton>
          <MediaLibrary session={session} onExpired={onExpired} onSelect={asset => { onChange(asset.url); close(); }} />
        </div>
      )}
    </div>
  );
}
