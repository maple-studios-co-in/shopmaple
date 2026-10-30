"use client";
import type { StorefrontContent } from "@shopmaple/contracts";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import { HomeCitiesLayoutFields } from "./home-cities-layout-fields";
import { HomeDetailsFields } from "./home-details-fields";
import { CheckField, FieldGrid, MoveButtons, PanelHeader, SectionHeading, rowCard } from "./kit";
import { SortableList } from "./sortable-list";

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
export const titleCase = (value: string) =>
  value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function HomepagePanel({ content, edit, focusedSection }: {
  content: StorefrontContent;
  edit: (next: StorefrontContent) => void;
  focusedSection: string | null;
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
  const visible = content.homeSections.filter((section) => section.enabled).length;
  return (
    <>
      <PanelHeader
        title="Homepage"
        description="Drag sections into order, or use the Move buttons, and choose what visitors see. Focus a section to find it in the live preview."
      />
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <SectionHeading className="m-0">Sections</SectionHeading>
        <span className="text-xs text-muted-foreground tabular-nums">{visible} of {content.homeSections.length} visible</span>
      </div>
      <SortableList
        items={content.homeSections}
        getId={(section) => section.key}
        getLabel={(section) => titleCase(section.key)}
        rowClassName={rowCard}
        onReorder={(homeSections) => edit({ ...content, homeSections })}
        rowProps={(section) => ({
          "data-preview-section": section.key,
          "data-preview-focused": focusedSection === section.key ? "true" : undefined,
          className: cn(!section.enabled && "bg-surface"),
        })}
        renderItem={(section, index, handle) => (
          <>
            {handle}
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <NativeCheckbox
                aria-label={`Show ${titleCase(section.key)}`}
                checked={section.enabled}
                onChange={(event) => edit({
                  ...content,
                  homeSections: content.homeSections.map((item) => item.key === section.key ? { ...item, enabled: event.target.checked } : item),
                })}
              />
              <span className={cn("truncate text-sm font-medium", !section.enabled && "text-muted-foreground line-through decoration-faint/60")}>{titleCase(section.key)}</span>
            </label>
            <MoveButtons
              name={titleCase(section.key)}
              index={index}
              length={content.homeSections.length}
              onMove={(direction) => {
                const sections = [...content.homeSections];
                [sections[index], sections[index + direction]] = [sections[index + direction]!, sections[index]!];
                edit({ ...content, homeSections: sections });
              }}
            />
          </>
        )}
      />
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
