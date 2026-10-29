"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Plus, RotateCcw } from "lucide-react";
import type { ChromeLink, ChromeNavigationItem, FooterContent, SiteChrome } from "@shopmaple/contracts";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import { CheckField, FieldGrid, MoveButtons, PanelHeader, Prose, RemoveButton, SectionHeading, SelectField, rowCard } from "./kit";
import { ToggleRows } from "./service-page-fields";
import { SortableList } from "./sortable-list";

const newId = () => `chrome-${crypto.randomUUID()}`;
const newLink = (): ChromeLink => ({id:newId(),label:"New link",href:"/collections/all",enabled:true});
const lower = (value:string) => value.charAt(0).toLowerCase()+value.slice(1);
const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60";
/** A list row holding a block of fields: the row card stacked vertically. Nested lists sit on the panel tone. */
const stackCard = cn(rowCard, "grid items-stretch gap-4 p-4", focusRing);
const nestedCard = cn(stackCard, "border-line-soft bg-surface shadow-none");
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) {
  return <CheckField label={label} aria-label={label} checked={checked} onChange={event=>onChange(event.currentTarget.checked)}/>;
}

// Row refs follow identities, so moving to a disabled arrow or removing a row
// always leaves keyboard users at a meaningful surviving control.
function Rows<T>({title,name,items,onChange,render,identity,create,min=0,max=99,nested=false}:{
  title:string;name:string;items:T[];onChange:(items:T[])=>void;
  render:(item:T,index:number,update:(item:T)=>void)=>ReactNode;
  identity:(item:T)=>string;create?:()=>T;min?:number;max?:number;nested?:boolean;
}) {
  const nodes=useRef(new Map<string,HTMLLIElement>()), add=useRef<HTMLButtonElement>(null), pending=useRef<string|null>(null);
  useLayoutEffect(()=>{
    if(pending.current!==null) { (nodes.current.get(pending.current)??add.current)?.focus(); pending.current=null; }
  },[items]);
  function update(next:T[],id:string) {pending.current=id;onChange(next);}
  return <section aria-label={title} className="grid min-w-0 gap-3">
    <SectionHeading as={nested?"h4":"h3"} className="mt-0 mb-0" description={create ? `${items.length} of ${max}. ${min>0 ? `Keep at least ${min}.` : "All entries may be removed or hidden."}` : undefined}>{title}</SectionHeading>
    <SortableList items={items} getId={identity} getLabel={(_,index)=>lower(`${name} ${index+1}`)} onReorder={next=>onChange(next)}
      rowClassName={nested?nestedCard:stackCard}
      rowProps={(item,index)=>{const id=identity(item);return {"data-chrome-row":id,tabIndex:-1,"aria-label":`${name} ${index+1}`,ref:(node:HTMLElement|null)=>{if(node)nodes.current.set(id,node as HTMLLIElement);else nodes.current.delete(id);}};}}
      renderItem={(item,index,handle)=>{
      const id=identity(item), label=`${name} ${index+1}`;
      return <>
        <div className="-my-1 -ml-1 flex min-w-0 items-center gap-2">
          {handle}
          <span aria-hidden="true" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{label}</span>
          <MoveButtons name={lower(label)} index={index} length={items.length} onMove={direction=>{
            const next=[...items]; [next[index],next[index+direction]]=[next[index+direction]!,next[index]!]; update(next,id);
          }}/>
          {create && <RemoveButton label={`Remove ${lower(label)}`} disabled={items.length<=min} onClick={()=>update(items.filter((_,i)=>i!==index),items[index+1]?identity(items[index+1]!):items[index-1]?identity(items[index-1]!):"")}/>}
        </div>
        {render(item,index,next=>onChange(items.map((old,i)=>i===index?next:old)))}
      </>;
    }}/>
    {create && <div><Button ref={add} type="button" variant="outline" size="sm" disabled={items.length>=max} onClick={()=>{const item=create();update([...items,item],identity(item));}}><Plus aria-hidden="true" strokeWidth={1.5}/>Add {lower(name)}</Button></div>}
  </section>;
}
function LinkFields<T extends ChromeLink>({link,name,onChange}:{link:T;name:string;onChange:(value:T)=>void}) {
  function update(patch:Partial<T>) {onChange({...link,...patch});}
  return <FieldGrid>
    <Field label={`${name} label`} value={link.label} maxLength={120} onChange={label=>update({label} as Partial<T>)}/>
    <Field label={`${name} destination`} value={link.href} maxLength={300} onChange={href=>update({href} as Partial<T>)}/>
    <Field label={`${name} enquiry subject`} value={link.enquirySubject??""} maxLength={160} onChange={enquirySubject=>{
      const next={...link}; if(enquirySubject)next.enquirySubject=enquirySubject;else delete next.enquirySubject;onChange(next);
    }}/>
    {"cta" in link && <Field label={`${name} call to action`} value={String(link.cta)} maxLength={80} onChange={cta=>onChange({...link,cta})}/>}
    <Toggle label={`Show ${lower(name)}`} checked={link.enabled} onChange={enabled=>update({enabled} as Partial<T>)}/>
    {"parent" in link && <Toggle label={`${name} parent style`} checked={Boolean(link.parent)} onChange={parent=>onChange({...link,parent})}/>}
  </FieldGrid>;
}
function Links<T extends ChromeLink>({title,name,items,onChange,max,min=0,create,nested}:{title:string;name:string;items:T[];onChange:(items:T[])=>void;max:number;min?:number;create:()=>T;nested?:boolean}) {
  return <Rows title={title} name={name} items={items} onChange={onChange} min={min} max={max} create={create} nested={nested} identity={item=>item.id} render={(link,index,update)=><LinkFields link={link} name={`${name} ${index+1}`} onChange={update}/>}/>;
}
function Submenu({name,item,onChange}:{name:string;item:ChromeNavigationItem;onChange:(value:ChromeNavigationItem)=>void}) {
  const [expanded,setExpanded]=useState(false);
  return <details open={expanded} className="group/submenu min-w-0 rounded-md border border-line-soft bg-surface">
    <summary className={cn("flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium text-foreground select-none transition-colors duration-150 ease-admin hover:bg-accent [&::-webkit-details-marker]:hidden",focusRing)} onClick={event=>{event.preventDefault();setExpanded(!expanded);}}>
      <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-admin group-open/submenu:rotate-90 motion-reduce:transition-none"/>
      {name} submenu ({item.columns.length} columns)
    </summary>
    {expanded && <div className="border-t border-line-soft p-3 sm:p-4">
      <Rows nested title={`${name} columns`} name={`${name} column`} items={item.columns} max={4} onChange={columns=>onChange({...item,columns})} identity={column=>column.id} create={()=>({id:newId(),links:[{...newLink(),parent:false}]})}
        render={(column,columnIndex,updateColumn)=><>
          <Toggle label={`Show ${lower(name)} column ${columnIndex+1}`} checked={column.links.some(link=>link.enabled)} onChange={enabled=>updateColumn({...column,links:column.links.map(link=>({...link,enabled}))})}/>
          <Prose className="-mt-2 text-[12.5px]">Showing or hiding a column changes all its links.</Prose>
          <Links nested title={`${name} column ${columnIndex+1} links`} name={`${name} column ${columnIndex+1} link`} items={column.links} max={12} min={1} create={()=>({...newLink(),parent:false})} onChange={links=>updateColumn({...column,links})}/></>}/>
    </div>}
  </details>;
}
function NavigationFields({items,onChange}:{items:ChromeNavigationItem[];onChange:(items:ChromeNavigationItem[])=>void}) {
  return <Rows title="Main navigation" name="Navigation item" items={items} onChange={onChange} min={1} max={8} identity={item=>item.id}
    create={()=>({id:newId(),label:"New navigation",href:"/collections/all",enabled:true,feature:"none" as const,columns:[]})}
    render={(item,index,update)=>{
      const name=`Navigation item ${index+1}`;
      return <>
        <FieldGrid>
          <Field label={`${name} label`} value={item.label} maxLength={120} onChange={label=>update({...item,label})}/>
          <Field label={`${name} destination`} value={item.href} maxLength={300} onChange={href=>update({...item,href})}/>
          <SelectField label={`${name} feature preset`} value={item.feature} onChange={event=>update({...item,feature:event.target.value as ChromeNavigationItem["feature"]})}>
            <NativeSelectOption value="none">No featured artwork</NativeSelectOption>
            <NativeSelectOption value="living">Living room artwork</NativeSelectOption>
            <NativeSelectOption value="bedroom">Bedroom artwork</NativeSelectOption>
          </SelectField>
          <Toggle label={`Show ${lower(name)}`} checked={item.enabled} onChange={enabled=>update({...item,enabled})}/>
        </FieldGrid>
        <Submenu name={name} item={item} onChange={update}/>
      </>;
    }}/>;
}
const titleCase = (value:string) => value.charAt(0).toUpperCase()+value.slice(1);
function FooterLayout<K extends string>({title,name,items,onChange}:{title:string;name:string;items:{key:K;enabled:boolean}[];onChange:(items:{key:K;enabled:boolean}[])=>void}) {
  const nodes=useRef(new Map<K,HTMLLIElement>()),pending=useRef<K|null>(null);
  useLayoutEffect(()=>{if(pending.current){nodes.current.get(pending.current)?.focus();pending.current=null;}},[items]);
  return <section aria-label={title} className="grid min-w-0 content-start gap-3">
    <SectionHeading className="mt-0 mb-0">{title}</SectionHeading>
    <ToggleRows items={items} name={item=>`${name} ${item.key}`} label={item=>titleCase(item.key)}
      onChange={next=>onChange(next)}
      onMove={(next,moved)=>{pending.current=moved.key;onChange(next);}}
      rowProps={item=>({tabIndex:-1,"aria-label":`${name} ${item.key}`,ref:(node:HTMLElement|null)=>{if(node)nodes.current.set(item.key,node as HTMLLIElement);else nodes.current.delete(item.key);}})}/>
  </section>;
}
const footerTextFields = [
  ["shopHeading","Shop heading",160],["helpHeading","Help heading",160],["careHeading","Customer care heading",160],
  ["contactHeading","Contact heading",160],["bulkHeading","Bulk contact heading",160],["serviceHeading","Service contact heading",160],["findUsHeading","Find us heading",160],
  ["customerPhone","Customer phone",16],["customerPhoneLabel","Customer phone label",60],["customerEmail","Customer email",254],
  ["bulkPhone","Bulk phone",16],["bulkPhoneLabel","Bulk phone label",60],["bulkEmail","Bulk email",254],["copyrightName","Copyright name",160],
] as const;
function FooterFields({value,onChange}:{value:FooterContent;onChange:(value:FooterContent)=>void}) {
  return <div className="grid gap-8">
    <div className="grid gap-6 lg:grid-cols-2">
      <FooterLayout title="Footer columns" name="footer" items={value.columns} onChange={columns=>onChange({...value,columns})}/>
      <FooterLayout title="Footer contact columns" name="footer contact" items={value.contactColumns} onChange={contactColumns=>onChange({...value,contactColumns})}/>
    </div>
    <div>
      <SectionHeading className="mt-0" description="Phone numbers use + and 8 to 15 digits. Address: 1 to 4 nonblank lines, up to 160 characters per line. Leave a social profile blank to hide it.">Headings and contact details</SectionHeading>
      <FieldGrid>{footerTextFields.map(([key,label,max])=><Field key={key} label={label} value={value[key]} maxLength={max} onChange={text=>onChange({...value,[key]:text})}/>)}
        <Field label="Instagram profile" value={value.instagram??""} maxLength={300} onChange={text=>onChange({...value,instagram:text||null})}/>
        <Field label="LinkedIn company profile" value={value.linkedin??""} maxLength={300} onChange={text=>onChange({...value,linkedin:text||null})}/>
        <Field label="Address lines" value={value.addressLines.join("\n")} multiline maxLength={643} onChange={text=>onChange({...value,addressLines:text.split("\n")})}/>
      </FieldGrid>
    </div>
    <Links title="Footer shop links" name="Footer shop link" items={value.shopLinks} max={12} create={newLink} onChange={shopLinks=>onChange({...value,shopLinks})}/>
    <Links title="Footer help links" name="Footer help link" items={value.helpLinks} max={12} create={newLink} onChange={helpLinks=>onChange({...value,helpLinks})}/>
    <Links title="Footer policy links" name="Footer policy link" items={value.policyLinks} max={8} create={newLink} onChange={policyLinks=>onChange({...value,policyLinks})}/>
  </div>;
}
const sections = [
  ["announcement","Announcement & WhatsApp"],["header","Header links"],["navigation","Main navigation"],["footer","Footer"],
] as const;
type Section = (typeof sections)[number][0];
export function SiteChromeFields({value,onChange}:{value?:SiteChrome;onChange:(value:SiteChrome|undefined)=>void}) {
  const current=value??resolveSiteChrome(),heading=useRef<HTMLSpanElement>(null),resetFocus=useRef(false);
  const [section,setSection]=useState<Section>("announcement");
  useLayoutEffect(()=>{if(resetFocus.current){heading.current?.focus();resetFocus.current=false;}},[value]);
  function update(patch:Partial<SiteChrome>) {onChange({...current,...patch});}
  return <section aria-label="Navigation and footer controls">
    <PanelHeader
      // The title is focusable so restoring the original moves focus back to the top of the screen.
      title={<span ref={heading} tabIndex={-1} className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">Navigation &amp; footer</span>}
      description="Edit storefront links and contact information. Save a draft, then publish when ready. Product availability and prices remain managed by Keeri."
      actions={<Button type="button" variant="outline" size="sm" disabled={value===undefined} onClick={()=>{resetFocus.current=true;onChange(undefined);}}><RotateCcw aria-hidden="true" strokeWidth={1.5}/>Restore original navigation &amp; footer</Button>}
    />
    <Prose className="-mt-3 mb-6 text-[12.5px]">Destinations must be local storefront paths (for example /collections/all or /pages/contact). Enquiry subjects are optional and only work with /pages/contact. Labels: up to 120 characters; enquiry subjects: up to 160.</Prose>
    <Tabs value={section} onValueChange={next=>setSection(next as Section)} className="gap-6">
      <TabsList aria-label="Navigation & footer section" className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
        {/* Radix activates tabs on mousedown and focus; a plain click selects too. */}
        {sections.map(([key,label])=><TabsTrigger key={key} value={key} className="flex-none px-3" onClick={()=>setSection(key)}>{label}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="announcement" className="grid gap-8">
        <div>
          <SectionHeading className="mt-0">Announcement</SectionHeading>
          <FieldGrid>
            <Field label="Announcement text" value={current.announcement.text} maxLength={200} onChange={text=>update({announcement:{...current.announcement,text}})}/>
            <Field label="Announcement destination" value={current.announcement.href} maxLength={300} onChange={href=>update({announcement:{...current.announcement,href}})}/>
            <Toggle label="Show announcement" checked={current.announcement.enabled} onChange={enabled=>update({announcement:{...current.announcement,enabled}})}/>
          </FieldGrid>
        </div>
        <div>
          <SectionHeading className="mt-0" description="Phone numbers use + and 8 to 15 digits.">WhatsApp</SectionHeading>
          <FieldGrid>
            <Field label="WhatsApp phone" value={current.whatsapp.phone} maxLength={16} onChange={phone=>update({whatsapp:{...current.whatsapp,phone}})}/>
            <Field label="WhatsApp label" value={current.whatsapp.label} maxLength={120} onChange={label=>update({whatsapp:{...current.whatsapp,label}})}/>
            <Toggle label="Show WhatsApp" checked={current.whatsapp.enabled} onChange={enabled=>update({whatsapp:{...current.whatsapp,enabled}})}/>
          </FieldGrid>
        </div>
      </TabsContent>
      <TabsContent value="header" className="grid gap-8">
        <Links title="Utility links" name="Utility link" items={current.utilityLinks} max={6} create={newLink} onChange={utilityLinks=>update({utilityLinks})}/>
        <Links title="Desktop discovery" name="Desktop discovery link" items={current.desktopDiscovery} max={6} create={()=>({...newLink(),cta:"View all"})} onChange={desktopDiscovery=>update({desktopDiscovery})}/>
        <Links title="Mobile quick links" name="Mobile quick link" items={current.mobileQuickLinks} max={8} create={newLink} onChange={mobileQuickLinks=>update({mobileQuickLinks})}/>
      </TabsContent>
      <TabsContent value="navigation"><NavigationFields items={current.navigation} onChange={navigation=>update({navigation})}/></TabsContent>
      <TabsContent value="footer"><FooterFields value={current.footer} onChange={footer=>update({footer})}/></TabsContent>
    </Tabs>
  </section>;
}
