import { ReturnsPageContent } from "@/components/service-pages";
import { getPublishedContent } from "@/lib/content";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
export async function generateMetadata() {
  return { title: resolveServicePages((await getPublishedContent()).servicePages).returns.title };
}
export default async function ReturnsPage() {
  const published = await getPublishedContent();
  const content = resolveServicePages(published.servicePages).returns;
  return <ReturnsPageContent content={content} footer={resolveSiteChrome(published.siteChrome).footer} media={published.templateMedia} />;
}
