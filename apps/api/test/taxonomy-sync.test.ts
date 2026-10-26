import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptKeeriExportV2 } from '../src/keeri.js';
import { planCatalogueUnion } from '../src/catalogue-union.js';
import { fetchKeeriExport } from '../src/keeri-fetch.js';
import { v2Fixture } from './fixtures/keeri-v2.js';
import { shopifyFixture } from './fixtures/shopify-admin.js';

function fixture() {
  const data = v2Fixture();
  return {...data, models: data.models.map(model => ({...model, productType: 'chair', taxonomy: {category:'Dining', subCategory:null}}))};
}
test('Keeri taxonomy survives adaptation without requiring price or image', () => {
  const data = fixture(); data.publicMedia=[]; data.models[0]!.variants=[];
  const product = adaptKeeriExportV2(data,'maple').products[0]!;
  assert.deepEqual(product.sourceTaxonomy,{productType:'chair',category:'Dining',subCategory:null});
  assert.equal(product.variants.length,0);
});
test('taxonomy follows exact Keeri identity onto a merged Shopify product', () => {
  const data=fixture(); data.models[0]!.variants[0]!.sku='CHAIR-OAK';
  const result=planCatalogueUnion(shopifyFixture(),data,'maple');
  assert.equal(result.products.length,1);
  assert.equal(result.products[0]!.handle,'real-chair');
  assert.deepEqual(result.products[0]!.sourceTaxonomy,{productType:'chair',category:'Dining',subCategory:null});
});
test('unknown and malformed source taxonomy cannot inject collection membership', () => {
  for (const taxonomy of [{category:'Dining',subCategory:null,collections:['clearance-sale']},{category:'x'.repeat(201),subCategory:null}]) {
    const data=fixture();
    assert.throws(()=>adaptKeeriExportV2({...data,models:[{...data.models[0],taxonomy}]},'maple'));
  }
});
test('taxonomy transport is explicit and rejects an old response instead of silently losing classification', async () => {
  const options={endpoint:'https://keeri.example/api/storefront/catalogue/v2',trustedOrigin:'https://keeri.example',tenantId:'maple',token:'synthetic-taxonomy-token',schemaVersion:2 as const,includeTaxonomy:true};
  const result=await fetchKeeriExport({...options,fetch:async (url)=>{
    assert.equal(String(url),'https://keeri.example/api/storefront/catalogue/v2?taxonomy=1');
    return new Response(JSON.stringify(fixture()),{headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(result.products[0]!.sourceTaxonomy?.category,'Dining');
  await assert.rejects(fetchKeeriExport({...options,fetch:async()=>new Response(JSON.stringify(v2Fixture()),{headers:{'Content-Type':'application/json'}})}),{code:'INVALID_EXPORT'});
});

test('customer details and approved storefront image references survive the combined catalogue',()=>{
 const data=fixture();const m=data.models[0]!;
 const content={details:'Solid oak frame',materials:'Oak and linen',dimensions:'80 x 60 cm',careInstructions:'Dry cloth',warranty:'One year'};
 const input={...data,models:[{...m,content}],publicMedia:data.publicMedia.map(a=>({...a,url:`https://store.maplefurnishers.com/media/keeri/${a.assetId}.webp`}))};
 const result=planCatalogueUnion(shopifyFixture(),input,'maple');
 const p=result.products.find(p=>p.id.startsWith('keeri:'))!;
 assert.deepEqual(p.sourceDetails,content);
 assert.ok(p.images[0]?.startsWith('https://store.maplefurnishers.com/media/keeri/'));
});

test('content transport explicitly requests source details and rejects incomplete upstream contracts',async()=>{
 const options={endpoint:'https://keeri.example/api/storefront/catalogue/v2',trustedOrigin:'https://keeri.example',tenantId:'maple',token:'synthetic-content-token',schemaVersion:2 as const,includeTaxonomy:true,includeContent:true};
 const data=fixture();const content={details:'Oak',materials:null,dimensions:null,careInstructions:null,warranty:null};
 const result=await fetchKeeriExport({...options,fetch:async(url)=>{
  assert.equal(String(url),'https://keeri.example/api/storefront/catalogue/v2?taxonomy=1&content=1');
  return Response.json({...data,models:data.models.map(m=>({...m,content}))});
 }});
 assert.equal(result.products[0]?.sourceDetails?.details,'Oak');
 await assert.rejects(fetchKeeriExport({...options,fetch:async()=>Response.json(data)}),{code:'INVALID_EXPORT'});
});
