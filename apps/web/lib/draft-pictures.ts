import {
  authoredArticleSchema, authoredBlockSchema, contentImageSchema, contentPageSchema, heroSlideSchema, homeCollectionTileSchema,
  instagramPostSchema, nimbusSlideSchema, templateMediaDecorativeKeys, templateMediaItemSchema, templateMediaResponsiveKeys,
  type AuthoredArticle, type AuthoredBlock, type CampaignContent, type ContentPage, type HomeCollectionTile, type HomeDetails,
  type StorefrontContent, type TemplateMediaItem, type TemplateMediaKey,
} from "@shopmaple/contracts";
import { templateMediaSlots } from "./template-media-defaults";
// The collection banners' optional phone picture (owner, 20 Nov 2026); imported on its own line, apart from the list above.
import { templateMediaPhoneOptionalKeys } from "@shopmaple/contracts";

/*
 * The draft as the live preview saves it (owner, 17 Nov 2026: "when I am clicking the banner with the new image it should
 * get updated on the live preview"). The live preview saves the draft quietly after each pause in editing, and a save
 * must pass the draft's whole check. Before, one picture half-chosen anywhere failed that check, so the preview saved
 * nothing at all and finished changes never showed either:
 * - a campaign banner clicked in the preview got an empty replacement at once (no pictures; its description was the
 *   campaign's label, which is empty for every campaign);
 * - a replacement needed both sizes and a description before anything else could be saved;
 * - a new post, slide, tile, block or page held every other change back until all its fields were filled.
 *
 * So the preview's save completes what it can, in its own copy only: a chosen picture missing its other size shows at
 * both, and an empty description takes the words around the picture (stand-ins). What cannot be shown yet (a replacement
 * with no picture, an address that is not a library picture, a new item still missing words) is left out of that copy,
 * and the original shows. Both are named in the preview pane. The form keeps exactly what staff entered, and an explicit
 * save or publish still checks every rule (both sizes, a written description), so stand-ins never go live unseen.
 */

type HeroSlide = NonNullable<HomeDetails["hero"]["slides"]>[number];
type NimbusSlide = NonNullable<HomeDetails["nimbus"]["slides"]>[number];

const isPicture = (value: unknown): value is string => typeof value === "string" && value !== "" && contentImageSchema.safeParse(value).success;
const isEmpty = (value: unknown) => value === undefined || value === null || value === "";
const isBlank = (value: unknown) => typeof value !== "string" || value.trim() === "";
const capitalised = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The first of these with words in it, on one line, no longer than a picture description may be. */
function wordsFrom(...parts: (string | null | undefined)[]): string {
  for (const part of parts) {
    const line = (part ?? "").replace(/\s+/g, " ").trim();
    if (line) return line.length > 200 ? `${line.slice(0, 199).trimEnd()}…` : line;
  }
  return "Maple Furnishers";
}

/** A campaign as the Campaigns screen lists it ("landing-dining" is "Dining"). */
export const campaignName = (key: string) => capitalised(key.replace(/^landing-/, "").replace(/-/g, " "));
/** Words for a campaign picture: its label, else its headline, else its supporting words (every campaign's label is empty). */
export const campaignPictureWords = (campaign: CampaignContent) =>
  wordsFrom(campaign.label, campaign.headline.join(" "), campaign.supporting, `${campaignName(campaign.key)} banner`);
const slotOf = (key: TemplateMediaKey) => templateMediaSlots.find((slot) => slot.key === key);
const placementName = (key: TemplateMediaKey) => `Artwork “${slotOf(key)?.label ?? key}”`;
const responsiveKey = (key: TemplateMediaKey) => (templateMediaResponsiveKeys as readonly string[]).includes(key);
const decorativeKey = (key: TemplateMediaKey) => (templateMediaDecorativeKeys as readonly string[]).includes(key);
/** A collection page's banner: its phone picture is optional (owner, 20 Nov 2026). */
const phoneOptionalKey = (key: TemplateMediaKey) => (templateMediaPhoneOptionalKeys as readonly string[]).includes(key);

/** A list where each item may change or go: the same array back when nothing did. */
function mapList<T>(items: readonly T[], each: (item: T, index: number) => T | null): T[] {
  let changed = false;
  const next: T[] = [];
  items.forEach((item, index) => {
    const value = each(item, index);
    if (value !== item) changed = true;
    if (value !== null) next.push(value);
  });
  return changed ? next : (items as T[]);
}

export type PreviewReady = {
  /** What the live preview saves. */
  content: StorefrontContent;
  /** Not shown until finished; the original shows meanwhile ("Instagram post 3", "Campaign “Sofas hero” banner"). */
  leftOut: string[];
  /** Shown with a stand-in until staff choose or write their own ("Campaign “Sofas hero” banner: phone picture"). */
  standIns: string[];
};

type Notes = { leave: (item: string) => void; stand: (item: string) => void };

/**
 * A desktop and phone pair as the preview shows it: one chosen picture stands in for a missing other; nothing chosen, or
 * an address that is not a library picture, shows nothing new (null).
 */
function pairFor(desktop: unknown, mobile: unknown, name: string, notes: Notes): [string, string] | null {
  if ((!isEmpty(desktop) && !isPicture(desktop)) || (!isEmpty(mobile) && !isPicture(mobile)) || (!isPicture(desktop) && !isPicture(mobile))) {
    notes.leave(name);
    return null;
  }
  if (!isPicture(mobile)) notes.stand(`${name}: phone picture`);
  if (!isPicture(desktop)) notes.stand(`${name}: desktop picture`);
  return [isPicture(desktop) ? desktop : mobile as string, isPicture(mobile) ? mobile : desktop as string];
}

function described(alt: string, words: () => string, name: string, notes: Notes) {
  if (!isBlank(alt)) return alt;
  notes.stand(`${name}: description`);
  return words();
}

function previewCampaign(campaign: CampaignContent, notes: Notes): CampaignContent {
  const art = campaign.artwork;
  if (!art) return campaign;
  const name = `Campaign “${campaignName(campaign.key)}” banner`;
  const pair = pairFor(art.desktopImage, art.mobileImage, name, notes);
  if (!pair) return { ...campaign, artwork: null };
  const alt = described(art.alt, () => campaignPictureWords(campaign), name, notes);
  if (pair[0] === art.desktopImage && pair[1] === art.mobileImage && alt === art.alt) return campaign;
  // The rest of the artwork (how the announcement shows it) is kept as staff set it.
  return { ...campaign, artwork: { ...art, desktopImage: pair[0], mobileImage: pair[1], alt } };
}

function previewMediaItem(item: TemplateMediaItem, notes: Notes): TemplateMediaItem | null {
  const name = placementName(item.key);
  let next: TemplateMediaItem = item;
  if (responsiveKey(item.key)) {
    const pair = pairFor(item.image, item.mobileImage, name, notes);
    if (!pair) return null;
    if (pair[0] !== item.image || pair[1] !== item.mobileImage) next = { ...next, image: pair[0], mobileImage: pair[1] };
  } else {
    if (!isPicture(item.image)) { notes.leave(name); return null; }
    // A collection banner keeps a phone picture that is a library picture; one being chosen shows the wide picture meanwhile.
    const keepPhone = phoneOptionalKey(item.key) && isPicture(item.mobileImage);
    if (item.mobileImage !== undefined && !keepPhone) { const { mobileImage: _none, ...rest } = next; next = rest; }
  }
  if (!decorativeKey(item.key) && isBlank(item.alt)) next = { ...next, alt: described(item.alt, () => wordsFrom(slotOf(item.key)?.alt, slotOf(item.key)?.label), name, notes) };
  return next;
}

function previewBlocks(blocks: AuthoredBlock[], words: string, owner: string, notes: Notes): AuthoredBlock[] {
  return mapList(blocks, (block, index) => {
    const name = `${owner}, block ${index + 1}`;
    const item = block.type === "image" && isPicture(block.src) && isBlank(block.alt) ? { ...block, alt: described(block.alt, () => words, name, notes) } : block;
    if (!authoredBlockSchema.safeParse(item).success) { notes.leave(name); return null; }
    return item;
  });
}

/**
 * The draft as the live preview saves it: stand-ins for a chosen picture's missing other size and empty description,
 * and whatever cannot be shown yet left out, so one unfinished picture or item never holds back every other change.
 * A draft with nothing unfinished comes back as the same object.
 */
export function previewReadyContent(content: StorefrontContent): PreviewReady {
  const leftOut: string[] = [], standIns: string[] = [];
  const notes: Notes = { leave: (item) => { leftOut.push(item); }, stand: (item) => { standIns.push(item); } };
  let next = content;
  const set = <K extends keyof StorefrontContent>(key: K, value: StorefrontContent[K]) => {
    if (value !== next[key]) next = { ...next, [key]: value };
  };

  set("campaigns", mapList(content.campaigns, (campaign) => previewCampaign(campaign, notes)));

  set("pages", mapList(content.pages, (page, index) => {
    const name = `Page “${page.title.trim() || page.slug || index + 1}”`;
    let item: ContentPage = page;
    if (page.banner) {
      const banner = page.banner, bannerName = `${name} banner`;
      const pair = pairFor(banner.desktopImage, banner.mobileImage, bannerName, notes);
      if (!pair) item = { ...item, banner: null };
      else {
        const alt = described(banner.alt, () => wordsFrom(page.title, banner.label), bannerName, notes);
        if (pair[0] !== banner.desktopImage || pair[1] !== banner.mobileImage || alt !== banner.alt)
          item = { ...item, banner: { ...banner, desktopImage: pair[0], mobileImage: pair[1], alt } };
      }
    }
    if (item.blocks) {
      const blocks = previewBlocks(item.blocks, wordsFrom(item.title), name, notes);
      if (blocks !== item.blocks) {
        if (blocks.length) item = { ...item, blocks };
        else { const { blocks: _none, ...rest } = item; item = rest; }
      }
    }
    if (contentPageSchema.safeParse(item).success) return item;
    // A banner whose link or button words are still being typed is left out before the whole page is.
    if (item.banner && contentPageSchema.safeParse({ ...item, banner: null }).success) { notes.leave(`${name} banner`); return { ...item, banner: null }; }
    notes.leave(name);
    return null;
  }));

  const postsFrom = { leftOut: leftOut.length, standIns: standIns.length };
  const posts = mapList(content.instagramPosts, (post, index) => {
    const name = `Instagram post ${index + 1}`;
    const item = isPicture(post.src) && isBlank(post.alt) ? { ...post, alt: described(post.alt, () => "Maple Furnishers on Instagram", name, notes) } : post;
    if (!instagramPostSchema.safeParse(item).success) { notes.leave(name); return null; }
    return item;
  });
  // The homepage needs one post: with none ready they all stay, and the draft's check says what is missing.
  if (posts.length) set("instagramPosts", posts);
  else { leftOut.length = postsFrom.leftOut; standIns.length = postsFrom.standIns; }

  if (content.templateMedia) set("templateMedia", mapList(content.templateMedia, (item) => previewMediaItem(item, notes)));

  if (content.homeMerchandising) {
    const merchandising = content.homeMerchandising;
    const tiles = (list: HomeCollectionTile[], group: string) => mapList(list, (tile, index) => {
      const name = `Merchandising, ${group} tile ${index + 1}`;
      const item = isPicture(tile.image) && isBlank(tile.alt) ? { ...tile, alt: described(tile.alt, () => wordsFrom(tile.title), name, notes) } : tile;
      if (!homeCollectionTileSchema.safeParse(item).success) { notes.leave(name); return null; }
      return item;
    });
    const categories = tiles(merchandising.categories, "category"), offers = tiles(merchandising.offers, "offer");
    if (categories !== merchandising.categories || offers !== merchandising.offers) set("homeMerchandising", { ...merchandising, categories, offers });
  }

  if (content.homeDetails) {
    const details = content.homeDetails;
    let hero = details.hero, nimbus = details.nimbus;
    if (hero.slides) {
      const slides = mapList(hero.slides, (slide: HeroSlide, index) => {
        const name = `Homepage hero slide ${index + 1}`;
        const pictured = slide.kind === "video" ? isPicture(slide.poster) : isPicture(slide.src);
        const item = pictured && isBlank(slide.alt) ? { ...slide, alt: described(slide.alt, () => wordsFrom(slide.headline, slide.intro), name, notes) } : slide;
        if (!heroSlideSchema.safeParse(item).success) { notes.leave(name); return null; }
        return item;
      });
      if (slides !== hero.slides) {
        // With no slide ready the hero shows its default stills, as it does before the first slide is added.
        if (slides.length) hero = { ...hero, slides };
        else { const { slides: _none, ...rest } = hero; hero = rest; }
      }
    }
    if (nimbus.slides) {
      const slides = mapList(nimbus.slides, (slide: NimbusSlide, index) => {
        const name = `Nimbus collection ${index + 1}`;
        const item = isPicture(slide.image) && isBlank(slide.alt) ? { ...slide, alt: described(slide.alt, () => wordsFrom(slide.heading, slide.tagline), name, notes) } : slide;
        if (!nimbusSlideSchema.safeParse(item).success) { notes.leave(name); return null; }
        return item;
      });
      if (slides !== nimbus.slides) {
        if (slides.length) nimbus = { ...nimbus, slides };
        else { const { slides: _none, ...rest } = nimbus; nimbus = rest; }
      }
    }
    if (hero !== details.hero || nimbus !== details.nimbus) set("homeDetails", { ...details, hero, nimbus });
  }

  if (content.authoredArticles) {
    set("authoredArticles", mapList(content.authoredArticles, (article: AuthoredArticle, index) => {
      const name = `Article “${article.title.trim() || index + 1}”`;
      let item = article;
      if (item.cover && isPicture(item.cover.src) && isBlank(item.cover.alt))
        item = { ...item, cover: { ...item.cover, alt: described(item.cover.alt, () => wordsFrom(item.title), `${name} cover`, notes) } };
      const blocks = previewBlocks(item.blocks, wordsFrom(item.title), name, notes);
      if (blocks !== item.blocks) item = { ...item, blocks };
      // An article with no block ready cannot be saved; it is left out whole until one is.
      if (!authoredArticleSchema.safeParse(item).success) { notes.leave(name); return null; }
      return item;
    }));
  }

  return { content: next, leftOut, standIns };
}

/** A failed check as zod reports it. */
export type ContentIssue = { path: readonly PropertyKey[]; message: string; code?: string; origin?: string };

const fieldNames: Record<string, string> = {
  desktopImage: "desktop picture", mobileImage: "phone picture", image: "picture", src: "picture", poster: "poster picture",
  leftImage: "left picture", rightImage: "right picture", alt: "picture description", leftAlt: "left picture description",
  rightAlt: "right picture description", href: "link", cta: "button words", label: "label", headline: "headline",
  supporting: "supporting words", offer: "offer", eligibility: "eligibility", title: "title", slug: "page address",
  handle: "address", description: "description", body: "body", heading: "heading", tagline: "tagline", intro: "intro",
  features: "feature", text: "words", items: "list item", collectionHandle: "collection", artwork: "artwork",
  banner: "banner", cover: "cover picture", blocks: "block", excerpt: "excerpt", paragraphs: "paragraph", promises: "promise",
  tiles: "tile", slides: "slide", schedule: "schedule", name: "name", attribution: "attribution", eyebrow: "small heading",
  announcement: "announcement", whatsapp: "WhatsApp", navigation: "menu item", columns: "footer column", links: "link",
  shopLinks: "shop link", utilityLinks: "utility link", mobileQuickLinks: "phone quick link", desktopDiscovery: "menu picture",
  contactColumns: "contact column", contactHeading: "contact heading", shopHeading: "shop heading", customerPhone: "customer phone",
  bulkPhone: "bulk order phone", enquirySubject: "enquiry subject", children: "menu item",
};
const screenNames: Record<string, string> = {
  homeCopy: "Homepage words", homeSections: "Homepage sections", siteChrome: "Navigation & footer", siteWords: "Site words",
  editorialContent: "Policies & blogs", landingPages: "Category pages", storyPage: "Our Story", nimbusPage: "The Nimbus Collection",
  terraPage: "The Terra Collection", servicePages: "Service pages", templateFilms: "Films", productHighlights: "Product highlights",
  homeCitiesLayout: "Homepage cities", motion: "Motion settings",
};

function placeOf(path: readonly PropertyKey[], content: StorefrontContent): { place: string; rest: readonly PropertyKey[] } {
  const [root, second, ...rest] = path;
  const at = typeof second === "number" ? second : -1;
  switch (root) {
    case "campaigns": return { place: `Campaign “${campaignName(content.campaigns[at]?.key ?? "?")}”`, rest };
    case "pages": { const page = content.pages[at]; return { place: `Page “${page?.title.trim() || page?.slug || at + 1}”`, rest }; }
    case "instagramPosts": return { place: `Instagram post ${at + 1}`, rest };
    case "templateMedia": { const item = content.templateMedia?.[at]; return { place: item ? placementName(item.key) : `Artwork ${at + 1}`, rest }; }
    case "authoredArticles": { const article = content.authoredArticles?.[at]; return { place: `Article “${article?.title.trim() || at + 1}”`, rest }; }
    case "homeMerchandising": {
      const group = second === "categories" ? "category" : second === "offers" ? "offer" : String(second ?? "");
      const [index, ...after] = rest;
      return typeof index === "number" ? { place: `Merchandising, ${group} tile ${index + 1}`, rest: after } : { place: `Merchandising, ${group}`, rest };
    }
    case "homeDetails": return { place: `Homepage ${typeof second === "string" ? second.replace(/([A-Z])/g, " $1").toLowerCase() : ""}`.trim(), rest };
    default: {
      const screen = screenNames[String(root)];
      return screen ? { place: screen, rest: [second, ...rest].filter((part) => part !== undefined) } : { place: "the draft", rest: [] };
    }
  }
}

/** "headline 1", "announcement link", "slide 2 picture description": the field under the item, as its screen labels it. */
function fieldOf(rest: readonly PropertyKey[]): string {
  const words: string[] = [];
  for (const part of rest) {
    if (typeof part === "number") { if (words.length) words[words.length - 1] = `${words[words.length - 1]} ${part + 1}`; continue; }
    const name = fieldNames[String(part)];
    if (name) words.push(name);
  }
  return words.join(" ");
}

/** What is wrong, as a short clause, or the check's own words. */
function problemOf(issue: ContentIssue): string {
  if (/approved Maple media/i.test(issue.message)) return "use an approved image from the media library";
  if (issue.code === "too_small") return issue.origin === "array" ? "add at least one" : "it is empty";
  if (issue.code === "too_big") return "it is too long";
  if (issue.code === "invalid_type") return "it is missing";
  if (/nonblank|nonempty/i.test(issue.message)) return "it is empty";
  if (issue.code === "invalid_format") return "it is not in the right form";
  return issue.message.replace(/\.$/, "");
}

/** "Check Campaign “Sofas hero”, artwork picture description: it is empty." for a failed check of the draft. */
export function describeContentIssue(issue: ContentIssue | undefined, content: StorefrontContent): string {
  if (!issue) return "Check the content fields: some values are invalid.";
  const { place, rest } = placeOf(issue.path, content);
  const field = fieldOf(rest);
  return `Check ${place}${field ? `, ${field}` : ""}: ${problemOf(issue)}.`;
}
