import assert from 'node:assert/strict';
import test from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {HomeCarousel} from '../components/home-carousel';
import Loading from '../app/loading';

test('route loading presents the Maple logo with an accessible status',()=>{
 const dom=new JSDOM(renderToStaticMarkup(<Loading/>));
 assert.equal(dom.window.document.querySelector('[role="status"] img')?.getAttribute('src'),'/media/footer/maple-logo.webp');
 assert.match(dom.window.document.querySelector('[role="status"]')?.textContent??'',/Loading/);
});

test('automatic carousels expose keyboard playback without a visible play icon',()=>{
 const dom=new JSDOM(renderToStaticMarkup(<HomeCarousel autoplay label="Cities"><span>Delhi</span></HomeCarousel>));
 const control=dom.window.document.querySelector('button[aria-label="Play Cities"]');
 assert.ok(control);assert.ok(control.hasAttribute('data-carousel-play'));
 assert.equal(control.querySelector('svg'),null);
});
