import Link from "next/link";
import type { TemplateMedia, TemplateMediaKey } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { PolicyContents } from "@/components/policy-contents";
import { StoreContent, headingOutline } from "@/components/store-content";
import source from "@/data/store-content.json";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

type Policy = ReturnType<typeof resolveEditorialContent>["policies"][string];

/** Every policy the store publishes, in the order of its source content, for the page's switcher. */
export function policyLinks(policies: Record<string, Policy>) {
  return Object.keys(source.policies).flatMap(slug => policies[slug] ? [{ slug, title: policies[slug].title }] : []);
}

// A photograph of the store's own for each policy, from the artwork staff manage in the admin, so a
// replaced photo changes here too: a restful bedroom (privacy), a hand checking upholstery (refunds), a
// room being styled at home (shipping) and a woven seat in close-up (terms).
const photographs: Record<string, TemplateMediaKey> = {
  "privacy-policy": "nimbus-room-bedroom",
  "refund-policy": "story-hero",
  "shipping-policy": "home-workshop-poster",
  "terms-of-service": "story-film-poster",
};

/**
 * A policy page in the style of the Impact Layout homepage and the product page: a wide photograph,
 * then the staff-edited text on a white sheet that rises over it, at a readable measure beside an
 * "On this page" list of its headings, and a closing note pointing to the contact page with links to
 * the other policies. The policy text opens with its own title, so the page title is for search
 * engines and screen readers only. Styles: styles/policy-page.css.
 */
export function PolicyArticle({ policy, slug, policies, media }: {
  policy: Policy;
  slug: string;
  policies: { slug: string; title: string }[];
  media?: TemplateMedia;
}) {
  const outline = headingOutline(policy.content);
  const photograph = resolveTemplateMedia(photographs[slug] ?? "story-hero", media);
  return (
    <div className="policy-page">
      <h1 className="policy-title">{policy.title}</h1>
      <figure className="policy-visual">
        <Image src={photograph.image} alt="" fill sizes="100vw" preload />
      </figure>
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
    </div>
  );
}
