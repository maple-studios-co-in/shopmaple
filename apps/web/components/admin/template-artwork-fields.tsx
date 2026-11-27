"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import {
  defaultCollectionBannerLook, templateMediaDecorativeKeys, templateMediaPhoneOptionalKeys, templateMediaResponsiveKeys,
  type CollectionBannerDisplay, type TemplateMedia, type TemplateMediaItem, type TemplateMediaKey,
} from "@shopmaple/contracts";
import { resolveTemplateMedia, templateMediaSlots } from "@/lib/template-media-defaults";
import { pictureSlotGroups } from "@/lib/picture-slot-defaults";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import { WordsLookFields } from "./banner-look-fields";
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
  // A collection page's banner (owner, 20 Nov 2026): a wide picture, an optional square one for phones, and how it shows.
  const banner = templateMediaPhoneOptionalKeys.some(key => key === selected);
  const overridden = value?.some(item => item.key === selected) ?? false;
  function update(patch: Partial<Pick<TemplateMediaItem, "image" | "mobileImage" | "alt" | "display" | "look">>) {
    const next: TemplateMediaItem = { ...artwork, ...patch };
    // An optional phone picture that was cleared is no phone picture.
    if (banner && !next.mobileImage) delete next.mobileImage;
    // The words' look belongs to a photo behind the words; a whole banner has none.
    if (next.display !== "photo") delete next.look;
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
        {banner && <Notice tone="info">
          This banner is the size of the category pages&apos; banners: 2784 × 400 px, shown 1360 × 195 on a laptop. Phones show it square: add a square phone picture (at least 1000 × 1000 px), or phones show the middle of the wide one.
        </Notice>}
        <div className={cn("grid gap-5", (responsive || banner) && "@xl:grid-cols-2")} key={selected}>
          {(responsive || banner ? (["Desktop", "Mobile"] as const) : (["Desktop"] as const)).map(kind => {
            const key = kind === "Desktop" ? "image" : "mobileImage", url = artwork[key] ?? "";
            return <div key={kind} role="group" aria-label={`${kind} artwork`} className="grid min-w-0 content-start gap-3">
              <p className="text-xs font-semibold tracking-[0.02em] text-muted-foreground uppercase">{banner && kind === "Mobile" ? "Phone (optional)" : kind}</p>
              <Field label={`${kind} image URL`} value={url} maxLength={1000} onChange={image => update({ [key]: image })} />
              <MediaPicker label={`${kind} image`} value={url} onChange={image => update({ [key]: image })} session={session} onExpired={onExpired}
                openRequest={kind === "Desktop" && request?.slot === selected && request.library !== false ? request.nonce : undefined} />
            </div>;
          })}
        </div>
        {banner && <div className="grid gap-2 border-t border-line-soft pt-5">
          <SelectField label="How the banner shows the picture" value={artwork.display ?? "banner"} disabled={!artwork.image}
            onChange={event => update({ display: event.target.value as CollectionBannerDisplay })}>
            <NativeSelectOption value="banner">The whole banner, with its own words (as on the category pages)</NativeSelectOption>
            <NativeSelectOption value="photo">A photo behind the collection&apos;s name and line</NativeSelectOption>
          </SelectField>
          <Prose className="text-xs">{artwork.image
            ? "Choose “A photo” for a picture without words: the page writes the collection's name and line over it, on Maple's burgundy."
            : "Until you choose a picture, the banner writes the collection's name and line on Maple's burgundy, over its first product photo."}</Prose>
          {artwork.image && artwork.display === "photo" && <div className="mt-3">
            <WordsLookFields value={{ ...defaultCollectionBannerLook, ...artwork.look }} onChange={look => update({ look })} />
          </div>}
        </div>}
        <div className="grid gap-2 border-t border-line-soft pt-5">
          <Field label="Image description" value={artwork.alt} maxLength={200} onChange={alt => update({ alt })} />
          <Prose className="text-xs">{banner
            ? "For a whole banner, write the banner's words here for visitors using a screen reader. A photo behind the page's words may stay blank."
            : decorative
            ? "Leave the description blank if this artwork is decorative. Otherwise describe what it communicates."
            : "Describe what the image communicates for visitors using a screen reader. A description is required."}</Prose>
        </div>
        <div><ActionButton icon={RotateCcw} disabled={!overridden}
          onClick={() => { onChange((value ?? []).filter(item => item.key !== selected)); placement.current?.focus(); }}>Restore original</ActionButton></div>
      </Card>
    </>
  );
}
