"use client";
import type { StorefrontContent } from "@shopmaple/contracts";
import { Field } from "./field";
import { HomeCitiesLayoutFields } from "./home-cities-layout-fields";
import { HomeDetailsFields } from "./home-details-fields";
import { CheckField, FieldGrid, PanelHeader, SectionHeading } from "./kit";
import { sectionName } from "@/lib/section-thumbnails";
import { SectionRail, type SectionScreen, type ThumbnailSource } from "./section-rail";

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

export function HomepagePanel({ content, edit, focusedSection, onSelectSection, onOpenScreen, thumbnails }: {
  content: StorefrontContent;
  edit: (next: StorefrontContent) => void;
  focusedSection: string | null;
  onSelectSection: (section: string) => void;
  onOpenScreen: (screen: SectionScreen) => void;
  thumbnails: ThumbnailSource;
}) {
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
        description="Each card is the section as your draft draws it. Drag or use the Move buttons to reorder, untick to hide, and choose Edit to change its content. Select a section, here or with Edit in the live preview, to find it on the page."
      />
      <SectionHeading className="mb-2">Sections</SectionHeading>
      <SectionRail content={content} edit={edit} selected={focusedSection} onSelect={onSelectSection} onOpenScreen={onOpenScreen} source={thumbnails} />
      <SectionHeading>Homepage copy</SectionHeading>
      <FieldGrid>{(Object.keys(copyLabels) as (keyof Copy)[]).map(copyField)}</FieldGrid>
      <HomeDetailsFields value={content.homeDetails} onChange={(homeDetails) => edit({ ...content, homeDetails })} />
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
