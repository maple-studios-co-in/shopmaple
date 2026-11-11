"use client";
import type { ServicePagesContent } from "@shopmaple/contracts";
import { resolveBulkPage, type ResolvedBulkPage } from "@/lib/bulk-enquiry-defaults";
import { Notice } from "./crm-primitives";
import { ContentPanel, ContentPanels, GroupedFields, PageEditor, SectionToggles, TextFields, listFields } from "./kit";

const sectionLabels = { hero: "Opening", figures: "Figures", trust: "Advantages", process: "Process", proposal: "Proposal form", business: "Business", cities: "Cities" };
const figureLabels = { checks: "quality checks", cities: "cities", workshop: "workshop" };
const promiseLabels = { price: "Price", quality: "Quality", materials: "Materials", custom: "Customization", delivery: "Delivery" };
const stepLabels = { meet: "Meet", design: "Design", deliver: "Deliver" };

/**
 * The Bulk Enquiry editor (Figma 298:924, owner 10 Nov 2026): page title, the regions' order and visibility, then a panel
 * per region in the page's order. An older draft opens on the page as it now reads (lib/bulk-enquiry-defaults.ts).
 */
export function BulkEnquiryFields({ content, onChange }: { content: ServicePagesContent; onChange: (value: ServicePagesContent) => void }) {
  const data = resolveBulkPage(content.bulk);
  const { trust, process, proposal, business, cities } = data;
  const patch = (next: Partial<ResolvedBulkPage>) => onChange({ ...content, bulk: { ...data, ...next } });
  return <PageEditor label="Service page content" title="Bulk Enquiry"
    description="Edit /bulk-enquiry. Changes stay in your draft until published. The photos are under Artwork, Bulk Enquiry; the phone number and email are the footer's bulk contact. The IndiaMART link and the form's questions stay fixed."
    intro={<TextFields value={data} onChange={patch} fields={[["title", "Bulk page title", 160]]} />}>
    <SectionToggles prefix="Bulk" labels={sectionLabels} items={data.sections} onChange={sections => patch({ sections })}
      description="Drag sections into order, or use the Move buttons, and hide the ones you do not need. The page keeps an accessible heading, and hiding the proposal form also hides the opening's button." />
    <ContentPanels description="Open a section to edit its text. A line break in a heading or subtitle is kept on wide screens.">
      <ContentPanel title="Opening">
        <TextFields value={data} onChange={patch} fields={[
          ["eyebrow", "Bulk eyebrow", 160], ["heading", "Bulk heading", 160, true], ["subtitle", "Bulk subtitle", 300, true],
          ["heroCta", "Bulk opening button", 60], ["heroNote", "Bulk opening note", 160],
        ]} />
      </ContentPanel>
      <ContentPanel title="Figures">
        <TextFields value={trust} onChange={next => patch({ trust: next })} fields={[["metricValue", "Bulk project count", 80], ["metricLabel", "Bulk project count label", 160]]} />
        <GroupedFields items={data.figures} grid legend={figure => `The ${figureLabels[figure.key]} figure`} onChange={figures => patch({ figures })}
          fields={figure => [["value", `Bulk ${figureLabels[figure.key]} figure`, 80], ["label", `Bulk ${figureLabels[figure.key]} figure label`, 160]]} />
      </ContentPanel>
      <ContentPanel title="Advantages">
        <TextFields value={trust} onChange={next => patch({ trust: next })} fields={[
          ["eyebrow", "Bulk advantages eyebrow", 160], ["heading", "Bulk advantages heading", 300], ["body", "Bulk advantages introduction", 300, true],
        ]} />
        <GroupedFields items={trust.items} legend={item => promiseLabels[item.key]} onChange={items => patch({ trust: { ...trust, items } })}
          fields={item => [["title", `Bulk ${promiseLabels[item.key]} advantage`, 160], ["body", `Bulk ${promiseLabels[item.key]} advantage text`, 300, true]]} />
      </ContentPanel>
      <ContentPanel title="Process">
        <TextFields value={process} onChange={next => patch({ process: next })} fields={[["eyebrow", "Bulk process eyebrow", 300], ["heading", "Bulk process heading", 160]]} />
        <GroupedFields items={process.steps} legend={step => stepLabels[step.key]} onChange={steps => patch({ process: { ...process, steps } })}
          fields={step => [["title", `Bulk ${stepLabels[step.key]} step title`, 160], ["body", `Bulk ${stepLabels[step.key]} step body`, 3000, true]]} />
      </ContentPanel>
      <ContentPanel title="Proposal form">
        <Notice tone="info">The phone number and email beside the form are the footer’s bulk contact, under Navigation &amp; footer. Enquiries carry no files, so the references box opens an email to that address.</Notice>
        <TextFields value={proposal} onChange={next => patch({ proposal: next })} fields={[
          ["eyebrow", "Bulk proposal eyebrow", 160], ["heading", "Bulk proposal heading", 160, true], ["body", "Bulk proposal introduction", 600, true],
          ["contactHeading", "Bulk conversation heading", 160], ["formHeading", "Bulk form heading", 160],
          ["referencesTitle", "Bulk references title", 160], ["referencesNote", "Bulk references note", 200],
          ["note", "Bulk form note", 300, true], ["cta", "Bulk form button", 60],
        ]} />
      </ContentPanel>
      <ContentPanel title="Business">
        <TextFields value={business} onChange={next => patch({ business: next })} fields={[
          ["badge", "Bulk business eyebrow", 160], ["heading", "Bulk business heading", 160, true], ["body", "Bulk business body", 4000, true],
          ...listFields(business.features, index => `Bulk business feature ${index + 1}`, 200, features => patch({ business: { ...business, features } })),
          ["cta", "Bulk business button", 160],
        ]} />
      </ContentPanel>
      <ContentPanel title="Cities">
        <TextFields value={cities} onChange={next => patch({ cities: next })} fields={[
          ["eyebrow", "Bulk cities eyebrow", 160], ["heading", "Bulk cities heading", 160], ["body", "Bulk cities line", 300],
        ]} />
      </ContentPanel>
    </ContentPanels>
  </PageEditor>;
}
