"use client";
import { useState } from "react";
import { PencilLine } from "lucide-react";
import type { StorefrontContent } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
/** The homepage copy each section shows, so a section's own words can be edited beside it. */
const sectionCopy: Partial<Record<StorefrontContent["homeSections"][number]["key"], (keyof Copy)[]>> = {
  categories: ["categoryHeading"],
  ticker: ["ticker"],
  instagram: ["socialHeading"],
  bestsellers: ["bestsellersHeading"],
  chairs: ["chairsHeading"],
  testimonial: ["testimonialHeading", "testimonialSubheading"],
};
export const titleCase = (value: string) =>
  value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function HomepagePanel({ content, edit, focusedSection }: {
  content: StorefrontContent;
  edit: (next: StorefrontContent) => void;
  focusedSection: string | null;
}) {
  const [editing, setEditing] = useState<StorefrontContent["homeSections"][number]["key"] | null>(null);
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
        <span className="text-[12px] text-muted-foreground tabular-nums">{visible} of {content.homeSections.length} visible</span>
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
              <span className={cn("truncate text-[13.5px] font-medium", !section.enabled && "text-muted-foreground line-through decoration-faint/60")}>{titleCase(section.key)}</span>
            </label>
            {sectionCopy[section.key] && (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" aria-label={`Edit ${titleCase(section.key)} copy`} onClick={() => setEditing(section.key)}>
                <PencilLine aria-hidden="true" strokeWidth={1.5} />
                <span className="hidden sm:inline">Copy</span>
              </Button>
            )}
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
      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-line-soft px-6 py-5">
            <SheetTitle className="font-display text-[22px] font-normal">{editing ? titleCase(editing) : ""}</SheetTitle>
            <SheetDescription>The words this section shows on the homepage. Changes stay in your draft.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 overflow-y-auto px-6 py-5">{editing && sectionCopy[editing]?.map(copyField)}</div>
          <SheetFooter className="border-t border-line-soft px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Done</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
