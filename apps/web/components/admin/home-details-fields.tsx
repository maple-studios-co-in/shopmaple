"use client";
import { Plus } from "lucide-react";
import type { HomeDetails } from "@shopmaple/contracts";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { Notice } from "./crm-primitives";
import { Field } from "./field";
import { ActionButton, ContentPanel, ContentPanels, GroupedFields, RemoveButton, TextFields, listFields, usePendingFocus } from "./kit";

const tileNames = { sofas: "Sofas", chairs: "Chairs", tables: "Tables", beds: "Beds" };
const valueNames = { "quiet-luxury": "Quiet luxury", "real-living": "Real living", "ages-beautifully": "Ages beautifully", strength: "Strength" };
export type HomeDetailSection = "hero" | "difference" | "nimbus" | "testimonial" | "newsletter" | "values" | "cities" | "project";
const detailTitles: Record<HomeDetailSection, string> = {
  hero: "Hero", difference: "The Maple Difference", nimbus: "Nimbus", testimonial: "Customer testimonial",
  newsletter: "Newsletter", values: "Values", cities: "Cities", project: "Project introduction",
};

/** Every homepage section's text, as collapsible panels. */
export function HomeDetailsFields({ value, onChange }: { value?: HomeDetails; onChange: (value: HomeDetails) => void }) {
  return (
    <section aria-label="Homepage section content">
      <ContentPanels description="Open a section to edit its text. Changes appear on the storefront only after publishing.">
        {(Object.keys(detailTitles) as HomeDetailSection[]).map(section => (
          <ContentPanel key={section} data-preview-section={section} title={detailTitles[section]}>
            <HomeDetailFields section={section} value={value} onChange={onChange} />
          </ContentPanel>
        ))}
      </ContentPanels>
    </section>
  );
}

/** One homepage section's text fields; the section inspector and the panels above share them. */
export function HomeDetailFields({ section, value, onChange }: { section: HomeDetailSection; value?: HomeDetails; onChange: (value: HomeDetails) => void }) {
  const page = resolveHomeDetails(value);
  const update = <K extends keyof HomeDetails>(key: K, next: HomeDetails[K]) => onChange({ ...page, [key]: next });
  const { hero, difference, nimbus } = page;
  switch (section) {
    case "hero": return <>
      <TextFields value={hero} onChange={next => update("hero", next)} fields={[["cta", "Hero collection button", 80]]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <GroupedFields items={hero.tiles} legend={tile => tileNames[tile.key]} onChange={tiles => update("hero", { ...hero, tiles })}
          fields={tile => [["label", `${tileNames[tile.key]} tile label`, 80], ["priceLabel", `${tileNames[tile.key]} starting-price label`, 80]]} />
      </div>
      <Notice tone="info">Starting-price labels are display text. Product prices and availability are managed in Keeri.</Notice>
    </>;
    case "difference": return <TextFields value={difference} onChange={next => update("difference", next)} fields={[
      ["eyebrow", "Difference eyebrow", 160], ["heading", "Difference heading", 160], ["cta", "Difference button", 80],
      ...listFields(difference.promises, index => `Difference promise ${index + 1}`, 160, promises => update("difference", { ...difference, promises })),
    ]} />;
    case "nimbus": return <TextFields value={nimbus} onChange={next => update("nimbus", next)} fields={[
      ["heading", "Nimbus heading", 160], ["tagline", "Nimbus tagline", 300], ["cta", "Nimbus button", 80],
      ...listFields(nimbus.features, index => `Nimbus feature ${index + 1}`, 160, features => update("nimbus", { ...nimbus, features })),
    ]} />;
    case "testimonial": return <TestimonialFields value={page.testimonial} onChange={next => update("testimonial", next)} />;
    case "newsletter": return <TextFields value={page.newsletter} onChange={next => update("newsletter", next)} fields={[
      ["heading", "Newsletter heading", 160], ["signupHeading", "Newsletter signup heading", 160], ["body", "Newsletter body", 2000, true],
    ]} />;
    case "values": return <div className="grid gap-3">
      <GroupedFields items={page.values} legend={item => valueNames[item.key]} onChange={values => update("values", values)}
        fields={item => [["title", `${valueNames[item.key]} title`, 160], ["body", `${valueNames[item.key]} body`, 2000, true]]} />
    </div>;
    case "cities": return <TextFields value={page.cities} onChange={next => update("cities", next)} fields={[["eyebrow", "Cities eyebrow", 160], ["heading", "Cities heading", 160]]} />;
    case "project": return <>
      <TextFields value={page.project} onChange={next => update("project", next)} fields={[
        ["heading", "Project heading", 160], ["responseTime", "Project response time", 80],
        ["introBefore", "Project text before response time", 1000, true], ["introAfter", "Project text after response time", 1000, true],
        ["body", "Project body", 2000, true],
      ]} />
      <Notice tone="info">Spacing around the highlighted response time is added automatically. This text does not change enquiry handling.</Notice>
    </>;
  }
}

function TestimonialFields({ value: testimonial, onChange }: { value: HomeDetails["testimonial"]; onChange: (value: HomeDetails["testimonial"]) => void }) {
  const focus = usePendingFocus<number | "add">(testimonial.paragraphs.length);
  function paragraphs(next: string[], target: number | "add" | null = null) {
    focus.focusAfter(target);
    onChange({ ...testimonial, paragraphs: next });
  }
  return <>
    <Notice tone="info">Use only approved customer wording and attribution.</Notice>
    <TextFields value={testimonial} onChange={onChange} fields={[
      ["title", "Testimonial title", 160], ["name", "Testimonial customer name", 120], ["attribution", "Testimonial attribution", 160],
      ...testimonial.paragraphs.map((paragraph, index) => (
        <div key={index} data-span="full" className="flex min-w-0 items-start gap-2"
          ref={node => focus.track(index)(node?.querySelector("textarea") ?? null)}>
          <Field className="flex-1" label={`Testimonial paragraph ${index + 1}`} value={paragraph} maxLength={2000} multiline
            onChange={value => paragraphs(testimonial.paragraphs.map((item, i) => i === index ? value : item))} />
          <RemoveButton className="mt-7" label={`Remove testimonial paragraph ${index + 1}`} disabled={testimonial.paragraphs.length === 1}
            onClick={() => paragraphs(testimonial.paragraphs.filter((_, i) => i !== index), "add")} />
        </div>
      )),
    ]} />
    <div>
      <ActionButton icon={Plus} ref={focus.track("add")} disabled={testimonial.paragraphs.length === 6}
        onClick={() => paragraphs([...testimonial.paragraphs, ""], testimonial.paragraphs.length)}>Add testimonial paragraph</ActionButton>
    </div>
  </>;
}
