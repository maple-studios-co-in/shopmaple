import type { EditorialNode } from "@shopmaple/contracts";
import { StoreContent } from "@/components/store-content";
import { policyOutline } from "@/lib/policy-outline";
import { HelpPage, type HelpChrome } from "./help-page";
import { PolicyContents } from "./policy-contents";

// The frames set each section's text as one block: a blank line between paragraphs and lists, none under a
// sub-heading such as "Personal Information", which leads its list; list items are "• " lines, not indented.
const copy = [
  "text-[15px] leading-[23px] lg:text-[17px] lg:leading-[26px]",
  "[&>*+*]:mt-[23px] lg:[&>*+*]:mt-[26px] [&>h3+*]:mt-0",
  "[&_li]:before:content-['•_'] [&_ol]:list-decimal [&_ol]:pl-5 [&_ol>li]:before:content-none",
  "[&_strong]:font-semibold [&_b]:font-semibold [&_a]:text-maple [&_a]:underline [&_a]:underline-offset-2",
].join(" ");

/**
 * A policy written in the page editor, laid out as its Help page: the text before the first heading sits
 * under the title, and each heading opens a numbered section listed under "On this page". A policy saved
 * without headings has no sections to list, so all of its text reads as the body instead.
 */
export function PolicyDocument({ slug, title, content, chrome }: { slug: string; title: string; content: EditorialNode[]; chrome: HelpChrome }) {
  const { intro, sections } = policyOutline(content);
  const sectioned = sections.length > 0;
  return (
    <HelpPage
      chrome={chrome}
      current={`/policies/${slug}`}
      title={title}
      opening={sectioned && intro.length > 0 ? <StoreContent nodes={intro} /> : undefined}
      photo={`/media/policies/${slug}.jpg`}
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
