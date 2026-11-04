/**
 * The listing hero's photo for each kind of piece (owner, 4 Nov 2026): wide, sharp and free of the "Maple Furnishers"
 * watermark stamp, chosen from the catalogue by its real pixel size and by how it sits in a 1440×500 banner, with its
 * piece featured beside it. Each list is in order of preference: the first piece the catalogue has wins, and with none
 * the hero keeps the collection's own first photo. `width` is the photo's own pixel width; the hero never draws it
 * wider, so it stays crisp on any screen. `position` is where the piece sits in the photo, for the banner's crop.
 */
export type HeroPhoto = { handle: string; image: string; width: number; position?: string };

const shopify = (file: string) => `https://cdn.shopify.com/s/files/1/0691/8651/9229/files/${file}`;

export const heroPhotos: Record<string, HeroPhoto[]> = {
  all: [{ handle: "aria-5-seater-sofa", image: shopify("2.1_05395d32-eee4-420c-b3fd-d66df462f2bb.png?v=1783922389"), width: 1536, position: "center 58%" }],
  chairs: [{ handle: "orvane-accent-chair", image: shopify("both_0c29b634-10a2-4ebc-9ca3-28188d47a02d.png?v=1776159321"), width: 1536, position: "center 88%" }],
  sofas: [{ handle: "sora-5-seater-sofa", image: shopify("6.1_1.png?v=1783923471"), width: 1587, position: "center 60%" }],
  tables: [{ handle: "nova-dining-table", image: shopify("File_2026-05-27T11_42_27.516Z.webp?v=1780471191"), width: 1537, position: "center 45%" }],
  beds: [{ handle: "aileron-signature-bed", image: shopify("Gemini_Generated_Image_omfoktomfoktomfo.png?v=1778160420"), width: 2528, position: "center 62%" }],
  storage: [{ handle: "arden-console-cabinet", image: shopify("9D25AA03-9581-46B1-B8BC-749AE7B9A95C.webp?v=1781938509"), width: 1254, position: "center 50%" }],
};

/** The photos for a listing: "all" for the whole range, else its kind of piece; none for a collection of mixed kinds. */
export const heroPhotosFor = (key: string | null | undefined): HeroPhoto[] => (key && Object.hasOwn(heroPhotos, key) ? heroPhotos[key]! : []);
