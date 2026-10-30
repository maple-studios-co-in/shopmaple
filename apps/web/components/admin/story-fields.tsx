"use client";
import type { StoryPageContent, StorySectionKey } from "@shopmaple/contracts";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import { Field } from "./field";
import { GroupedFields, PageEditor, Prose, SectionHeading, SectionToggles, TextFields } from "./kit";

const labels: Record<StorySectionKey, string> = { hero: "Hero", "belief-film": "Belief and film", journey: "Journey", cities: "Cities" };
export function StoryFields({ value, onChange }: { value?: StoryPageContent; onChange: (value: StoryPageContent) => void }) {
  const page = resolveStoryPageContent(value);
  const patch = (next: Partial<StoryPageContent>) => onChange({ ...page, ...next });
  /** A heading edited one line per heading line. */
  const lines = (label: string, key: "heroHeading" | "beliefHeading" | "filmHeading") => (
    <Field key={key} label={label} value={page[key].join("\n")} multiline maxLength={482} onChange={value => patch({ [key]: value.split("\n") })} />
  );
  return (
    <PageEditor label="Our Story page content" title="Our Story"
      description="Edit the existing /pages/our-story page. Changes stay in your draft until published. Original images and video stay in place."
      intro={<>
        <TextFields value={page} onChange={onChange} fields={[
          ["title", "Our Story page title", 160], ["tagline", "Our Story tagline", 300], lines("Our Story hero heading", "heroHeading"),
          ["beliefEyebrow", "Our Story belief eyebrow", 160], ["journeyHeading", "Our Story journey heading", 160],
          lines("Our Story belief heading", "beliefHeading"), ["beliefBody", "Our Story belief body", 8000, true], lines("Our Story film heading", "filmHeading"),
        ]} />
        <Prose className="mt-3 text-xs">Use one line per heading line, up to three. Text displays as text, including any HTML.</Prose>
      </>}>
      <SectionToggles prefix="Our Story" labels={labels} items={page.sections} onChange={sections => patch({ sections })}
        description="Drag sections into order or use the Move buttons. The page heading stays available to screen readers when the hero is hidden." />
      <div>
        <SectionHeading>Journey</SectionHeading>
        <div className="grid gap-3">
          <GroupedFields grid items={page.timeline} legend={(_, index) => `Chapter ${index + 1}`} onChange={timeline => patch({ timeline })} fields={(_, index) => [
            ["date", `Our Story chapter ${index + 1} date`, 80], ["title", `Our Story chapter ${index + 1} title`, 160],
            ["body", `Our Story chapter ${index + 1} body`, 3000, true],
          ]} />
        </div>
      </div>
    </PageEditor>
  );
}
