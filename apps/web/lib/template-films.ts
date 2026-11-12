import type { TemplateFilm, TemplateFilmKey, TemplateFilms } from "@shopmaple/contracts";
import type { CollectionFilm } from "@/lib/collection-landing";

/** The film staff chose for a place (Admin → Homepage → Testimonial, Artwork → Nimbus / Terra), or null: nothing is shown. */
export function resolveTemplateFilm(key: TemplateFilmKey, films?: TemplateFilms): TemplateFilm | null {
  return films?.find(film => film.key === key) ?? null;
}

/** A running time as the collection film's link shows it: "00:08", "02:15", "1:02:03". */
export function filmDuration(ms: number | undefined): string | undefined {
  if (!ms || ms < 0) return undefined;
  const total = Math.round(ms / 1000), hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * A collection page's film ("Watch collection film / 00:25"), opened over the page, with the page's opening photo as its
 * poster; undefined when staff have not chosen one, and the link is left out.
 */
export function collectionFilm(key: "nimbus-hero" | "terra-hero", films: TemplateFilms | undefined, { label, title, poster }: { label: string; title: string; poster: string }): CollectionFilm | undefined {
  const film = resolveTemplateFilm(key, films);
  if (!film) return undefined;
  const duration = filmDuration(film.durationMs);
  return { label, title, src: film.src, poster, ...(duration ? { duration } : {}) };
}
/** `{ film }` when there is one, else nothing, so a page without a film has no `film` key at all. */
export const withFilm = (film: CollectionFilm | undefined) => film ? { film } : {};
