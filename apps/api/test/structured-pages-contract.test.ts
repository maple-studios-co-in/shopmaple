import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storefrontContentSchema } from '@shopmaple/contracts';
const base = { schemaVersion: 1, homeSections: [{ key: 'hero', enabled: true }], homeCopy: { categoryHeading: '', bestsellersHeading: '', socialHeading: '', ticker: '', testimonialHeading: '', testimonialSubheading: '' }, campaigns: [], instagramPosts: [{ href: 'https://www.instagram.com/p/test/', src: '/media/room.webp', alt: 'Room' }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } };
const page = { slug: 'studio', title: 'Studio', description: '', body: 'First paragraph.\n\nSecond paragraph.', banner: null };
const parse = (value: unknown) => storefrontContentSchema.safeParse({ ...base, pages: [value] });
test('legacy page serialization retains exact body and absent blocks', () => {
  const result = storefrontContentSchema.parse({ ...base, pages: [page] });
  assert.deepEqual(result.pages, [page]);
  assert.equal(Object.hasOwn(result.pages[0]!, 'blocks'), false);
  assert.equal(Object.hasOwn(result, 'authoredArticles'), false);
  assert.equal(parse({ ...page, body: '\t'.repeat(8000) }).success, true);
});
test('structured pages accept every shared block kind in order and retain legacy fields', () => {
  const blocks = [
    { id: 'intro', type: 'paragraph', text: 'Welcome.' },
    { id: 'heading', type: 'heading', level: 2, text: 'Rooms' },
    { id: 'subheading', type: 'heading', level: 3, text: 'Details' },
    { id: 'quote', type: 'quote', text: 'Comfort.' },
    { id: 'list', type: 'list', ordered: true, items: ['Wood', 'Steel'] },
    { id: 'link', type: 'link', text: 'Story', href: '/pages/our-story#intro' },
    { id: 'image', type: 'image', src: '/media/room.webp', alt: 'Room' },
  ];
  const value = { ...page, blocks };
  const result = parse(value);
  assert.equal(result.success, true, 'valid structured page blocks must survive the storefront parser');
  if (result.success) assert.deepEqual(result.data.pages, [value]);
  assert.equal(parse({ ...page, blocks: Array.from({ length: 60 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: 'P' })) }).success, true);
});
test('page block boundaries reject empty, duplicate, oversized and unsafe content', () => {
  const blocks = [{ id: 'intro', type: 'paragraph', text: 'Welcome.' }];
  assert.equal(parse({ ...page, blocks }).success, true, 'the positive control must parse before rejection checks');
  for (const invalid of [
    [], [blocks[0], blocks[0]], Array.from({ length: 61 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: 'P' })),
    [{ id: 'p', type: 'paragraph', text: ' ' }], [{ id: 'p', type: 'paragraph', text: 'x'.repeat(8001) }],
    [{ id: 'p', type: 'paragraph', text: 'bad\u0000' }], [{ id: 'p', type: 'paragraph', text: 'x', html: '<b>x</b>' }],
    [{ id: 'h', type: 'heading', level: 1, text: 'Title' }], [{ id: 'l', type: 'list', ordered: false, items: [''] }],
    [{ id: 'a', type: 'link', text: 'Link', href: 'javascript:alert(1)' }],
    ...['https://evil.invalid/a.webp', '/media/./uploads/a.webp', '/media//uploads/a.webp', '/media/uploads/../a.webp', '/media/uploads/a.webp/.', '/media/%61.webp'].map(src => [{ id: 'i', type: 'image', src, alt: 'Room' }]),
    [{ id: 'i', type: 'image', src: '/media/a.webp', alt: '' }],
  ]) assert.equal(parse({ ...page, blocks: invalid }).success, false, JSON.stringify(invalid).slice(0, 120));
});
test('structured page byte cap includes retained body and banner; whole document remains bounded', () => {
  const blocks = Array.from({ length: 6 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: 'x'.repeat(7000) }));
  assert.equal(parse({ ...page, blocks }).success, true, 'page below 48 KiB is accepted');
  assert.equal(parse({ ...page, body: 'b'.repeat(8000), blocks }).success, false, 'retained legacy body counts toward 48 KiB');
  const boundary = { ...page, body: '', blocks: Array.from({ length: 7 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: i < 6 ? 'a'.repeat(8000) : 'a' })) };
  boundary.blocks[6]!.text = 'a'.repeat(48 * 1024 - Buffer.byteLength(JSON.stringify(boundary)) + 1);
  assert.equal(Buffer.byteLength(JSON.stringify(boundary)), 48 * 1024);
  assert.equal(parse(boundary).success, true);
  assert.equal(parse({ ...boundary, description: 'x' }).success, false);
  assert.equal(parse({ ...boundary, banner: { desktopImage: '/media/a.webp', mobileImage: '/media/b.webp', alt: 'Banner', href: '/', label: 'Home' } }).success, false);
  const pages = Array.from({ length: 3 }, (_, i) => ({ ...boundary, slug: `page-${i}` }));
  assert.equal(storefrontContentSchema.safeParse({ ...base, pages }).success, false, 'document remains capped at 128 KiB');
});
