import { CampaignBanner, type CampaignKey } from "@/components/campaign-banner";
import { CollectionListing } from "@/components/collection-listing";
import { CollectionBanner } from "@/components/store/collection-banner";
import { getCollectionPage } from "@/lib/catalog";
import { collectionIntro, heroTitle } from "@/lib/collection-intro";
import { collectionQuery, collectionTitles } from "@/lib/collections";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import { defaultStorefrontContent } from "@/lib/content-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { collectionHeroKeys, isCampaignActive, type TemplateMediaKey } from "@shopmaple/contracts";

type Query = Record<string, string | string[] | undefined>;
const categoryHandles = ["sofas", "chairs", "tables", "beds", "storage", "outdoors"];
/** Pages that open on their campaign hero alone, without the banner above it (owner, 23 Nov 2026, for the beds page). */
const heroOnlyHandles = new Set(["beds"]);

/** Whether a campaign banner draws on the page as it is served, judged as CampaignBanner judges it. */
function campaignShows(content: StorefrontDocument, key: CampaignKey) {
  if (!content.campaignsAvailable) return false;
  const schedule = (content.campaigns.find((item) => item.key === key) ?? defaultStorefrontContent.campaigns.find((item) => item.key === key))?.schedule;
  return !schedule || isCampaignActive(schedule, Date.now());
}

/**
 * A collection's listing page (/collections/<handle>): its banner, its campaign banners and the filtered, paged pieces. The
 * public route draws it from the published snapshot; the staff live preview passes a draft (`content`), so the banners
 * are the draft's, and a picture clicked there opens its chooser. The caller has checked the handle is a collection.
 */
export async function CollectionPageView({ handle, query: search, content }: { handle: string; query: Query; content?: StorefrontDocument }) {
  const query = collectionQuery(search);
  // Every collection, chairs included, opens on its listing (owner, 11 Nov 2026): the older chairs editorial was drawn
  // from Shopify's artwork and products and left with them. The banner shows the collection's first piece with a photo.
  const result = await getCollectionPage(handle, query);
  const cover = result.facets?.cover ?? null;
  // The banner's own picture, when staff chose one (owner, 19 and 20 Nov 2026): an Artwork placement per collection page,
  // read from the draft in the live preview, with its phone picture and how it shows. Without one the banner keeps the
  // collection's first product photo. Read after the listing, so the catalogue is asked first as before.
  const slot = (collectionHeroKeys as readonly string[]).includes(`collection-hero-${handle}`) ? `collection-hero-${handle}` as TemplateMediaKey : undefined;
  const storefront = content ?? await getPublishedContent();
  const chosen = slot ? resolveTemplateMedia(slot, storefront.templateMedia) : null;
  const picture = chosen?.image
    ? { image: chosen.image, ...(chosen.mobileImage ? { mobileImage: chosen.mobileImage } : {}), alt: chosen.alt, display: chosen.display ?? "banner" as const }
    : undefined;
  const campaign: CampaignKey | undefined = (
    {
      beds: "beds-hero",
      "outdoor-furnitures": "outdoors-hero",
      "tv-media-units": "tv-units-hero",
    } as Record<string, CampaignKey>
  )[handle];
  // The beds page opens on its campaign hero alone (owner, 23 Nov 2026: "I only want the below one banner"); the banner
  // above it doubled the opening. Its listing's heading ("All beds") is then the page's heading. Whenever the hero is not
  // drawn (a schedule outside its dates, or campaigns unavailable), the banner comes back, so the page never opens bare.
  const heroOnly = heroOnlyHandles.has(handle) && campaign !== undefined && campaignShows(storefront, campaign);
  // The introduction speaks for the collection's kind of piece: its own category, or the one every listed piece shares.
  const shared = [...new Set(result.products.map((product) => product.category).filter(Boolean))];
  const kind = categoryHandles.includes(handle) ? handle : shared.length === 1 ? shared[0] : null;
  // One linen background from the header down (styles/collection-parity.css), so the banner stands on the listing's own.
  return (
    <div className="collection-page" data-collection-page data-hero-only={heroOnly ? "" : undefined}>
      {/* The banner the size of the category pages' banners (owner, 20 Nov 2026), in place of the full-width dark hero. */}
      {!heroOnly && (
        <CollectionBanner title={heroTitle(handle, collectionTitles[handle]!)} crumb={collectionTitles[handle]!} intro={collectionIntro(kind)} cover={cover}
          slot={slot} picture={picture} />
      )}
      {campaign && (
        <div className="landing-banner-frame" data-landing-banner="hero">
          <CampaignBanner campaign={campaign} eager content={content} />
        </div>
      )}
      <CollectionListing
        handle={handle}
        title={collectionTitles[handle]!}
        headingLevel={heroOnly ? "h1" : "h2"}
        query={result.query}
        products={result.products}
        total={result.total}
        collectionTotal={result.collectionTotal}
        limit={result.limit}
        inStock={result.inStock}
        outOfStock={result.outOfStock}
        highestPrice={result.highestPrice}
        facets={result.facets}
      />
      {handle === "beds" && (
        <div className="landing-banner-frame home-container" data-landing-banner="inset">
          <CampaignBanner campaign="beds-sale" content={content} />
        </div>
      )}
    </div>
  );
}
