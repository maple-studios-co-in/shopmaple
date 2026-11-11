import { notFound } from "next/navigation";
import { CampaignBanner, type CampaignKey } from "@/components/campaign-banner";
import { CollectionListing } from "@/components/collection-listing";
import { CollectionHero } from "@/components/store/collection-hero";
import { getCollectionPage } from "@/lib/catalog";
import { collectionIntro, heroTitle } from "@/lib/collection-intro";
import {
  collectionTitles,
  collectionQuery,
} from "@/lib/collections";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Query>;
}) {
  const { handle } = await params;
  // Sorted and filtered views point search to the collection itself; later pages keep their own address.
  const page = Number((await searchParams)?.page);
  const path = `/collections/${handle}${Number.isInteger(page) && page > 1 ? `?page=${page}` : ""}`;
  const title = collectionTitles[handle] ?? "Furniture";
  return { title, description: `${title} by Maple Furnishers: handcrafted luxury furniture, made to order in Delhi and delivered across India.`, alternates: { canonical: path } };
}
type Query = Record<string, string | string[] | undefined>;
const categoryHandles = ["sofas", "chairs", "tables", "beds", "storage", "outdoors"];
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Query>;
}) {
  const { handle } = await params;
  if (!Object.hasOwn(collectionTitles, handle)) notFound();
  const query = collectionQuery(await searchParams);
  // Every collection, chairs included, opens on its listing (owner, 11 Nov 2026): the older chairs editorial was drawn
  // from Shopify's artwork and products and left with them. The hero shows the collection's first piece with a photo.
  const result = await getCollectionPage(handle, query);
  const cover = result.facets?.cover ?? null;
  const campaign: CampaignKey | undefined = (
    {
      beds: "beds-hero",
      "outdoor-furnitures": "outdoors-hero",
      "tv-media-units": "tv-units-hero",
    } as Record<string, CampaignKey>
  )[handle];
  // The introduction speaks for the collection's kind of piece: its own category, or the one every listed piece shares.
  const shared = [...new Set(result.products.map((product) => product.category).filter(Boolean))];
  const kind = categoryHandles.includes(handle) ? handle : shared.length === 1 ? shared[0] : null;
  return (
    <>
      <CollectionHero title={heroTitle(handle, collectionTitles[handle]!)} crumb={collectionTitles[handle]!} intro={collectionIntro(kind)} cover={cover} />
      {campaign && (
        <div className="landing-banner-frame" data-landing-banner="hero">
          <CampaignBanner campaign={campaign} eager />
        </div>
      )}
      <CollectionListing
        handle={handle}
        title={collectionTitles[handle]!}
        headingLevel="h2"
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
          <CampaignBanner campaign="beds-sale" />
        </div>
      )}
    </>
  );
}
