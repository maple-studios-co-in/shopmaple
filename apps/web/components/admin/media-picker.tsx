"use client";
import { contentFilmSchema, contentImageSchema } from "@shopmaple/contracts";
import { useId, useRef, useState } from "react";
import { Clapperboard, ImageIcon, Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StaffSession } from "./dashboard";
import { ActionButton } from "./kit";
import { MediaLibrary, type MediaAsset, type MediaKind } from "./media-library";

/** Library uploads stay private until published, so the admin previews them (images and films) through its own route. */
export function mediaPreviewUrl(src: string) {
  const match = /^\/media\/uploads\/([a-f0-9]{64})\.(?:webp|mp4|webm)$/.exec(src);
  return match ? `/api/admin/media/${match[1]}/preview` : src;
}

/**
 * Choose an approved image, or with `accept="video"` a film, from the media library; previews go through the private
 * admin transport. The library it opens lists and uploads only that kind.
 */
export function MediaPicker({ label, value, onChange, onPick, session, onExpired, accept = "image" }: {
  label: string; value: string; onChange: (url: string) => void; session: StaffSession; onExpired: () => void;
  /** Receives the chosen file itself instead of `onChange` its address, for a field that keeps more (a film's running time). */
  onPick?: (asset: MediaAsset) => void;
  accept?: MediaKind;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const film = accept === "video";
  const noun = film ? "film" : "image";
  const previewable = Boolean(value) && (film ? contentFilmSchema : contentImageSchema).safeParse(value).success;
  const Placeholder = film ? Clapperboard : ImageIcon;
  return (
    <div role="group" aria-labelledby={labelId} data-span="full" data-media-picker={accept} className="grid min-w-0 gap-3 rounded-lg border border-line-soft bg-surface p-3 [overflow-wrap:anywhere] sm:p-4">
      <p id={labelId} className="text-xs font-medium text-foreground">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="grid h-[100px] w-[160px] shrink-0 place-items-center overflow-hidden rounded-md border border-line-soft bg-sunken">
          {previewable
            ? film
              ? <video src={mediaPreviewUrl(value)} aria-label={`${label} preview`} width={160} height={100} controls muted playsInline preload="metadata" className="size-full object-contain" />
              : <img src={mediaPreviewUrl(value)} alt={`${label} preview`} width={160} height={100} className="size-full object-contain" />
            : <Placeholder aria-hidden="true" strokeWidth={1.5} className="size-5 text-muted-foreground" />}
        </span>
        <div className="grid min-w-0 flex-1 basis-48 gap-2">
          <p className="text-xs text-muted-foreground">{previewable ? value : value
            ? film ? "This address is not a film from the media library, so it does not play. Choose a film." : "This address is not an approved image, so it is not previewed."
            : `No ${noun} chosen.`}</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={Images} ref={trigger} aria-expanded={open} onClick={() => setOpen(v => !v)}>Choose {noun}</ActionButton>
            {value && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange("")}>Clear {noun}</Button>}
          </div>
        </div>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-line-soft pt-3" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
          <ActionButton icon={X} variant="ghost" className="justify-self-end text-muted-foreground" onClick={close}>Close library</ActionButton>
          <MediaLibrary session={session} onExpired={onExpired} accept={accept} onSelect={asset => { if (onPick) onPick(asset); else onChange(asset.url); close(); }} />
        </div>
      )}
    </div>
  );
}
