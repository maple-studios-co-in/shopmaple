/**
 * The listing hero's photo for each kind of piece (owner, 4 Nov 2026): wide, sharp and free of the "Maple Furnishers"
 * watermark stamp, chosen from the catalogue by its real pixel size and by how it sits in a 1440×500 banner, with its
 * piece featured beside it. Each list is in order of preference: the first piece the catalogue has wins, and with none
 * the hero keeps the collection's own first photo. `width` is the photo's own pixel width; the hero never draws it
 * wider, so it stays crisp on any screen. `position` is where the piece sits in the photo, for the banner's crop.
 */
export type HeroPhoto = { handle: string; image: string; width: number; position?: string };

export const heroPhotos: Record<string, HeroPhoto[]> = {
  all: [{ handle: "aria-5-seater-sofa", image: "/media/shopify/c09025554b079ad265ea0d42719077c3.png", width: 1536, position: "center 58%" }],
  chairs: [{ handle: "orvane-accent-chair", image: "/media/shopify/9e1602dd4212fd372cc5fbbcd0c5b769.png", width: 1536, position: "center 88%" }],
  sofas: [{ handle: "sora-5-seater-sofa", image: "/media/shopify/f88892800f54656697ff6700a640d9e1.png", width: 1587, position: "center 60%" }],
  tables: [{ handle: "nova-dining-table", image: "/media/shopify/66c083b24e0ef54491acf489379b7333.webp", width: 1537, position: "center 45%" }],
  beds: [{ handle: "aileron-signature-bed", image: "/media/shopify/7869d06353f7ac93b6be8c8f1d1b9344.png", width: 2528, position: "center 62%" }],
  storage: [{ handle: "arden-console-cabinet", image: "/media/shopify/535a470decf261e38c35acc258c3c4c0.webp", width: 1254, position: "center 50%" }],
};

/** The photos for a listing: "all" for the whole range, else its kind of piece; none for a collection of mixed kinds. */
export const heroPhotosFor = (key: string | null | undefined): HeroPhoto[] => (key && Object.hasOwn(heroPhotos, key) ? heroPhotos[key]! : []);
