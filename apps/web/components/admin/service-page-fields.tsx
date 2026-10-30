"use client";
import type { ReactNode } from "react";
import type { ServicePagesContent } from "@shopmaple/contracts";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { Notice } from "./crm-primitives";
import { ContentPanel, ContentPanels, GroupedFields, PageEditor, SectionToggles, TextFields, listFields, patchKey, textField } from "./kit";

const contactLabels = { intro: "Introduction and form", help: "Help", cities: "Cities" };
const bulkLabels = { hero: "Hero and form", trust: "Trust", process: "Process", business: "Business", cities: "Cities" };
const categoryLabels = { tracking: "Tracking", payment: "Payment", account: "Account", warranty: "Warranty", damage: "Damage" };
const trustLabels = { price: "Price", quality: "Quality", materials: "Materials", custom: "Customization" };
const stepLabels = { meet: "Meet", design: "Design", deliver: "Deliver" };
type Cities = { eyebrow: string; heading: string };
type Sections<K extends string> = { key: K; enabled: boolean }[];

/** The contact and bulk editors: page title, section order and visibility, then the section panels ending with Cities. */
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
    const data = content.contact;
    const patch = (next: Partial<typeof data>) => onChange({ ...content, contact: { ...data, ...next } });
    return <ServicePage prefix="Contact" title="Contact" labels={contactLabels} data={data} patch={patch}
      description="Edit /pages/contact. Changes stay in your draft until published. Contact destinations and enquiry handling are managed separately.">
      <ContentPanel title="Introduction">
        <TextFields value={data} onChange={patch} fields={[["eyebrow", "Contact eyebrow", 160], ["heading", "Contact heading", 300]]} />
      </ContentPanel>
      <ContentPanel title="Help introduction">
        <TextFields value={data} onChange={patch} fields={[["helpEyebrow", "Contact help eyebrow", 300], ["helpHeading", "Contact help heading", 160]]} />
      </ContentPanel>
      {data.categories.map(category => {
        const label = categoryLabels[category.key], change = (next: Partial<typeof category>) => patch({ categories: patchKey(data.categories, category.key, next) });
        return (
          <ContentPanel key={category.key} title={`${label} questions`}>
            <TextFields value={category} onChange={change}
              fields={[["title", `Contact ${label} category title`, 160], ["subtitle", `Contact ${label} category subtitle`, 300]]} />
            <GroupedFields items={category.questions} legend={question => `Question ${question.key.slice(1)}`} onChange={questions => change({ questions })}
              fields={({ key }) => [["question", `Contact ${label} question ${key.slice(1)}`, 300], ["answer", `Contact ${label} answer ${key.slice(1)}`, 4000, true]]} />
          </ContentPanel>
        );
      })}
    </ServicePage>;
  }
  if (page === "bulk") {
    const data = content.bulk;
    const { trust, process, business } = data;
    const patch = (next: Partial<typeof data>) => onChange({ ...content, bulk: { ...data, ...next } });
    return <ServicePage prefix="Bulk" title="Bulk Enquiry" labels={bulkLabels} data={data} patch={patch}
      description="Edit /pages/bulk-enquiry. Changes stay in your draft until published. Images, business destinations and form requirements stay attached to the original template.">
      <ContentPanel title="Hero">
        <TextFields value={data} onChange={patch} fields={[["eyebrow", "Bulk eyebrow", 160], ["heading", "Bulk heading", 160], ["subtitle", "Bulk subtitle", 300]]} />
      </ContentPanel>
      <ContentPanel title="Trust">
        <TextFields value={trust} onChange={trust => patch({ trust })} fields={[
          ["heading", "Bulk trust heading", 300], ["metricValue", "Bulk project count", 80], ["metricLabel", "Bulk project count label", 160],
          ...trust.items.map(item => textField(`Bulk ${trustLabels[item.key]} promise`, item.title, 160,
            title => patch({ trust: { ...trust, items: patchKey(trust.items, item.key, { title }) } }))),
        ]} />
      </ContentPanel>
      <ContentPanel title="Process">
        <TextFields value={process} onChange={process => patch({ process })}
          fields={[["eyebrow", "Bulk process eyebrow", 300], ["heading", "Bulk process heading", 160]]} />
        <GroupedFields items={process.steps} legend={step => stepLabels[step.key]} onChange={steps => patch({ process: { ...process, steps } })}
          fields={step => [["title", `Bulk ${stepLabels[step.key]} step title`, 160], ["body", `Bulk ${stepLabels[step.key]} step body`, 3000, true]]} />
      </ContentPanel>
      <ContentPanel title="Business">
        <TextFields value={business} onChange={business => patch({ business })} fields={[
          ["badge", "Bulk business badge", 160], ["heading", "Bulk business heading", 160], ["body", "Bulk business body", 4000, true],
          ...listFields(business.features, index => `Bulk business feature ${index + 1}`, 200, features => patch({ business: { ...business, features } })),
          ["cta", "Bulk business button", 160], ["trust", "Bulk business trust text", 160],
        ]} />
      </ContentPanel>
    </ServicePage>;
  }
  const data = content.returns;
  return <PageEditor label="Service page content" title="Return & Exchange" description="Edit /pages/returns. The policy destination and enquiry-only explanation stay in place."
    intro={<TextFields value={data} onChange={returns => onChange({ ...content, returns })} fields={[
      ["title", "Returns page title", 160], ["heading", "Returns heading", 160],
      ["policyLabel", "Returns policy link label", 160], ["intro", "Returns introduction", 1000, true],
    ]} />}>
    <Notice tone="info">Editing this page does not approve returns or issue refunds.</Notice>
  </PageEditor>;
}
