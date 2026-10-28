import { ReturnsPageContent } from "@/components/service-pages";
import { getPublishedContent } from "@/lib/content";
import { resolveServicePages } from "@/lib/service-page-defaults";
export async function generateMetadata() {
  return { title: resolveServicePages((await getPublishedContent()).servicePages).returns.title };
}
export default async function ReturnsPage() {
  const content = resolveServicePages((await getPublishedContent()).servicePages).returns;
  return <ReturnsPageContent content={content} />;
}
