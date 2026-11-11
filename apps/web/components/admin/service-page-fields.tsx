"use client";
import type { ReactNode } from "react";
import type { ServicePagesContent } from "@shopmaple/contracts";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { resolveContactPage, type ResolvedContactPage } from "@/lib/contact-page-content";
import { BulkEnquiryFields } from "./bulk-enquiry-fields";
import { Notice } from "./crm-primitives";
import { ContentPanel, ContentPanels, GroupedFields, PageEditor, SectionToggles, TextFields, patchKey } from "./kit";

const contactLabels = { intro: "Introduction", reach: "Ways to reach us", enquiry: "Enquiry", help: "Help", visit: "Delhi address", cities: "Cities" };
const guidanceLabels = { order: "existing order", project: "larger project" };
const categoryLabels = { tracking: "Tracking", payment: "Payment", account: "Account", warranty: "Warranty", damage: "Damage" };
type Cities = { eyebrow: string; heading: string };
type Sections<K extends string> = { key: K; enabled: boolean }[];

/** The contact editor's frame: page title, section order and visibility, then the section panels ending with Cities.
    (Bulk Enquiry has its own editor, `BulkEnquiryFields`.) */
function ServicePage<K extends string>({ prefix, title, description, labels, data, patch, children }: {
  prefix: string; title: string; description: string; labels: Record<K, string>; children: ReactNode;
  data: { title: string; sections: Sections<K>; cities: Cities }; patch: (next: { title?: string; sections?: Sections<K>; cities?: Cities }) => void;
}) {
  return <PageEditor label="Service page content" title={title} description={description}
    intro={<TextFields value={data} onChange={patch} fields={[["title", `${prefix} page title`, 160]]} />}>
    <SectionToggles prefix={prefix} labels={labels} items={data.sections} onChange={sections => patch({ sections })}
      description="Drag sections into order, or use the Move buttons, and hide the ones you do not need. The page keeps an accessible heading." />
    <ContentPanels>
      {children}
      <ContentPanel title="Cities">
        <TextFields value={data.cities} onChange={cities => patch({ cities })}
          fields={[["eyebrow", `${prefix} cities eyebrow`, 160], ["heading", `${prefix} cities heading`, 160]]} />
      </ContentPanel>
    </ContentPanels>
  </PageEditor>;
}

export function ServicePageFields({ value, page, onChange }: {
  value?: ServicePagesContent; page: keyof ServicePagesContent; onChange: (value: ServicePagesContent) => void;
}) {
  const content = resolveServicePages(value);
  if (page === "contact") {
    // The redesign's words (Figma 298:511, owner 10 Nov 2026); an older draft opens with the design's copy filled in.
    const data = resolveContactPage(content.contact);
    const { reach } = data;
    const patch = (next: Partial<ResolvedContactPage>) => onChange({ ...content, contact: { ...data, ...next } });
    return <ServicePage prefix="Contact" title="Contact" labels={contactLabels} data={data} patch={patch}
      description="Edit /contact. Changes stay in your draft until published. The phone number, email and address are the footer's customer care details; the photos are under Artwork, Contact. Enquiry handling is managed separately.">
      <ContentPanel title="Introduction">
        <TextFields value={data} onChange={patch} fields={[
          ["eyebrow", "Contact eyebrow", 160], ["heading", "Contact heading", 300, true], ["introBody", "Contact introduction text", 300, true],
        ]} />
      </ContentPanel>
      <ContentPanel title="Ways to reach us">
        <Notice tone="info">The number and email shown are the footer’s customer care details, under Navigation &amp; footer.</Notice>
        <TextFields value={reach.call} onChange={call => patch({ reach: { ...reach, call } })} fields={[["title", "Contact call title", 80], ["note", "Contact call note", 160]]} />
        <TextFields value={reach.write} onChange={write => patch({ reach: { ...reach, write } })} fields={[["title", "Contact email title", 80], ["note", "Contact email note", 160]]} />
        <TextFields value={reach.visit} onChange={visit => patch({ reach: { ...reach, visit } })}
          fields={[["title", "Contact visit title", 80], ["detail", "Contact visit detail", 160], ["note", "Contact visit note", 160]]} />
      </ContentPanel>
      <ContentPanel title="Enquiry">
        <TextFields value={data} onChange={patch} fields={[
          ["enquiryEyebrow", "Contact enquiry eyebrow", 160], ["enquiryHeading", "Contact enquiry heading", 300, true], ["enquiryBody", "Contact enquiry text", 600, true],
        ]} />
        <GroupedFields items={data.guidance} legend={item => item.key === "order" ? "For an existing order" : "For a larger project"} onChange={guidance => patch({ guidance })}
          fields={item => [["title", `Contact ${guidanceLabels[item.key]} title`, 160], ["body", `Contact ${guidanceLabels[item.key]} text`, 400, true]]} />
        <TextFields value={data} onChange={patch} fields={[
          ["bulkCta", "Contact bulk enquiry button", 80], ["formHeading", "Contact form heading", 160], ["formNote", "Contact form note", 300, true],
        ]} />
      </ContentPanel>
      <ContentPanel title="Help introduction">
        <TextFields value={data} onChange={patch} fields={[
          ["helpEyebrow", "Contact help eyebrow", 300], ["helpHeading", "Contact help heading", 160], ["helpBody", "Contact help text", 300, true],
        ]} />
      </ContentPanel>
      {data.categories.map(category => {
        const label = categoryLabels[category.key], change = (next: Partial<typeof category>) => patch({ categories: patchKey(data.categories, category.key, next) });
        return (
          <ContentPanel key={category.key} title={`${label} questions`}>
            <TextFields value={category} onChange={change} fields={[["title", `Contact ${label} category title`, 160]]} />
            <GroupedFields items={category.questions} legend={question => `Question ${question.key.slice(1)}`} onChange={questions => change({ questions })}
              fields={({ key }) => [["question", `Contact ${label} question ${key.slice(1)}`, 300], ["answer", `Contact ${label} answer ${key.slice(1)}`, 4000, true]]} />
          </ContentPanel>
        );
      })}
      <ContentPanel title="Delhi address">
        <Notice tone="info">The address shown is the footer’s, under Navigation &amp; footer.</Notice>
        <TextFields value={data} onChange={patch} fields={[
          ["visitEyebrow", "Contact address eyebrow", 160], ["visitHeading", "Contact address heading", 300], ["visitBody", "Contact address text", 300, true],
          ["visitCta", "Contact directions button", 80],
        ]} />
      </ContentPanel>
    </ServicePage>;
  }
  // The Bulk Enquiry redesign has its own editor (Figma 298:924, owner 10 Nov 2026).
  if (page === "bulk") return <BulkEnquiryFields content={content} onChange={onChange} />;
  const data = content.returns;
  return <PageEditor label="Service page content" title="Return & Exchange" description="Edit /returns. The policy destination and enquiry-only explanation stay in place."
    intro={<TextFields value={data} onChange={returns => onChange({ ...content, returns })} fields={[
      ["title", "Returns page title", 160], ["heading", "Returns heading", 160],
      ["policyLabel", "Returns policy link label", 160], ["intro", "Returns introduction", 1000, true],
    ]} />}>
    <Notice tone="info">Editing this page does not approve returns or issue refunds.</Notice>
  </PageEditor>;
}
