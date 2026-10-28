import Link from "next/link";
import type { StorefrontContent } from "@shopmaple/contracts";
import { StoreContent } from "@/components/store-content";
import source from "@/data/store-content.json";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
export const isPolicySlug = (slug: string) => Object.hasOwn(source.policies, slug);
/** A policy page from the supplied content; null when the slug is not a known policy. */
export function PolicyPage({ slug, content }: { slug: string; content: StorefrontContent }) {
  if (!isPolicySlug(slug)) return null;
  const { policies } = resolveEditorialContent(content.editorialContent);
  const policy = policies[slug];
  if (!policy) return null;
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
