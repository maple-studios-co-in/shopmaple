"use client";
import type { StoryPageContent, StorySectionKey } from "@shopmaple/contracts";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import { Field } from "./field";
import { FieldGrid, FieldGroup, Prose, SectionHeading } from "./kit";
import { ToggleRows } from "./service-page-fields";

const labels: Record<StorySectionKey, string> = {
  hero: "Hero", "belief-film": "Belief and film", journey: "Journey", cities: "Cities",
};
export function StoryFields({ value, onChange }: {
  value?: StoryPageContent;
  onChange: (value: StoryPageContent) => void;
}) {
  const page = resolveStoryPageContent(value);
  function update(patch: Partial<StoryPageContent>) {
    onChange({ ...page, ...patch });
  }
  return (
    <section aria-label="Our Story page content" className="grid gap-6">
      <div>
        <SectionHeading className="mt-2" description="Edit the existing /pages/our-story page. Changes stay in your draft until published. Original images and video stay in place.">Our Story</SectionHeading>
        <FieldGrid>
          <Field label="Our Story page title" value={page.title} maxLength={160} onChange={title => update({ title })} />
          <Field label="Our Story tagline" value={page.tagline} maxLength={300} onChange={tagline => update({ tagline })} />
          <Field label="Our Story hero heading" value={page.heroHeading.join("\n")} multiline maxLength={482} onChange={value => update({ heroHeading: value.split("\n") })} />
          <Field label="Our Story belief eyebrow" value={page.beliefEyebrow} maxLength={160} onChange={beliefEyebrow => update({ beliefEyebrow })} />
          <Field label="Our Story journey heading" value={page.journeyHeading} maxLength={160} onChange={journeyHeading => update({ journeyHeading })} />
          <Field label="Our Story belief heading" value={page.beliefHeading.join("\n")} multiline maxLength={482} onChange={value => update({ beliefHeading: value.split("\n") })} />
          <Field label="Our Story belief body" value={page.beliefBody} multiline maxLength={8000} onChange={beliefBody => update({ beliefBody })} />
          <Field label="Our Story film heading" value={page.filmHeading.join("\n")} multiline maxLength={482} onChange={value => update({ filmHeading: value.split("\n") })} />
        </FieldGrid>
        <Prose className="mt-3 text-[12.5px]">Use one line per heading line, up to three. Text displays as text, including any HTML.</Prose>
      </div>
      <div>
        <SectionHeading description="Drag sections into order or use the Move buttons. The page heading stays available to screen readers when the hero is hidden.">Sections</SectionHeading>
        <ToggleRows items={page.sections} name={section => `Our Story ${labels[section.key]}`} label={section => labels[section.key]}
          onChange={sections => update({ sections })} />
      </div>
      <div>
        <SectionHeading>Journey</SectionHeading>
        <div className="grid gap-3">
          {page.timeline.map((item, index) => {
            function chapter(patch: Partial<StoryPageContent["timeline"][number]>) {
              update({ timeline: page.timeline.map(entry => entry.key === item.key ? { ...entry, ...patch } : entry) });
            }
            return (
              <FieldGroup key={item.key} legend={`Chapter ${index + 1}`}>
                <FieldGrid>
                  <Field label={`Our Story chapter ${index + 1} date`} value={item.date} maxLength={80} onChange={date => chapter({ date })} />
                  <Field label={`Our Story chapter ${index + 1} title`} value={item.title} maxLength={160} onChange={title => chapter({ title })} />
                  <Field label={`Our Story chapter ${index + 1} body`} value={item.body} multiline maxLength={3000} onChange={body => chapter({ body })} />
                </FieldGrid>
              </FieldGroup>
            );
          })}
        </div>
      </div>
    </section>
  );
}
