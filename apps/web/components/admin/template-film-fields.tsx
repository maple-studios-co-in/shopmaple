"use client";
import { templateFilmKeys, type TemplateFilmKey, type TemplateFilms } from "@shopmaple/contracts";
import { Card } from "@/components/ui/card";
import { resolveTemplateFilm } from "@/lib/template-films";
import type { StaffSession } from "./dashboard";
import { SectionHeading } from "./kit";
import { MediaPicker } from "./media-picker";

/**
 * Where a film can be chosen besides the hero slides (owner, 12 Nov 2026), and the admin screen it sits with: the
 * testimonial in its homepage section (and Artwork → Homepage, beside its poster), each collection film under Artwork
 * with that page's photos. Films are a field set of their own (`templateFilms`), separate from the artwork placements.
 */
export const filmPlaces: Record<TemplateFilmKey, { label: string; group: "Homepage" | "Nimbus" | "Terra"; description: string }> = {
  "home-testimonial": {
    label: "Customer testimonial film", group: "Homepage",
    description: "Plays muted and looping beside the testimonial once visitors scroll to it, with the testimonial video poster as its still. Visitors who ask for reduced motion see the poster. Without a film, the poster shows on its own.",
  },
  "nimbus-hero": {
    label: "Nimbus collection film", group: "Nimbus",
    description: "Opens over the page, with sound and the browser’s controls, from the film link in the opening. The opening photo is its poster. Without a film the page has no film link.",
  },
  "terra-hero": {
    label: "Terra collection film", group: "Terra",
    description: "Opens over the page, with sound and the browser’s controls, from the film link in the opening. The opening photo is its poster. Without a film the page has no film link.",
  },
};
type Props = { value?: TemplateFilms; onChange: (value: TemplateFilms | undefined) => void; session: StaffSession; onExpired: () => void };
export type TemplateFilmFieldsProps = Props;

/** One place's film, chosen from the media library's films (never an image); clearing it removes the film. */
export function TemplateFilmField({ place, value, onChange, session, onExpired }: Props & { place: TemplateFilmKey }) {
  const { label, description } = filmPlaces[place];
  const others = (value ?? []).filter(film => film.key !== place);
  const save = (next: TemplateFilms) => onChange(next.length ? next : undefined);
  return (
    <Card className="gap-3 px-5 py-5 shadow-xs sm:px-6" data-template-film={place}>
      <SectionHeading className="m-0" description={description}>{label}</SectionHeading>
      <MediaPicker accept="video" label={label} value={resolveTemplateFilm(place, value)?.src ?? ""} session={session} onExpired={onExpired}
        onPick={asset => save([...others, { key: place, src: asset.url, ...(asset.durationMs ? { durationMs: asset.durationMs } : {}) }]
          .sort((a, b) => templateFilmKeys.indexOf(a.key) - templateFilmKeys.indexOf(b.key)))}
        onChange={url => { if (!url) save(others); }} />
    </Card>
  );
}

/** The films that belong with an Artwork group (Homepage, Nimbus, Terra); nothing for the others. */
export function TemplateFilmFields({ group, ...props }: Props & { group: string }) {
  const places = templateFilmKeys.filter(key => filmPlaces[key].group === group);
  if (!places.length) return null;
  return <div className="mt-6 grid gap-4">{places.map(place => <TemplateFilmField key={place} place={place} {...props} />)}</div>;
}
