"use client";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import type { HomeDetails } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { ActionButton, ContentPanel, ContentPanels, GroupedFields, RemoveButton, TextFields, listFields, usePendingFocus } from "./kit";
import { MediaPicker } from "./media-picker";
import { ProductSearch } from "./product-search";

const tileNames = { sofas: "Sofas", chairs: "Chairs", tables: "Tables", beds: "Beds" };
const valueNames = { "quiet-luxury": "Quiet luxury", "real-living": "Real living", "ages-beautifully": "Ages beautifully", strength: "Strength" };
export type HomeDetailSection = "hero" | "difference" | "nimbus" | "testimonial" | "newsletter" | "values" | "cities" | "project" | "editorial" | "compare";
const detailTitles: Record<HomeDetailSection, string> = {
  hero: "Hero", difference: "The Maple Difference", nimbus: "Nimbus", testimonial: "Customer testimonial",
  newsletter: "Newsletter", values: "Values", cities: "Cities", project: "Project introduction",
  editorial: "Pull up a chair", compare: "Find your feel",
};
/** The panels on the Homepage screen. Pull up a chair and Find your feel are edited from their section's Edit button, which has the media library and catalogue search they need. */
const panelSections: HomeDetailSection[] = ["hero", "difference", "nimbus", "testimonial", "newsletter", "values", "cities", "project"];

/** Every homepage section's text, as collapsible panels. */
export function HomeDetailsFields({ value, onChange }: { value?: HomeDetails; onChange: (value: HomeDetails) => void }) {
  return (
    <section aria-label="Homepage section content">
      <ContentPanels description="Open a section to edit its text. Changes appear on the storefront only after publishing.">
        {panelSections.map(section => (
          <ContentPanel key={section} data-preview-section={section} title={detailTitles[section]}>
            <HomeDetailFields section={section} value={value} onChange={onChange} />
          </ContentPanel>
        ))}
      </ContentPanels>
    </section>
  );
}

/** One homepage section's text fields; the section inspector and the panels above share them. */
export function HomeDetailFields({ section, value, onChange, session, onExpired }: {
  section: HomeDetailSection; value?: HomeDetails; onChange: (value: HomeDetails) => void;
  /** Staff session and expiry handler, for the media library and catalogue search a section may use. */
  session?: StaffSession; onExpired?: () => void;
}) {
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
    case "editorial": {
      const { editorial } = page;
      const next = (patch: Partial<typeof editorial>) => update("editorial", { ...editorial, ...patch });
      return <>
        <TextFields value={editorial} onChange={next => update("editorial", next)} fields={[
          ["title", "Editorial title", 120], ["text", "Editorial text", 300, true], ["cta", "Editorial button", 80], ["href", "Editorial link", 500],
          ["leftAlt", "Left image description", 200], ["rightAlt", "Right image description", 200],
          ...(session && onExpired ? [] : [["leftImage", "Left image address", 1000], ["rightImage", "Right image address", 1000]] as const),
        ]} />
        {/* Both photos are required, so clearing one keeps the one already chosen. */}
        {session && onExpired && <>
          <MediaPicker label="Left image" value={editorial.leftImage} onChange={url => url && next({ leftImage: url })} session={session} onExpired={onExpired} />
          <MediaPicker label="Right image" value={editorial.rightImage} onChange={url => url && next({ rightImage: url })} session={session} onExpired={onExpired} />
        </>}
      </>;
    }
    case "compare": return <CompareFields value={page.compare} onChange={next => update("compare", next)} onExpired={onExpired} />;
  }
}

const sideNames = { left: "Left", right: "Right" } as const;
/** Find your feel: the header's words, then the two products, each chosen from the catalogue with its own label. */
function CompareFields({ value: compare, onChange, onExpired }: { value: NonNullable<HomeDetails["compare"]>; onChange: (value: NonNullable<HomeDetails["compare"]>) => void; onExpired?: () => void }) {
  const [searching, setSearching] = useState<"left" | "right" | null>(null);
  return <>
    <Notice tone="info">Both photos come from the catalogue: each product's first photo. If either product is missing or has no photo, this section is left out.</Notice>
    <TextFields value={compare} onChange={onChange} fields={[["eyebrow", "Compare eyebrow", 160], ["heading", "Compare heading", 160], ["lede", "Compare lede", 300, true]]} />
    <div className="grid gap-3 sm:grid-cols-2">
      {(["left", "right"] as const).map(side => <fieldset key={side} data-compare-side={side} className="grid min-w-0 content-start gap-4 rounded-lg border border-line-soft bg-surface p-4 sm:p-5">
        <legend className="float-left mb-1 w-full text-sm font-semibold text-foreground">{sideNames[side]} product</legend>
        <div className="clear-both grid gap-4">
          <p className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">{compare[side].handle}</p>
          <TextFields value={compare[side]} onChange={next => onChange({ ...compare, [side]: next })} fields={[["label", `${sideNames[side]} product label`, 80]]} />
          <div><ActionButton icon={Search} aria-expanded={searching === side} onClick={() => setSearching(searching === side ? null : side)}>Change {side} product</ActionButton></div>
        </div>
      </fieldset>)}
    </div>
    {searching && <ProductSearch onExpired={onExpired ?? (() => {})} actions={product => (
      <Button type="button" variant="outline" size="xs" aria-label={`Use ${product.title} as ${searching} product`}
        onClick={() => { onChange({ ...compare, [searching]: { ...compare[searching], handle: product.handle } }); setSearching(null); }}>Use as {searching} product</Button>
    )} />}
  </>;
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
