import { notFound } from "next/navigation";
import Link from "next/link";
import { StoreContent } from "@/components/store-content";
import source from "@/data/store-content.json";
const policies = source.policies;
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  return {
    title: Object.hasOwn(policies, slug)
      ? policies[slug as keyof typeof policies].title
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
  if (!Object.hasOwn(policies, slug)) notFound();
  const policy = policies[slug as keyof typeof policies];
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
