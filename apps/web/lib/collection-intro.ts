import { siteWordDefaults, type SiteWordKey } from "./site-word-defaults";

/**
 * The listing hero's line for a kind of piece (frame 105:484, "Made for long conversations."), and what to call one. The
 * line is a Site word (`word`), so staff change it from the live preview (owner, 19 Nov 2026); `heading` is the theme's own.
 */
export type CollectionIntroCopy = { heading: string; noun: string; word: SiteWordKey };

const intro = (word: SiteWordKey, noun: string): CollectionIntroCopy => ({ heading: siteWordDefaults[word], noun, word });
// The frame's own chair line, and the same voice for the other rooms; nothing here promises more than the store's pages
// already do (made to order in Delhi, delivered across India).
const intros: Record<string, CollectionIntroCopy> = {
  chairs: intro("collection.intro.chairs", "chair"),
  sofas: intro("collection.intro.sofas", "sofa"),
  tables: intro("collection.intro.tables", "table"),
  beds: intro("collection.intro.beds", "bed"),
  storage: intro("collection.intro.storage", "piece"),
  outdoors: intro("collection.intro.outdoors", "piece"),
};
const everything: CollectionIntroCopy = intro("collection.intro.everything", "piece");

/** The lines for a collection of one kind of piece (`category`), or the store-wide ones for a mixed collection. */
export function collectionIntro(category: string | null | undefined): CollectionIntroCopy {
  return (category && Object.hasOwn(intros, category) ? intros[category] : undefined) ?? everything;
}

// The frame names the chair collection for what most of it is.
const heroTitles: Record<string, string> = { chairs: "Dining & Accent Chairs" };
/** The hero's title: the frame's own for chairs, else the collection's name. */
export const heroTitle = (handle: string, title: string) => heroTitles[handle] ?? title;
