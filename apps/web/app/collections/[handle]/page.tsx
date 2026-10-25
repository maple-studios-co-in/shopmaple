import { notFound } from "next/navigation";
import { CampaignBanner, type CampaignKey } from "@/components/campaign-banner";
import { CollectionListing } from "@/components/collection-listing";
import { LegacyChairs } from "@/components/legacy-chairs";
import { canOrder, pricedVariants } from "@/lib/product-availability";
import { getProducts } from "@/lib/catalog";
import {
  collectionTitles,
  collectionQuery,
  collectionMembers,
  filterCollection,
} from "@/lib/collections";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return { title: collectionTitles[handle] ?? "Furniture" };
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
  // Membership and facets must run over the entire preview, not just its first API page.
  const first = await getProducts({ limit: "50", sort: "featured" });
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(first.total / 50) - 1 }, (_, index) =>
      getProducts({ limit: "50", sort: "featured", page: String(index + 2) }),
    ),
  );
  const products = [
    ...first.products,
    ...pages.flatMap((page) => page.products),
  ];
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
  if (handle === "chairs" && !browsingRequested)
    return <LegacyChairs products={products} />;
  const members = collectionMembers(products, handle);
  const filtered = filterCollection(members, query);
  const limit = 24;
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(filtered.length / limit)),
  );
  const knownPrices = members.flatMap((product) =>
    pricedVariants(product).map((variant) => variant.pricePaise),
  );
  const campaign: CampaignKey | undefined = (
    {
      beds: "beds-hero",
      "outdoor-furnitures": "outdoors-hero",
      "tv-media-units": "tv-units-hero",
    } as Record<string, CampaignKey>
  )[handle];
  return (
    <>
      {campaign && <CampaignBanner campaign={campaign} />}
      <CollectionListing
        handle={handle}
        title={collectionTitles[handle]!}
        query={{ ...query, page }}
        products={filtered.slice((page - 1) * limit, page * limit)}
        total={filtered.length}
        collectionTotal={members.length}
        limit={limit}
        inStock={members.filter((p) => p.variants.some(canOrder)).length}
        outOfStock={
          members.filter(
            (p) => !p.variants.length || p.variants.some((v) => !canOrder(v)),
          ).length
        }
        highestPrice={knownPrices.length ? Math.max(...knownPrices) : null}
      />
      {handle === "beds" && <CampaignBanner campaign="beds-sale" />}
    </>
  );
}
