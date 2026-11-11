import type { Metadata } from "next";
import { CollectionLandingView } from "@/components/collection-landing";
import { getPublishedContent } from "@/lib/content";
import { resolveTerraLanding, resolveTerraPageContent, terraPath } from "@/lib/terra-content-defaults";

// The Terra Collection (Figma 311:921; owner, 10 Nov 2026): the published words and artwork, drawn by the collection
// template it shares with Nimbus.
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const page = resolveTerraPageContent((await getPublishedContent()).terraPage);
  return { title: page.title, description: page.hero.body.replace(/\s+/g, " ").trim(), alternates: { canonical: terraPath } };
}
export default async function Page() {
  return <CollectionLandingView page={resolveTerraLanding(await getPublishedContent())} />;
}
