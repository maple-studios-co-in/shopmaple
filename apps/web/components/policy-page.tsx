import Link from "next/link";
import { StoreContent } from "@/components/store-content";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

type Policy = ReturnType<typeof resolveEditorialContent>["policies"][string];

export function PolicyArticle({ policy }: { policy: Policy }) {
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
