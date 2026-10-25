import { notFound } from "next/navigation";
import Link from "next/link";
import { StoreContent } from "@/components/store-content";
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
  return (
    <section className="editorial-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>{policy.title}</span>
      </nav>
      <h1>{policy.title}</h1>
      <article className="store-prose">
        <StoreContent nodes={policy.content} />
      </article>
    </section>
  );
}
