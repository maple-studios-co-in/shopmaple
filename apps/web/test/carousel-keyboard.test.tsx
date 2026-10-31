import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { HomeCarousel } from '../components/home-carousel';

const dom = new JSDOM('<!doctype html><button id="before">Before</button><div id="root"></div><button id="after">After</button>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
Object.defineProperty(document, 'hidden', { get: () => false });
let notifyVisible: (() => void) | undefined;
class Observer {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    notifyVisible = () => this.callback([{ target, isIntersecting: true, intersectionRatio: 1, time: 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() { notifyVisible = undefined; }
}
Object.assign(globalThis, { IntersectionObserver: Observer });

async function mount(autoplay = true) {
  const host = document.getElementById('root')!;
  const root = createRoot(host);
  await act(async () => root.render(<HomeCarousel label="Instagram posts" autoplay={autoplay}>
    <a href="https://www.instagram.com/p/first/">First post</a>
    <a href="https://www.instagram.com/p/second/">Second post</a>
  </HomeCarousel>));
  const rail = host.querySelector<HTMLElement>('[data-carousel-rail]')!;
  Object.defineProperties(rail, { clientWidth: { value: 600 }, scrollWidth: { value: 1800 } });
  rail.scrollBy = options => { rail.scrollLeft += (options as ScrollToOptions).left ?? 0; };
  rail.scrollTo = options => { rail.scrollLeft = (options as ScrollToOptions).left ?? 0; };
  await act(async () => notifyVisible?.());
  return {
    host, rail,
    button: (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!,
    unmount: () => act(async () => root.unmount()),
  };
}

test('focus on carousel content stops motion after leaving until the rotation button is activated', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const h = await mount();
  try {
    await act(async () => t.mock.timers.tick(4500));
    assert.equal(h.rail.scrollLeft, 600);
    await act(async () => h.rail.querySelector<HTMLAnchorElement>('a')!.focus());
    await act(async () => document.getElementById('after')!.focus());
    await act(async () => t.mock.timers.tick(9000));
    assert.equal(h.rail.scrollLeft, 600, 'Leaving the carousel must not restart motion');
    const play = h.button('Play Instagram posts');
    await act(async () => play.focus());
    await act(async () => play.click());
    assert.equal(document.activeElement, play, 'Activating rotation must retain keyboard focus');
    await act(async () => t.mock.timers.tick(4500));
    assert.equal(h.rail.scrollLeft, 1200);
    await act(async () => h.rail.querySelector<HTMLAnchorElement>('a')!.focus());
    await act(async () => t.mock.timers.tick(9000));
    assert.equal(h.rail.scrollLeft, 1200, 'Moving focus into content must stop explicitly resumed motion');
  } finally { await h.unmount(); }
});

test('manual carousels retain native content focus and usable previous and next controls', async () => {
  const h = await mount(false);
  try {
    assert.equal(h.host.querySelector('button[aria-label^="Play"], button[aria-label^="Pause"]'), null);
    const next = h.button('Next Instagram posts');
    await act(async () => next.focus());
    await act(async () => next.click());
    assert.equal(document.activeElement, next);
    assert.equal(h.rail.scrollLeft, 600);
    const previous = h.button('Previous Instagram posts');
    await act(async () => previous.focus());
    await act(async () => previous.click());
    assert.equal(document.activeElement, previous);
    assert.equal(h.rail.scrollLeft, 0);
  } finally { await h.unmount(); }
});

test('rotation control is the first native tab stop before any moving content', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const h = await mount();
  try {
    // These elements use native DOM tab order. No positive tabindex may jump
    // this control ahead of unrelated page controls or hide an ordering defect.
    const stops = Array.from(h.host.querySelectorAll<HTMLElement>('a[href], button, [tabindex]'))
      .filter(element => element.tabIndex >= 0 && !element.closest('[hidden]') && !(element instanceof dom.window.HTMLButtonElement && element.disabled));
    assert.equal(stops.some(element => element.tabIndex > 0), false);
    const rotation = h.button('Pause Instagram posts');
    assert.ok(stops[0] === rotation, 'Keyboard users must reach rotation control before the rail and its post links');
    await act(async () => stops[0]!.focus());
    assert.equal(document.activeElement, rotation);
    assert.equal(rotation.getAttribute('aria-label'), 'Play Instagram posts');
    await act(async () => document.getElementById('after')!.focus());
    await act(async () => t.mock.timers.tick(9000));
    assert.equal(h.rail.scrollLeft, 0, 'Entry through rotation control pauses until explicitly resumed');
  } finally { await h.unmount(); }
});
