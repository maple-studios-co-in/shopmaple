import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { collectionTitles } from "@/lib/collections";

/**
 * Decides whether the collection exists before loading.tsx streams the logo screen. The response status is sent with
 * the first streamed byte, so an unknown handle has to be turned away here for a real 404 instead of a 200 that shows
 * "We couldn't find that page".
 */
export default async function CollectionLayout({ children, params }: { children: ReactNode; params: Promise<{ handle: string }> }) {
  if (!Object.hasOwn(collectionTitles, (await params).handle)) notFound();
  return children;
}
