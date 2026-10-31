import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeProjectForm, HomeNewsletterForm } from "../components/store/home/forms";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useEnquiry } from "../components/use-enquiry";
import { createEnquirySender } from "../lib/enquiry-client";
const input={kind:"contact" as const,name:"Test",email:"test@example.invalid",phone:"",message:"Synthetic",context:{product:"",variant:"",sku:"",pincode:""}};
const receipt={reference:"enq_00000000-0000-4000-8000-000000000000",mode:"preview",notificationSent:false};
test("a lost response retries with the same idempotency key; edits get a new key",async()=>{
 const keys:string[]=[];let attempts=0;
 const send=createEnquirySender(async (_url,options)=>{keys.push(new Headers(options?.headers).get("Idempotency-Key")!);if(++attempts===1)throw Error("network");return Response.json(receipt);});
 await assert.rejects(()=>send(input),/try again/);
 assert.deepEqual(await send(input),receipt);
 await send({...input,message:"Changed"});
 assert.equal(keys[0],keys[1]);assert.notEqual(keys[1],keys[2]);
});
test("a successful HTTP response without a valid receipt never implies success",async()=>{
 const send=createEnquirySender(async()=>Response.json({success:true}));
 await assert.rejects(()=>send(input),/try again/);
});
test("rate-limit responses use a clear bounded message and do not echo server input",async()=>{
 const send=createEnquirySender(async()=>Response.json({message:"private backend contents"},{status:429}));
 await assert.rejects(()=>send(input),/Too many/);
});
test("context accepts the full catalogue product and variant title limits",async()=>{
 const send=createEnquirySender(async()=>Response.json(receipt));
 assert.deepEqual(await send({...input,context:{...input.context,product:"P".repeat(500),variant:"V".repeat(300)}}),receipt);
});


test("saved receipt retains preview reference without claiming the asynchronous team alert was unsent", async () => {
 const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/contact" });
 Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
 const container = document.getElementById("root")!;
 const previous = fetch;
 globalThis.fetch = async () => Response.json(receipt);
 function ReceiptForm() {
  const enquiry = useEnquiry();
  return <><button onClick={() => void enquiry.submit(input)}>Submit enquiry</button><p role={enquiry.failed ? "alert" : "status"}>{enquiry.message}</p></>;
 }
 const root = createRoot(container);
 try {
  await act(async () => root.render(<ReceiptForm />));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  const status = container.querySelector('[role="status"]')?.textContent ?? "";
  assert.match(status, /Your enquiry has been saved/);
  assert.match(status, /Reference: enq_00000000-0000-4000-8000-000000000000/);
  assert.doesNotMatch(status, /development preview|notification/i);
  assert.doesNotMatch(status, /has not been sent to our team/);
  assert.equal(container.querySelector('[role="alert"]'), null);
 } finally { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.close(); }
});


test("project preview notice leaves asynchronous notification unconfirmed and preserves newsletter availability", () => {
 const dom = new JSDOM(renderToStaticMarkup(<><HomeProjectForm /><HomeNewsletterForm /></>));
 try {
  const notice = dom.window.document.querySelector("[data-project-form] [data-preview-detail]")?.textContent ?? "";
  assert.equal(notice, "");
  assert.doesNotMatch(notice, /saved locally|notifications are not connected|has not been sent to our team/);
  assert.equal(dom.window.document.querySelector("[data-newsletter-form] [data-preview-detail]")?.textContent, "Newsletter signup is not available yet.");
 } finally { dom.window.close(); }
});
