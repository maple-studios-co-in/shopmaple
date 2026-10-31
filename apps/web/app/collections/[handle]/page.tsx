import { notFound } from "next/navigation";
import { CampaignBanner, type CampaignKey } from "@/components/campaign-banner";
import { CollectionListing } from "@/components/collection-listing";
import { LegacyChairs, legacyChairHandles } from "@/components/legacy-chairs";
import { getCollectionPage, getProductCards } from "@/lib/catalog";
import {
  collectionTitles,
  collectionQuery,
} from "@/lib/collections";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const title = collectionTitles[handle] ?? "Furniture";
  // Sorted and filtered views of a collection point search to the collection itself.
  return { title, description: `${title} by Maple Furnishers: handcrafted luxury furniture, made to order in Delhi and delivered across India.`, alternates: { canonical: `/collections/${handle}` } };
}
type Query = Record<string, string | string[] | undefined>;
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Query>;
}) {
  const { handle } = await params;
  if (!Object.hasOwn(collectionTitles, handle)) notFound();
  const rawQuery = await searchParams;
  const query = collectionQuery(rawQuery);
  // Explicit browsing controls retain the historical chair grid, including
  // empty or malformed values handled by the existing query normalizer.
  const browsingRequested = [
    "q",
    "sort",
    "sort_by",
    "availability",
    "min",
    "max",
    "category",
    "page",
  ].some((key) => Object.hasOwn(rawQuery, key));
  const showChairEditorial = handle === "chairs" && !browsingRequested;
  const [result, editorialProducts] = await Promise.all([
    getCollectionPage(handle, query),
    showChairEditorial ? getProductCards(legacyChairHandles) : Promise.resolve([]),
  ]);
  const campaign: CampaignKey | undefined = (
    {
      beds: "beds-hero",
      "outdoor-furnitures": "outdoors-hero",
      "tv-media-units": "tv-units-hero",
    } as Record<string, CampaignKey>
  )[handle];
  return (
    <>
      {showChairEditorial && <LegacyChairs products={editorialProducts} />}
      {campaign && <CampaignBanner campaign={campaign} />}
      <CollectionListing
        handle={handle}
        title={collectionTitles[handle]!}
        headingLevel={showChairEditorial ? "h2" : "h1"}
        query={result.query}
        products={result.products}
        total={result.total}
        collectionTotal={result.collectionTotal}
        limit={result.limit}
        inStock={result.inStock}
        outOfStock={result.outOfStock}
        highestPrice={result.highestPrice}
      />
      {handle === "beds" && <CampaignBanner campaign="beds-sale" />}
    </>
  );
}
