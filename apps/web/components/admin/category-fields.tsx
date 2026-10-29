"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  categoryPageSlugs,
  type CategoryPageContent,
  type CategoryPageSlug,
  type CategorySectionContent,
} from "@shopmaple/contracts";
import { resolveCategoryPageContent } from "@/lib/category-content-defaults";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import { CheckField, FieldGrid, MoveButtons, PanelHeader, SectionHeading, rowCard } from "./kit";
import { SortableList } from "./sortable-list";

/** A sortable section row that opens to show its fields: the row card, laid out as a disclosure. */
const sectionCard = cn(rowCard, "group/section block p-0");

export function CategoryFields({
  value,
  onChange,
}: {
  value: CategoryPageContent[];
  onChange: (value: CategoryPageContent[]) => void;
}) {
  const [active, setActive] = useState<CategoryPageSlug>(categoryPageSlugs[0]);
  function update(page: CategoryPageContent) {
    onChange(
      value.some((item) => item.slug === page.slug)
        ? value.map((item) => (item.slug === page.slug ? page : item))
        : [...value, page],
    );
  }
  const labelOf = (slug: string) => slug[0]!.toUpperCase() + slug.slice(1);
  return (
    <div>
      <PanelHeader
        title="Category pages"
        description="Edit the Sofas, Tables, and Chairs pages. Changes become public when the draft is published. Campaign copy is managed in Campaigns."
      />
      <Tabs value={active} onValueChange={(next) => setActive(next as CategoryPageSlug)} className="gap-5">
        <TabsList aria-label="Category page">
          {categoryPageSlugs.map((slug) => (
            // Radix activates tabs on mousedown and focus; a plain click selects too.
            <TabsTrigger key={slug} value={slug} className="px-3" onClick={() => setActive(slug)}>
              {labelOf(slug)}
            </TabsTrigger>
          ))}
        </TabsList>
        {categoryPageSlugs.map((slug) => {
          const page = resolveCategoryPageContent(slug, value);
          const label = labelOf(slug);
          function sectionUpdate(
            key: CategorySectionContent["key"],
            patch: Partial<CategorySectionContent>,
          ) {
            update({
              ...page,
              sections: page.sections.map((section) =>
                section.key === key ? { ...section, ...patch } : section,
              ),
            });
          }
          function move(index: number, offset: number) {
            const next = index + offset;
            if (next < 0 || next >= page.sections.length) return;
            const sections = [...page.sections];
            [sections[index], sections[next]] = [sections[next]!, sections[index]!];
            update({ ...page, sections });
          }
          return (
            // Every page stays mounted so its fields keep their values while another tab is shown.
            <TabsContent key={slug} value={slug} forceMount className="data-[state=inactive]:hidden">
              <section aria-label={`${label} page content`} className="grid gap-6">
                <FieldGrid>
                  <Field label={`${label} title`} value={page.title} maxLength={160} onChange={(title) => update({ ...page, title })} />
                  <Field
                    label={`${label} introduction`}
                    value={page.introduction}
                    maxLength={8000}
                    multiline
                    onChange={(introduction) => update({ ...page, introduction })}
                  />
                </FieldGrid>
                <div>
                  <SectionHeading description="Open a section to edit its text, drag it into order or use its Move buttons.">Sections</SectionHeading>
                  <SortableList
                    items={page.sections}
                    getId={(section) => section.key}
                    getLabel={(section) => `${label} ${section.key}`}
                    tag="div"
                    rowTag="details"
                    rowClassName={sectionCard}
                    onReorder={(sections) => update({ ...page, sections })}
                    renderItem={(section, index, handle) => (
                      <>
                        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-[13.5px] font-medium text-foreground capitalize outline-none select-none transition-colors duration-150 ease-admin hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
                          <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-admin group-open/section:rotate-90 motion-reduce:transition-none" />
                          {section.key.replaceAll("-", " ")}
                          {!section.enabled && <Badge variant="secondary" className="rounded-md border-0 bg-neutral-bg font-semibold text-neutral normal-case">Hidden</Badge>}
                        </summary>
                        <div className="grid gap-4 border-t border-line-soft px-4 pt-3 pb-5">
                          <div className="flex flex-wrap items-center gap-3">
                            {handle}
                            <CheckField
                              className="min-w-0 flex-1"
                              label="Show section"
                              aria-label={`Show ${label} ${section.key}`}
                              checked={section.enabled}
                              onChange={(event) => sectionUpdate(section.key, { enabled: event.currentTarget.checked })}
                            />
                            <MoveButtons name={`${label} ${section.key}`} index={index} length={page.sections.length} onMove={(direction) => move(index, direction)} />
                          </div>
                          {(section.heading !== undefined || section.eyebrow !== undefined || section.items?.length) && (
                            <FieldGrid>
                              {section.heading !== undefined && (
                                <Field
                                  label={`${label} ${section.key} heading`}
                                  value={section.heading}
                                  maxLength={160}
                                  onChange={(heading) => sectionUpdate(section.key, { heading })}
                                />
                              )}
                              {section.eyebrow !== undefined && (
                                <Field
                                  label={`${label} ${section.key} eyebrow`}
                                  value={section.eyebrow}
                                  maxLength={160}
                                  onChange={(eyebrow) => sectionUpdate(section.key, { eyebrow })}
                                />
                              )}
                              {section.items?.map((item) => {
                                const title = (
                                  <Field
                                    key={`${item.key}-title`}
                                    label={`${label} ${item.key} label`}
                                    value={item.title}
                                    maxLength={160}
                                    onChange={(title) =>
                                      sectionUpdate(section.key, {
                                        items: section.items!.map((current) => (current.key === item.key ? { ...current, title } : current)),
                                      })
                                    }
                                  />
                                );
                                if (item.body === undefined) return title;
                                return (
                                  <div key={item.key} data-span="full" className="grid gap-4 border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
                                    {title}
                                    <Field
                                      label={`${label} ${item.key} body`}
                                      value={item.body}
                                      maxLength={600}
                                      multiline
                                      onChange={(body) =>
                                        sectionUpdate(section.key, {
                                          items: section.items!.map((current) => (current.key === item.key ? { ...current, body } : current)),
                                        })
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </FieldGrid>
                          )}
                        </div>
                      </>
                    )}
                  />
                </div>
              </section>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
