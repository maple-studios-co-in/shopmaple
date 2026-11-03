/** The listing hero's line for a kind of piece (frame 105:484, "Made for long conversations."), and what to call one. */
export type CollectionIntroCopy = { heading: string; noun: string };

// The frame's own chair line, and the same voice for the other rooms; nothing here promises more than the store's pages
// already do (made to order in Delhi, delivered across India).
const intros: Record<string, CollectionIntroCopy> = {
  chairs: { heading: "Made for long conversations.", noun: "chair" },
  sofas: { heading: "Made for slow evenings.", noun: "sofa" },
  tables: { heading: "Made for the moments in between.", noun: "table" },
  beds: { heading: "Made for unhurried mornings.", noun: "bed" },
  storage: { heading: "Made to keep things close.", noun: "piece" },
  outdoors: { heading: "Made for open air.", noun: "piece" },
};
const everything: CollectionIntroCopy = { heading: "Made to be lived with.", noun: "piece" };

/** The lines for a collection of one kind of piece (`category`), or the store-wide ones for a mixed collection. */
export function collectionIntro(category: string | null | undefined): CollectionIntroCopy {
  return (category && Object.hasOwn(intros, category) ? intros[category] : undefined) ?? everything;
}

// The frame names the chair collection for what most of it is.
const heroTitles: Record<string, string> = { chairs: "Dining & Accent Chairs" };
/** The hero's title: the frame's own for chairs, else the collection's name. */
export const heroTitle = (handle: string, title: string) => heroTitles[handle] ?? title;
