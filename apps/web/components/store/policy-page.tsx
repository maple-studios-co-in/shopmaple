import Link from "next/link";
import { StoreContent } from "@/components/store-content";
import { breadcrumbs, editorialPage, editorialTitle, storeProse, textLink } from "./current-look";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

type Policy = ReturnType<typeof resolveEditorialContent>["policies"][string];

export function PolicyArticle({ policy }: { policy: Policy }) {
  return (
    <section data-store data-policy-page className={editorialPage}>
      <nav data-breadcrumb aria-label="Breadcrumb" className={breadcrumbs}>
        <Link href="/" className={textLink}>Home</Link>
        <span>{policy.title}</span>
      </nav>
      <h1 className={editorialTitle}>{policy.title}</h1>
      <article data-policy-body className={storeProse}>
        <StoreContent nodes={policy.content} />
      </article>
    </section>
  );
}
