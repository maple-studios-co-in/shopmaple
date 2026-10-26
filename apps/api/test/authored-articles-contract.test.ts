import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storefrontContentSchema } from '@shopmaple/contracts';
const base = { schemaVersion: 1, homeSections: [{ key: 'hero', enabled: true }], homeCopy: { categoryHeading: '', bestsellersHeading: '', socialHeading: '', ticker: '', testimonialHeading: '', testimonialSubheading: '' }, campaigns: [], instagramPosts: [{ href: 'https://www.instagram.com/p/test/', src: '/media/room.webp', alt: 'Room' }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } };
const article = () => ({ blog: 'news', handle: 'new-studio', title: 'New studio', excerpt: '', cover: { src: '/media/room.webp', alt: 'Room' }, blocks: [{ id: 'intro', type: 'paragraph', text: 'Welcome.' }], publishedAt: null });
const parse = (items: unknown[]) => storefrontContentSchema.safeParse({ ...base, authoredArticles: items });
test('legacy documents retain absent authored articles', () => assert.equal(Object.hasOwn(storefrontContentSchema.parse(base), 'authoredArticles'), false));
test('authored article blocks and empty lists survive storefront validation', () => {
  const value = article();
  const result = parse([value]);
  assert.equal(result.success, true, 'valid authored articles must be accepted by the storefront boundary');
  if (result.success) assert.deepEqual(result.data.authoredArticles, [value]);
  assert.equal(parse([]).success, true);
  for (const block of [ { id: 'quote', type: 'quote', text: 'Comfort.' }, { id: 'heading', type: 'heading', level: 2, text: 'Rooms' }, { id: 'heading-3', type: 'heading', level: 3, text: 'Rooms' }, { id: 'list', type: 'list', ordered: false, items: ['Wood'] }, { id: 'link', type: 'link', text: 'Story', href: '/pages/our-story' }, { id: 'image', type: 'image', src: '/media/room.webp', alt: 'Room' } ]) assert.equal(parse([{ ...value, blocks: [block] }]).success, true);
});
test('authored boundaries reject unsafe, ambiguous and oversized data', () => {
  const value = article();
  for (const update of [ { blog: 'unknown' }, { handle: 'Bad Handle' }, { handle: 'a'.repeat(121) }, { title: ' ' }, { title: 'a'.repeat(301) }, { excerpt: 'a'.repeat(2001) }, { title: 'bad\u0000' }, { html: '<b>bad</b>' }, { publishedAt: 'yesterday' }, { cover: { src: 'https://evil.invalid/x', alt: 'x' } }, { cover: { src: '/media/a.webp', alt: ' ' } }, { blocks: [] }, { blocks: [{ id: 'a', type: 'paragraph', text: ' ' }] }, { blocks: [{ id: 'a', type: 'paragraph', text: 'a'.repeat(8001) }] }, { blocks: [{ id: 'a', type: 'heading', level: 1, text: 'H' }] }, { blocks: [{ id: 'a', type: 'list', ordered: true, items: [] }] }, { blocks: [{ id: 'a', type: 'list', ordered: true, items: [' '] }] }, { blocks: [{ id: 'a', type: 'link', text: 'x', href: 'javascript:alert(1)' }] }, { blocks: [{ id: 'a', type: 'image', src: '/media/a.webp', alt: '' }] }, { blocks: [{ id: 'a', type: 'paragraph', text: 'x', onclick: 'x' }] }, { blocks: [{ id: 'a', type: 'paragraph', text: 'x' }, { id: 'a', type: 'quote', text: 'x' }] }, { blocks: Array.from({ length: 61 }, (_, i) => ({ id: `b-${i}`, type: 'paragraph', text: 'x' })) }, { blocks: Array.from({ length: 7 }, (_, i) => ({ id: `b-${i}`, type: 'paragraph', text: 'x'.repeat(8000) })) } ]) assert.equal(parse([{ ...value, ...update }]).success, false, JSON.stringify(update).slice(0,100));
  assert.equal(parse([value, value]).success, false);
  assert.equal(parse(Array.from({ length: 21 }, (_, i) => ({ ...value, handle: `story-${i}` }))).success, false);
  assert.equal(parse([{ ...value, blog: 'recent-stories', handle: 'space-saving-furniture-ideas-for-small-homes' }]).success, false);
});

test('media paths reject dot-segment and duplicate-slash aliases before browser normalization', () => {
  const hash = 'a'.repeat(64);
  for (const src of [
    `/media/./uploads/${hash}.webp`, `/media//uploads/${hash}.webp`,
    `/media/uploads/./${hash}.webp`, `/media/uploads//${hash}.webp`,
    `/media/uploads/${hash}.webp/.`, '/media/../uploads/a.webp',
    'https://cdn.shopify.com/s/files/./room.webp',
    'https://shop.maplefurnishers.com/cdn/shop//files/room.webp',
  ]) {
    assert.equal(parse([{ ...article(), cover: { src, alt: 'Room' } }]).success, false, src);
    assert.equal(parse([{ ...article(), blocks: [{ id: 'image', type: 'image', src, alt: 'Room' }] }]).success, false, src);
    assert.equal(storefrontContentSchema.safeParse({ ...base, instagramPosts: [{ ...base.instagramPosts[0], src }] }).success, false, `legacy media: ${src}`);
  }
  for (const src of [`/media/uploads/${hash}.webp`, '/media/room.v2.webp', 'https://cdn.shopify.com/s/files/1/room.webp?v=1&width=640', 'https://shop.maplefurnishers.com/cdn/shop/files/room.webp?v=123'])
    assert.equal(parse([{ ...article(), cover: { src, alt: 'Room' } }]).success, true, src);
});
