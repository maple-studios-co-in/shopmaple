import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { HomeCarousel } from '../components/home-carousel';
const dom=new JSDOM('<!doctype html><div id="root"></div><button id="outside">Outside</button>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
let reduced=false,visible=true;
const listeners=new Set<()=>void>();
Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({get matches(){return reduced;},addEventListener:(_n:string,f:()=>void)=>listeners.add(f),removeEventListener:(_n:string,f:()=>void)=>listeners.delete(f)})});
Object.defineProperty(document,'hidden',{get:()=>!visible});
type Observation = { target: Element; isIntersecting: boolean; intersectionRatio: number; time: number };
let intersect:((entries:Observation[])=>void)|undefined;
let observed: Element;
class Observer{constructor(cb:typeof intersect){intersect=cb;}observe(target:Element){observed=target;}disconnect(){intersect=undefined;}}
const observation=(isIntersecting:boolean,time=0,intersectionRatio=isIntersecting?1:0):Observation=>({target:observed,isIntersecting,intersectionRatio,time});
Object.assign(globalThis,{IntersectionObserver:Observer});
async function mount(autoplay=false){
 reduced=false;visible=true;const host=document.getElementById('root')!,root=createRoot(host);
 try { await act(async()=>root.render(<HomeCarousel {...{label:'Instagram posts',autoplay}}><a href="https://www.instagram.com/p/first/">First post</a><a href="https://www.instagram.com/p/second/">Second post</a></HomeCarousel>)); } catch(error) { await act(async()=>root.unmount()); throw error; }
 const rail=host.querySelector<HTMLElement>('[data-carousel-rail]')!;Object.defineProperties(rail,{clientWidth:{value:600},scrollWidth:{value:1800}});
 const moves:ScrollToOptions[]=[];
 rail.scrollBy=options=>{const o=options as ScrollToOptions;moves.push(o);rail.scrollLeft+=o.left??0;};
 rail.scrollTo=options=>{const o=options as ScrollToOptions;moves.push(o);rail.scrollLeft=o.left??0;};
 await act(async()=>intersect?.([observation(true)]));
 return{host,rail,moves,unmount:async()=>act(async()=>root.unmount()),button:(label:string)=>host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)};
}
test('manual arrows preserve page scrolling and reduced-motion instant navigation',async()=>{const h=await mount();try{await act(async()=>h.button('Next Instagram posts')!.click());assert.deepEqual(h.moves,[{left:600,behavior:'smooth'}]);reduced=true;await act(async()=>h.button('Previous Instagram posts')!.click());assert.deepEqual(h.moves[1],{left:-600,behavior:'instant'});}finally{await h.unmount();}});
test('autoplay advances an overflowing row and user pause prevents subsequent motion',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
 assert.ok(h.button('Pause Instagram posts'),'Automatic rows must provide a working pause control');
 await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,600);
 await act(async()=>h.button('Pause Instagram posts')!.click());await act(async()=>t.mock.timers.tick(9000));assert.equal(h.rail.scrollLeft,600);
 await act(async()=>h.button('Play Instagram posts')!.click());await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,1200);
 await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0);assert.equal(h.moves.at(-1)?.behavior,'instant','Wrapping must not animate backwards across the whole feed');
 }finally{await h.unmount();}
});
test('keyboard focus stops autoplay until explicitly restarted even after focus leaves',async t=>{t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{await act(async()=>h.rail.querySelector<HTMLElement>('a')!.focus());await act(async()=>document.getElementById('outside')!.focus());await act(async()=>t.mock.timers.tick(9000));assert.equal(h.rail.scrollLeft,0);assert.ok(h.button('Play Instagram posts'));}finally{await h.unmount();}});
test('offscreen rows, hidden pages, pointer hover and reduced-motion changes suspend automatic movement',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
 await act(async()=>intersect?.([observation(false)]));await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0);
 await act(async()=>intersect?.([observation(true)]));visible=false;await act(async()=>document.dispatchEvent(new dom.window.Event('visibilitychange')));await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0);
 visible=true;await act(async()=>document.dispatchEvent(new dom.window.Event('visibilitychange')));
 await act(async()=>h.host.querySelector('[data-carousel]')!.dispatchEvent(new dom.window.MouseEvent('mouseover',{bubbles:true})));await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0);
 await act(async()=>h.host.querySelector('[data-carousel]')!.dispatchEvent(new dom.window.MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body})));await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,600);
 reduced=true;await act(async()=>listeners.forEach(f=>f()));await act(async()=>t.mock.timers.tick(9000));assert.equal(h.rail.scrollLeft,600);
 }finally{await h.unmount();}
});
test('server HTML preserves every post link without running JavaScript',()=>{const html=renderToStaticMarkup(<HomeCarousel label="Instagram posts"><a href="https://www.instagram.com/p/first/">Original caption</a></HomeCarousel>);const d=new JSDOM(html).window.document;assert.equal(d.querySelector('a')?.textContent,'Original caption');assert.equal(d.querySelector('a')?.getAttribute('href'),'https://www.instagram.com/p/first/');assert.equal(d.querySelector('a')?.closest('[hidden]'),null);});
test('clicking Pause still pauses when pointer activation first moves focus onto the button',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
 const pause=h.button('Pause Instagram posts')!;
 await act(async()=>pause.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));
 await act(async()=>pause.focus());await act(async()=>pause.click());
 await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0,'Pointer focus must not turn a pause click into Play');
 }finally{await h.unmount();}
});

test('unmount clears automatic movement rather than retaining a background timer',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);
 await h.unmount();await act(async()=>t.mock.timers.tick(9000));assert.equal(h.moves.length,0);
});


test('missing media-query API keeps content usable with autoplay off and instant manual navigation',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const original=window.matchMedia;Object.defineProperty(window,'matchMedia',{configurable:true,value:undefined});
 let h:Awaited<ReturnType<typeof mount>>|undefined;
 try {
  await assert.doesNotReject(async()=>{h=await mount(true);},'A missing browser motion API must not prevent the carousel from rendering');
  assert.ok(h);assert.equal(h.rail.querySelector('a')?.textContent,'First post');
  await act(async()=>t.mock.timers.tick(9000));assert.equal(h.rail.scrollLeft,0);
  assert.equal(h.button('Play Instagram posts')?.disabled,true);
  await act(async()=>h!.button('Next Instagram posts')!.click());assert.deepEqual(h.moves,[{left:600,behavior:'instant'}]);
 }finally{await h?.unmount();Object.defineProperty(window,'matchMedia',{configurable:true,value:original});}
});

test('queued carousel observations use the latest matching target state',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
  await act(async()=>intersect?.([observation(true,1),observation(false,2)]));
  await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0,'An older visible observation must not keep an offscreen row moving');
  await act(async()=>intersect?.([observation(false,4),observation(true,3)]));
  await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0,'Observation time determines the newest state');
  await act(async()=>intersect?.([{...observation(true,5),target:document.getElementById('outside')!}]));
  await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0,'An unrelated element must not resume this row');
  await act(async()=>intersect?.([observation(false,6),observation(true,7)]));
  await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,600);
 }finally{await h.unmount();}
});

test('carousel motion waits for its configured visible-area threshold',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
  await act(async()=>intersect?.([observation(true,1,0.05)]));
  await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,0,'Edge contact below 15 percent must not advance the row');
  await act(async()=>intersect?.([observation(true,2,0.15)]));
  await act(async()=>t.mock.timers.tick(4500));assert.equal(h.rail.scrollLeft,600);
 }finally{await h.unmount();}
});

test('missing viewport observer keeps automatic movement off but retains manual arrows',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const original=globalThis.IntersectionObserver;
 Object.assign(globalThis,{IntersectionObserver:undefined});let h:Awaited<ReturnType<typeof mount>>|undefined;
 try{
  h=await mount(true);await act(async()=>t.mock.timers.tick(9000));assert.equal(h.rail.scrollLeft,0);
  await act(async()=>h!.button('Next Instagram posts')!.click());assert.equal(h.rail.scrollLeft,600);
 }finally{await h?.unmount();Object.assign(globalThis,{IntersectionObserver:original});}
});

test('vertical page wheel scrolling leaves autoplay and the native event intact',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
  const wheel=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:120});
  await act(async()=>h.rail.dispatchEvent(wheel));
  assert.equal(wheel.defaultPrevented,false,'Page scrolling must remain native');
  await act(async()=>t.mock.timers.tick(4500));
  assert.equal(h.rail.scrollLeft,600);
  assert.ok(h.button('Pause Instagram posts'));
 }finally{await h.unmount();}
});

for(const gesture of [
 {name:'horizontal trackpad',deltaX:120,deltaY:0,shiftKey:false},
 {name:'reverse horizontal trackpad',deltaX:-120,deltaY:0,shiftKey:false},
 {name:'shift-wheel',deltaX:0,deltaY:120,shiftKey:true},
]){
 test(`${gesture.name} scrolling pauses autoplay until explicitly restarted`,async t=>{
  t.mock.timers.enable({apis:['setInterval']});const h=await mount(true);try{
   const wheel=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,...gesture});
   await act(async()=>h.rail.querySelector('a')!.dispatchEvent(wheel));
   assert.equal(wheel.defaultPrevented,false,'Visitors must retain native horizontal scrolling');
   // JSDOM has no layout/default scrolling; represent the position chosen by the visitor.
   h.rail.scrollLeft=240;
   await act(async()=>t.mock.timers.tick(9000));
   assert.equal(h.rail.scrollLeft,240,'Automatic movement must not override the visitor’s chosen position');
   assert.ok(h.button('Play Instagram posts'));
   await act(async()=>h.button('Play Instagram posts')!.click());
   await act(async()=>t.mock.timers.tick(4500));
   assert.equal(h.rail.scrollLeft,840,'Explicit Play resumes automatic movement');
  }finally{await h.unmount();}
 });
}

for (const gesture of ['touch rail', 'next arrow'] as const) {
 test(`${gesture} exposes an enabled Play control that resumes after focus leaves`, async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const h = await mount(true);
  try {
   if (gesture === 'touch rail') {
    await act(async () => h.rail.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
   } else {
    await act(async () => h.button('Next Instagram posts')!.click());
   }
   await act(async () => document.getElementById('outside')!.focus());
   const stoppedAt = h.rail.scrollLeft;
   await act(async () => t.mock.timers.tick(9000));
   assert.equal(h.rail.scrollLeft, stoppedAt, 'Visitor interaction must stop automatic movement');
   const resume = h.button('Play Instagram posts');
   assert.ok(resume, 'Paused rails must expose the semantic Play state used by the visible resume affordance');
   assert.equal(resume.disabled, false);
   await act(async () => resume.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
   await act(async () => resume.focus());
   await act(async () => resume.click());
   assert.ok(h.button('Pause Instagram posts'), 'Pointer activation restores the automatic state');
   await act(async () => t.mock.timers.tick(4500));
   assert.equal(h.rail.scrollLeft, stoppedAt + 600);
  } finally { await h.unmount(); }
 });
}
