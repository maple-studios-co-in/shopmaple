import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {CampaignWindow} from '../components/campaign-window';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/'});
Object.assign(globalThis,{window:dom.window,self:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const container=document.getElementById('root')!;
function clock(t:TestContext) {
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-01T00:00:00Z')});
 const jobs=new Map<number,{run:()=>void;due:number}>();let id=0;
 t.mock.method(window,'setTimeout',(run:()=>void,delay:number)=>{const token=++id;jobs.set(token,{run,due:Date.now()+delay});return token;});
 t.mock.method(window,'clearTimeout',(token:number)=>jobs.delete(token));
 return async(ms:number)=>{await act(async()=>{t.mock.timers.setTime(Date.now()+ms);for(const [token,job] of [...jobs])if(job.due<=Date.now()){jobs.delete(token);job.run();}});};
}
async function mount(schedule:{startsAt:string|null;endsAt:string|null}){
 const root=createRoot(container);
 await act(async()=>root.render(<CampaignWindow schedule={schedule} serverNow={Date.now()}><section data-campaign="test"><h2>Timed campaign</h2></section></CampaignWindow>));
 return root;
}
test('an active banner disappears at its end while the page remains open',async(t)=>{
 const advance=clock(t);
 const root=await mount({startsAt:null,endsAt:'2026-11-01T00:00:01Z'});
 try {
  assert.equal(container.querySelector('h2')?.textContent,'Timed campaign');
  await advance(1000);
  assert.equal(container.querySelector('[data-campaign]'),null);
 }finally{await act(async()=>root.unmount());}
});
test('a future banner becomes visible at its start without reloading or publishing again',async(t)=>{
 const advance=clock(t);
 const root=await mount({startsAt:'2026-11-01T00:00:01Z',endsAt:'2026-11-01T00:00:02Z'});
 try {
  assert.equal(container.querySelector('[data-campaign]'),null);
  await advance(1000);
  assert.equal(container.querySelector('h2')?.textContent,'Timed campaign');
  await advance(1000);
  assert.equal(container.querySelector('[data-campaign]'),null);
 }finally{await act(async()=>root.unmount());}
});
test('resuming an open page rechecks expiry even when background timers were suspended',async(t)=>{
 const advance=clock(t);
 const root=await mount({startsAt:null,endsAt:'2026-11-01T00:00:01Z'});
 try {
  t.mock.timers.setTime(new Date('2026-11-02T00:00:00Z').getTime());
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(container.querySelector('[data-campaign]'),null);
 }finally{await act(async()=>root.unmount());}
});
