"use client";
import type { StorefrontContent } from "@shopmaple/contracts";
import { Field } from "./field";
import { HomeCitiesLayoutFields } from "./home-cities-layout-fields";
import { HomeDetailsFields } from "./home-details-fields";
import { CheckField, FieldGrid, PanelHeader, SectionHeading } from "./kit";
import { sectionName, type HomeSectionKey } from "@/lib/section-thumbnails";
import type { StaffSession } from "./dashboard";
import { SectionInspector } from "./section-inspector";
import { SectionRail, type ThumbnailSource } from "./section-rail";

type Copy = StorefrontContent["homeCopy"];
const copyLabels: Record<keyof Copy, string> = {
  categoryHeading: "Category heading",
  bestsellersHeading: "Bestsellers heading",
  chairsHeading: "Chairs heading",
  socialHeading: "Social heading",
  ticker: "Brand ticker",
  testimonialHeading: "Testimonial heading",
  testimonialSubheading: "Testimonial subheading",
};
const copyLimit = (key: keyof Copy) => key === "ticker" ? 600 : key === "testimonialSubheading" ? 300 : 160;
export const titleCase = sectionName;

export function HomepagePanel({ content, edit, focusedSection, onSelectSection, inspecting, onInspect, session, onExpired, onScheduleEditingChange, scheduleEditing, thumbnails }: {
  content: StorefrontContent;
  edit: (next: StorefrontContent) => void;
  focusedSection: string | null;
  onSelectSection: (section: string) => void;
  /** The section whose inspector fills this column, or null for the section list. */
  inspecting: HomeSectionKey | null;
  onInspect: (section: HomeSectionKey | null) => void;
  session: StaffSession;
  onExpired: () => void;
  onScheduleEditingChange: (editing: boolean) => void;
  scheduleEditing: boolean;
  thumbnails: ThumbnailSource;
}) {
  if (inspecting) {
    const back = () => {
      onInspect(null);
      // Back on the list, the section's own Edit button takes focus again.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-section-card="${inspecting}"] [data-section-edit]`)?.focus());
    };
    return <SectionInspector key={inspecting} section={inspecting} content={content} edit={edit} session={session} onExpired={onExpired}
      onScheduleEditingChange={onScheduleEditingChange} locked={scheduleEditing} onBack={back} />;
  }
  const copyField = (key: keyof Copy) => (
    <Field
      key={key}
      label={copyLabels[key]}
      value={content.homeCopy[key] ?? "Chairs"}
      multiline={key === "ticker"}
      maxLength={copyLimit(key)}
      onChange={(value) => edit({ ...content, homeCopy: { ...content.homeCopy, [key]: value } })}
    />
  );
  const motion = (key: keyof StorefrontContent["motion"], fallback: boolean) => ({
    checked: content.motion[key] ?? fallback,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => edit({ ...content, motion: { ...content.motion, [key]: event.target.checked } }),
  });
  return (
    <>
      <PanelHeader
        title="Homepage"
        description="Each card is the section as your draft draws it. Drag or use the Move buttons to reorder and untick to hide. Edit opens everything a section shows: its text, artwork, layout and motion. Edit in the live preview opens the same."
      />
      <SectionHeading className="mb-2">Sections</SectionHeading>
      <SectionRail content={content} edit={edit} selected={focusedSection} onSelect={onSelectSection} onInspect={onInspect} source={thumbnails} />
      <SectionHeading>Homepage copy</SectionHeading>
      <FieldGrid>{(Object.keys(copyLabels) as (keyof Copy)[]).map(copyField)}</FieldGrid>
      <HomeDetailsFields value={content.homeDetails} onChange={(homeDetails) => edit({ ...content, homeDetails })} session={session} onExpired={onExpired} />
      <HomeCitiesLayoutFields value={content.homeCitiesLayout} onChange={(homeCitiesLayout) => edit({ ...content, homeCitiesLayout })} />
      <SectionHeading description="Visitors can pause motion. Their reduced-motion preference takes priority.">Motion</SectionHeading>
      <div className="grid gap-3">
        <CheckField label="Automatically move the homepage ticker" {...motion("autoplayTicker", true)} />
        <CheckField label="Automatically move Instagram posts" {...motion("autoplaySocial", true)} />
        <CheckField label="Automatically move city illustrations" {...motion("autoplayCities", true)} />
        <CheckField label="Section reveal effects" {...motion("revealSections", false)} />
      </div>
    </>
  );
}
