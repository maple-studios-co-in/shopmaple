import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {PrismaClient} from '@prisma/client';
import {registerCatalogueMedia} from '../src/catalogue-media.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).pathname!='/shopmaple_test'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('isolated test DB required');
const db=new PrismaClient({datasources:{db:{url}}});after(()=>db.$disconnect());
beforeEach(async()=>{await db.cartItem.deleteMany();await db.variant.deleteMany();await db.product.deleteMany()});
const image='https://store.maplefurnishers.com/media/keeri/approved1.webp';
async function fixture(){await db.product.create({data:{id:'media-product',handle:'media-product',title:'Chair',description:'',images:[image],published:true,source:'keeri:maple',sourceUpdatedAt:new Date()}})}
function app(fetch:typeof globalThis.fetch,timeoutMs?:number){const a=express();registerCatalogueMedia(a,db,{origin:'https://keeri.example',token:'synthetic-media-token',fetch,timeoutMs});a.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||503).json({error:'unavailable'}));return a;}
test('catalogue media serves only referenced published images through the fixed authenticated source',async()=>{
 await fixture();let calls=0;
 const a=app(async(url,init)=>{calls++;assert.equal(String(url),'https://keeri.example/api/storefront/media/approved1');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-media-token');return new Response(Buffer.from('RIFF0000WEBPsynthetic'),{headers:{'content-type':'image/webp'}})});
 assert.equal((await request(a).get('/media/keeri/approved1.webp')).status,200);
 assert.equal((await request(a).get('/media/keeri/other.webp')).status,404);
 await db.product.update({where:{id:'media-product'},data:{published:false}});
 assert.equal((await request(a).get('/media/keeri/approved1.webp')).status,404);assert.equal(calls,1);
});
test('private, redirected, oversized and non-image upstream responses are never forwarded',async()=>{
 await fixture();
 for(const response of [new Response('secret',{status:401}),new Response('redirect',{status:302}),new Response('<html>private</html>',{headers:{'content-type':'text/html'}}),new Response('large',{headers:{'content-type':'image/webp','content-length':'9999999'}})]){
  const r=await request(app(async()=>response)).get('/media/keeri/approved1.webp');assert.notEqual(r.status,200);assert.doesNotMatch(r.text,/secret|private|redirect/);
 }
});

test('upstream timeout releases capacity and late bytes never reach the browser',async()=>{
 await fixture();let calls=0;
 const a=app(async()=>{calls++;await new Promise(r=>setTimeout(r,80));return new Response(Buffer.from('RIFF0000WEBPsynthetic'),{headers:{'content-type':'image/webp'}})},20);
 const result=await request(a).get('/media/keeri/approved1.webp');
 assert.equal(result.status,404);assert.doesNotMatch(result.text,/synthetic/);assert.equal(calls,1);
});
