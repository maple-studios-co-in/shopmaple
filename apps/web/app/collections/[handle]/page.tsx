import { notFound } from "next/navigation";
import { CollectionListing } from "@/components/collection-listing";
import { canOrder, pricedVariants } from "@/lib/product-availability";
import { getProducts } from "@/lib/catalog";
import {
  collectionTitles,
  collectionQuery,
  collectionMembers,
  filterCollection,
} from "@/lib/collections";
export const dynamic = "force-dynamic";
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
  const query = collectionQuery(await searchParams);
  // Membership and facets must run over the entire preview, not just its first API page.
  const first = await getProducts({ limit: "50", sort: "featured" });
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(first.total / 50) - 1 }, (_, index) =>
      getProducts({ limit: "50", sort: "featured", page: String(index + 2) }),
    ),
  );
  const members = collectionMembers(
    [...first.products, ...pages.flatMap((page) => page.products)],
    handle,
  );
  const filtered = filterCollection(members, query);
  const limit = 24;
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(filtered.length / limit)),
  );
  const knownPrices = members.flatMap(product => pricedVariants(product).map(variant => variant.pricePaise));
  return (
    <CollectionListing
      handle={handle}
      title={collectionTitles[handle]!}
      query={{ ...query, page }}
      products={filtered.slice((page - 1) * limit, page * limit)}
      total={filtered.length}
      collectionTotal={members.length}
      limit={limit}
      inStock={
        members.filter((p) => p.variants.some(canOrder)).length
      }
      outOfStock={
        members.filter((p) => !p.variants.length || p.variants.some(v => !canOrder(v))).length
      }
      highestPrice={knownPrices.length ? Math.max(...knownPrices) : null}
    />
  );
}
