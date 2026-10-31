import { notFound } from "next/navigation";
import { PolicyArticle } from "@/components/policy-page";
import source from "@/data/store-content.json";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
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
  return {
    title: Object.hasOwn(source.policies, slug)
      ? policies[slug]?.title ?? "Policy"
      : "Policy",
    ...(Object.hasOwn(source.policies, slug) ? { alternates: { canonical: `/policies/${slug}` } } : {}),
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
  if (!Object.hasOwn(source.policies, slug)) notFound();
  const content = await getPublishedContent();
  const { policies } = resolveEditorialContent(content.editorialContent);
  const policy = policies[slug];
  if (!policy) notFound();
  return <PolicyArticle policy={policy} />;
}
