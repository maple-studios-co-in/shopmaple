import { notFound } from "next/navigation";
import { PolicyPage, isPolicySlug } from "@/components/policy-page";
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
    title: isPolicySlug(slug)
      ? policies[slug]?.title ?? "Policy"
      : "Policy",
  };
}
export default async function Policy({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  const page = PolicyPage({ slug, content: await getPublishedContent() });
  if (!page) notFound();
  return page;
}
