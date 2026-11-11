import { NimbusWithArtwork } from "@/components/artwork-pages";
import { getPublishedContent } from "@/lib/content";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const content = resolveNimbusPageContent((await getPublishedContent()).nimbusPage);
  return { title: content.title };
}
export default async function Page() {
  const content = await getPublishedContent();
  return <NimbusWithArtwork content={content} />;
}
