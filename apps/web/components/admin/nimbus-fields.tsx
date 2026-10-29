"use client";
import type { NimbusPageContent, NimbusSectionKey } from "@shopmaple/contracts";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
import { Field } from "./field";
import { FieldGrid, FieldGroup, SectionHeading } from "./kit";
import { ContentPanel, PanelStack, ToggleRows } from "./service-page-fields";

const sections: Record<NimbusSectionKey, string> = {
  hero: "Hero film", intro: "Introduction", "rooms-grid": "Room tiles", origin: "Origin",
  principles: "Principles", "rooms-slideshow": "Room slideshow", series: "Series", project: "Project", promises: "Promises",
};
const rooms = { bedroom: "Bedroom", living: "Living room", dining: "Dining room" };
const principles = { comfort: "Cloud comfort", silhouettes: "Soft silhouettes", luxury: "Airy luxury", spaces: "Modern spaces" };
const promises = { custom: "Customization", delivery: "Delivery", craft: "Craftsmanship", warranty: "Warranty" };
export function NimbusFields({value,onChange}:{value?:NimbusPageContent;onChange:(value:NimbusPageContent)=>void}) {
  const page = resolveNimbusPageContent(value);
  function update<K extends keyof NimbusPageContent>(key:K,value:NimbusPageContent[K]) { onChange({...page,[key]:value}); }
  const field=(label:string,value:string,maxLength:number,onChange:(value:string)=>void,multiline=false)=>(
    <Field key={label} label={label} value={value} maxLength={maxLength} onChange={onChange} multiline={multiline}/>
  );
  return (
    <section aria-label="Nimbus page content" className="grid gap-6">
      <div>
        <SectionHeading className="mt-2" description="Edit /pages/nimbus-collection. Changes stay in your draft until published. The original artwork, videos and product links stay attached to their sections.">The Nimbus Collection</SectionHeading>
        <FieldGrid>{field("Nimbus page title",page.title,160,title=>update("title",title))}</FieldGrid>
      </div>
      <div>
        <SectionHeading description="Drag sections into order, or use the Move buttons, and hide the ones you do not need. A page heading remains available to screen readers.">Sections</SectionHeading>
        <ToggleRows items={page.sections} name={section=>`Nimbus ${sections[section.key]}`} label={section=>sections[section.key]}
          onChange={next=>update("sections",next)} />
      </div>
      <div>
        <SectionHeading description="Open a section to edit its text.">Section content</SectionHeading>
        <PanelStack>
          <ContentPanel title="Introduction"><FieldGrid>
            {field("Nimbus introduction heading",page.intro.heading,160,heading=>update("intro",{...page.intro,heading}))}
            {field("Nimbus introduction body",page.intro.body,2000,body=>update("intro",{...page.intro,body}),true)}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Room tiles"><FieldGrid>
            {page.roomTiles.map(tile=>field(`Nimbus ${rooms[tile.key]} tile title`,tile.title,160,title=>update("roomTiles",page.roomTiles.map(item=>item.key===tile.key?{...item,title}:item))))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Origin"><FieldGrid>
            {field("Nimbus origin eyebrow",page.origin.eyebrow,160,eyebrow=>update("origin",{...page.origin,eyebrow}))}
            {field("Nimbus origin heading",page.origin.heading,160,heading=>update("origin",{...page.origin,heading}))}
            {field("Nimbus origin body",page.origin.body,8000,body=>update("origin",{...page.origin,body}),true)}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Principles">
            <FieldGrid>{field("Nimbus principles heading",page.principles.heading,160,heading=>update("principles",{...page.principles,heading}))}</FieldGrid>
            {page.principles.items.map(item=>(<FieldGroup key={item.key} legend={principles[item.key]}>
              {field(`Nimbus ${principles[item.key]} title`,item.title,160,title=>update("principles",{...page.principles,items:page.principles.items.map(entry=>entry.key===item.key?{...entry,title}:entry)}))}
              {field(`Nimbus ${principles[item.key]} body`,item.body,2000,body=>update("principles",{...page.principles,items:page.principles.items.map(entry=>entry.key===item.key?{...entry,body}:entry)}),true)}
            </FieldGroup>))}
          </ContentPanel>
          <ContentPanel title="Room slideshow"><FieldGrid>
            {page.roomSlides.map(slide=>field(`Nimbus ${rooms[slide.key]} slide label`,slide.label,160,label=>update("roomSlides",page.roomSlides.map(item=>item.key===slide.key?{...item,label}:item))))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Series"><FieldGrid>
            {field("Nimbus series eyebrow",page.series.eyebrow,300,eyebrow=>update("series",{...page.series,eyebrow}))}
            {field("Nimbus series heading",page.series.heading,160,heading=>update("series",{...page.series,heading}))}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Project"><FieldGrid>
            {field("Nimbus project heading",page.project.heading,160,heading=>update("project",{...page.project,heading}))}
            {field("Nimbus project body",page.project.body,2000,body=>update("project",{...page.project,body}),true)}
          </FieldGrid></ContentPanel>
          <ContentPanel title="Promises"><FieldGrid>
            {page.promises.map(item=>field(`Nimbus ${promises[item.key]} promise`,item.title,160,title=>update("promises",page.promises.map(entry=>entry.key===item.key?{...entry,title}:entry))))}
          </FieldGrid></ContentPanel>
        </PanelStack>
      </div>
    </section>
  );
}
