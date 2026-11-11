import { NimbusCollection } from "@/components/nimbus-collection";
import { getPublishedContent } from "@/lib/content";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const content = resolveNimbusPageContent((await getPublishedContent()).nimbusPage);
  return { title: content.title, alternates: { canonical: "/nimbus-collection" } };
}
/** The Nimbus Collection (Figma 311:548; owner, 10 Nov 2026), drawn by the collection template it shares with Terra. */
export default async function Page() {
  return <NimbusCollection site={await getPublishedContent()} />;
}
