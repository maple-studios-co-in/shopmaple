import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rename, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/shopmaple_test' || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '55439') throw Error('Dedicated loopback test database required');
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = 'http://localhost:3000';
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const token = randomBytes(32).toString('hex'), editorToken = randomBytes(32).toString('hex');
const auth = { Origin: origin, Cookie: `shop_admin=${token}`, 'X-CSRF-Token': digest('csrf:' + token) };
const editorAuth = { Origin: origin, Cookie: `shop_admin=${editorToken}`, 'X-CSRF-Token': digest('csrf:' + editorToken) };
let root: string, http: ReturnType<typeof request>;
const ids: string[] = [];
const fixture = () => ({ schemaVersion: 1, homeSections: [{ key: 'hero', enabled: true }], homeCopy: { categoryHeading: '', bestsellersHeading: '', socialHeading: '', ticker: '', testimonialHeading: '', testimonialSubheading: '' }, campaigns: [], instagramPosts: [{ href: 'https://www.instagram.com/p/test/', src: '/media/room.webp', alt: 'Room' }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } });
const article = (handle = 'new-studio') => ({ blog: 'news', handle, title: 'A new studio', excerpt: 'A story', cover: null, blocks: [{ id: 'intro', type: 'paragraph', text: 'Welcome.' }], publishedAt: null });
before(async () => {
  await db.shopContentRevision.deleteMany(); await db.shopContent.deleteMany();
  await db.shopArticlePublication.deleteMany();
  root = await mkdtemp(join(tmpdir(), 'authored-articles-'));
  for (const [role, session] of [['publisher', token], ['editor', editorToken]] as const) {
    const staff = await db.shopAdmin.create({ data: { email: `article-${role}-${randomBytes(5).toString('hex')}@example.invalid`, passwordHash: 'unused-test-password-hash', role } }); ids.push(staff.id);
    await db.shopAdminSession.create({ data: { adminId: staff.id, tokenHash: digest(session), expiresAt: new Date(Date.now() + 600000) } });
  }
  await db.product.create({ data: { id: 'article-product', handle: 'article-chair', title: 'Article chair', description: '', category: 'chairs', images: [], published: true, source: 'article-test', sourceUpdatedAt: new Date() } });
  await db.product.create({ data: { id: 'article-hidden-product', handle: 'article-hidden-chair', title: 'Hidden chair', description: '', category: 'chairs', images: [], published: false, source: 'article-test', sourceUpdatedAt: new Date() } });
  http = request(createApp(db, { webOrigin: origin, catalogMode: 'preview', secureCookies: false, mediaRoot: root }));
});
after(async () => {
  await db.shopContentRevision.deleteMany({ where: { actorId: { in: ids } } });
  await db.shopMediaAsset.deleteMany({ where: { createdById: { in: ids } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: ids } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: ids } } });
  await db.product.deleteMany({ where: { source: 'article-test' } });
  await db.shopArticlePublication.deleteMany();
  await db.$disconnect(); if (root) await rm(root, { recursive: true, force: true });
});
async function save(content: unknown, headers = auth) {
  const version = (await db.shopContent.findUnique({ where: { id: 'storefront' } }))?.version ?? 0;
  const result = await http.put('/api/admin/content').set(headers).send({ expectedVersion: version, content });
  assert.equal(result.status, 200); return result.body;
}
const publish = (expectedVersion: number, headers = auth) => http.post('/api/admin/content/publish').set(headers).send({ expectedVersion });
const publicContent = () => http.get('/api/content/storefront');
const snapshot = async () => ({ content: await db.shopContent.findUnique({ where: { id: 'storefront' } }), revisions: await db.shopContentRevision.count(), publications: await db.shopArticlePublication.findMany({ orderBy: [{ blog: 'asc' }, { handle: 'asc' }] }) });
async function upload(background: string, client = http) {
  const data = await sharp({ create: { width: 12, height: 12, channels: 3, background } }).png().toBuffer();
  const result = await client.post('/api/admin/media').set(auth).set('Content-Type', 'image/png').send(data);
  assert.equal(result.status, 201); return result.body.asset as { id: string; url: string; sha256: string };
}

test('unpublished dates are cleared, drafts stay private, and first publication dates survive edits, removal and restore', async () => {
  const forged = '2001-01-01T00:00:00.000Z';
  let saved = await save({ ...fixture(), authoredArticles: [{ ...article(), publishedAt: forged }] });
  assert.equal(saved.draft.authoredArticles[0].publishedAt, null, 'clients cannot assign a first publication date');
  assert.equal((await publicContent()).status, 404);
  const revision = await db.shopContentRevision.findFirstOrThrow({ where: { version: saved.version } });
  const start = Date.now(); const published = await publish(saved.version); const end = Date.now();
  assert.equal(published.status, 200);
  const date = published.body.draft.authoredArticles[0].publishedAt;
  assert.ok(Date.parse(date) >= start && Date.parse(date) <= end);
  assert.equal((await publicContent()).body.content.authoredArticles[0].publishedAt, date);
  saved = await save({ ...fixture(), authoredArticles: [{ ...article(), title: 'Changed draft', publishedAt: '2099-01-01T00:00:00Z' }] });
  assert.equal(saved.draft.authoredArticles[0].publishedAt, date);
  assert.equal((await publicContent()).body.content.authoredArticles[0].title, 'A new studio');
  assert.equal((await publish(saved.version)).body.draft.authoredArticles[0].publishedAt, date);
  saved = await save({ ...fixture(), authoredArticles: [] });
  const removed = await publish(saved.version); assert.equal(removed.status, 200);
  assert.deepEqual((await publicContent()).body.content.authoredArticles, []);
  const restored = await http.post('/api/admin/content/rollback').set(auth).send({ expectedVersion: removed.body.version, revisionId: revision.id });
  assert.equal(restored.status, 200); assert.equal(restored.body.draft.authoredArticles[0].publishedAt, date);
  assert.deepEqual((await publicContent()).body.content.authoredArticles, []);
  assert.equal((await publish(restored.body.version)).body.draft.authoredArticles[0].publishedAt, date);
  saved = await save(fixture()); assert.equal(Object.hasOwn(saved.draft, 'authoredArticles'), false);
  assert.equal((await publish(saved.version)).status, 200);
  assert.equal(Object.hasOwn((await publicContent()).body.content, 'authoredArticles'), false);
});

test('authored changes keep editor, origin, CSRF, authentication and optimistic version gates', async () => {
  const saved = await save({ ...fixture(), authoredArticles: [article('gated-story')] }, editorAuth);
  const before = await snapshot();
  assert.equal((await publish(saved.version, editorAuth)).status, 403);
  assert.equal((await publish(saved.version, { ...auth, Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await publish(saved.version, { ...auth, 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await http.post('/api/admin/content/publish').set('Origin', origin).send({ expectedVersion: saved.version })).status, 401);
  assert.equal((await publish(saved.version - 1)).status, 409);
  assert.equal((await http.put('/api/admin/content').set(auth).send({ expectedVersion: saved.version - 1, content: fixture() })).status, 409);
  assert.deepEqual(await snapshot(), before);
  const responses = await Promise.all([publish(saved.version), publish(saved.version)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
});

test('same-snapshot authored pages and articles, existing routes, and actual catalogue links publish', async () => {
  const hrefs = ['/', '/#intro', '/pages/contact', '/pages/bulk-enquiry', '/pages/chairs', '/pages/tables', '/pages/sofas', '/pages/nimbus-collection', '/pages/our-story', '/pages/returns', '/pages/new-room', '/policies/privacy-policy', '/policies/refund-policy', '/blogs/life-culture', '/blogs/recent-stories/space-saving-furniture-ideas-for-small-homes', '/blogs/news/new-linked-story', '/collections/all', '/collections/chairs', '/collections/beds', '/collections/frontpage', '/products/article-chair#details'];
  const content = { ...fixture(), pages: [{ slug: 'new-room', title: 'New room', description: '', body: 'Hello', banner: null }], authoredArticles: [{ ...article('linked-story'), blocks: hrefs.map((href, i) => ({ id: `link-${i}`, type: 'link', text: 'Read', href })) }, article('new-linked-story')] };
  assert.equal((await publish((await save(content)).version)).status, 200);
  assert.equal((await publicContent()).body.content.authoredArticles.length, 2);
});

test('missing article/page/policy/blog/product/collection targets reject publication without any writes', async () => {
  for (const href of ['/pages/new-room', '/blogs/news/new-linked-story', '/pages/does-not-exist', '/blogs/news/does-not-exist', '/blogs/not-a-blog', '/policies/no-policy', '/products/no-product', '/products/article-hidden-chair', '/collections/not-a-collection']) {
    const saved = await save({ ...fixture(), authoredArticles: [{ ...article('missing-target'), blocks: [{ id: 'link', type: 'link', text: 'Read', href }] }] });
    const before = await snapshot(); const response = await publish(saved.version);
    assert.equal(response.status, 400, href); assert.equal(response.body.code, 'ARTICLE_LINK_TARGET_MISSING');
    assert.deepEqual(await snapshot(), before);
  }
});

test('article cover and inline media stay private until published, and missing or tampered images fail atomically', async () => {
  const cover = await upload('#163842'), inline = await upload('#957122');
  const authored = { ...article('illustrated'), cover: { src: cover.url, alt: 'Room' }, blocks: [{ id: 'image', type: 'image', src: inline.url, alt: 'Chair' }] };
  const saved = await save({ ...fixture(), authoredArticles: [authored] });
  assert.equal((await http.get(cover.url)).status, 404); assert.equal((await http.get(inline.url)).status, 404);
  assert.equal((await publish(saved.version)).status, 200);
  assert.equal((await http.get(cover.url)).status, 200, 'article covers must become publicly readable');
  assert.equal((await http.get(inline.url)).status, 200, 'inline article images must become publicly readable');
  for (const kind of ['missing-reference', 'missing-file', 'tampered', 'invalid-reference'] as const) {
    const first = await upload(kind === 'missing-reference' ? '#354267' : kind === 'missing-file' ? '#734253' : kind === 'tampered' ? '#546372' : '#234524');
    const second = await upload(kind === 'missing-reference' ? '#759263' : kind === 'missing-file' ? '#945264' : kind === 'tampered' ? '#465263' : '#826354');
    const file = join(root, second.sha256 + '.webp');
    const original = await readFile(file);
    if (kind === 'missing-file') await rename(file, file + '.missing');
    if (kind === 'tampered') await writeFile(file, Buffer.alloc(original.length, 65));
    const src = kind === 'missing-reference' ? `/media/uploads/${'f'.repeat(64)}.webp` : kind === 'invalid-reference' ? '/media/uploads/not-a-hash.webp' : second.url;
    try {
      const saved = await save({ ...fixture(), authoredArticles: [{ ...article(`broken-${kind}`), cover: { src: first.url, alt: 'Cover' }, blocks: [{ id: 'image', type: 'image', src, alt: 'Photo' }] }] });
      const before = await snapshot(); const response = await publish(saved.version);
      assert.equal(response.status, 400, kind); assert.equal(response.body.code, kind === 'invalid-reference' ? 'MEDIA_REFERENCE_INVALID' : 'MEDIA_REFERENCE_MISSING');
      assert.deepEqual(await snapshot(), before);
      assert.equal((await http.get(first.url)).status, 404);
      assert.equal((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: first.id } })).publicAt, null);
    } finally {
      if (kind === 'missing-file') await rename(file + '.missing', file);
      if (kind === 'tampered') await writeFile(file, original);
    }
  }
});


test('malformed authored data and route collisions reject saves without changing revisions or public content', async () => {
  const before = await snapshot();
  const version = before.content!.version;
  for (const authoredArticles of [
    [{ ...article(), blog: 'recent-stories', handle: 'space-saving-furniture-ideas-for-small-homes' }],
    [article(), article()],
    [{ ...article(), title: ' ' }],
    [{ ...article(), blocks: [{ id: 'image', type: 'image', src: 'https://evil.invalid/x', alt: 'x' }] }],
    [{ ...article(), blocks: Array.from({ length: 7 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: 'a'.repeat(8000) })) }],
  ]) {
    const response = await http.put('/api/admin/content').set(auth).send({ expectedVersion: version, content: { ...fixture(), authoredArticles } });
    assert.equal(response.status, 400); assert.equal(response.body.code, 'INVALID_INPUT');
    assert.deepEqual(await snapshot(), before);
  }
  const oversized = await http.put('/api/admin/content').set(auth).send({ expectedVersion: version, content: { ...fixture(), authoredArticles: [{ ...article(), excerpt: 'a'.repeat(140000) }] } });
  assert.equal(oversized.status, 413); assert.deepEqual(await snapshot(), before);
});

test('legacy page links retain existing publication behavior', async () => {
  const saved = await save({ ...fixture(), pages: [{ slug: 'legacy-links', title: 'Legacy', description: '', body: '', banner: { desktopImage: '/media/a.webp', mobileImage: '/media/b.webp', alt: 'Art', href: '/pages/legacy-unavailable', label: 'Read' } }] });
  const result = await publish(saved.version);
  assert.equal(result.status, 200);
  assert.equal((await publicContent()).body.content.pages[0].banner.href, '/pages/legacy-unavailable');
});

test('server publication metadata cannot overflow article bounds or commit a partial ledger', async () => {
  const value = { ...article('near-size-limit'), blocks: Array.from({ length: 7 }, (_, i) => ({ id: `part-${i}`, type: 'paragraph', text: i < 6 ? 'a'.repeat(8000) : 'a' })) };
  // Make a valid 48 KiB draft whose server-owned timestamp would exceed the limit.
  value.blocks[6]!.text = 'a'.repeat(48 * 1024 - Buffer.byteLength(JSON.stringify(value)) + 1);
  assert.equal(Buffer.byteLength(JSON.stringify(value)), 48 * 1024);
  const saved = await save({ ...fixture(), authoredArticles: [value] });
  const before = await snapshot();
  const response = await publish(saved.version);
  assert.equal(response.status, 400, 'publication must validate the normalized server-owned document');
  assert.deepEqual(await snapshot(), before);
});

test('saving media path aliases is rejected without changing the draft, revision or publication ledger', async () => {
  await save({ ...fixture(), authoredArticles: [article('canonical-paths')] });
  const before = await snapshot();
  const hash = 'b'.repeat(64);
  for (const src of [`/media/./uploads/${hash}.webp`, `/media//uploads/${hash}.webp`, `/media/uploads/./${hash}.webp`, `/media/uploads//${hash}.webp`, `/media/uploads/${hash}.webp/.`]) {
    for (const value of [{ ...article('aliased-cover'), cover: { src, alt: 'Room' } }, { ...article('aliased-inline'), blocks: [{ id: 'image', type: 'image', src, alt: 'Room' }] }]) {
      const response = await http.put('/api/admin/content').set(auth).send({ expectedVersion: before.content!.version, content: { ...fixture(), authoredArticles: [value] } });
      assert.equal(response.status, 400, src);
      assert.equal(response.body.code, 'INVALID_INPUT');
      assert.deepEqual(await snapshot(), before);
    }
  }
});

test('legacy persisted aliased media cannot bypass publication integrity checks', async () => {
  const isolatedHttp = request(createApp(db, { webOrigin: origin, catalogMode: 'preview', secureCookies: false, mediaRoot: root }));
  const asset = await upload('#143958', isolatedHttp);
  await save({ ...fixture(), authoredArticles: [article('persisted-alias')] });
  // A snapshot saved before canonical-path validation must also fail when published.
  await db.shopContent.update({ where: { id: 'storefront' }, data: { draft: { ...fixture(), authoredArticles: [{ ...article('persisted-alias'), cover: { src: `/media/./uploads/${asset.sha256}.webp`, alt: 'Room' } }] } } });
  const before = await snapshot();
  const response = await publish(before.content!.version);
  assert.equal(response.status, 400, 'persisted dot-segment alias must not skip the media gate');
  assert.equal(response.body.code, 'INVALID_INPUT');
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicAt, null);
  assert.equal((await http.get(asset.url)).status, 404);
});
