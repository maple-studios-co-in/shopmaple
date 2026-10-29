"use client";
import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import type { HomeDetails } from "@shopmaple/contracts";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { Button } from "@/components/ui/button";
import { Notice } from "./crm-primitives";
import { Field } from "./field";
import { FieldGrid, FieldGroup, RemoveButton, SectionHeading } from "./kit";
import { ContentPanel, PanelStack } from "./service-page-fields";

const tileNames = { sofas: "Sofas", chairs: "Chairs", tables: "Tables", beds: "Beds" };
const valueNames = { "quiet-luxury": "Quiet luxury", "real-living": "Real living", "ages-beautifully": "Ages beautifully", strength: "Strength" };
export function HomeDetailsFields({ value, onChange }: {
  value?: HomeDetails;
  onChange: (value: HomeDetails) => void;
}) {
  const page = resolveHomeDetails(value);
  const paragraphFields = useRef<HTMLDivElement>(null);
  const addParagraph = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | "add" | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "add") addParagraph.current?.focus();
    else paragraphFields.current?.querySelectorAll("textarea")[target]?.focus();
    pendingFocus.current = null;
  }, [page.testimonial.paragraphs.length]);
  function update<K extends keyof HomeDetails>(key: K, value: HomeDetails[K]) {
    onChange({ ...page, [key]: value });
  }
  const field = (label: string, value: string, maxLength: number, onChange: (value: string) => void, multiline = false) => (
    <Field key={label} label={label} value={value} maxLength={maxLength} onChange={onChange} multiline={multiline} />
  );
  return (
    <section aria-label="Homepage section content">
      <SectionHeading description="Open a section to edit its text. Changes appear on the storefront only after publishing.">Section content</SectionHeading>
      <PanelStack>
        <ContentPanel data-preview-section="hero" title="Hero">
          <FieldGrid>{field("Hero collection button", page.hero.cta, 80, cta => update("hero", { ...page.hero, cta }))}</FieldGrid>
          <div className="grid gap-3 sm:grid-cols-2">
            {page.hero.tiles.map(tile => (
              <FieldGroup key={tile.key} legend={tileNames[tile.key]}>
                {field(`${tileNames[tile.key]} tile label`, tile.label, 80, label => update("hero", { ...page.hero, tiles: page.hero.tiles.map(item => item.key === tile.key ? { ...item, label } : item) }))}
                {field(`${tileNames[tile.key]} starting-price label`, tile.priceLabel, 80, priceLabel => update("hero", { ...page.hero, tiles: page.hero.tiles.map(item => item.key === tile.key ? { ...item, priceLabel } : item) }))}
              </FieldGroup>
            ))}
          </div>
          <Notice tone="info">Starting-price labels are display text. Product prices and availability are managed in Keeri.</Notice>
        </ContentPanel>
        <ContentPanel data-preview-section="difference" title="The Maple Difference">
          <FieldGrid>
            {field("Difference eyebrow", page.difference.eyebrow, 160, eyebrow => update("difference", { ...page.difference, eyebrow }))}
            {field("Difference heading", page.difference.heading, 160, heading => update("difference", { ...page.difference, heading }))}
            {field("Difference button", page.difference.cta, 80, cta => update("difference", { ...page.difference, cta }))}
            {page.difference.promises.map((value, index) => field(`Difference promise ${index + 1}`, value, 160, value => update("difference", { ...page.difference, promises: page.difference.promises.map((item, i) => i === index ? value : item) })))}
          </FieldGrid>
        </ContentPanel>
        <ContentPanel data-preview-section="nimbus" title="Nimbus">
          <FieldGrid>
            {field("Nimbus heading", page.nimbus.heading, 160, heading => update("nimbus", { ...page.nimbus, heading }))}
            {field("Nimbus tagline", page.nimbus.tagline, 300, tagline => update("nimbus", { ...page.nimbus, tagline }))}
            {field("Nimbus button", page.nimbus.cta, 80, cta => update("nimbus", { ...page.nimbus, cta }))}
            {page.nimbus.features.map((value, index) => field(`Nimbus feature ${index + 1}`, value, 160, value => update("nimbus", { ...page.nimbus, features: page.nimbus.features.map((item, i) => i === index ? value : item) })))}
          </FieldGrid>
        </ContentPanel>
        <ContentPanel data-preview-section="testimonial" title="Customer testimonial">
          <Notice tone="info">Use only approved customer wording and attribution.</Notice>
          <FieldGrid ref={paragraphFields}>
            {field("Testimonial title", page.testimonial.title, 160, title => update("testimonial", { ...page.testimonial, title }))}
            {field("Testimonial customer name", page.testimonial.name, 120, name => update("testimonial", { ...page.testimonial, name }))}
            {field("Testimonial attribution", page.testimonial.attribution, 160, attribution => update("testimonial", { ...page.testimonial, attribution }))}
            {page.testimonial.paragraphs.map((value, index) => (
              <div key={index} data-span="full" className="flex min-w-0 items-start gap-2">
                <Field className="flex-1" label={`Testimonial paragraph ${index + 1}`} value={value} maxLength={2000} multiline
                  onChange={value => update("testimonial", { ...page.testimonial, paragraphs: page.testimonial.paragraphs.map((item, i) => i === index ? value : item) })} />

                <RemoveButton className="mt-7" label={`Remove testimonial paragraph ${index + 1}`} disabled={page.testimonial.paragraphs.length === 1} onClick={() => {
                  pendingFocus.current = "add";
                  update("testimonial", { ...page.testimonial, paragraphs: page.testimonial.paragraphs.filter((_, i) => i !== index) });
                }} />
              </div>
            ))}
          </FieldGrid>
          <div>
            <Button type="button" variant="outline" size="sm" ref={addParagraph} disabled={page.testimonial.paragraphs.length === 6} onClick={() => {
              pendingFocus.current = page.testimonial.paragraphs.length;
              update("testimonial", { ...page.testimonial, paragraphs: [...page.testimonial.paragraphs, ""] });
            }}><Plus aria-hidden="true" strokeWidth={1.5} />Add testimonial paragraph</Button>
          </div>
        </ContentPanel>
        <ContentPanel data-preview-section="newsletter" title="Newsletter">
          <FieldGrid>
            {field("Newsletter heading", page.newsletter.heading, 160, heading => update("newsletter", { ...page.newsletter, heading }))}
            {field("Newsletter signup heading", page.newsletter.signupHeading, 160, signupHeading => update("newsletter", { ...page.newsletter, signupHeading }))}
            {field("Newsletter body", page.newsletter.body, 2000, body => update("newsletter", { ...page.newsletter, body }), true)}
          </FieldGrid>
        </ContentPanel>
        <ContentPanel data-preview-section="values" title="Values">
          <div className="grid gap-3">
            {page.values.map(value => (
              <FieldGroup key={value.key} legend={valueNames[value.key]}>
                {field(`${valueNames[value.key]} title`, value.title, 160, title => update("values", page.values.map(item => item.key === value.key ? { ...item, title } : item)))}
                {field(`${valueNames[value.key]} body`, value.body, 2000, body => update("values", page.values.map(item => item.key === value.key ? { ...item, body } : item)), true)}
              </FieldGroup>
            ))}
          </div>
        </ContentPanel>
        <ContentPanel data-preview-section="cities" title="Cities">
          <FieldGrid>
            {field("Cities eyebrow", page.cities.eyebrow, 160, eyebrow => update("cities", { ...page.cities, eyebrow }))}
            {field("Cities heading", page.cities.heading, 160, heading => update("cities", { ...page.cities, heading }))}
          </FieldGrid>
        </ContentPanel>
        <ContentPanel data-preview-section="project" title="Project introduction">
          <FieldGrid>
            {field("Project heading", page.project.heading, 160, heading => update("project", { ...page.project, heading }))}
            {field("Project response time", page.project.responseTime, 80, responseTime => update("project", { ...page.project, responseTime }))}
            {field("Project text before response time", page.project.introBefore, 1000, introBefore => update("project", { ...page.project, introBefore }), true)}
            {field("Project text after response time", page.project.introAfter, 1000, introAfter => update("project", { ...page.project, introAfter }), true)}
            {field("Project body", page.project.body, 2000, body => update("project", { ...page.project, body }), true)}
          </FieldGrid>
          <Notice tone="info">Spacing around the highlighted response time is added automatically. This text does not change enquiry handling.</Notice>
        </ContentPanel>
      </PanelStack>
    </section>
  );
}
