"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { templateMediaDecorativeKeys, templateMediaResponsiveKeys, type TemplateMedia, type TemplateMediaItem, type TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia, templateMediaSlots } from "@/lib/template-media-defaults";
import { pictureSlotGroups } from "@/lib/picture-slot-defaults";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { ActionButton, FieldGrid, PanelHeader, Prose, SectionHeading, SelectField } from "./kit";
import { MediaPicker } from "./media-picker";
import { TemplateFilmFields, type TemplateFilmFieldsProps } from "./template-film-fields";

const groups = ["Homepage", "Homepage icons", "Cities", "Nimbus", "Our Story", "Contact", "Bulk Enquiry", "Terra", ...pictureSlotGroups] as const;
type Props = { value?: TemplateMedia; onChange: (value: TemplateMedia) => void; session: StaffSession; onExpired: () => void };

/** A picture clicked in the live preview: show its placement and open its library. Each click brings a new `nonce`. */
export type ArtworkRequest = { slot: TemplateMediaKey; nonce: number; /** false: show the placement without opening its library (a film is chosen below it). */ library?: boolean };

/** The Artwork screen: every page's artwork, chosen by group and placement. */
export function TemplateArtworkFields({ films, request, ...props }: Props & { films?: TemplateFilmFieldsProps; request?: ArtworkRequest }) {
  const [group, setGroup] = useState<(typeof groups)[number]>("Homepage");
  // A picture clicked in the live preview opens on its own group first; the placement and library follow below.
  useEffect(() => {
    const wanted = request && templateMediaSlots.find(item => item.key === request.slot)?.group;
    if (wanted) setGroup(wanted as (typeof groups)[number]);
  }, [request?.nonce]);
  return (
    <section aria-label="Template artwork">
      <PanelHeader title="Artwork" description="Choose a page and placement to replace its image. Save a draft, then publish when ready." />
      <ArtworkSlots {...props} request={request} keys={templateMediaSlots.filter(item => item.group === group).map(item => item.key)}
        group={<SelectField label="Artwork group" value={group} onChange={event => setGroup(event.target.value as (typeof groups)[number])}>
          {groups.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
        </SelectField>} />
      {films && <TemplateFilmFields group={group} {...films} />}
    </section>
  );
}

/**
 * Replace the artwork of one placement among `keys`: the Artwork screen passes a whole group,
 * a homepage section's inspector only the placements that section draws.
 */
export function ArtworkSlots({ value, onChange, session, onExpired, keys, group, request }: Props & { keys: readonly TemplateMediaKey[]; group?: ReactNode; request?: ArtworkRequest }) {
  const [chosen, setSelected] = useState<TemplateMediaKey>(keys[0]!);
  // A picture clicked in the live preview: its placement, once its group's placements are here (the group may change first).
  const handled = useRef(0);
  const offered = keys.join(" ");
  useEffect(() => {
    if (!request || request.nonce === handled.current || !keys.includes(request.slot)) return;
    handled.current = request.nonce;
    setSelected(request.slot);
  }, [request?.nonce, offered]);
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
            {overridden ? "Custom artwork in this draft" : slot.image ? "Using original artwork" : slot.standIn ? "Chosen by the page" : slot.product ? "Using a Keeri product photo" : "No artwork shown"}
          </Badge>
        </div>
        {slot.help && <Prose className="text-sm">{slot.help}</Prose>}
        {!overridden && !slot.image && <Notice tone="info">
          {slot.standIn
            ? `Until you upload one, this shows ${slot.standIn}.`
            : slot.product
            ? `The original artwork was on Shopify and has left the store. Until you upload one, the store shows the first photo of the Keeri product “${slot.product}”.`
            : "The original artwork was on Shopify and has left the store. Until you upload one, the store leaves this image out."}
        </Notice>}
        {["home-testimonial-poster", "nimbus-hero-poster", "terra-hero"].includes(selected) && <Notice tone="info">
          This picture is also the poster of its film: the still shown before the film plays and to visitors who ask for reduced motion. Choose the film itself below.{selected === "home-testimonial-poster" && " The image description also labels the film."}
        </Notice>}
        {responsive && <Notice tone="info">This placement needs both desktop and mobile images. Changing one keeps the other crop.</Notice>}
        <div className={cn("grid gap-5", responsive && "@xl:grid-cols-2")} key={selected}>
          {(responsive ? (["Desktop", "Mobile"] as const) : (["Desktop"] as const)).map(kind => {
            const key = kind === "Desktop" ? "image" : "mobileImage", url = artwork[key] ?? "";
            return <div key={kind} role="group" aria-label={`${kind} artwork`} className="grid min-w-0 content-start gap-3">
              <p className="text-xs font-semibold tracking-[0.02em] text-muted-foreground uppercase">{kind}</p>
              <Field label={`${kind} image URL`} value={url} maxLength={1000} onChange={image => update({ [key]: image })} />
              <MediaPicker label={`${kind} image`} value={url} onChange={image => update({ [key]: image })} session={session} onExpired={onExpired}
                openRequest={kind === "Desktop" && request?.slot === selected && request.library !== false ? request.nonce : undefined} />
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
