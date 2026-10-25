import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
const url=process.env.TEST_DATABASE_URL;
if(!url || new URL(url).pathname!=="/shopmaple_test") throw Error("Dedicated test database required");
const db=new PrismaClient({datasources:{db:{url}}});
const origin="http://localhost:3000";
const app=createApp(db,{webOrigin:origin,catalogMode:"preview",secureCookies:false});
after(async()=>db.$disconnect());
test("enquiries are durably accepted without sending email or claiming team delivery",async()=>{
 const result=await request(app).post("/api/enquiries").set("Origin",origin).set("Idempotency-Key",randomUUID()).send({kind:"contact",name:"Test Visitor",email:"enquiry-test@example.invalid",phone:"",message:"Synthetic test enquiry",context:{product:"Aero",variant:"Taupe",sku:"TEST-SKU",pincode:"110015"}});
 assert.equal(result.status,201);
 assert.match(result.body.reference,/^enq_/);
 assert.equal(result.body.mode,"preview");
 assert.equal(result.body.notificationSent,false);
 assert.equal(result.body.email,undefined);
});
const sample={kind:"contact",email:"enquiry-test@example.invalid",message:"Synthetic integration test"};
function client(){return request(createApp(db,{webOrigin:origin,catalogMode:"preview",secureCookies:false}));}
test("concurrent retry returns one durable receipt; changed payload conflicts",async()=>{
 const key=randomUUID(),http=client();
 const send=(body:object)=>http.post("/api/enquiries").set("Origin",origin).set("Idempotency-Key",key).send(body);
 const results=await Promise.all([send(sample),send(sample)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
 assert.equal(results[0]!.body.reference,results[1]!.body.reference);
 assert.equal(await db.enquiry.count({where:{id:results[0]!.body.reference}}),1);
 assert.equal((await send({...sample,message:"changed"})).status,409);
 const row=await db.enquiry.findUniqueOrThrow({where:{id:results[0]!.body.reference}});
 assert.equal(row.message,sample.message);assert.equal(row.status,"new");
 assert.match(String(results[0]!.headers['cache-control']),/no-store/);
});
test("enquiry validation rejects bad keys, injected properties and invalid bulk/context",async()=>{
 const http=client();
 const send=(body:object,key:string=randomUUID())=>http.post("/api/enquiries").set("Origin",origin).set("Idempotency-Key",key).send(body);
 for(const body of [{...sample,email:"bad"},{...sample,kind:"bulk"},{...sample,context:{pincode:"abc"}},{...sample,status:"sent"},{...sample,message:"x".repeat(5001)}]) assert.equal((await send(body)).status,400);
 assert.equal((await send(sample,"invalid")).status,400);
});
test("cross-origin submissions and public enquiry reads are unavailable",async()=>{
 const http=client();
 assert.equal((await http.post("/api/enquiries").set("Origin","https://other.invalid").set("Idempotency-Key",randomUUID()).send(sample)).status,403);
 assert.equal((await http.get("/api/enquiries")).status,404);
 assert.equal((await http.post("/api/enquiries").send(sample)).status,403);
});
test("enquiries enforce body size and a bounded submission rate",async()=>{
 const http=client();
 assert.equal((await http.post("/api/enquiries").set("Origin",origin).set("Idempotency-Key",randomUUID()).send({...sample,message:"x".repeat(17000)})).status,413);
 const key=randomUUID();
 for(let i=0;i<10;i++) assert.equal((await http.post("/api/enquiries").set("Origin",origin).set("Idempotency-Key",key).send(sample)).status,i===0?201:200);
 const result=await http.post("/api/enquiries").set("Origin",origin).set("Idempotency-Key",key).send(sample);
 assert.equal(result.status,429);assert.equal(result.body.code,"TOO_MANY_ENQUIRIES");
});
