import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ContentEditor } from "../components/admin/editor";
import { defaultStorefrontContent } from "../lib/content-defaults";
const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost:3000/admin"});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const container=document.getElementById("root")!;
function button(name:string){const found=[...container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.getAttribute("aria-label")===name||b.textContent===name);assert.ok(found,`Missing ${name} button`);return found;}
async function fill(label:string,value:string){const field=container.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`);assert.ok(field,`Missing ${label} input`);await act(async()=>{Object.getOwnPropertyDescriptor(field.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype,"value")!.set!.call(field,value);field.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});}
async function page(value:string){const select=container.querySelector<HTMLSelectElement>('[aria-label="Existing page"]');assert.ok(select);await act(async()=>{select.value=value;select.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});for(const details of container.querySelectorAll<HTMLDetailsElement>('[aria-label="Service page content"] details')){await act(async()=>details.querySelector<HTMLElement>("summary")!.click());assert.equal(details.open,true);}}
for(const conflict of[false,true]) test(`staff edit Contact, Bulk and Returns through private draft (${conflict?"conflict":"saved"})`,async()=>{
  const previous=globalThis.fetch;const root=createRoot(container);const initial=structuredClone(defaultStorefrontContent);delete(initial as Record<string,unknown>).servicePages;
  let saved:Record<string,any>|undefined;let puts=0;
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),"/api/admin/content","No publish or operational endpoint may be called");if(init?.method==="PUT"){puts++;assert.equal(new Headers(init.headers).get("X-CSRF-Token"),"c".repeat(64));saved=JSON.parse(String(init.body));return conflict?Response.json({error:"Version conflict"},{status:409}):Response.json({version:5,draft:saved!.content,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});}return Response.json({version:4,draft:initial,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});};
  try{
    await act(async()=>root.render(<ContentEditor session={{user:{id:"editor",email:"editor@example.test",role:"editor"},csrfToken:"c".repeat(64)}} initialContent={defaultStorefrontContent} onExpired={()=>assert.fail("Unexpected expiry")}/>));
    await act(async()=>button("Existing pages").click());await page("contact");
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Contact page title"]')?.value,"Contact Us","Contact template must be editable");
    await fill("Contact page title","Talk to Maple");await fill("Contact heading","A home made around you");await fill("Contact help heading","Find an answer");
    await fill("Contact Tracking category title","Your delivery");await fill("Contact Tracking question 1","Where is my order?");await fill("Contact Tracking answer 1","<script>literal text</script> Contact our team.");
    await fill("Contact cities heading","Cities we serve");
    const move=button("Move Contact Help up");move.focus();await act(async()=>move.click());assert.equal(document.activeElement,move);assert.equal(move.disabled,true);
    await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Show Contact Cities"]')!.click());
    await page("bulk");assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Bulk page title"]')?.value,"Bulk Enquiry");
    await fill("Bulk heading","Spaces for your business");await fill("Bulk trust heading","Built with care");await fill("Bulk project count","125+");
    await fill("Bulk Quality promise","Carefully checked");await fill("Bulk process heading","Your project journey");await fill("Bulk Meet step body","Tell us about your space.");
    await fill("Bulk business body","Discuss your furnishing project.");await fill("Bulk business feature 1","Furniture for your brief");await fill("Bulk business button","Discuss bulk furniture");
    const bulkMove=button("Move Bulk Process up");bulkMove.focus();await act(async()=>bulkMove.click());assert.equal(document.activeElement,bulkMove);
    await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Show Bulk Hero and form"]')!.click());
    await page("returns");assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Returns heading"]')?.value,"Return & Exchange");
    await fill("Returns page title","");await act(async()=>button("Save draft").click());assert.equal(puts,0,"Invalid copy must not be sent");
    await fill("Returns page title","Returns support");await fill("Returns heading","Help with a return");await fill("Returns policy link label","Read our refund policy");await fill("Returns introduction","Tell us about your order.");
    await page("contact");assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Contact heading"]')?.value,"A home made around you","Page switching preserves edits");
    await act(async()=>button("Save draft").click());assert.ok(saved);assert.equal(puts,1);assert.equal(saved.expectedVersion,4);
    const c=saved.content.servicePages;
    assert.equal(c.contact.title,"Talk to Maple");assert.equal(c.contact.helpHeading,"Find an answer");assert.equal(c.contact.cities.heading,"Cities we serve");
    assert.deepEqual(c.contact.sections,[{key:"help",enabled:true},{key:"intro",enabled:true},{key:"cities",enabled:false}]);
    assert.equal(c.contact.categories[0].key,"tracking");assert.equal(c.contact.categories[0].title,"Your delivery");assert.deepEqual(c.contact.categories[0].questions[0],{key:"q1",question:"Where is my order?",answer:"<script>literal text</script> Contact our team."});
    assert.equal(c.bulk.heading,"Spaces for your business");assert.equal(c.bulk.trust.metricValue,"125+");assert.equal(c.bulk.trust.items.find((i:any)=>i.key==="quality").title,"Carefully checked");
    assert.deepEqual(c.bulk.sections.slice(0,3),[{key:"hero",enabled:false},{key:"process",enabled:true},{key:"trust",enabled:true}]);
    assert.equal(c.bulk.process.steps.find((i:any)=>i.key==="meet").body,"Tell us about your space.");assert.equal(c.bulk.business.features[0],"Furniture for your brief");assert.equal(c.bulk.business.cta,"Discuss bulk furniture");
    assert.deepEqual(c.returns,{title:"Returns support",heading:"Help with a return",policyLabel:"Read our refund policy",intro:"Tell us about your order."});
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Contact heading"]')?.value,"A home made around you","Conflict retains local edits");
    assert.match(container.textContent??"",conflict?/another editor|changed|conflict/i:/Draft saved/);assert.match(container.textContent??"",/Published version 2/);
    assert.equal([...container.querySelectorAll("button")].some(b=>b.textContent==="Publish draft"),false);assert.equal(container.querySelector("script"),null);
  }finally{await act(async()=>root.unmount());globalThis.fetch=previous;}
});
