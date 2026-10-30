"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { templateMediaDecorativeKeys, templateMediaResponsiveKeys, type TemplateMedia, type TemplateMediaItem, type TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia, templateMediaSlots } from "@/lib/template-media-defaults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { FieldGrid, PanelHeader, Prose, SelectField } from "./kit";
import { MediaPicker } from "./media-picker";

const groups = ["Homepage", "Homepage icons", "Cities", "Nimbus", "Our Story"] as const;
export function TemplateArtworkFields({ value, onChange, session, onExpired }: {
  value?: TemplateMedia;
  onChange: (value: TemplateMedia) => void;
  session: StaffSession;
  onExpired: () => void;
}) {
  const [selected, setSelected] = useState<TemplateMediaKey>("home-workshop-poster");
  const placement = useRef<HTMLSelectElement>(null);
  const slot = templateMediaSlots.find(item => item.key === selected)!;
  const artwork = resolveTemplateMedia(selected, value);
  const responsive = templateMediaResponsiveKeys.some(key => key === selected);
  const overridden = value?.some(item => item.key === selected) ?? false;
  const poster = selected.endsWith("-poster");
  const decorative = templateMediaDecorativeKeys.some(key => key === selected);
  function update(patch: Partial<Pick<TemplateMediaItem, "image" | "mobileImage" | "alt">>) {
    const next = { ...artwork, ...patch };
    onChange(overridden
      ? value!.map(item => item.key === selected ? next : item)
      : [...(value ?? []), next]);
  }
  return (
    <section aria-label="Template artwork">
      <PanelHeader title="Artwork" description="Choose a page and placement to replace its image. Save a draft, then publish when ready." />
      <FieldGrid className="mb-6">
        <SelectField label="Artwork group" value={slot.group} onChange={event => {
          const first = templateMediaSlots.find(item => item.group === event.target.value);
          if (first) setSelected(first.key);
        }}>
          {groups.map(group => <NativeSelectOption key={group} value={group}>{group}</NativeSelectOption>)}
        </SelectField>
        <SelectField ref={placement} label="Artwork placement" value={selected} onChange={event => {
          const next = templateMediaSlots.find(item => item.key === event.target.value);
          if (next) setSelected(next.key);
        }}>
          {templateMediaSlots.filter(item => item.group === slot.group).map(item => <NativeSelectOption key={item.key} value={item.key}>{item.label}</NativeSelectOption>)}
        </SelectField>
      </FieldGrid>
      <Card className="gap-5 px-5 py-5 shadow-xs sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">{slot.label}</h3>
          <Badge variant="secondary" className={cn("rounded-md border-0 font-semibold", overridden ? "bg-accent-tint text-primary" : "bg-neutral-bg text-neutral")}>
            {overridden ? "Custom artwork in this draft" : "Using original artwork"}
          </Badge>
        </div>
        {poster && <Notice tone="info">Changing this poster replaces the still image; the video stays unchanged.{selected !== "home-workshop-poster" && " The image description also labels the video."}</Notice>}
        {responsive && <Notice tone="info">This placement needs both desktop and mobile images. Changing one keeps the other crop.</Notice>}
        <div className={cn("grid gap-5", responsive && "lg:grid-cols-2")} key={selected}>
          <div role="group" aria-label="Desktop artwork" className="grid min-w-0 content-start gap-3">
            <p className="text-xs font-semibold tracking-[0.02em] text-muted-foreground uppercase">Desktop</p>
            <Field label="Desktop image URL" value={artwork.image} maxLength={1000} onChange={image => update({ image })} />
            <MediaPicker label="Desktop image" value={artwork.image} onChange={image => update({ image })} session={session} onExpired={onExpired} />
          </div>
          {responsive && <div role="group" aria-label="Mobile artwork" className="grid min-w-0 content-start gap-3">
            <p className="text-xs font-semibold tracking-[0.02em] text-muted-foreground uppercase">Mobile</p>
            <Field label="Mobile image URL" value={artwork.mobileImage ?? ""} maxLength={1000} onChange={mobileImage => update({ mobileImage })} />
            <MediaPicker label="Mobile image" value={artwork.mobileImage ?? ""} onChange={mobileImage => update({ mobileImage })} session={session} onExpired={onExpired} />
          </div>}
        </div>
        <div className="grid gap-2 border-t border-line-soft pt-5">
          <Field label="Image description" value={artwork.alt} maxLength={200} onChange={alt => update({ alt })} />
          <Prose className="text-xs">{decorative ? "Leave the description blank if this artwork is decorative. Otherwise describe what it communicates." : "Describe what the image communicates for visitors using a screen reader. A description is required."}</Prose>
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" disabled={!overridden} onClick={() => {
            onChange((value ?? []).filter(item => item.key !== selected));
            placement.current?.focus();
          }}><RotateCcw aria-hidden="true" strokeWidth={1.5} />Restore original</Button>
        </div>
      </Card>
    </section>
  );
}
