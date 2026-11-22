import {
  blogCoverKeys,
  collectionHeroPages,
  categoryPageSectionKeys,
  categoryTileKeys,
  categoryValueKeys,
  type CategoryPageSlug,
  type TemplateMediaItem,
  type TemplateMediaKey,
} from "@shopmaple/contracts";
import categories from "@/data/landing-categories.json";
import blogIndex from "@/data/blog-index.json";
import { menuTemplateMedia } from "@/lib/menu-artwork";
import { productBannerPicture } from "@/components/store/product-banner";

/**
 * The storefront pictures that were fixed in code until the owner made them admin slots (12 Nov 2026; keys in
 * packages/contracts/src/picture-slots.ts). Each slot's original is exactly what the store showed before, so nothing
 * changes until staff upload a picture: the bundled file, or, where the store showed a Keeri product's photo, that
 * product (`product`), or nothing at all (the category pages' value icons).
 */
export const pictureSlotGroups = ["Main menu", "Sofas page", "Tables page", "Chairs page", "Collection pages", "Blog", "Product page", "Help pages", "Sign-in pages", "Icons & logo"] as const;
export type PictureSlotGroup = (typeof pictureSlotGroups)[number];
export type PictureSlot = TemplateMediaItem & {
  product?: string;
  label: string;
  group: PictureSlotGroup | "Homepage";
  /** Where the picture appears and the size that suits it, for staff. */
  help: string;
  /** What the store shows here until staff upload a picture, when the page picks it itself. */
  standIn?: string;
};

const slot = (key: string, rest: Omit<PictureSlot, "key">): PictureSlot => ({ key: key as TemplateMediaKey, ...rest });

const menu: PictureSlot[] = [
  slot("menu-living-feature", { ...menuTemplateMedia["menu-living-feature"], label: "Living menu photo", group: "Main menu",
    help: "The room photo on the left of the Living menu, which opens from the header on desktop. Roughly square (shown about 240 × 250 px); upload at least 640 × 660 px." }),
  slot("menu-bedroom-feature", { ...menuTemplateMedia["menu-bedroom-feature"], label: "Bedroom menu photo", group: "Main menu",
    help: "The room photo on the left of the Bedroom menu, which opens from the header on desktop. Roughly square (shown about 240 × 250 px); upload at least 640 × 660 px." }),
  slot("menu-discovery-new", { ...menuTemplateMedia["menu-discovery-new"], label: "New Arrivals link photo", group: "Main menu",
    help: "The small square photo beside “New Arrivals” along the bottom of every desktop menu. Square, at least 320 × 320 px." }),
  slot("menu-discovery-bestsellers", { ...menuTemplateMedia["menu-discovery-bestsellers"], label: "Bestsellers link photo", group: "Main menu",
    help: "The small square photo beside “Bestsellers” along the bottom of every desktop menu. Square, at least 320 × 320 px." }),
  slot("menu-discovery-look", { ...menuTemplateMedia["menu-discovery-look"], label: "Complete the Look link photo", group: "Main menu",
    help: "The small square photo beside “Complete the Look” along the bottom of every desktop menu. Square, at least 320 × 320 px." }),
];

type LandingSource = { type: string; heading?: string; product?: string; width?: number; height?: number; items?: { title: string; product?: string }[] };
const pageNames: Record<CategoryPageSlug, { group: PictureSlotGroup; name: string }> = {
  sofas: { group: "Sofas page", name: "Sofas" },
  tables: { group: "Tables page", name: "Tables" },
  chairs: { group: "Chairs page", name: "Chairs" },
};

/** The sofas, tables and chairs pages' banners, circles and value icons, in page order (data/landing-categories.json). */
function landing(slug: CategoryPageSlug): PictureSlot[] {
  const { group, name } = pageNames[slug];
  const sections = categories[slug].sections as LandingSource[];
  const where = `the ${name} page (/${slug})`;
  return sections.flatMap((section, index): PictureSlot[] => {
    const key = categoryPageSectionKeys[slug][index]!;
    if (section.type === "banner" && key !== "hero" && key !== "sale") {
      const next = sections.slice(index + 1).find(item => item.type === "products")?.heading;
      return [slot(`${slug}-${key}`, {
        image: "", product: section.product, alt: `${name} — find furniture for your space`,
        label: `Banner above “${next}”`, group,
        help: `A wide banner between the product rows on ${where}, above “${next}”. Desktop ${section.width} × ${section.height} px (about ${Math.round(section.width! / section.height!)}:1); on phones it is square, so choose a square mobile image of at least 1200 × 1200 px.`,
      })];
    }
    if (section.type === "categories")
      return section.items!.map((item, at) => slot(`${slug}-tile-${categoryTileKeys[slug][at]}`, {
        image: "", product: item.product, alt: item.title, label: `“${item.title}” circle`, group,
        help: `The round photo above “${item.title}” in the category circles near the top of ${where}. Square, at least 600 × 600 px; the corners are cut to a circle, so keep the piece in the middle.`,
      }));
    if (section.type === "values")
      return section.items!.map((item, at) => slot(`${slug}-value-${categoryValueKeys[slug][at]}`, {
        image: "", alt: "", label: `“${item.title}” icon`, group,
        help: `An optional small icon above “${item.title}” in “The Maple Difference” on ${where}. Square, at least 200 × 200 px; a WebP or PNG with a transparent background works best. Nothing shows here until you add one.`,
      }));
    return [];
  });
}

const articles = (blogIndex as Record<string, Record<string, { image: { src: string; alt: string; width: number; height: number } }>>)["recent-stories"]!;
const blog: PictureSlot[] = [
  ...Object.entries(blogCoverKeys).map(([handle, key]) => {
    const art = articles[handle]!.image;
    return slot(key, { image: art.src, alt: art.alt, label: `Cover: ${art.alt.replace(/\s+/g, " ")}`, group: "Blog",
      help: `The picture for this article on the blog listing, across the top of the article and in “Recent Articles”. The article banner is 1200 × 500 px and cards are cropped from it, so upload a wide photo of at least 1600 × 1000 px with the subject in the middle. The current picture is ${art.width} × ${art.height} px.` });
  }),
  slot("blog-bestsellers-promo", { image: "/media/home/editorial-left.webp", alt: "", label: "Shop Bestsellers photo", group: "Blog",
    help: "The tall “Maple” photo tile at the start of “Shop Bestsellers” under the blog listing. It is cropped to a portrait tile, so a square or portrait photo of at least 944 × 944 px suits it." }),
  slot("blog-collections-photo", { image: "/media/home/editorial-right.webp", alt: "", label: "Explore our collections photo", group: "Blog",
    help: "The room photo beside “Explore our collections” at the foot of every article. About 4:3, at least 1323 × 979 px." }),
];

const others: PictureSlot[] = [
  slot("product-banner", { ...productBannerPicture, label: "Product page banner", group: "Product page",
    help: "The wide photo behind “Made for your space.” on every product page. 16:9, at least 1600 × 900 px; keep the piece on the right, as the left is washed in burgundy under the words." }),
  ...["/media/home/editorial-flip-runo.webp", "/media/home/editorial-flip-aero.webp", "/media/home/editorial-flip-varyn.webp", "/media/home/editorial-flip-seno.webp"]
    .map((image, at) => slot(`home-editorial-flip-${at + 1}`, { image, alt: "", label: `Editorial flip photo ${at + 1}`, group: "Homepage",
      help: `Photo ${at + 1} of the four that flip after the square photo in “Pull up a chair” on the homepage. Square, at least 800 × 800 px, with the piece centred.` })),
  ...([["privacy-policy", "Privacy policy"], ["refund-policy", "Refund policy"], ["shipping-policy", "Shipping policy"], ["terms-of-service", "Terms of service"]] as const)
    .map(([slug, title]) => slot(`policy-${slug}`, { image: `/media/policies/${slug}.jpg`, alt: "", label: `${title} photo`, group: "Help pages",
      help: `The wide photo at the top of the ${title} page (/policies/${slug}). 1920 × 640 px (3:1); phones crop it a little taller, so keep the subject in the middle.` })),
  slot("policy-return-exchange", { image: "/media/policies/return-exchange.jpg", alt: "", label: "Return & Exchange photo", group: "Help pages",
    help: "The wide photo at the top of the Return & Exchange page (/returns). 1920 × 640 px (3:1); phones crop it a little taller, so keep the subject in the middle." }),
  slot("auth-login", { image: "/media/account/login-editorial.webp", alt: "", label: "Sign-in page photo", group: "Sign-in pages",
    help: "The photo beside the form on the sign-in and forgot-password pages (a band above the form on phones). 16:9, at least 1536 × 864 px." }),
  slot("auth-sign-up", { image: "/media/account/sign-up-editorial.webp", alt: "", label: "Create account page photo", group: "Sign-in pages",
    help: "The photo beside the form on the create-account page (a band above the form on phones). 16:9, at least 1536 × 864 px." }),
];

/** Icons and the logo (owner, 16 Nov 2026): each keeps the drawing the store showed until staff upload another. */
const icon = (key: string, image: string, label: string, help: string, alt = ""): PictureSlot => slot(key, { image, alt, label, group: "Icons & logo", help });
const iconHelp = "A small line drawing beside its words. Upload a square SVG, PNG or WebP of at least 160 × 160 px, ideally on a transparent background.";
const icons: PictureSlot[] = [
  icon("site-logo", "/media/footer/maple-logo.webp", "Logo", "The Maple logo in the header and at the top of the footer. A wide logo of about 1080 × 500 px on a transparent background.", "Maple Furnishers"),
  icon("icon-footer-map", "/media/footer/map.svg", "Footer: address icon", iconHelp),
  icon("icon-footer-phone", "/media/footer/phone.svg", "Footer: phone icon", iconHelp),
  icon("icon-footer-mail", "/media/footer/mail.svg", "Footer: email icon", iconHelp),
  icon("icon-footer-phone-light", "/media/footer/phone-light.svg", "Footer: phone icon (bulk orders)", iconHelp),
  icon("icon-footer-mail-light", "/media/footer/mail-light.svg", "Footer: email icon (bulk orders)", iconHelp),
  icon("icon-footer-marketplace", "/media/footer/amazon.avif", "Footer: marketplace badge", "The badge under “Find Us On” in the footer. About 150 × 56 px.", "Amazon"),
  icon("icon-contact-phone", "/media/contact/phone.svg", "Contact: call icon", iconHelp),
  icon("icon-contact-mail", "/media/contact/mail.svg", "Contact: write icon", iconHelp),
  icon("icon-contact-pin", "/media/contact/pin.svg", "Contact: visit icon", iconHelp),
  icon("icon-story-handmade", "/media/our-story/handmade.svg", "Our Story: Handmade icon", iconHelp),
  icon("icon-story-unique-designs", "/media/our-story/unique-designs.svg", "Our Story: Unique designs icon", iconHelp),
  icon("icon-story-bespoke-pieces", "/media/our-story/bespoke-pieces.svg", "Our Story: Bespoke pieces icon", iconHelp),
  icon("icon-bulk-custom", "/media/bulk-enquiry/ruler.svg", "Bulk Enquiry: custom specifications icon", iconHelp),
  icon("icon-bulk-materials", "/media/bulk-enquiry/layers.svg", "Bulk Enquiry: materials icon", iconHelp),
  icon("icon-bulk-quality", "/media/bulk-enquiry/shield.svg", "Bulk Enquiry: quality icon", iconHelp),
  icon("icon-bulk-delivery", "/media/bulk-enquiry/truck.svg", "Bulk Enquiry: delivery icon", iconHelp),
  icon("icon-bulk-price", "/media/bulk-enquiry/tag.svg", "Bulk Enquiry: price icon", iconHelp),
  ...["comfort", "airy", "quiet"].map((name, at) => icon(`icon-nimbus-feeling-${at + 1}`, `/media/collection-icons/nimbus-${name}.svg`, `Nimbus: feeling card ${at + 1} drawing`, iconHelp)),
  ...["fabric", "chair", "swatch"].map((name, at) => icon(`icon-nimbus-note-${at + 1}`, `/media/collection-icons/nimbus-${name}.svg`, `Nimbus: detail ${at + 1} icon`, iconHelp)),
  ...["grounded", "tactile", "nature"].map((name, at) => icon(`icon-terra-feeling-${at + 1}`, `/media/collection-icons/terra-${name}.svg`, `Terra: feeling card ${at + 1} drawing`, iconHelp)),
  ...["timber", "weave", "stone"].map((name, at) => icon(`icon-terra-note-${at + 1}`, `/media/collection-icons/terra-${name}.svg`, `Terra: detail ${at + 1} icon`, iconHelp)),
  ...["bespoke", "craft", "delivery"].map((name, at) => icon(`icon-collection-promise-${at + 1}`, `/media/collection-icons/promise-${name}.svg`, `Nimbus and Terra: promise ${at + 1} icon`, iconHelp)),
];

/**
 * The banner at the top of each collection page (owner, 19 Nov 2026: the heroes could not be changed; 20 Nov 2026: a banner
 * the size of the category pages' banners in place of the full-width hero). Until staff choose a picture, the banner writes
 * the collection's name and line on Maple's burgundy, over the collection's first product photo when it has one.
 */
const collectionHeroes: PictureSlot[] = collectionHeroPages.map(([handle, title]) => slot(`collection-hero-${handle}`, {
  image: "", alt: "", label: `${title} (/collections/${handle})`, group: "Collection pages",
  standIn: "the collection's name and line on Maple's burgundy, over its first product photo",
  help: `The banner at the top of the collection page /collections/${handle}, the size of the category pages' banners. Upload a finished banner with its own words, as on the category pages, or a photo for the page to write “${title}” and its line over. Wide: 2784 × 400 px. Phones show a square, so add a square phone picture too.`,
}));

export const pictureSlots: PictureSlot[] = [...menu, ...landing("sofas"), ...landing("tables"), ...landing("chairs"), ...collectionHeroes, ...blog, ...others, ...icons];
