import { notFound } from "next/navigation";
import { PolicyArticle } from "@/components/policy-page";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { pageDescription } from "@/lib/seo";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
/** Every policy on the site: the imported ones staff kept and the ones staff added (owner, 24 Nov 2026). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const content = await getPublishedContent();
  const { policies } = resolveEditorialContent(content.editorialContent);
  const policy = Object.hasOwn(policies, slug) ? policies[slug] : undefined;
  if (!policy) return { title: "Policy" };
  return {
    title: policy.seoTitle || policy.title,
    ...(policy.seoDescription ? { description: pageDescription(policy.seoDescription) } : {}),
    alternates: { canonical: `/policies/${slug}` },
  };
}
export default async function PolicyPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const content = await getPublishedContent();
  const { policies } = resolveEditorialContent(content.editorialContent);
  const policy = Object.hasOwn(policies, slug) ? policies[slug] : undefined;
  if (!policy) notFound();
  return <PolicyArticle policy={policy} slug={slug} footer={resolveSiteChrome(content.siteChrome).footer} media={content.templateMedia} />;
}
