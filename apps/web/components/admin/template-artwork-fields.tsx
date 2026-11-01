"use client";
import { useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { templateMediaDecorativeKeys, templateMediaResponsiveKeys, type TemplateMedia, type TemplateMediaItem, type TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia, templateMediaSlots } from "@/lib/template-media-defaults";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { ActionButton, FieldGrid, PanelHeader, Prose, SectionHeading, SelectField } from "./kit";
import { MediaPicker } from "./media-picker";

const groups = ["Homepage", "Homepage icons", "Cities", "Nimbus", "Our Story"] as const;
type Props = { value?: TemplateMedia; onChange: (value: TemplateMedia) => void; session: StaffSession; onExpired: () => void };

/** The Artwork screen: every page's artwork, chosen by group and placement. */
export function TemplateArtworkFields(props: Props) {
  const [group, setGroup] = useState<(typeof groups)[number]>("Homepage");
  return (
    <section aria-label="Template artwork">
      <PanelHeader title="Artwork" description="Choose a page and placement to replace its image. Save a draft, then publish when ready." />
      <ArtworkSlots {...props} keys={templateMediaSlots.filter(item => item.group === group).map(item => item.key)}
        group={<SelectField label="Artwork group" value={group} onChange={event => setGroup(event.target.value as (typeof groups)[number])}>
          {groups.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
        </SelectField>} />
    </section>
  );
}

/**
 * Replace the artwork of one placement among `keys`: the Artwork screen passes a whole group,
 * a homepage section's inspector only the placements that section draws.
 */
export function ArtworkSlots({ value, onChange, session, onExpired, keys, group }: Props & { keys: readonly TemplateMediaKey[]; group?: ReactNode }) {
  const [chosen, setSelected] = useState<TemplateMediaKey>(keys[0]!);
  // A new set of placements (another group) starts at its first; the group control keeps focus.
  const selected = keys.includes(chosen) ? chosen : keys[0]!;
  const placement = useRef<HTMLSelectElement>(null);
  const slot = templateMediaSlots.find(item => item.key === selected)!;
  const artwork = resolveTemplateMedia(selected, value);
  const responsive = templateMediaResponsiveKeys.some(key => key === selected), decorative = templateMediaDecorativeKeys.some(key => key === selected);
  const overridden = value?.some(item => item.key === selected) ?? false;
  function update(patch: Partial<Pick<TemplateMediaItem, "image" | "mobileImage" | "alt">>) {
    const next = { ...artwork, ...patch };
    onChange(overridden ? value!.map(item => item.key === selected ? next : item) : [...(value ?? []), next]);
  }
  return (
    <>
      <FieldGrid className="mb-6">
        {group}
        <SelectField ref={placement} label="Artwork placement" value={selected} onChange={event => setSelected(event.target.value as TemplateMediaKey)}>
          {keys.map(key => <NativeSelectOption key={key} value={key}>{templateMediaSlots.find(item => item.key === key)!.label}</NativeSelectOption>)}
        </SelectField>
      </FieldGrid>
      <Card className="@container gap-5 px-5 py-5 shadow-xs sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading className="m-0">{slot.label}</SectionHeading>
          <Badge variant="secondary" className={cn("rounded-md border-0 font-semibold", overridden ? "bg-accent-tint text-primary" : "bg-neutral-bg text-neutral")}>
            {overridden ? "Custom artwork in this draft" : "Using original artwork"}
          </Badge>
        </div>
        {selected.endsWith("-poster") && <Notice tone="info">
          Changing this poster replaces the still image; the video stays unchanged.{selected !== "home-workshop-poster" && " The image description also labels the video."}
        </Notice>}
        {responsive && <Notice tone="info">This placement needs both desktop and mobile images. Changing one keeps the other crop.</Notice>}
        <div className={cn("grid gap-5", responsive && "@xl:grid-cols-2")} key={selected}>
          {(responsive ? (["Desktop", "Mobile"] as const) : (["Desktop"] as const)).map(kind => {
            const key = kind === "Desktop" ? "image" : "mobileImage", url = artwork[key] ?? "";
            return <div key={kind} role="group" aria-label={`${kind} artwork`} className="grid min-w-0 content-start gap-3">
              <p className="text-xs font-semibold tracking-[0.02em] text-muted-foreground uppercase">{kind}</p>
              <Field label={`${kind} image URL`} value={url} maxLength={1000} onChange={image => update({ [key]: image })} />
              <MediaPicker label={`${kind} image`} value={url} onChange={image => update({ [key]: image })} session={session} onExpired={onExpired} />
            </div>;
          })}
        </div>
        <div className="grid gap-2 border-t border-line-soft pt-5">
          <Field label="Image description" value={artwork.alt} maxLength={200} onChange={alt => update({ alt })} />
          <Prose className="text-xs">{decorative
            ? "Leave the description blank if this artwork is decorative. Otherwise describe what it communicates."
            : "Describe what the image communicates for visitors using a screen reader. A description is required."}</Prose>
        </div>
        <div><ActionButton icon={RotateCcw} disabled={!overridden}
          onClick={() => { onChange((value ?? []).filter(item => item.key !== selected)); placement.current?.focus(); }}>Restore original</ActionButton></div>
      </Card>
    </>
  );
}
