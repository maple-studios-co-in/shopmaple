"use client";
import type { NimbusPageContent, NimbusSectionKey } from "@shopmaple/contracts";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
import { ContentPanel, ContentPanels, FieldGrid, GroupedFields, PageEditor, SectionToggles, TextFields, patchKey, textField } from "./kit";

const sections: Record<NimbusSectionKey, string> = {
  hero: "Hero film", intro: "Introduction", "rooms-grid": "Room tiles", origin: "Origin",
  principles: "Principles", "rooms-slideshow": "Room slideshow", series: "Series", project: "Project", promises: "Promises",
};
const rooms = { bedroom: "Bedroom", living: "Living room", dining: "Dining room" };
const principles = { comfort: "Cloud comfort", silhouettes: "Soft silhouettes", luxury: "Airy luxury", spaces: "Modern spaces" };
const promises = { custom: "Customization", delivery: "Delivery", craft: "Craftsmanship", warranty: "Warranty" };
export function NimbusFields({ value, onChange }: { value?: NimbusPageContent; onChange: (value: NimbusPageContent) => void }) {
  const page = resolveNimbusPageContent(value);
  const patch = (next: Partial<NimbusPageContent>) => onChange({ ...page, ...next });
  return (
    <PageEditor label="Nimbus page content" title="The Nimbus Collection"
      intro={<TextFields value={page} onChange={onChange} fields={[["title", "Nimbus page title", 160]]} />}
      description="Edit /pages/nimbus-collection. Changes stay in your draft until published. The original artwork, videos and product links stay attached to their sections.">
      <SectionToggles prefix="Nimbus" labels={sections} items={page.sections} onChange={sections => patch({ sections })}
        description="Drag sections into order, or use the Move buttons, and hide the ones you do not need. A page heading remains available to screen readers." />
      <ContentPanels>
        <ContentPanel title="Introduction">
          <TextFields value={page.intro} onChange={intro => patch({ intro })}
            fields={[["heading", "Nimbus introduction heading", 160], ["body", "Nimbus introduction body", 2000, true]]} />
        </ContentPanel>
        <ContentPanel title="Room tiles"><FieldGrid>
          {page.roomTiles.map(tile => textField(`Nimbus ${rooms[tile.key]} tile title`, tile.title, 160,
            title => patch({ roomTiles: patchKey(page.roomTiles, tile.key, { title }) })))}
        </FieldGrid></ContentPanel>
        <ContentPanel title="Origin">
          <TextFields value={page.origin} onChange={origin => patch({ origin })}
            fields={[["eyebrow", "Nimbus origin eyebrow", 160], ["heading", "Nimbus origin heading", 160], ["body", "Nimbus origin body", 8000, true]]} />
        </ContentPanel>
        <ContentPanel title="Principles">
          <TextFields value={page.principles} onChange={next => patch({ principles: next })} fields={[["heading", "Nimbus principles heading", 160]]} />
          <GroupedFields items={page.principles.items} legend={item => principles[item.key]} onChange={items => patch({ principles: { ...page.principles, items } })}
            fields={item => [["title", `Nimbus ${principles[item.key]} title`, 160], ["body", `Nimbus ${principles[item.key]} body`, 2000, true]]} />
        </ContentPanel>
        <ContentPanel title="Room slideshow"><FieldGrid>
          {page.roomSlides.map(slide => textField(`Nimbus ${rooms[slide.key]} slide label`, slide.label, 160,
            label => patch({ roomSlides: patchKey(page.roomSlides, slide.key, { label }) })))}
        </FieldGrid></ContentPanel>
        <ContentPanel title="Series">
          <TextFields value={page.series} onChange={series => patch({ series })}
            fields={[["eyebrow", "Nimbus series eyebrow", 300], ["heading", "Nimbus series heading", 160]]} />
        </ContentPanel>
        <ContentPanel title="Project">
          <TextFields value={page.project} onChange={project => patch({ project })}
            fields={[["heading", "Nimbus project heading", 160], ["body", "Nimbus project body", 2000, true]]} />
        </ContentPanel>
        <ContentPanel title="Promises"><FieldGrid>
          {page.promises.map(item => textField(`Nimbus ${promises[item.key]} promise`, item.title, 160,
            title => patch({ promises: patchKey(page.promises, item.key, { title }) })))}
        </FieldGrid></ContentPanel>
      </ContentPanels>
    </PageEditor>
  );
}
