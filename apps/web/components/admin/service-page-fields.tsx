"use client";
import type { ServicePagesContent } from "@shopmaple/contracts";
import { resolveServicePages } from "@/lib/service-page-defaults";
import { Field } from "./forms";
import { SortableList } from "./sortable-list";

const contactLabels = { intro: "Introduction and form", help: "Help", cities: "Cities" };
const bulkLabels = { hero: "Hero and form", trust: "Trust", process: "Process", business: "Business", cities: "Cities" };
const categoryLabels = { tracking: "Tracking", payment: "Payment", account: "Account", warranty: "Warranty", damage: "Damage" };
const trustLabels = { price: "Price", quality: "Quality", materials: "Materials", custom: "Customization" };
const stepLabels = { meet: "Meet", design: "Design", deliver: "Deliver" };
function Sections<K extends string>({ name, items, labels, onChange }: {
  name: string; items: { key: K; enabled: boolean }[]; labels: Record<K, string>;
  onChange: (items: { key: K; enabled: boolean }[]) => void;
}) {
  return <><h3>Sections</h3><p>Drag sections into order, or use the Move buttons, and hide the ones you do not need. The page keeps an accessible heading.</p>
    <SortableList items={items} getId={item => item.key} getLabel={item => `${name} ${labels[item.key]}`} className="admin-section-list" onReorder={next => onChange(next)}
      renderItem={(item, index, handle) => <>
      {handle}
      <label><input type="checkbox" aria-label={`Show ${name} ${labels[item.key]}`} checked={item.enabled}
        onChange={event => onChange(items.map(entry => entry.key === item.key ? { ...entry, enabled: event.target.checked } : entry))} />
        <span>{labels[item.key]}</span></label>
      <div>{([-1, 1] as const).map(direction => <button key={direction} type="button"
        aria-label={`Move ${name} ${labels[item.key]} ${direction === -1 ? "up" : "down"}`}
        disabled={index + direction < 0 || index + direction >= items.length}
        onClick={() => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; onChange(next); }}>
        {direction === -1 ? "Move up" : "Move down"}</button>)}</div>
    </>} /></>;
}
const field = (label: string, value: string, maxLength: number, onChange: (value: string) => void, multiline = false) =>
  <Field key={label} label={label} value={value} maxLength={maxLength} onChange={onChange} multiline={multiline} />;
export function ServicePageFields({ value, page, onChange }: {
  value?: ServicePagesContent; page: keyof ServicePagesContent; onChange: (value: ServicePagesContent) => void;
}) {
  const content = resolveServicePages(value);
  function update<K extends keyof ServicePagesContent>(key: K, value: ServicePagesContent[K]) { onChange({ ...content, [key]: value }); }
  if (page === "contact") {
    const data = content.contact;
    const patch = (next: Partial<typeof data>) => update("contact", { ...data, ...next });
    return <section aria-label="Service page content">
      <h2>Contact</h2><p>Edit /pages/contact. Changes stay in your draft until published. Contact destinations and enquiry handling are managed separately.</p>
      {field("Contact page title", data.title, 160, title => patch({ title }))}
      <Sections name="Contact" items={data.sections} labels={contactLabels} onChange={sections => patch({ sections })} />
      <details><summary>Introduction</summary><div className="admin-fields">
        {field("Contact eyebrow", data.eyebrow, 160, eyebrow => patch({ eyebrow }))}
        {field("Contact heading", data.heading, 300, heading => patch({ heading }))}
      </div></details>
      <details><summary>Help introduction</summary><div className="admin-fields">
        {field("Contact help eyebrow", data.helpEyebrow, 300, helpEyebrow => patch({ helpEyebrow }))}
        {field("Contact help heading", data.helpHeading, 160, helpHeading => patch({ helpHeading }))}
      </div></details>
      {data.categories.map(category => {
        const label = categoryLabels[category.key];
        const change = (next: Partial<typeof category>) => patch({ categories: data.categories.map(item => item.key === category.key ? { ...item, ...next } : item) });
        return <details key={category.key}><summary>{label} questions</summary><div className="admin-fields">
          {field(`Contact ${label} category title`, category.title, 160, title => change({ title }))}
          {field(`Contact ${label} category subtitle`, category.subtitle, 300, subtitle => change({ subtitle }))}
          {category.questions.map(question => <fieldset key={question.key}><legend>Question {question.key.slice(1)}</legend>
            {field(`Contact ${label} question ${question.key.slice(1)}`, question.question, 300, value => change({ questions: category.questions.map(item => item.key === question.key ? { ...item, question: value } : item) }))}
            {field(`Contact ${label} answer ${question.key.slice(1)}`, question.answer, 4000, answer => change({ questions: category.questions.map(item => item.key === question.key ? { ...item, answer } : item) }), true)}
          </fieldset>)}
        </div></details>;
      })}
      <details><summary>Cities</summary><div className="admin-fields">
        {field("Contact cities eyebrow", data.cities.eyebrow, 160, eyebrow => patch({ cities: { ...data.cities, eyebrow } }))}
        {field("Contact cities heading", data.cities.heading, 160, heading => patch({ cities: { ...data.cities, heading } }))}
      </div></details>
    </section>;
  }
  if (page === "bulk") {
    const data = content.bulk;
    const patch = (next: Partial<typeof data>) => update("bulk", { ...data, ...next });
    return <section aria-label="Service page content">
      <h2>Bulk Enquiry</h2><p>Edit /pages/bulk-enquiry. Changes stay in your draft until published. Images, business destinations and form requirements stay attached to the original template.</p>
      {field("Bulk page title", data.title, 160, title => patch({ title }))}
      <Sections name="Bulk" items={data.sections} labels={bulkLabels} onChange={sections => patch({ sections })} />
      <details><summary>Hero</summary><div className="admin-fields">
        {field("Bulk eyebrow", data.eyebrow, 160, eyebrow => patch({ eyebrow }))}
        {field("Bulk heading", data.heading, 160, heading => patch({ heading }))}
        {field("Bulk subtitle", data.subtitle, 300, subtitle => patch({ subtitle }))}
      </div></details>
      <details><summary>Trust</summary><div className="admin-fields">
        {field("Bulk trust heading", data.trust.heading, 300, heading => patch({ trust: { ...data.trust, heading } }))}
        {field("Bulk project count", data.trust.metricValue, 80, metricValue => patch({ trust: { ...data.trust, metricValue } }))}
        {field("Bulk project count label", data.trust.metricLabel, 160, metricLabel => patch({ trust: { ...data.trust, metricLabel } }))}
        {data.trust.items.map(item => field(`Bulk ${trustLabels[item.key]} promise`, item.title, 160, title => patch({ trust: { ...data.trust, items: data.trust.items.map(entry => entry.key === item.key ? { ...entry, title } : entry) } })))}
      </div></details>
      <details><summary>Process</summary><div className="admin-fields">
        {field("Bulk process eyebrow", data.process.eyebrow, 300, eyebrow => patch({ process: { ...data.process, eyebrow } }))}
        {field("Bulk process heading", data.process.heading, 160, heading => patch({ process: { ...data.process, heading } }))}
        {data.process.steps.map(step => <fieldset key={step.key}><legend>{stepLabels[step.key]}</legend>
          {field(`Bulk ${stepLabels[step.key]} step title`, step.title, 160, title => patch({ process: { ...data.process, steps: data.process.steps.map(item => item.key === step.key ? { ...item, title } : item) } }))}
          {field(`Bulk ${stepLabels[step.key]} step body`, step.body, 3000, body => patch({ process: { ...data.process, steps: data.process.steps.map(item => item.key === step.key ? { ...item, body } : item) } }), true)}
        </fieldset>)}
      </div></details>
      <details><summary>Business</summary><div className="admin-fields">
        {field("Bulk business badge", data.business.badge, 160, badge => patch({ business: { ...data.business, badge } }))}
        {field("Bulk business heading", data.business.heading, 160, heading => patch({ business: { ...data.business, heading } }))}
        {field("Bulk business body", data.business.body, 4000, body => patch({ business: { ...data.business, body } }), true)}
        {data.business.features.map((value, index) => field(`Bulk business feature ${index + 1}`, value, 200, value => patch({ business: { ...data.business, features: data.business.features.map((item, i) => i === index ? value : item) } })))}
        {field("Bulk business button", data.business.cta, 160, cta => patch({ business: { ...data.business, cta } }))}
        {field("Bulk business trust text", data.business.trust, 160, trust => patch({ business: { ...data.business, trust } }))}
      </div></details>
      <details><summary>Cities</summary><div className="admin-fields">
        {field("Bulk cities eyebrow", data.cities.eyebrow, 160, eyebrow => patch({ cities: { ...data.cities, eyebrow } }))}
        {field("Bulk cities heading", data.cities.heading, 160, heading => patch({ cities: { ...data.cities, heading } }))}
      </div></details>
    </section>;
  }
  const data = content.returns;
  const patch = (next: Partial<typeof data>) => update("returns", { ...data, ...next });
  return <section aria-label="Service page content">
    <h2>Return &amp; Exchange</h2><p>Edit /pages/returns. The policy destination and enquiry-only explanation stay in place.</p>
    <div className="admin-fields">
      {field("Returns page title", data.title, 160, title => patch({ title }))}
      {field("Returns heading", data.heading, 160, heading => patch({ heading }))}
      {field("Returns policy link label", data.policyLabel, 160, policyLabel => patch({ policyLabel }))}
      {field("Returns introduction", data.intro, 1000, intro => patch({ intro }), true)}
    </div>
    <p>Editing this page does not approve returns or issue refunds.</p>
  </section>;
}
