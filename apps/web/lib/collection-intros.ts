/** The listing introduction ("Collection introduction" in the design) for each collection. */
export type CollectionIntro = { headline: string; copy: string; cta: string };

const intros: Record<string, CollectionIntro> = {
  chairs: {
    headline: "Made for long conversations.",
    copy: "Find a silhouette, material, and finish that belongs at your table.",
    cta: "Find your chair",
  },
};

export function collectionIntro(handle: string, title: string): CollectionIntro {
  return intros[handle] ?? {
    headline: "Made in our workshop, made for your home.",
    copy: "Pieces are made in Delhi, and many can be ordered in the size, fabric and finish you choose.",
    cta: `Browse ${title.toLowerCase()}`,
  };
}
