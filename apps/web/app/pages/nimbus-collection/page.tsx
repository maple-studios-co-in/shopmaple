import { NimbusLanding } from "@/components/category-nimbus";
import { getPublishedContent } from "@/lib/content";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const content = resolveNimbusPageContent((await getPublishedContent()).nimbusPage);
  return { title: content.title };
}
export default async function Page() {
  const content = await getPublishedContent();
  return <NimbusLanding content={content.nimbusPage} media={content.templateMedia} />;
}
