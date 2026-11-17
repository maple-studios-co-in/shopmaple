import { notFound } from "next/navigation";
import { CollectionPageView } from "@/components/store/collection-page";
import { collectionTitles } from "@/lib/collections";
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
/** The page itself is components/store/collection-page.tsx, which the staff live preview draws from a draft too. */
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Query>;
}) {
  const { handle } = await params;
  if (!Object.hasOwn(collectionTitles, handle)) notFound();
  // Called, not mounted, so the route returns the finished page as it always has.
  return CollectionPageView({ handle, query: await searchParams });
}
