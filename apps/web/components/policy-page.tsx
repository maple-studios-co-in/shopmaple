import Link from "next/link";
import { PolicyContents } from "@/components/policy-contents";
import { StoreContent, headingOutline } from "@/components/store-content";
import source from "@/data/store-content.json";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

type Policy = ReturnType<typeof resolveEditorialContent>["policies"][string];

/** Every policy the store publishes, in the order of its source content, for the page's switcher. */
export function policyLinks(policies: Record<string, Policy>) {
  return Object.keys(source.policies).flatMap(slug => policies[slug] ? [{ slug, title: policies[slug].title }] : []);
}

/**
 * A policy page in the style of the Impact Layout homepage and the product page: a cream header with
 * the title and the other policies, the staff-edited text at a readable measure beside an
 * "On this page" list of its headings, and a closing note pointing to the contact page.
 * Styles: styles/policy-page.css.
 */
export function PolicyArticle({ policy, slug, policies }: {
  policy: Policy;
  slug: string;
  policies: { slug: string; title: string }[];
}) {
  const outline = headingOutline(policy.content);
  return (
    <div className="policy-page">
      <header className="policy-header">
        <div className="policy-header-inner">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span>{policy.title}</span>
          </nav>
          <p className="policy-eyebrow">Terms and Policies</p>
          <h1>{policy.title}</h1>
          {policies.length > 1 && (
            <nav className="policy-switcher" aria-label="Policies">
              <ul>
                {policies.map(other => (
                  <li key={other.slug}>
                    <Link href={`/policies/${other.slug}`} aria-current={other.slug === slug ? "page" : undefined}>{other.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </header>
      <div className="policy-layout" data-contents={outline.entries.length > 0}>
        <PolicyContents entries={outline.entries} />
        <article className="policy-prose">
          <StoreContent nodes={policy.content} anchors={outline.anchors} />
        </article>
        <aside className="policy-help" aria-labelledby="policy-help-title">
          <h2 id="policy-help-title">Questions about this policy?</h2>
          <p>If anything here is unclear, or you would like to talk about your order, our team is happy to help.</p>
          <Link href="/pages/contact">Contact us</Link>
        </aside>
      </div>
    </div>
  );
}
