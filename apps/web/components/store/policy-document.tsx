import { templateMediaKeys, type EditorialNode, type TemplateMedia, type TemplateMediaKey } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { StoreContent } from "@/components/store-content";
import { policyOutline } from "@/lib/policy-outline";
import { HelpPage, type HelpChrome } from "./help-page";
import { PolicyContents } from "./policy-contents";

// The frames set each section's text as one block: a blank line between paragraphs and lists, none under a
// sub-heading such as "Personal Information", which leads its list; list items are "• " lines, not indented.
// Lists written in the rich text editor keep each item's words in a paragraph: the first one stays on the bullet's line,
// a list inside an item is indented under it, and tables get the page's rules (24 Nov 2026).
const copy = [
  "text-[15px] leading-[23px] lg:text-[17px] lg:leading-[26px]",
  "[&>*+*]:mt-[23px] lg:[&>*+*]:mt-[26px] [&>h3+*]:mt-0",
  "[&_li]:before:content-['•_'] [&_ol]:list-decimal [&_ol]:pl-5 [&_ol>li]:before:content-none",
  "[&_li>p:first-child]:inline [&_li>p+p]:mt-2 [&_li_:is(ul,ol)]:mt-1 [&_li_:is(ul,ol)]:pl-5",
  "[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:[overflow-wrap:normal]",
  "[&_:is(td,th)]:border [&_:is(td,th)]:border-help-rule [&_:is(td,th)]:p-3 [&_:is(td,th)]:text-left [&_:is(td,th)]:align-top [&_th]:font-semibold",
  "[&_strong]:font-semibold [&_b]:font-semibold [&_a]:text-maple [&_a]:underline [&_a]:underline-offset-2",
].join(" ");

/**
 * A policy written in the page editor, laid out as its Help page: the text before the first heading sits
 * under the title, and each heading opens a numbered section listed under "On this page". A policy saved
 * without headings has no sections to list, so all of its text reads as the body instead.
 */
/** The bundled policy photos; a policy staff added without choosing one shows the Terms of Service photo. */
const bundledPhotos = new Set(["privacy-policy", "refund-policy", "return-exchange", "shipping-policy", "terms-of-service"]);
export function PolicyDocument({ slug, title, content, chrome, media, photo: chosen }: {
  slug: string; title: string; content: EditorialNode[]; chrome: HelpChrome; media?: TemplateMedia;
  /** A photo staff chose for this policy in the Policies editor (owner, 24 Nov 2026). */
  photo?: { src: string; alt: string };
}) {
  const { intro, sections } = policyOutline(content);
  // The photo staff chose leads; else the template artwork (policy-<slug>); else the bundled photo.
  const key = `policy-${slug}`;
  const slotted = (templateMediaKeys as readonly string[]).includes(key);
  const photo = chosen ? { image: chosen.src, alt: chosen.alt } : slotted ? resolveTemplateMedia(key as TemplateMediaKey, media)
    : { image: `/media/policies/${bundledPhotos.has(slug) ? slug : "terms-of-service"}.jpg`, alt: "" };
  const sectioned = sections.length > 0;
  return (
    <HelpPage
      chrome={chrome}
      current={`/policies/${slug}`}
      title={title}
      opening={sectioned && intro.length > 0 ? <StoreContent nodes={intro} /> : undefined}
      photo={photo.image}
      photoAlt={photo.alt}
      photoSlot={slotted && !chosen ? key : undefined}
    >
      {!sectioned && <div className={`max-w-[800px] pt-8 pb-16 lg:py-16 ${copy}`}><StoreContent nodes={intro} /></div>}
      {sectioned && <div className="flex flex-col gap-8 pt-8 pb-16 lg:grid lg:grid-cols-[260px_minmax(0,800px)] lg:gap-x-12 lg:py-16 xl:gap-x-[88px]">
        <PolicyContents sections={sections.map(({ id, number, title }) => ({ id, number, title }))} />
        <div className="flex flex-col gap-8 lg:gap-[42px]">
          {sections.map(section => (
            <section key={section.id} id={section.id} data-policy-section aria-labelledby={`${section.id}-title`} className="flex scroll-mt-6 flex-col gap-4 border-b border-help-rule pb-4">
              <h2 id={`${section.id}-title`} className="text-[23px] leading-[1.25] font-medium lg:text-[28px]">
                {section.number}. {section.title}
              </h2>
              {section.nodes.length > 0 && <div className={copy}><StoreContent nodes={section.nodes} /></div>}
            </section>
          ))}
        </div>
      </div>}
    </HelpPage>
  );
}
