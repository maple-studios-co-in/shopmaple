import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {CampaignBanner} from '../components/campaign-banner';
import {defaultStorefrontContent} from '../lib/content-defaults';
async function banner(schedule?: {startsAt:string|null;endsAt:string|null}|null) {
 const content=structuredClone(defaultStorefrontContent);
 const c=content.campaigns.find(x=>x.key==='landing-announcement')!;
 c.headline=['Publisher-approved campaign'];
 if(schedule!==undefined) Object.assign(c,{schedule});
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({version:3,content});
 try {return new JSDOM(renderToStaticMarkup(await CampaignBanner({campaign:'landing-announcement'}))).window.document;}
 finally {globalThis.fetch=previous;}
}
test('legacy unscheduled published banners retain approved text and local destination',async()=>{
 const doc=await banner();
 assert.equal(doc.querySelector('h2')?.textContent,'Publisher-approved campaign');
 assert.equal(doc.querySelector('[data-campaign-cta]')?.getAttribute('href'),'/collections/all');
});
test('future campaign is absent from server output instead of resurrecting bundled artwork',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-01T00:00:00Z')});
 const doc=await banner({startsAt:'2026-11-02T00:00:00Z',endsAt:null});
 assert.equal(doc.querySelector('[data-campaign]'),null);
 assert.equal(doc.querySelector('img'),null);
});
test('expired campaign has no stale offer or destination in server output',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-03T00:00:00Z')});
 const doc=await banner({startsAt:null,endsAt:'2026-11-02T00:00:00Z'});
 assert.equal(doc.querySelector('[data-campaign]'),null);
 assert.equal(doc.querySelector('a'),null);
});
test('new server renders observe inclusive start and exclusive end without republishing',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-01T00:00:00Z')});
 const schedule={startsAt:'2026-11-01T05:30:00+05:30',endsAt:'2026-11-01T06:30:00+05:30'};
 assert.equal((await banner(schedule)).querySelector('h2')?.textContent,'Publisher-approved campaign');
 t.mock.timers.setTime(new Date('2026-11-01T01:00:00Z').getTime());
 assert.equal((await banner(schedule)).querySelector('[data-campaign]'),null);
});
test('clearing the window restores the published campaign, without replacing its approved copy',async()=>{
 const doc=await banner(null);
 assert.equal(doc.querySelector('h2')?.textContent,'Publisher-approved campaign');
});
test('content failures do not revive default offers, while the rest of the store can retain its defaults',async()=>{
 const previous=globalThis.fetch;
 try {
  for(const response of [new Response(null,{status:500}),Response.json({version:2,content:{invalid:true}})]) {
   globalThis.fetch=async()=>response;
   const doc=new JSDOM(renderToStaticMarkup(await CampaignBanner({campaign:'landing-announcement'}))).window.document;
   assert.equal(doc.querySelector('[data-campaign]'),null);
  }
 } finally {globalThis.fetch=previous;}
});
