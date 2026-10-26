import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { defaultStorefrontContent } from "../lib/content-defaults";

const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost:3000/admin"});
Object.assign(globalThis, {window:dom.window, document:dom.window.document, HTMLElement:dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot} = await import("react-dom/client");
const {ContentEditor} = await import("../components/admin/editor");
const container = document.getElementById("root")!;
function button(name:string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.getAttribute("aria-label")===name || el.textContent===name);
  assert.ok(found, `Missing ${name} button`); return found;
}
function field(name:string) {
  const found = [...container.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>("input,textarea,select")].find(el=>el.getAttribute("aria-label")===name);
  assert.ok(found, `Missing ${name} field`); return found;
}
async function click(name:string) { await act(async()=>button(name).click()); }
async function type(name:string,value:string) {
  const input=field(name);
  await act(async()=>{
    const proto = input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : input.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(input,value);
    input.dispatchEvent(new dom.window.Event(input.tagName === "SELECT" ? "change" : "input",{bubbles:true}));
  });
}
async function toggle(name:string) { await act(async()=> (field(name) as HTMLInputElement).click()); }
async function setup(status=200, role:"editor"|"publisher"="editor") {
  const previous=globalThis.fetch, root=createRoot(container), initial=structuredClone(defaultStorefrontContent);
  delete initial.siteChrome;
  let saved:any, expired=0; const calls:string[]=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),"/api/admin/content","Editing never publishes"); calls.push(init?.method??"GET");
    if(init?.method==="PUT") {
      saved=JSON.parse(String(init.body));
      assert.equal(new Headers(init.headers).get("X-CSRF-Token"),"c".repeat(64));
      return status===200 ? Response.json({version:5,draft:saved.content,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"}) : Response.json({error:"Rejected"},{status});
    }
    return Response.json({version:4,draft:initial,publishedVersion:2,updatedAt:"2026-10-26T12:00:00Z"});
  };
  await act(async()=>root.render(<ContentEditor session={{user:{id:"staff",email:"staff@example.test",role},csrfToken:"c".repeat(64)}} initialContent={defaultStorefrontContent} onExpired={()=>{expired++;}}/>));
  return {initial,calls,saved:()=>saved,expired:()=>expired,close:async()=>{await act(async()=>root.unmount());globalThis.fetch=previous;}};
}

test("existing draft edits preserve version and permissions without publishing",async()=>{
  const app=await setup(); try {
    assert.equal(button("Save draft").disabled,true);
    await click("Homepage"); await type("Category heading","Independent heading"); await click("Save draft");
    assert.equal(app.saved().expectedVersion,4); assert.equal(app.saved().content.homeCopy.categoryHeading,"Independent heading");
    assert.equal(container.textContent?.includes("Publish draft"),false);
  } finally { await app.close(); }
});

test("navigation editing retains invalid text until save and restore removes only its override",async()=>{
  const app=await setup(); try {
    await click("Homepage"); await type("Category heading","Sibling edit");
    await click("Navigation & footer"); assert.equal(button("Restore original navigation & footer").disabled,true);
    await type("Announcement text","Fresh announcement"); await type("Announcement destination","/collections/");
    await type("WhatsApp label","Message our team");
    assert.equal(field("Announcement destination").value,"/collections/");
    await click("Save draft"); assert.deepEqual(app.calls,["GET"]); assert.match(container.querySelector('[role="alert"]')?.textContent??"",/siteChrome/);
    await type("Announcement destination","/collections/all"); await click("Save draft");
    assert.equal(app.saved().content.siteChrome.announcement.text,"Fresh announcement");
    assert.equal(app.saved().content.siteChrome.whatsapp.label,"Message our team");
    assert.equal(app.saved().content.homeCopy.categoryHeading,"Sibling edit");
    await click("Restore original navigation & footer"); await click("Save draft");
    assert.equal(Object.hasOwn(app.saved().content,"siteChrome"),false);
    assert.equal(app.saved().content.homeCopy.categoryHeading,"Sibling edit");
    assert.deepEqual(app.calls,["GET","PUT","PUT"]);
  } finally { await app.close(); }
});

test("links and navigation preserve IDs across edits, moves, nested editing and removal focus",async()=>{
  const app=await setup(); try {
    await click("Navigation & footer"); await type("Navigation & footer section","header"); await click("Add utility link");
    const utilityRows=()=>[...container.querySelectorAll<HTMLElement>('[aria-label="Utility links"] [data-chrome-row]')];
    const added=utilityRows().at(-1)!; const id=added.dataset.chromeRow!;
    const index=utilityRows().length;
    await type(`Utility link ${index} label`,"Ask us"); await type(`Utility link ${index} destination`,"/pages/contact"); await type(`Utility link ${index} enquiry subject`,"Dining tables");
    button(`Move utility link ${index} up`).focus(); await click(`Move utility link ${index} up`);
    assert.equal((document.activeElement as HTMLElement).dataset.chromeRow,id);
    await click("Save draft");
    assert.equal(app.saved().content.siteChrome.utilityLinks[index-2].id,id);
    assert.equal(app.saved().content.siteChrome.utilityLinks[index-2].enquirySubject,"Dining tables");
    await click(`Remove utility link ${index-1}`);
    assert.notEqual(document.activeElement,document.body);
    await type("Navigation & footer section","navigation"); await click("Add navigation item");
    const navIndex=container.querySelectorAll('[aria-label="Main navigation"] > ol > li').length;
    await type(`Navigation item ${navIndex} label`,"Inspiration");
    await type(`Navigation item ${navIndex} destination`,"/collections/all");
    await type(`Navigation item ${navIndex} feature preset`,"bedroom");
    const submenu=[...container.querySelectorAll("summary")].find(node=>node.textContent?.startsWith(`Navigation item ${navIndex} submenu`));
    assert.ok(submenu); await act(async()=>submenu.click());
    await click(`Add navigation item ${navIndex} column`);
    await type(`Navigation item ${navIndex} column 1 link 1 label`,"Beds");
    await type(`Navigation item ${navIndex} column 1 link 1 destination`,"/collections/beds");
    await toggle(`Show navigation item ${navIndex} column 1 link 1`);
    await toggle(`Navigation item ${navIndex} column 1 link 1 parent style`);
    await click("Save draft"); const nav=app.saved().content.siteChrome.navigation.at(-1);
    assert.equal(nav.label,"Inspiration"); assert.equal(nav.feature,"bedroom");
    assert.equal(nav.columns[0].links[0].label,"Beds"); assert.equal(nav.columns[0].links[0].enabled,false); assert.equal(nav.columns[0].links[0].parent,true);
  } finally { await app.close(); }
});

test("footer details, layout and discovery edits save together with no publication",async()=>{
  const app=await setup(); try {
    await click("Navigation & footer");
    await type("Navigation & footer section","footer"); await click("Move footer help up"); await toggle("Show footer care"); await click("Move footer contact service up");
    await type("Shop heading","Browse furniture"); await type("Address lines","First address\nSecond address");
    await type("Customer phone","+919876543210"); await type("Customer email","care@example.test"); await type("Instagram profile","");
    await type("LinkedIn company profile","https://www.linkedin.com/company/maple-furnishers");
    await type("Navigation & footer section","header"); await click("Add desktop discovery link");
    const discoveryCount=container.querySelectorAll('[aria-label="Desktop discovery"] > ol > li').length;
    await type(`Desktop discovery link ${discoveryCount} call to action`,"Read more");
    await click("Save draft"); const chrome=app.saved().content.siteChrome;
    assert.deepEqual(chrome.footer.columns.map((x:any)=>x.key),["help","shop","care"]); assert.equal(chrome.footer.columns[2].enabled,false);
    assert.equal(chrome.footer.contactColumns[0].key,"service"); assert.equal(chrome.footer.shopHeading,"Browse furniture");
    assert.deepEqual(chrome.footer.addressLines,["First address","Second address"]); assert.equal(chrome.footer.customerEmail,"care@example.test");
    assert.equal(chrome.footer.instagram,null); assert.equal(chrome.desktopDiscovery.at(-1).cta,"Read more");
  } finally { await app.close(); }
});

test("chrome editing uses existing conflict and expired-session handling",async()=>{
  for (const status of [409,401]) {
    const app=await setup(status,"publisher"); try {
      await click("Navigation & footer"); await type("Announcement text","Retained draft");
      assert.equal(button("Publish draft").disabled,true); await click("Save draft");
      assert.equal(field("Announcement text").value,"Retained draft");
      if(status===409) {assert.match(container.textContent??"",/Another editor saved/); assert.equal(button("Save draft").disabled,true);}
      else assert.equal(app.expired(),1);
    } finally { await app.close(); }
  }
});

test("nested column visibility hides its links while list bounds and removal keep usable focus",async()=>{
  const app=await setup(); try {
    await click("Navigation & footer"); await type("Navigation & footer section","navigation");
    const summary=[...container.querySelectorAll("summary")].find(node=>node.textContent?.startsWith("Navigation item 1 submenu"));
    assert.ok(summary); await act(async()=>summary.click());
    await toggle("Show navigation item 1 column 1"); await click("Save draft");
    assert.ok(app.saved().content.siteChrome.navigation[0].columns[0].links.every((item:any)=>item.enabled===false));
    await toggle("Show navigation item 1 column 1"); await click("Save draft");
    assert.ok(app.saved().content.siteChrome.navigation[0].columns[0].links.every((item:any)=>item.enabled===true));
    await type("Navigation & footer section","header");
    while(!button("Add utility link").disabled) await click("Add utility link");
    assert.equal(container.querySelectorAll('[aria-label="Utility links"] > ol > li').length,6);
    assert.equal(button("Move utility link 1 up").disabled,true);
    assert.equal(button("Move utility link 6 down").disabled,true);
    for(let i=6;i>0;i--) await click(`Remove utility link ${i}`);
    assert.equal(document.activeElement,button("Add utility link"));
    await click("Save draft"); assert.deepEqual(app.saved().content.siteChrome.utilityLinks,[]);
    await type("Navigation & footer section","navigation");
    while(!button("Add navigation item").disabled) await click("Add navigation item");
    assert.equal(container.querySelectorAll('[aria-label="Main navigation"] > ol > li').length,8);
    for(let i=8;i>1;i--)await click(`Remove navigation item ${i}`);
    assert.equal(button("Remove navigation item 1").disabled,true);
    assert.equal(document.activeElement?.getAttribute("aria-label"),"Navigation item 1");
  } finally { await app.close(); }
});
