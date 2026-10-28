"use client";
import type { StoryPageContent, StorySectionKey } from "@shopmaple/contracts";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
import { Field } from "./forms";
import { SortableList } from "./sortable-list";

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
    <section aria-label="Our Story page content">
      <h2>Our Story</h2>
      <p>Edit the existing /pages/our-story page. Changes stay in your draft until published. Original images and video stay in place.</p>
      <div className="admin-fields">
        <Field label="Our Story page title" value={page.title} maxLength={160} onChange={title => update({ title })} />
        <Field label="Our Story hero heading" value={page.heroHeading.join("\n")} multiline maxLength={482} onChange={value => update({ heroHeading: value.split("\n") })} />
        <Field label="Our Story tagline" value={page.tagline} maxLength={300} onChange={tagline => update({ tagline })} />
        <Field label="Our Story belief eyebrow" value={page.beliefEyebrow} maxLength={160} onChange={beliefEyebrow => update({ beliefEyebrow })} />
        <Field label="Our Story belief heading" value={page.beliefHeading.join("\n")} multiline maxLength={482} onChange={value => update({ beliefHeading: value.split("\n") })} />
        <Field label="Our Story belief body" value={page.beliefBody} multiline maxLength={8000} onChange={beliefBody => update({ beliefBody })} />
        <Field label="Our Story film heading" value={page.filmHeading.join("\n")} multiline maxLength={482} onChange={value => update({ filmHeading: value.split("\n") })} />
        <Field label="Our Story journey heading" value={page.journeyHeading} maxLength={160} onChange={journeyHeading => update({ journeyHeading })} />
      </div>
      <p>Use one line per heading line, up to three. Text displays as text, including any HTML.</p>
      <h3>Sections</h3>
      <p>Drag sections into order or use the Move buttons. The page heading stays available to screen readers when the hero is hidden.</p>
      <SortableList items={page.sections} getId={section => section.key} getLabel={section => `Our Story ${labels[section.key]}`} className="admin-section-list"
        onReorder={sections => update({ sections })}
        renderItem={(section, index, handle) => (
          <>
            {handle}
            <label>
              <input type="checkbox" aria-label={`Show Our Story ${labels[section.key]}`} checked={section.enabled}
                onChange={event => update({ sections: page.sections.map(item => item.key === section.key ? { ...item, enabled: event.target.checked } : item) })} />
              <span>{labels[section.key]}</span>
            </label>
            <div>
              {([-1, 1] as const).map(direction => (
                <button key={direction} type="button" aria-label={`Move Our Story ${labels[section.key]} ${direction === -1 ? "up" : "down"}`}
                  disabled={index + direction < 0 || index + direction >= page.sections.length}
                  onClick={() => {
                    const sections = [...page.sections];
                    [sections[index], sections[index + direction]] = [sections[index + direction]!, sections[index]!];
                    update({ sections });
                  }}>
                  {direction === -1 ? "Move up" : "Move down"}
                </button>
              ))}
            </div>
          </>
        )}
      />
      <h3>Journey</h3>
      {page.timeline.map((item, index) => {
        function chapter(patch: Partial<StoryPageContent["timeline"][number]>) {
          update({ timeline: page.timeline.map(entry => entry.key === item.key ? { ...entry, ...patch } : entry) });
        }
        return (
          <fieldset key={item.key}>
            <legend>Chapter {index + 1}</legend>
            <div className="admin-fields">
              <Field label={`Our Story chapter ${index + 1} date`} value={item.date} maxLength={80} onChange={date => chapter({ date })} />
              <Field label={`Our Story chapter ${index + 1} title`} value={item.title} maxLength={160} onChange={title => chapter({ title })} />
              <Field label={`Our Story chapter ${index + 1} body`} value={item.body} multiline maxLength={3000} onChange={body => chapter({ body })} />
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
