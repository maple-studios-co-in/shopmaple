import assert from "node:assert/strict";
import test from "node:test";
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
