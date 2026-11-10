"use client";
import type { StoryPageContent, StorySectionKey } from "@shopmaple/contracts";
import { resolveStoryPageContent, type ResolvedStoryPage } from "@/lib/story-content-defaults";
import { Field } from "./field";
import { GroupedFields, PageEditor, Prose, SectionHeading, SectionToggles, TextFields } from "./kit";

const labels: Record<StorySectionKey, string> = {
  hero: "Hero", principles: "Principles", "belief-film": "Belief", journey: "Journey", cities: "Cities", invitation: "Invitation",
};
/** The Our Story page's words, region by region (the redesign of 10 Nov 2026); its photos are under Artwork. */
export function StoryFields({ value, onChange }: { value?: StoryPageContent; onChange: (value: StoryPageContent) => void }) {
  const page = resolveStoryPageContent(value);
  const patch = (next: Partial<ResolvedStoryPage>) => onChange({ ...page, ...next });
  const lines = (label: string, key: "heroHeading" | "beliefHeading") => (
    <Field key={key} label={label} value={page[key].join("\n")} multiline maxLength={482} onChange={value => patch({ [key]: value.split("\n") })} />
  );
  return (
    <PageEditor label="Our Story page content" title="Our Story"
      description="Edit the /our-story page. Changes stay in your draft until published. Its photos are in Artwork, under Our Story."
      intro={<>
        <TextFields value={page} onChange={onChange} fields={[["title", "Our Story page title", 160]]} />
        <Prose className="mt-3 text-xs">Use one line per heading line, up to three. A blank line in a longer text starts a new paragraph. Text displays as text, including any HTML.</Prose>
      </>}>
      <SectionToggles prefix="Our Story" labels={labels} items={page.sections} onChange={sections => patch({ sections })}
        description="Drag sections into order or use the Move buttons. The page heading stays available to screen readers when the hero is hidden, and the hero's button to the journey shows only while the journey does." />
      <div>
        <SectionHeading>Hero</SectionHeading>
        <TextFields value={page} onChange={onChange} fields={[
          ["heroEyebrow", "Our Story hero eyebrow", 160], lines("Our Story hero heading", "heroHeading"),
          ["tagline", "Our Story tagline", 300], ["heroCta", "Our Story hero button", 60],
          ["heroBody", "Our Story hero introduction", 600, true],
        ]} />
      </div>
      <div>
        <SectionHeading>Principles</SectionHeading>
        <div className="grid gap-3">
          <GroupedFields grid items={page.principles} legend={(_, index) => `Principle ${index + 1}`} onChange={principles => patch({ principles })} fields={(_, index) => [
            ["title", `Our Story principle ${index + 1} title`, 80], ["body", `Our Story principle ${index + 1} text`, 200],
          ]} />
        </div>
      </div>
      <div>
        <SectionHeading>Belief</SectionHeading>
        <TextFields value={page} onChange={onChange} fields={[
          ["beliefEyebrow", "Our Story belief eyebrow", 160], lines("Our Story belief heading", "beliefHeading"),
          ["beliefBody", "Our Story belief body", 8000, true],
        ]} />
      </div>
      <div>
        <SectionHeading description="Each chapter is a slide: its year under the slider, its title (a new line breaks it) and its story.">Journey</SectionHeading>
        <TextFields value={page} onChange={onChange} fields={[["journeyEyebrow", "Our Story journey eyebrow", 160], ["journeyHeading", "Our Story journey heading", 160]]} />
        <div className="mt-4 grid gap-3">
          <GroupedFields grid items={page.timeline} legend={(_, index) => `Chapter ${index + 1}`} onChange={timeline => patch({ timeline })} fields={(_, index) => [
            ["date", `Our Story chapter ${index + 1} date`, 80], ["title", `Our Story chapter ${index + 1} title`, 160, true],
            ["body", `Our Story chapter ${index + 1} body`, 3000, true],
          ]} />
        </div>
      </div>
      <div>
        <SectionHeading>Invitation</SectionHeading>
        <TextFields value={page} onChange={onChange} fields={[
          ["invitationHeading", "Our Story invitation heading", 200], ["invitationCta", "Our Story invitation button", 60],
          ["invitationBody", "Our Story invitation text", 400, true],
        ]} />
      </div>
    </PageEditor>
  );
}
