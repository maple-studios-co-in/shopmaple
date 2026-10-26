"use client";

import { useRef, useState } from "react";
import { templateMediaDecorativeKeys, templateMediaResponsiveKeys, type TemplateMedia, type TemplateMediaItem, type TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia, templateMediaSlots } from "@/lib/template-media-defaults";
import type { StaffSession } from "./dashboard";
import { Field } from "./forms";
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
    <section className="admin-template-artwork" aria-label="Template artwork">
      <h2>Artwork</h2>
      <p>Choose a page and placement to replace its image. Save a draft, then publish when ready.</p>
      <div className="admin-fields">
        <label className="admin-field">
          <span>Artwork group</span>
          <select aria-label="Artwork group" value={slot.group} onChange={event => {
            const first = templateMediaSlots.find(item => item.group === event.target.value);
            if (first) setSelected(first.key);
          }}>
            {groups.map(group => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>
        <label className="admin-field">
          <span>Artwork placement</span>
          <select ref={placement} aria-label="Artwork placement" value={selected} onChange={event => {
            const next = templateMediaSlots.find(item => item.key === event.target.value);
            if (next) setSelected(next.key);
          }}>
            {templateMediaSlots.filter(item => item.group === slot.group).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <h3>{slot.label}</h3>
      <p>{overridden ? "Custom artwork in this draft." : "Using original artwork."}</p>
      {poster && <p>Changing this poster replaces the still image; the video stays unchanged.{selected !== "home-workshop-poster" && " The image description also labels the video."}</p>}
      {responsive && <p>This placement needs both desktop and mobile images. Changing one keeps the other crop.</p>}
      <div className="admin-artwork-images" key={selected}>
        <div role="group" aria-label="Desktop artwork">
          <Field label="Desktop image URL" value={artwork.image} maxLength={1000} onChange={image => update({ image })} />
          <MediaPicker label="Desktop image" value={artwork.image} onChange={image => update({ image })} session={session} onExpired={onExpired} />
        </div>
        {responsive && <div role="group" aria-label="Mobile artwork">
          <Field label="Mobile image URL" value={artwork.mobileImage ?? ""} maxLength={1000} onChange={mobileImage => update({ mobileImage })} />
          <MediaPicker label="Mobile image" value={artwork.mobileImage ?? ""} onChange={mobileImage => update({ mobileImage })} session={session} onExpired={onExpired} />
        </div>}
      </div>
      <Field label="Image description" value={artwork.alt} maxLength={200} onChange={alt => update({ alt })} />
      <p>{decorative ? "Leave the description blank if this artwork is decorative. Otherwise describe what it communicates." : "Describe what the image communicates for visitors using a screen reader. A description is required."}</p>
      <button type="button" disabled={!overridden} onClick={() => {
        onChange((value ?? []).filter(item => item.key !== selected));
        placement.current?.focus();
      }}>Restore original</button>
    </section>
  );
}
