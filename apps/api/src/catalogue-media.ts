import type {Express} from 'express';
import type {PrismaClient} from '@prisma/client';
import {HttpError} from './cart.js';
import {storeOrigins} from './site.js';
export type CatalogueMediaConfig={origin:string;token:string;fetch?:typeof fetch;timeoutMs?:number};
const unavailable=()=>new HttpError(404,'MEDIA_NOT_FOUND','This image is unavailable.');
export function registerCatalogueMedia(app:Express,db:PrismaClient,config?:CatalogueMediaConfig){
 let active=0;const queue:Array<()=>void>=[];
 /** One proxied picture kind: its public path, Keeri's server-only path, and whether the store lists it. */
 const route=(prefix:string,upstream:string,listed:(id:string,images:string[])=>Promise<boolean>)=>app.get(`/media/${prefix}/:filename`,async(req,res)=>{
  res.set('Cache-Control','no-store');
  const match=/^([A-Za-z0-9_-]{1,64})\.webp$/.exec(String(req.params.filename));
  if(!match||Object.keys(req.query).length||!config)throw unavailable();
  const origin=new URL(config.origin);
  if(origin.protocol!=='https:'||origin.href!==`${origin.origin}/`||origin.username||origin.password||!config.token)throw unavailable();
  // The listed photo's address on any of the store's own addresses (SITE_URL, SITE_ALIASES): during the move Keeri may
  // name either hostname.
  const images=storeOrigins().map(origin=>`${origin}/media/${prefix}/${match[1]}.webp`);
  if(!await listed(match[1]!,images))throw unavailable();
  if(queue.length>=48)throw new HttpError(503,'MEDIA_BUSY','Please try this image again.');
  if(active>=2)await new Promise<void>((resolve,reject)=>{
   const resume=()=>{clearTimeout(timer);resolve()};
   const timer=setTimeout(()=>{const i=queue.indexOf(resume);if(i>=0)queue.splice(i,1);reject(unavailable())},15000);
   queue.push(resume);
  });
  active++;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{reject(unavailable());controller.abort();void reader?.cancel().catch(()=>{})},Math.min(15000,Math.max(1,config.timeoutMs??15000)))});
  const mediaConfig=config;const assetId=match[1];
  async function read(){
   const response=await (mediaConfig.fetch??fetch)(`${origin.origin}${upstream}${assetId}`,{redirect:'error',headers:{Authorization:`Bearer ${mediaConfig.token}`,Accept:'image/webp'},signal:controller.signal});
   if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw unavailable()}
   if(response.status!==200||response.redirected||response.headers.get('content-type')!=='image/webp'||!response.body)throw unavailable();
   const length=response.headers.get('content-length');
   if(length!==null&&(!/^\d+$/.test(length)||Number(length)>4*1024*1024))throw unavailable();
   reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
   while(true){const part=await reader.read();if(controller.signal.aborted)throw unavailable();if(part.done)break;size+=part.value.byteLength;if(size>4*1024*1024)throw unavailable();parts.push(part.value)}
   const bytes=Buffer.concat(parts);
   if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw unavailable();
   return bytes;
  }
  try{
   const bytes=await Promise.race([read(),deadline]);
   res.set({'Content-Type':'image/webp','Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}).send(bytes);
  }catch{throw unavailable()}finally{clearTimeout(timer);controller.abort();void reader?.cancel().catch(()=>{});active--;queue.shift()?.()}
 });
 route('keeri','/api/storefront/media/',async(_id,images)=>Boolean(await db.product.findFirst({where:{published:true,images:{hasSome:images}},select:{id:true}})));
 // A customer's review photo, only while it belongs to an approved review on a listed product (Keeri checks again).
 route('keeri-review','/api/storefront/review-photos/',async(id)=>{
  const shape=JSON.stringify({reviews:{items:[{photos:[{id}]}]}});
  const rows=await db.$queryRaw<{one:number}[]>`SELECT 1 AS one FROM "Product" WHERE "published" AND "productPage" @> ${shape}::jsonb LIMIT 1`;
  return rows.length>0;
 });
}
