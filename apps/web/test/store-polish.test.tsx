import assert from 'node:assert/strict';
import test from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {Footer} from '../components/footer';
import {HomeCarousel} from '../components/home-carousel';
import Loading from '../app/loading';

test('footer policy popover dismisses outside and on Escape without dismissing an inside click',async()=>{
 const dom=new JSDOM('<button id="outside">Outside</button><div id="root"></div>',{url:'http://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,self:dom.window,HTMLElement:dom.window.HTMLElement,IntersectionObserver:class {observe(){} unobserve(){} disconnect(){}},Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<Footer/>));
  const details=document.querySelector<HTMLDetailsElement>('[data-footer-bottom] details')!;
  await act(async()=>details.querySelector('summary')!.click());assert.equal(details.open,true);
  await act(async()=>details.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));assert.equal(details.open,true);
  await act(async()=>document.getElementById('outside')!.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));assert.equal(details.open,false);
  await act(async()=>details.querySelector('summary')!.click());
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(details.open,false);
 }finally{await act(async()=>root.unmount());dom.window.close()}
});
test('route loading presents the Maple logo with an accessible status',()=>{
 const dom=new JSDOM(renderToStaticMarkup(<Loading/>));
 assert.equal(dom.window.document.querySelector('[role="status"] img')?.getAttribute('src'),'/media/footer/maple-logo.webp');
 assert.match(dom.window.document.querySelector('[role="status"]')?.textContent??'',/Loading/);
});

test('automatic carousels expose keyboard playback without a visible play icon',()=>{
 const dom=new JSDOM(renderToStaticMarkup(<HomeCarousel autoplay label="Cities"><span>Delhi</span></HomeCarousel>));
 const control=dom.window.document.querySelector('button[aria-label="Play Cities"]');
 assert.ok(control);assert.ok(control.classList.contains('motion-playback-control'));
 assert.equal(control.querySelector('svg'),null);
});
