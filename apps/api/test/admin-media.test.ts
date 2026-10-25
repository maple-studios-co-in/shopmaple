import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { HttpError } from "../src/cart.js";
import { registerMediaRoutes, prepareMediaForPublication } from "../src/admin/media.js";
const url = process.env.TEST_DATABASE_URL;
if(!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({datasources:{db:{url}}});
const origin="http://localhost:3000", token=randomBytes(32).toString("hex"), digest=(v:string)=>createHash("sha256").update(v).digest("hex");
let root:string, staffId:string, png:Buffer;
function app(mediaRoot:string|null=root) {
 const app=express();registerMediaRoutes(app,db,{webOrigin:origin,secureCookies:false,mediaRoot:mediaRoot ?? undefined});
 app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(err instanceof HttpError)res.status(err.status).json({code:err.code,message:err.message});
  else if((err as {type?:string})?.type==="entity.too.large")res.status(413).json({code:"REQUEST_TOO_LARGE"});
  else res.status(500).json({code:"SERVER_ERROR"});
 });return app;
}
function upload(http=request(app()), bytes=png, type="image/png") {return http.post("/api/admin/media").set("Origin",origin).set("Cookie",`shop_admin=${token}`).set("X-CSRF-Token",digest("csrf:"+token)).set("Content-Type",type).set("X-Media-Label",encodeURIComponent("Room interior")).send(bytes);}
function staff(http=request(app())) {return http.get("/api/admin/media").set("Cookie",`shop_admin=${token}`);}
before(async()=>{
 root=await mkdtemp(join(tmpdir(),"shop-media-test-"));
 const admin=await db.shopAdmin.create({data:{email:`media-${randomBytes(6).toString("hex")}@example.invalid`,passwordHash:"unused-test-password-hash",role:"publisher"}});staffId=admin.id;
 await db.shopAdminSession.create({data:{adminId:staffId,tokenHash:digest(token),expiresAt:new Date(Date.now()+600000)}});
 png=await sharp({create:{width:3000,height:1500,channels:3,background:"#987654"}}).png().toBuffer();
});
after(async()=>{
 if(staffId){await db.shopContentRevision.deleteMany({where:{actorId:staffId}});await db.shopMediaAsset.deleteMany({where:{createdById:staffId}});await db.shopAdminSession.deleteMany({where:{adminId:staffId}});await db.shopAdmin.deleteMany({where:{id:staffId}});}
 await db.$disconnect();if(root)await rm(root,{recursive:true,force:true});
});
test("upload authenticates and checks CSRF/Origin before image parsing",async()=>{
 const http=request(app());
 assert.equal((await http.post("/api/admin/media").set("Origin",origin).set("Content-Type","application/json").send("{broken")).status,401);
 assert.equal((await http.post("/api/admin/media").set("Origin",origin).set("Cookie",`shop_admin=${token}`).set("Content-Type","image/png").send("bad")).status,403);
 assert.equal((await http.post("/api/admin/media").set("Origin","https://attacker.invalid").set("Cookie",`shop_admin=${token}`).set("X-CSRF-Token",digest("csrf:"+token)).send("bad")).status,403);
 assert.equal((await http.get("/api/admin/media")).status,401);
});
test("upload normalizes to metadata-free bounded WebP and deduplicates immutable files",async()=>{
 const response=await upload();assert.equal(response.status,201);
 const asset=response.body.asset;assert.equal(asset.width,2560);assert.equal(asset.height,1280);assert.equal(asset.label,"Room interior");assert.equal(asset.mimeType,"image/webp");assert.equal(asset.publicAt,null);
 assert.match(asset.sha256,/^[a-f0-9]{64}$/);assert.equal(asset.url,`/media/uploads/${asset.sha256}.webp`);
 const file=await readFile(join(root,`${asset.sha256}.webp`));
 assert.equal(createHash("sha256").update(file).digest("hex"),asset.sha256);
 const metadata=await sharp(file).metadata();assert.equal(metadata.format,"webp");assert.equal(metadata.exif,undefined);
 const repeated=await upload();assert.equal(repeated.status,200);assert.equal(repeated.body.asset.id,asset.id);assert.equal((await readdir(root)).length,1);
 const listed=await staff();assert.equal(listed.status,200);assert.equal(listed.body.assets[0].id,asset.id);assert.equal(listed.body.nextCursor,null);assert.match(String(listed.headers["cache-control"]),/no-store/);
 const preview=await request(app()).get(asset.previewUrl).set("Cookie",`shop_admin=${token}`);assert.equal(preview.status,200);assert.match(String(preview.headers["cache-control"]),/no-store/);
 assert.equal((await request(app()).get(asset.previewUrl)).status,401);
 assert.equal((await request(app()).get(asset.url)).status,404);
});
test("invalid format, spoofed MIME, animated and oversized images are rejected",async()=>{
 for(const [body,type] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),"image/png"],[png,"image/jpeg"],[Buffer.from("not an image"),"image/png"],[Buffer.alloc(8*1024*1024+1),"image/png"]] as const){const r=await upload(request(app()),body,type);assert.ok([400,413,415].includes(r.status),`received ${r.status}`);}
 const huge=await sharp({create:{width:5000,height:5000,channels:3,background:"white"}}).png().toBuffer();assert.equal((await upload(request(app()),huge)).status,400);
 const frames=Buffer.alloc(24,128);frames.fill(0,12);const animated=await sharp(frames,{raw:{width:2,height:4,channels:3,pageHeight:2}}).webp({loop:0,delay:[100,100]}).toBuffer();assert.equal((await upload(request(app()),animated,"image/webp")).status,400);
});
test("missing persistent root disables uploads and pagination rejects invalid cursors",async()=>{
 assert.equal((await upload(request(app(null)))).status,503);
 const bad=await request(app()).get("/api/admin/media?limit=1000").set("Cookie",`shop_admin=${token}`);assert.equal(bad.status,400);
 assert.equal((await request(app()).get("/media/uploads/../../secret")).status,404);
});
test("publication resolves every managed reference atomically and only exposes committed assets",async()=>{
 const uploaded=await upload();assert.ok([200,201].includes(uploaded.status));const asset=uploaded.body.asset;
 await assert.rejects(db.$transaction(tx=>prepareMediaForPublication(tx,{instagramPosts:[{src:asset.url},{src:`/media/uploads/${"f".repeat(64)}.webp`}]},root)),(e:unknown)=>e instanceof HttpError&&e.status===400);
 assert.equal((await request(app()).get(asset.url)).status,404);
 await assert.rejects(db.$transaction(async tx=>{await prepareMediaForPublication(tx,{instagramPosts:[{src:asset.url}]},root);throw Error("rollback");}),/rollback/);
 assert.equal((await request(app()).get(asset.url)).status,404);
 await db.$transaction(tx=>prepareMediaForPublication(tx,{campaigns:[{artwork:{desktopImage:asset.url,mobileImage:asset.url}}]},root));
 const publicResponse=await request(app()).get(asset.url);assert.equal(publicResponse.status,200);assert.match(String(publicResponse.headers["cache-control"]),/immutable/);assert.equal(publicResponse.headers["content-type"],"image/webp");
 assert.equal((await request(app()).get(`/media/uploads/${"b".repeat(64)}.webp`)).status,404);
});
test("concurrent identical uploads create one asset and no temporary leftovers",async()=>{
 const other=await sharp({create:{width:30,height:20,channels:3,background:"#123456"}}).png().toBuffer();
 const responses=await Promise.all([upload(request(app()),other),upload(request(app()),other)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);assert.equal(responses[0]!.body.asset.id,responses[1]!.body.asset.id);
 assert.ok((await readdir(root)).every(name=>/^[a-f0-9]{64}\.webp$/.test(name)));
});
test("upload rate limit bounds repeated authenticated decoding requests",async()=>{
 const http=request(app());
 const results=[];for(let i=0;i<11;i++)results.push((await upload(http,Buffer.from("bad"))).status);
 assert.equal(results[0],400);assert.equal(results[10],429);
});
test("library pagination is stable and private metadata never leaks creator credentials",async()=>{
 const first=await request(app()).get("/api/admin/media?limit=1").set("Cookie",`shop_admin=${token}`);
 assert.equal(first.status,200);assert.equal(first.body.assets.length,1);assert.ok(first.body.nextCursor);
 assert.equal(first.body.assets[0].createdById,undefined);assert.equal(first.body.assets[0].storageKey,undefined);
 const next=await request(app()).get(`/api/admin/media?limit=1&cursor=${first.body.nextCursor}`).set("Cookie",`shop_admin=${token}`);
 assert.equal(next.status,200);assert.equal(next.body.assets.length,1);assert.notEqual(next.body.assets[0].id,first.body.assets[0].id);
 assert.equal((await request(app()).get("/api/admin/media?cursor=missing").set("Cookie",`shop_admin=${token}`)).status,400);
});
test("quota rejects new assets while allowing deduplicated selections and counts on-disk orphan files",async()=>{
 const {open,unlink}=await import("node:fs/promises");
 const different=await sharp({create:{width:15,height:25,channels:3,background:"#654321"}}).png().toBuffer();
 const orphan=join(root,"orphan.webp"), file=await open(orphan,"wx");await file.truncate(250*1024*1024);await file.close();
 try {const rejected=await upload(request(app()),different);assert.equal(rejected.status,409);assert.equal(rejected.body.code,"MEDIA_QUOTA_REACHED");assert.equal((await upload()).status,200);}finally{await unlink(orphan);}
 const count=await db.shopMediaAsset.count(), ids:string[]=[];
 try {
  await db.shopMediaAsset.createMany({data:Array.from({length:500-count},(_,i)=>{const id=`cquota${i}`,sha256=i.toString(16).padStart(64,"0");ids.push(id);return {id,sha256,storageKey:`${sha256}.webp`,label:"Quota fixture",width:1,height:1,bytes:1,mimeType:"image/webp",createdById:staffId};})});
  assert.equal((await upload(request(app()),different)).status,409);assert.equal((await upload()).status,200);
 }finally{await db.shopMediaAsset.deleteMany({where:{id:{in:ids}}});}
});
test("malformed managed references cannot bypass publication checks",async()=>{
 for(const image of ["/media/uploads/../private.png",`/media/uploads/${"a".repeat(64)}.webp?draft=1`,"/media/uploads/not-a-hash.webp"]){await assert.rejects(db.$transaction(tx=>prepareMediaForPublication(tx,{pages:[{banner:{desktopImage:image,mobileImage:image}}]},root)),(e:unknown)=>e instanceof HttpError&&e.code==="MEDIA_REFERENCE_INVALID");}
});
test("real app keeps saved draft images private, publishes atomically and rejects missing references",async()=>{
 const http=request(createApp(db,{webOrigin:origin,catalogMode:"preview",secureCookies:false,mediaRoot:root}));
 assert.equal((await http.post("/api/admin/media").set("Origin",origin).set("Content-Type","application/json").send("{invalid")).status,401);
 const input=await sharp({create:{width:64,height:32,channels:3,background:"#aabbcc"}}).png().toBuffer();
 const uploaded=await upload(http,input);assert.equal(uploaded.status,201);const asset=uploaded.body.asset;
 const current=await db.shopContent.findUnique({where:{id:"storefront"}});let version=current?.version??0;
 const content={schemaVersion:1,homeSections:[{key:"hero",enabled:true}],homeCopy:{categoryHeading:"Rooms",bestsellersHeading:"Favourites",socialHeading:"At home",ticker:"Furniture",testimonialHeading:"Customers",testimonialSubheading:"Stories"},campaigns:[],instagramPosts:[{href:"https://www.instagram.com/p/test/",src:asset.url,alt:"Room image"}],pages:[],motion:{autoplaySocial:false,autoplayCities:false,revealSections:true}};
 const change=(path:string,body:object)=>http.post(path).set("Origin",origin).set("Cookie",`shop_admin=${token}`).set("X-CSRF-Token",digest("csrf:"+token)).send(body);
 const save=async()=>http.put("/api/admin/content").set("Origin",origin).set("Cookie",`shop_admin=${token}`).set("X-CSRF-Token",digest("csrf:"+token)).send({expectedVersion:version,content});
 const saved=await save();assert.equal(saved.status,200);version=saved.body.version;
 assert.equal((await http.get(asset.url)).status,404);
 const published=await change("/api/admin/content/publish",{expectedVersion:version});assert.equal(published.status,200);version=published.body.version;
 assert.equal((await http.get(asset.url)).status,200,"Published content must expose its image through the public API");
 const previous=(await db.shopContent.findUniqueOrThrow({where:{id:"storefront"}})).published;
 content.instagramPosts[0]!.src=`/media/uploads/${"e".repeat(64)}.webp`;
 const missingDraft=await save();assert.equal(missingDraft.status,200);version=missingDraft.body.version;
 const rejected=await change("/api/admin/content/publish",{expectedVersion:version});assert.equal(rejected.status,400);assert.equal(rejected.body.code,"MEDIA_REFERENCE_MISSING");
 const after=await db.shopContent.findUniqueOrThrow({where:{id:"storefront"}});assert.deepEqual(after.published,previous);assert.equal(after.version,version);
});
test("prose mentioning a private URL does not publish it; only actual image fields are references",async()=>{
 const input=await sharp({create:{width:19,height:21,channels:3,background:"#bbccdd"}}).png().toBuffer();
 const uploaded=await upload(request(app()),input);assert.equal(uploaded.status,201);const asset=uploaded.body.asset;
 await db.$transaction(tx=>prepareMediaForPublication(tx,{pages:[{body:asset.url}],homeCopy:{ticker:asset.url}},root));
 assert.equal((await request(app()).get(asset.url)).status,404,"Writing a URL as body text must never expose its private image");
 await db.$transaction(tx=>prepareMediaForPublication(tx,{instagramPosts:[{src:asset.url}]},root));
 assert.equal((await request(app()).get(asset.url)).status,200);
});
test("publication rejects an uploaded asset whose persistent file is missing",async()=>{
 const input=await sharp({create:{width:17,height:23,channels:3,background:"#ccddee"}}).png().toBuffer();
 const uploaded=await upload(request(app()),input);assert.equal(uploaded.status,201);const asset=uploaded.body.asset;
 const {rename}=await import("node:fs/promises");const path=join(root,`${asset.sha256}.webp`);await rename(path,`${path}.temporarily-missing`);
 try {await assert.rejects(db.$transaction(tx=>prepareMediaForPublication(tx,{instagramPosts:[{src:asset.url}]},root)),(err:unknown)=>err instanceof HttpError&&err.code==="MEDIA_REFERENCE_MISSING");assert.equal((await db.shopMediaAsset.findUniqueOrThrow({where:{id:asset.id}})).publicAt,null);}finally{await rename(`${path}.temporarily-missing`,path);}
});
test("disconnecting uploads cannot release processing slots while database work is pending",async()=>{
 const {request:send}=await import("node:http");
 const instance=app(), server=instance.listen(0);const address=server.address();assert.ok(address&&typeof address!=="string");
 let unlock!:()=>void, locked!:()=>void;
 const acquired=new Promise<void>(resolve=>locked=resolve), held=new Promise<void>(resolve=>unlock=resolve);
 const blocker=db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(684019735)`;locked();await held;},{timeout:10000});await acquired;
 const connections=Array.from({length:2},()=>{const req=send({host:"127.0.0.1",port:address.port,path:"/api/admin/media",method:"POST",headers:{Origin:origin,Cookie:`shop_admin=${token}`,"X-CSRF-Token":digest("csrf:"+token),"Content-Type":"image/png","Content-Length":png.length}});req.on("error",()=>{});req.end(png);return req;});
 try {
  let waiting=0;for(let attempt=0;attempt<100;attempt++){const rows=await db.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND objid=684019735 AND NOT granted`;waiting=rows[0]!.count;if(waiting===2)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(waiting,2,"Both accepted uploads should be waiting in real database transactions");
  connections.forEach(connection=>connection.destroy());await new Promise(r=>setTimeout(r,30));
  const third=await upload(request(instance),Buffer.from("invalid"));assert.equal(third.status,429,"Disconnected but still-processing uploads must retain both slots");
 }finally{unlock();await blocker;connections.forEach(connection=>connection.destroy());await new Promise(r=>setTimeout(r,100));await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
