"use client";
import { useState } from "react";
import { categoryPageSlugs, type CategoryPageContent, type CategoryPageSlug, type CategorySectionContent } from "@shopmaple/contracts";
import { resolveCategoryPageContent } from "@/lib/category-content-defaults";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import { CheckField, DisclosureSummary, FieldGrid, MoveButtons, PanelHeader, SectionHeading, patchKey, rowCard, swap } from "./kit";
import { SortableList } from "./sortable-list";

const labelOf = (slug: string) => slug[0]!.toUpperCase() + slug.slice(1);
function CategoryPage({ page, label, update }: { page: CategoryPageContent; label: string; update: (page: CategoryPageContent) => void }) {
  function sectionUpdate(key: CategorySectionContent["key"], patch: Partial<CategorySectionContent>) {
    update({ ...page, sections: patchKey(page.sections, key, patch) });
  }
  return <section aria-label={`${label} page content`} className="grid gap-6">
    <FieldGrid>
      <Field label={`${label} title`} value={page.title} maxLength={160} onChange={title => update({ ...page, title })} />
      <Field label={`${label} introduction`} value={page.introduction} maxLength={8000} multiline onChange={introduction => update({ ...page, introduction })} />
    </FieldGrid>
    <div>
      <SectionHeading description="Open a section to edit its text, drag it into order or use its Move buttons.">Sections</SectionHeading>
      <SortableList items={page.sections} getId={section => section.key} getLabel={section => `${label} ${section.key}`} tag="div" rowTag="details"
        rowClassName={cn(rowCard, "block p-0")} onReorder={sections => update({ ...page, sections })}
        renderItem={(section, index, handle) => {
          const name = `${label} ${section.key}`;
          const items = (key: string, patch: { title?: string; body?: string }) => sectionUpdate(section.key, { items: patchKey(section.items!, key, patch) });
          return <>
            <DisclosureSummary className="capitalize">
              {section.key.replaceAll("-", " ")}
              {!section.enabled && <Badge variant="secondary" className="rounded-md border-0 bg-neutral-bg font-semibold text-neutral normal-case">Hidden</Badge>}
            </DisclosureSummary>
            <div className="grid gap-4 border-t border-line-soft px-4 pt-3 pb-5">
              <div className="flex flex-wrap items-center gap-3">
                {handle}
                <CheckField className="min-w-0 flex-1" label="Show section" aria-label={`Show ${name}`} checked={section.enabled}
                  onChange={event => sectionUpdate(section.key, { enabled: event.currentTarget.checked })} />
                <MoveButtons name={name} index={index} length={page.sections.length}
                  onMove={direction => update({ ...page, sections: swap(page.sections, index, direction) })} />
              </div>
              {(section.heading !== undefined || section.eyebrow !== undefined || section.items?.length) && <FieldGrid>
                {(["heading", "eyebrow"] as const).map(key => section[key] !== undefined
                  && <Field key={key} label={`${name} ${key}`} value={section[key]} maxLength={160} onChange={text => sectionUpdate(section.key, { [key]: text })} />)}
                {section.items?.map(item => {
                  const title = <Field key={`${item.key}-title`} label={`${label} ${item.key} label`} value={item.title} maxLength={160}
                    onChange={title => items(item.key, { title })} />;
                  if (item.body === undefined) return title;
                  return <div key={item.key} data-span="full" className="grid gap-4 border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
                    {title}
                    <Field label={`${label} ${item.key} body`} value={item.body} maxLength={600} multiline onChange={body => items(item.key, { body })} />
                  </div>;
                })}
              </FieldGrid>}
            </div>
          </>;
        }}
      />
    </div>
  </section>;
}

export function CategoryFields({ value, onChange }: { value: CategoryPageContent[]; onChange: (value: CategoryPageContent[]) => void }) {
  const [active, setActive] = useState<CategoryPageSlug>(categoryPageSlugs[0]);
  const update = (page: CategoryPageContent) =>
    onChange(value.some(item => item.slug === page.slug) ? value.map(item => (item.slug === page.slug ? page : item)) : [...value, page]);
  return <div>
    <PanelHeader title="Category pages"
      description="Edit the Sofas, Tables, and Chairs pages. Changes become public when the draft is published. Campaign copy is managed in Campaigns." />
    <Tabs value={active} onValueChange={next => setActive(next as CategoryPageSlug)} className="gap-5">
      <TabsList aria-label="Category page">
        {/* Radix activates tabs on mousedown and focus; a plain click selects too. */}
        {categoryPageSlugs.map(slug => <TabsTrigger key={slug} value={slug} className="px-3" onClick={() => setActive(slug)}>{labelOf(slug)}</TabsTrigger>)}
      </TabsList>
      {/* Every page stays mounted so its fields keep their values while another tab is shown. */}
      {categoryPageSlugs.map(slug => <TabsContent key={slug} value={slug} forceMount className="data-[state=inactive]:hidden">
        <CategoryPage page={resolveCategoryPageContent(slug, value)} label={labelOf(slug)} update={update} />
      </TabsContent>)}
    </Tabs>
  </div>;
}
