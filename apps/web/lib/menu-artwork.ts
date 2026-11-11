import type { TemplateMedia, TemplateMediaItem } from "@shopmaple/contracts";

/**
 * The desktop mega menu's pictures (Figma 256:3836), template artwork since 12 Nov 2026. The menu is on every page and
 * runs in the browser, so this file stays small: the server resolves the five pictures (layout.tsx) and hands the menu
 * only their addresses and descriptions.
 */
export const menuTemplateMedia = {
  // A furnished room, as in the design, rather than a piece on its own.
  "menu-living-feature": { key: "menu-living-feature", image: "/media/home/category-sofas.webp", alt: "A living room with a cream sofa, a wooden coffee table and plants" },
  "menu-bedroom-feature": { key: "menu-bedroom-feature", image: "/media/home/category-beds.webp", alt: "A bedroom with an upholstered green bed and wooden bedside tables" },
  "menu-discovery-new": { key: "menu-discovery-new", image: "/media/home/hero-sofas.webp", alt: "" },
  "menu-discovery-bestsellers": { key: "menu-discovery-bestsellers", image: "/media/home/editorial-flip-runo.webp", alt: "" },
  "menu-discovery-look": { key: "menu-discovery-look", image: "/media/home/strip-always-together.webp", alt: "" },
} satisfies Record<string, TemplateMediaItem>;

export type MenuPicture = { image: string; alt: string };
export type MenuArtwork = {
  /** Each room's card at the start of its mega menu. */
  features: Record<"living" | "bedroom", MenuPicture>;
  /** The photo beside each discovery link, by the link's id; a link without one is shown as words alone. */
  discovery: Record<string, string>;
};

const pick = (key: keyof typeof menuTemplateMedia, value?: TemplateMedia): MenuPicture => {
  const { image, alt } = value?.find(item => item.key === key) ?? menuTemplateMedia[key];
  return { image, alt };
};

/** The menu's pictures: staff's uploads where published, else the originals. */
export function resolveMenuArtwork(value?: TemplateMedia): MenuArtwork {
  return {
    features: { living: pick("menu-living-feature", value), bedroom: pick("menu-bedroom-feature", value) },
    discovery: {
      new: pick("menu-discovery-new", value).image,
      bestsellers: pick("menu-discovery-bestsellers", value).image,
      look: pick("menu-discovery-look", value).image,
    },
  };
}

export const defaultMenuArtwork = resolveMenuArtwork();
