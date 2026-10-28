"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ChromeLink, ChromeNavigationItem, FooterContent, SiteChrome } from "@shopmaple/contracts";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { Field } from "./field";
import { SortableList } from "./sortable-list";

const newId = () => `chrome-${crypto.randomUUID()}`;
const newLink = (): ChromeLink => ({id:newId(),label:"New link",href:"/collections/all",enabled:true});
const lower = (value:string) => value.charAt(0).toLowerCase()+value.slice(1);
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) {
  return <label className="admin-check"><input type="checkbox" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)}/>{label}</label>;
}

// Row refs follow identities, so moving to a disabled arrow or removing a row
// always leaves keyboard users at a meaningful surviving control.
function Rows<T>({title,name,items,onChange,render,identity,create,min=0,max=99}:{
  title:string;name:string;items:T[];onChange:(items:T[])=>void;
  render:(item:T,index:number,update:(item:T)=>void)=>ReactNode;
  identity:(item:T)=>string;create?:()=>T;min?:number;max?:number;
}) {
  const nodes=useRef(new Map<string,HTMLLIElement>()), add=useRef<HTMLButtonElement>(null), pending=useRef<string|null>(null);
  useLayoutEffect(()=>{
    if(pending.current!==null) { (nodes.current.get(pending.current)??add.current)?.focus(); pending.current=null; }
  },[items]);
  function update(next:T[],id:string) {pending.current=id;onChange(next);}
  return <section aria-label={title} className="admin-chrome-list">
    <h3>{title}</h3>
    {create && <p>{items.length} of {max}. {min>0 ? `Keep at least ${min}.` : "All entries may be removed or hidden."}</p>}
    <SortableList items={items} getId={identity} getLabel={(_,index)=>lower(`${name} ${index+1}`)} onReorder={next=>onChange(next)}
      rowProps={(item,index)=>{const id=identity(item);return {"data-chrome-row":id,tabIndex:-1,"aria-label":`${name} ${index+1}`,ref:(node:HTMLElement|null)=>{if(node)nodes.current.set(id,node as HTMLLIElement);else nodes.current.delete(id);}};}}
      renderItem={(item,index,handle)=>{
      const id=identity(item), label=`${name} ${index+1}`;
      return <>
        {render(item,index,next=>onChange(items.map((old,i)=>i===index?next:old)))}
        <div className="admin-actions">{handle}{([-1,1] as const).map(direction=><button key={direction} type="button" aria-label={`Move ${lower(label)} ${direction===-1?"up":"down"}`} disabled={index+direction<0||index+direction>=items.length} onClick={()=>{
          const next=[...items]; [next[index],next[index+direction]]=[next[index+direction]!,next[index]!]; update(next,id);
        }}>{direction===-1?"Move up":"Move down"}</button>)}
        {create && <button type="button" aria-label={`Remove ${lower(label)}`} disabled={items.length<=min} onClick={()=>update(items.filter((_,i)=>i!==index),items[index+1]?identity(items[index+1]!):items[index-1]?identity(items[index-1]!):"")}>Remove</button>}
        </div>
      </>;
    }}/>
    {create && <button ref={add} type="button" disabled={items.length>=max} onClick={()=>{const item=create();update([...items,item],identity(item));}}>Add {lower(name)}</button>}
  </section>;
}
function LinkFields<T extends ChromeLink>({link,name,onChange}:{link:T;name:string;onChange:(value:T)=>void}) {
  function update(patch:Partial<T>) {onChange({...link,...patch});}
  return <div className="admin-fields">
    <Field label={`${name} label`} value={link.label} maxLength={120} onChange={label=>update({label} as Partial<T>)}/>
    <Field label={`${name} destination`} value={link.href} maxLength={300} onChange={href=>update({href} as Partial<T>)}/>
    <Toggle label={`Show ${lower(name)}`} checked={link.enabled} onChange={enabled=>update({enabled} as Partial<T>)}/>
    <Field label={`${name} enquiry subject`} value={link.enquirySubject??""} maxLength={160} onChange={enquirySubject=>{
      const next={...link}; if(enquirySubject)next.enquirySubject=enquirySubject;else delete next.enquirySubject;onChange(next);
    }}/>
    {"parent" in link && <Toggle label={`${name} parent style`} checked={Boolean(link.parent)} onChange={parent=>onChange({...link,parent})}/>}
    {"cta" in link && <Field label={`${name} call to action`} value={String(link.cta)} maxLength={80} onChange={cta=>onChange({...link,cta})}/>}
  </div>;
}
function Links<T extends ChromeLink>({title,name,items,onChange,max,min=0,create}:{title:string;name:string;items:T[];onChange:(items:T[])=>void;max:number;min?:number;create:()=>T}) {
  return <Rows title={title} name={name} items={items} onChange={onChange} min={min} max={max} create={create} identity={item=>item.id} render={(link,index,update)=><LinkFields link={link} name={`${name} ${index+1}`} onChange={update}/>}/>;
}
function Submenu({name,item,onChange}:{name:string;item:ChromeNavigationItem;onChange:(value:ChromeNavigationItem)=>void}) {
  const [expanded,setExpanded]=useState(false);
  return <details open={expanded}><summary onClick={event=>{event.preventDefault();setExpanded(!expanded);}}>{name} submenu ({item.columns.length} columns)</summary>
    {expanded && <Rows title={`${name} columns`} name={`${name} column`} items={item.columns} max={4} onChange={columns=>onChange({...item,columns})} identity={column=>column.id} create={()=>({id:newId(),links:[{...newLink(),parent:false}]})}
      render={(column,columnIndex,updateColumn)=><>
        <Toggle label={`Show ${lower(name)} column ${columnIndex+1}`} checked={column.links.some(link=>link.enabled)} onChange={enabled=>updateColumn({...column,links:column.links.map(link=>({...link,enabled}))})}/>
        <p>Showing or hiding a column changes all its links.</p>
        <Links title={`${name} column ${columnIndex+1} links`} name={`${name} column ${columnIndex+1} link`} items={column.links} max={12} min={1} create={()=>({...newLink(),parent:false})} onChange={links=>updateColumn({...column,links})}/></>}/>}
  </details>;
}
function NavigationFields({items,onChange}:{items:ChromeNavigationItem[];onChange:(items:ChromeNavigationItem[])=>void}) {
  return <Rows title="Main navigation" name="Navigation item" items={items} onChange={onChange} min={1} max={8} identity={item=>item.id}
    create={()=>({id:newId(),label:"New navigation",href:"/collections/all",enabled:true,feature:"none" as const,columns:[]})}
    render={(item,index,update)=>{
      const name=`Navigation item ${index+1}`;
      return <>
        <div className="admin-fields">
          <Field label={`${name} label`} value={item.label} maxLength={120} onChange={label=>update({...item,label})}/>
          <Field label={`${name} destination`} value={item.href} maxLength={300} onChange={href=>update({...item,href})}/>
          <Toggle label={`Show ${lower(name)}`} checked={item.enabled} onChange={enabled=>update({...item,enabled})}/>
          <label className="admin-field"><span>{name} feature preset</span><select aria-label={`${name} feature preset`} value={item.feature} onChange={event=>update({...item,feature:event.target.value as ChromeNavigationItem["feature"]})}><option value="none">No featured artwork</option><option value="living">Living room artwork</option><option value="bedroom">Bedroom artwork</option></select></label>
        </div>
        <Submenu name={name} item={item} onChange={update}/>
      </>;
    }}/>;
}
function FooterLayout<K extends string>({title,name,items,onChange}:{title:string;name:string;items:{key:K;enabled:boolean}[];onChange:(items:{key:K;enabled:boolean}[])=>void}) {
  const nodes=useRef(new Map<K,HTMLLIElement>()),pending=useRef<K|null>(null);
  useLayoutEffect(()=>{if(pending.current){nodes.current.get(pending.current)?.focus();pending.current=null;}},[items]);
  return <section aria-label={title}><h3>{title}</h3><SortableList items={items} getId={item=>item.key} getLabel={item=>`${name} ${item.key}`} className="admin-section-list" onReorder={next=>onChange(next)}
    rowProps={item=>({tabIndex:-1,"aria-label":`${name} ${item.key}`,ref:(node:HTMLElement|null)=>{if(node)nodes.current.set(item.key,node as HTMLLIElement);else nodes.current.delete(item.key);}})}
    renderItem={(item,index,handle)=><>
    {handle}
    <Toggle label={`Show ${name} ${item.key}`} checked={item.enabled} onChange={enabled=>onChange(items.map(old=>old.key===item.key?{...old,enabled}:old))}/>
    <div className="admin-actions">{([-1,1] as const).map(direction=><button key={direction} type="button" aria-label={`Move ${name} ${item.key} ${direction===-1?"up":"down"}`} disabled={index+direction<0||index+direction>=items.length} onClick={()=>{const next=[...items];[next[index],next[index+direction]]=[next[index+direction]!,next[index]!];pending.current=item.key;onChange(next);}}>{direction===-1?"Move up":"Move down"}</button>)}</div>
  </>}/></section>;
}
const footerTextFields = [
  ["shopHeading","Shop heading",160],["helpHeading","Help heading",160],["careHeading","Customer care heading",160],
  ["contactHeading","Contact heading",160],["bulkHeading","Bulk contact heading",160],["serviceHeading","Service contact heading",160],["findUsHeading","Find us heading",160],
  ["customerPhone","Customer phone",16],["customerPhoneLabel","Customer phone label",60],["customerEmail","Customer email",254],
  ["bulkPhone","Bulk phone",16],["bulkPhoneLabel","Bulk phone label",60],["bulkEmail","Bulk email",254],["copyrightName","Copyright name",160],
] as const;
function FooterFields({value,onChange}:{value:FooterContent;onChange:(value:FooterContent)=>void}) {
  return <>
    <FooterLayout title="Footer columns" name="footer" items={value.columns} onChange={columns=>onChange({...value,columns})}/>
    <FooterLayout title="Footer contact columns" name="footer contact" items={value.contactColumns} onChange={contactColumns=>onChange({...value,contactColumns})}/>
    <h3>Headings and contact details</h3><p>Phone numbers use + and 8–15 digits. Address: 1–4 nonblank lines, up to 160 characters per line. Leave a social profile blank to hide it.</p>
    <div className="admin-fields">{footerTextFields.map(([key,label,max])=><Field key={key} label={label} value={value[key]} maxLength={max} onChange={text=>onChange({...value,[key]:text})}/>)}
      <Field label="Address lines" value={value.addressLines.join("\n")} multiline maxLength={643} onChange={text=>onChange({...value,addressLines:text.split("\n")})}/>
      <Field label="Instagram profile" value={value.instagram??""} maxLength={300} onChange={text=>onChange({...value,instagram:text||null})}/>
      <Field label="LinkedIn company profile" value={value.linkedin??""} maxLength={300} onChange={text=>onChange({...value,linkedin:text||null})}/>
    </div>
    <Links title="Footer shop links" name="Footer shop link" items={value.shopLinks} max={12} create={newLink} onChange={shopLinks=>onChange({...value,shopLinks})}/>
    <Links title="Footer help links" name="Footer help link" items={value.helpLinks} max={12} create={newLink} onChange={helpLinks=>onChange({...value,helpLinks})}/>
    <Links title="Footer policy links" name="Footer policy link" items={value.policyLinks} max={8} create={newLink} onChange={policyLinks=>onChange({...value,policyLinks})}/>
  </>;
}
export function SiteChromeFields({value,onChange}:{value?:SiteChrome;onChange:(value:SiteChrome|undefined)=>void}) {
  const current=value??resolveSiteChrome(),heading=useRef<HTMLHeadingElement>(null),resetFocus=useRef(false);
  const [section,setSection]=useState("announcement");
  useLayoutEffect(()=>{if(resetFocus.current){heading.current?.focus();resetFocus.current=false;}},[value]);
  function update(patch:Partial<SiteChrome>) {onChange({...current,...patch});}
  return <section className="admin-site-chrome" aria-label="Navigation and footer controls">
    <h2 ref={heading} tabIndex={-1}>Navigation &amp; footer</h2>
    <p>Edit storefront links and contact information. Save a draft, then publish when ready. Product availability and prices remain managed by Keeri.</p>
    <p>Destinations must be local storefront paths (for example /collections/all or /pages/contact). Enquiry subjects are optional and only work with /pages/contact. Labels: up to 120 characters; enquiry subjects: up to 160.</p>
    <button type="button" disabled={value===undefined} onClick={()=>{resetFocus.current=true;onChange(undefined);}}>Restore original navigation &amp; footer</button>
    <label className="admin-field"><span>Editing section</span><select aria-label="Navigation & footer section" value={section} onChange={event=>setSection(event.target.value)}><option value="announcement">Announcement &amp; WhatsApp</option><option value="header">Header links</option><option value="navigation">Main navigation</option><option value="footer">Footer</option></select></label>
    {section==="announcement" && <>
      <h3>Announcement</h3><div className="admin-fields">
        <Toggle label="Show announcement" checked={current.announcement.enabled} onChange={enabled=>update({announcement:{...current.announcement,enabled}})}/>
        <Field label="Announcement text" value={current.announcement.text} maxLength={200} onChange={text=>update({announcement:{...current.announcement,text}})}/>
        <Field label="Announcement destination" value={current.announcement.href} maxLength={300} onChange={href=>update({announcement:{...current.announcement,href}})}/>
      </div><h3>WhatsApp</h3><p>Phone numbers use + and 8–15 digits.</p><div className="admin-fields">
        <Toggle label="Show WhatsApp" checked={current.whatsapp.enabled} onChange={enabled=>update({whatsapp:{...current.whatsapp,enabled}})}/>
        <Field label="WhatsApp phone" value={current.whatsapp.phone} maxLength={16} onChange={phone=>update({whatsapp:{...current.whatsapp,phone}})}/>
        <Field label="WhatsApp label" value={current.whatsapp.label} maxLength={120} onChange={label=>update({whatsapp:{...current.whatsapp,label}})}/>
      </div>
    </>}
    {section==="header" && <>
      <Links title="Utility links" name="Utility link" items={current.utilityLinks} max={6} create={newLink} onChange={utilityLinks=>update({utilityLinks})}/>
      <Links title="Desktop discovery" name="Desktop discovery link" items={current.desktopDiscovery} max={6} create={()=>({...newLink(),cta:"View all"})} onChange={desktopDiscovery=>update({desktopDiscovery})}/>
      <Links title="Mobile quick links" name="Mobile quick link" items={current.mobileQuickLinks} max={8} create={newLink} onChange={mobileQuickLinks=>update({mobileQuickLinks})}/>
    </>}
    {section==="navigation" && <NavigationFields items={current.navigation} onChange={navigation=>update({navigation})}/>}
    {section==="footer" && <FooterFields value={current.footer} onChange={footer=>update({footer})}/>}
  </section>;
}
