"use client";
import type { NimbusPageContent, NimbusSectionKey } from "@shopmaple/contracts";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
import { Field } from "./forms";
import { SortableList, moveItem } from "./sortable-list";

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
    <section aria-label="Nimbus page content">
      <h2>The Nimbus Collection</h2>
      <p>Edit /pages/nimbus-collection. Changes stay in your draft until published. The original artwork, videos and product links stay attached to their sections.</p>
      {field("Nimbus page title",page.title,160,title=>update("title",title))}
      <h3>Sections</h3>
      <p>Move sections or hide them. A page heading remains available to screen readers.</p>
      <SortableList items={page.sections} getKey={section=>section.key} getLabel={section=>`Nimbus ${sections[section.key]}`}
        onReorder={next=>update("sections",next)}
        renderItem={(section,index,{handle})=>(
          <>
            {handle}
            <label>
              <input type="checkbox" aria-label={`Show Nimbus ${sections[section.key]}`} checked={section.enabled}
                onChange={event=>update("sections",page.sections.map(item=>item.key===section.key?{...item,enabled:event.target.checked}:item))}/>
              <span>{sections[section.key]}</span>
            </label>
            <div>
              {([-1,1] as const).map(direction=>(
                <button key={direction} type="button" aria-label={`Move Nimbus ${sections[section.key]} ${direction===-1?"up":"down"}`}
                  disabled={index+direction<0||index+direction>=page.sections.length}
                  onClick={()=>update("sections",moveItem(page.sections,index,index+direction))}>
                  {direction===-1?"Move up":"Move down"}
                </button>
              ))}
            </div>
          </>
        )}/>
      <h3>Section content</h3>
      <details><summary>Introduction</summary><div className="admin-fields">
        {field("Nimbus introduction heading",page.intro.heading,160,heading=>update("intro",{...page.intro,heading}))}
        {field("Nimbus introduction body",page.intro.body,2000,body=>update("intro",{...page.intro,body}),true)}
      </div></details>
      <details><summary>Room tiles</summary><div className="admin-fields">
        {page.roomTiles.map(tile=>field(`Nimbus ${rooms[tile.key]} tile title`,tile.title,160,title=>update("roomTiles",page.roomTiles.map(item=>item.key===tile.key?{...item,title}:item))))}
      </div></details>
      <details><summary>Origin</summary><div className="admin-fields">
        {field("Nimbus origin eyebrow",page.origin.eyebrow,160,eyebrow=>update("origin",{...page.origin,eyebrow}))}
        {field("Nimbus origin heading",page.origin.heading,160,heading=>update("origin",{...page.origin,heading}))}
        {field("Nimbus origin body",page.origin.body,8000,body=>update("origin",{...page.origin,body}),true)}
      </div></details>
      <details><summary>Principles</summary><div className="admin-fields">
        {field("Nimbus principles heading",page.principles.heading,160,heading=>update("principles",{...page.principles,heading}))}
        {page.principles.items.map(item=>(<fieldset key={item.key}><legend>{principles[item.key]}</legend>
          {field(`Nimbus ${principles[item.key]} title`,item.title,160,title=>update("principles",{...page.principles,items:page.principles.items.map(entry=>entry.key===item.key?{...entry,title}:entry)}))}
          {field(`Nimbus ${principles[item.key]} body`,item.body,2000,body=>update("principles",{...page.principles,items:page.principles.items.map(entry=>entry.key===item.key?{...entry,body}:entry)}),true)}
        </fieldset>))}
      </div></details>
      <details><summary>Room slideshow</summary><div className="admin-fields">
        {page.roomSlides.map(slide=>field(`Nimbus ${rooms[slide.key]} slide label`,slide.label,160,label=>update("roomSlides",page.roomSlides.map(item=>item.key===slide.key?{...item,label}:item))))}
      </div></details>
      <details><summary>Series</summary><div className="admin-fields">
        {field("Nimbus series eyebrow",page.series.eyebrow,300,eyebrow=>update("series",{...page.series,eyebrow}))}
        {field("Nimbus series heading",page.series.heading,160,heading=>update("series",{...page.series,heading}))}
      </div></details>
      <details><summary>Project</summary><div className="admin-fields">
        {field("Nimbus project heading",page.project.heading,160,heading=>update("project",{...page.project,heading}))}
        {field("Nimbus project body",page.project.body,2000,body=>update("project",{...page.project,body}),true)}
      </div></details>
      <details><summary>Promises</summary><div className="admin-fields">
        {page.promises.map(item=>field(`Nimbus ${promises[item.key]} promise`,item.title,160,title=>update("promises",page.promises.map(entry=>entry.key===item.key?{...entry,title}:entry))))}
      </div></details>
    </section>
  );
}
