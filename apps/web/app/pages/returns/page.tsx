import { ReturnsPage } from "@/components/returns-page";
import { getPublishedContent } from "@/lib/content";
import { resolveServicePages } from "@/lib/service-page-defaults";
export async function generateMetadata() {
  return { title: resolveServicePages((await getPublishedContent()).servicePages).returns.title };
}
export default async function Returns() {
  const content = resolveServicePages((await getPublishedContent()).servicePages).returns;
  return <ReturnsPage content={content} />;
}
