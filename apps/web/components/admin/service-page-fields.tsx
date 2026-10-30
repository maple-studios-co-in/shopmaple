"use client";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ServicePagesContent } from "@shopmaple/contracts";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import { Field } from "./field";
import { CheckField, FieldGrid, FieldGroup, MoveButtons, SectionHeading, rowCard } from "./kit";
import { SortableList, type SortableRowProps } from "./sortable-list";

/**
 * A collapsible block of fields: a native details/summary (closed until opened) drawn as a card.
 * Shared by the page editors in this folder; a candidate for kit.tsx.
 */
export function ContentPanel({ title, children, className, ...props }: Omit<ComponentProps<"details">, "title"> & { title: ReactNode }) {
  return (
    <details className={cn("group/panel min-w-0 rounded-lg border border-border bg-card shadow-xs", className)} {...props}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none select-none transition-colors duration-150 ease-admin hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-admin group-open/panel:rotate-90 motion-reduce:transition-none" />
        {title}
      </summary>
      <div className="grid gap-4 border-t border-line-soft px-4 pt-4 pb-5">{children}</div>
    </details>
  );
}

/** A stack of ContentPanels. */
export function PanelStack({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-2", className)} {...props} />;
}

/**
 * Sortable rows of named sections, each with a visibility checkbox and Move up/down buttons.
 * `name` is the spoken name (drag handle, Move buttons, "Show ..." checkbox); `label` is the visible text.
 */
export function ToggleRows<T extends { key: string; enabled: boolean }>({ items, name, label, onChange, onReorder, onMove, rowProps, className }: {
  items: readonly T[];
  name: (item: T) => string;
  label: (item: T) => ReactNode;
  onChange: (items: T[]) => void;
  /** Receives drags (and Move button presses unless onMove is given); defaults to onChange. */
  onReorder?: (items: T[], moved: T) => void;
  /** Receives Move button presses; defaults to onReorder. */
  onMove?: (items: T[], moved: T) => void;
  rowProps?: (item: T, index: number) => SortableRowProps;
  className?: string;
}) {
  const reorder = onReorder ?? ((next: T[]) => onChange(next));
  const moveTo = onMove ?? reorder;
  return (
    <SortableList items={items} getId={item => item.key} getLabel={item => name(item)} className={className}
      rowClassName={cn(rowCard, "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60")}
      onReorder={(next, moved) => reorder(next, moved)}
      rowProps={rowProps}
      renderItem={(item, index, handle) => (
        <>
          {handle}
          <CheckField className="min-w-0 flex-1" label={label(item)} aria-label={`Show ${name(item)}`} checked={item.enabled}
            onChange={event => onChange(items.map(entry => entry.key === item.key ? { ...entry, enabled: event.currentTarget.checked } : entry))} />
          <MoveButtons name={name(item)} index={index} length={items.length} onMove={direction => {
            const next = [...items];
            [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
            moveTo(next, item);
          }} />
        </>
      )}
    />
  );
}

const contactLabels = { intro: "Introduction and form", help: "Help", cities: "Cities" };
const bulkLabels = { hero: "Hero and form", trust: "Trust", process: "Process", business: "Business", cities: "Cities" };
const categoryLabels = { tracking: "Tracking", payment: "Payment", account: "Account", warranty: "Warranty", damage: "Damage" };
const trustLabels = { price: "Price", quality: "Quality", materials: "Materials", custom: "Customization" };
const stepLabels = { meet: "Meet", design: "Design", deliver: "Deliver" };
function Sections<K extends string>({ name, items, labels, onChange }: {
  name: string; items: { key: K; enabled: boolean }[]; labels: Record<K, string>;
  onChange: (items: { key: K; enabled: boolean }[]) => void;
}) {
  return <div>
    <SectionHeading description="Drag sections into order, or use the Move buttons, and hide the ones you do not need. The page keeps an accessible heading.">Sections</SectionHeading>
    <ToggleRows items={items} name={item => `${name} ${labels[item.key]}`} label={item => labels[item.key]} onChange={onChange} />
  </div>;
}
function PageHeading({ title, children }: { title: string; children: ReactNode }) {
  return <SectionHeading className="mt-2" description={children}>{title}</SectionHeading>;
}
const field = (label: string, value: string, maxLength: number, onChange: (value: string) => void, multiline = false) =>
  <Field key={label} label={label} value={value} maxLength={maxLength} onChange={onChange} multiline={multiline} />;
const pageClass = "grid gap-6";
export function ServicePageFields({ value, page, onChange }: {
  value?: ServicePagesContent; page: keyof ServicePagesContent; onChange: (value: ServicePagesContent) => void;
}) {
  const content = resolveServicePages(value);
  function update<K extends keyof ServicePagesContent>(key: K, value: ServicePagesContent[K]) { onChange({ ...content, [key]: value }); }
  if (page === "contact") {
    const data = content.contact;
    const patch = (next: Partial<typeof data>) => update("contact", { ...data, ...next });
    return <section aria-label="Service page content" className={pageClass}>
      <div>
        <PageHeading title="Contact">Edit /pages/contact. Changes stay in your draft until published. Contact destinations and enquiry handling are managed separately.</PageHeading>
        <FieldGrid>{field("Contact page title", data.title, 160, title => patch({ title }))}</FieldGrid>
      </div>
      <Sections name="Contact" items={data.sections} labels={contactLabels} onChange={sections => patch({ sections })} />
      <div>
        <SectionHeading description="Open a section to edit its text.">Section content</SectionHeading>
        <PanelStack>
          <ContentPanel title="Introduction"><FieldGrid>
            {field("Contact eyebrow", data.eyebrow, 160, eyebrow => patch({ eyebrow }))}
            {field("Contact heading", data.heading, 300, heading => patch({ heading }))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Help introduction"><FieldGrid>
            {field("Contact help eyebrow", data.helpEyebrow, 300, helpEyebrow => patch({ helpEyebrow }))}
            {field("Contact help heading", data.helpHeading, 160, helpHeading => patch({ helpHeading }))}
          </FieldGrid></ContentPanel>
          {data.categories.map(category => {
            const label = categoryLabels[category.key];
            const change = (next: Partial<typeof category>) => patch({ categories: data.categories.map(item => item.key === category.key ? { ...item, ...next } : item) });
            return <ContentPanel key={category.key} title={`${label} questions`}>
              <FieldGrid>
                {field(`Contact ${label} category title`, category.title, 160, title => change({ title }))}
                {field(`Contact ${label} category subtitle`, category.subtitle, 300, subtitle => change({ subtitle }))}
              </FieldGrid>
              {category.questions.map(question => <FieldGroup key={question.key} legend={`Question ${question.key.slice(1)}`}>
                {field(`Contact ${label} question ${question.key.slice(1)}`, question.question, 300, value => change({ questions: category.questions.map(item => item.key === question.key ? { ...item, question: value } : item) }))}
                {field(`Contact ${label} answer ${question.key.slice(1)}`, question.answer, 4000, answer => change({ questions: category.questions.map(item => item.key === question.key ? { ...item, answer } : item) }), true)}
              </FieldGroup>)}
            </ContentPanel>;
          })}
          <ContentPanel title="Cities"><FieldGrid>
            {field("Contact cities eyebrow", data.cities.eyebrow, 160, eyebrow => patch({ cities: { ...data.cities, eyebrow } }))}
            {field("Contact cities heading", data.cities.heading, 160, heading => patch({ cities: { ...data.cities, heading } }))}
          </FieldGrid></ContentPanel>
        </PanelStack>
      </div>
    </section>;
  }
  if (page === "bulk") {
    const data = content.bulk;
    const patch = (next: Partial<typeof data>) => update("bulk", { ...data, ...next });
    return <section aria-label="Service page content" className={pageClass}>
      <div>
        <PageHeading title="Bulk Enquiry">Edit /pages/bulk-enquiry. Changes stay in your draft until published. Images, business destinations and form requirements stay attached to the original template.</PageHeading>
        <FieldGrid>{field("Bulk page title", data.title, 160, title => patch({ title }))}</FieldGrid>
      </div>
      <Sections name="Bulk" items={data.sections} labels={bulkLabels} onChange={sections => patch({ sections })} />
      <div>
        <SectionHeading description="Open a section to edit its text.">Section content</SectionHeading>
        <PanelStack>
          <ContentPanel title="Hero"><FieldGrid>
            {field("Bulk eyebrow", data.eyebrow, 160, eyebrow => patch({ eyebrow }))}
            {field("Bulk heading", data.heading, 160, heading => patch({ heading }))}
            {field("Bulk subtitle", data.subtitle, 300, subtitle => patch({ subtitle }))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Trust"><FieldGrid>
            {field("Bulk trust heading", data.trust.heading, 300, heading => patch({ trust: { ...data.trust, heading } }))}
            {field("Bulk project count", data.trust.metricValue, 80, metricValue => patch({ trust: { ...data.trust, metricValue } }))}
            {field("Bulk project count label", data.trust.metricLabel, 160, metricLabel => patch({ trust: { ...data.trust, metricLabel } }))}
            {data.trust.items.map(item => field(`Bulk ${trustLabels[item.key]} promise`, item.title, 160, title => patch({ trust: { ...data.trust, items: data.trust.items.map(entry => entry.key === item.key ? { ...entry, title } : entry) } })))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Process">
            <FieldGrid>
              {field("Bulk process eyebrow", data.process.eyebrow, 300, eyebrow => patch({ process: { ...data.process, eyebrow } }))}
              {field("Bulk process heading", data.process.heading, 160, heading => patch({ process: { ...data.process, heading } }))}
            </FieldGrid>
            {data.process.steps.map(step => <FieldGroup key={step.key} legend={stepLabels[step.key]}>
              {field(`Bulk ${stepLabels[step.key]} step title`, step.title, 160, title => patch({ process: { ...data.process, steps: data.process.steps.map(item => item.key === step.key ? { ...item, title } : item) } }))}
              {field(`Bulk ${stepLabels[step.key]} step body`, step.body, 3000, body => patch({ process: { ...data.process, steps: data.process.steps.map(item => item.key === step.key ? { ...item, body } : item) } }), true)}
            </FieldGroup>)}
          </ContentPanel>
          <ContentPanel title="Business"><FieldGrid>
            {field("Bulk business badge", data.business.badge, 160, badge => patch({ business: { ...data.business, badge } }))}
            {field("Bulk business heading", data.business.heading, 160, heading => patch({ business: { ...data.business, heading } }))}
            {field("Bulk business body", data.business.body, 4000, body => patch({ business: { ...data.business, body } }), true)}
            {data.business.features.map((value, index) => field(`Bulk business feature ${index + 1}`, value, 200, value => patch({ business: { ...data.business, features: data.business.features.map((item, i) => i === index ? value : item) } })))}
            {field("Bulk business button", data.business.cta, 160, cta => patch({ business: { ...data.business, cta } }))}
            {field("Bulk business trust text", data.business.trust, 160, trust => patch({ business: { ...data.business, trust } }))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Cities"><FieldGrid>
            {field("Bulk cities eyebrow", data.cities.eyebrow, 160, eyebrow => patch({ cities: { ...data.cities, eyebrow } }))}
            {field("Bulk cities heading", data.cities.heading, 160, heading => patch({ cities: { ...data.cities, heading } }))}
          </FieldGrid></ContentPanel>
        </PanelStack>
      </div>
    </section>;
  }
  const data = content.returns;
  const patch = (next: Partial<typeof data>) => update("returns", { ...data, ...next });
  return <section aria-label="Service page content" className={pageClass}>
    <div>
      <PageHeading title="Return & Exchange">Edit /pages/returns. The policy destination and enquiry-only explanation stay in place.</PageHeading>
      <FieldGrid>
        {field("Returns page title", data.title, 160, title => patch({ title }))}
        {field("Returns heading", data.heading, 160, heading => patch({ heading }))}
        {field("Returns policy link label", data.policyLabel, 160, policyLabel => patch({ policyLabel }))}
        {field("Returns introduction", data.intro, 1000, intro => patch({ intro }), true)}
      </FieldGrid>
    </div>
    <Notice tone="info">Editing this page does not approve returns or issue refunds.</Notice>
  </section>;
}
