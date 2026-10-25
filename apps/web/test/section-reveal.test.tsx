import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SectionReveal } from '../components/section-reveal';

const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, {window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true});
let reduced = false;
const changes = new Set<() => void>();
Object.defineProperty(window, 'matchMedia', {configurable: true, value: () => ({get matches(){return reduced;}, addEventListener: (_: string, f: () => void) => changes.add(f), removeEventListener: (_: string, f: () => void) => changes.delete(f)})});
let enter: ((entries: {target: Element; isIntersecting: boolean}[]) => void) | undefined;
class Observer { constructor(cb: typeof enter){enter = cb;} observe(){} unobserve(){} disconnect(){enter = undefined;} }
Object.assign(globalThis, {IntersectionObserver: Observer});
const content = <><div data-home-section="hero"><a href="/collections/all">Shop now</a></div><div data-home-section="social"><a href="https://www.instagram.com/maplefurnishers/">Original copy</a></div></>;
async function mount(enabled = true, reduce = false) {
  reduced = reduce;
  const calls: {element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean}[] = [];
  dom.window.HTMLElement.prototype.getBoundingClientRect = function(){ return {top: this.getAttribute('data-home-section') === 'hero' ? 0 : 2000} as DOMRect; };
  dom.window.HTMLElement.prototype.animate = function(frames, options){
    const call = {element: this, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, cancelled: false}; calls.push(call);
    return {cancel(){call.cancelled = true;}} as Animation;
  };
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<SectionReveal enabled={enabled}>{content}</SectionReveal>));
  const section = document.querySelector('[data-home-section="social"]')!;
  return {calls, section, unmount: async () => act(async () => root.unmount())};
}
test('server content is visible and linked before enhancement', () => {
  const page = new JSDOM(renderToStaticMarkup(<SectionReveal enabled>{content}</SectionReveal>)).window.document;
  assert.equal(page.querySelectorAll('a').length, 2);
  assert.equal(page.querySelector('[hidden], [aria-hidden="true"], [style]'), null);
});
test('only entering offscreen sections animate once without hiding original content', async () => {
  const h = await mount();
  try {
    enter?.([{target: document.querySelector('[data-home-section="hero"]')!, isIntersecting:true}, {target:h.section, isIntersecting:false}]);
    assert.equal(h.calls.length, 0);
    enter?.([{target:h.section, isIntersecting:true}]);
    assert.equal(h.calls.length, 1, 'An entering lower section should receive its reveal');
    assert.equal(h.calls[0]!.element, h.section);
    assert.deepEqual(h.calls[0]!.frames, [{opacity:0.65, transform:'translateY(12px)'}, {opacity:1, transform:'translateY(0)'}]);
    assert.equal(h.calls[0]!.options.fill, 'none');
    enter?.([{target:h.section, isIntersecting:true}]);
    assert.equal(h.calls.length, 1);
    assert.equal(h.section.querySelector('a')?.textContent, 'Original copy');
  } finally {await h.unmount();}
});
test('disabled or reduced-motion visitors receive no animation', async () => {
  for (const [enabled, reduce] of [[false,false],[true,true]]) {
    const h = await mount(enabled, reduce);
    try {enter?.([{target:h.section, isIntersecting:true}]); assert.equal(h.calls.length, 0);} finally {await h.unmount();}
  }
});
test('changing reduced motion or focusing content cancels movement and unmount releases it', async () => {
  const h = await mount();
  try {
    enter?.([{target:h.section, isIntersecting:true}]);
    assert.equal(h.calls.length, 1);
    h.section.querySelector('a')!.focus();
    assert.equal(h.calls[0]!.cancelled, true);
  } finally {await h.unmount();}
  const next = await mount();
  try {
    enter?.([{target:next.section, isIntersecting:true}]); reduced = true; changes.forEach(f => f());
    assert.equal(next.calls[0]?.cancelled, true);
  } finally {await next.unmount();}
  assert.equal(changes.size, 0);
});
