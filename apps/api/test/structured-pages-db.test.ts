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
  root = await mkdtemp(join(tmpdir(), 'structured-pages-'));
  for (const [role, session] of [['publisher', token], ['editor', editorToken]] as const) {
    const staff = await db.shopAdmin.create({ data: { email: `page-${role}-${randomBytes(5).toString('hex')}@example.invalid`, passwordHash: 'unused-test-password-hash', role } }); ids.push(staff.id);
    await db.shopAdminSession.create({ data: { adminId: staff.id, tokenHash: digest(session), expiresAt: new Date(Date.now() + 600000) } });
  }
  await db.product.create({ data: { id: 'page-product', handle: 'page-chair', title: 'Article chair', description: '', category: 'chairs', images: [], published: true, source: 'structured-page-test', sourceUpdatedAt: new Date() } });
  await db.product.create({ data: { id: 'page-hidden-product', handle: 'page-hidden-chair', title: 'Hidden chair', description: '', category: 'chairs', images: [], published: false, source: 'structured-page-test', sourceUpdatedAt: new Date() } });
  http = request(createApp(db, { webOrigin: origin, catalogMode: 'preview', secureCookies: false, mediaRoot: root }));
});
after(async () => {
  await db.shopContentRevision.deleteMany({ where: { actorId: { in: ids } } });
  await db.shopMediaAsset.deleteMany({ where: { createdById: { in: ids } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: ids } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: ids } } });
  await db.product.deleteMany({ where: { source: 'structured-page-test' } });
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
const snapshot = async () => ({ content: await db.shopContent.findUnique({ where: { id: 'storefront' } }), revisions: await db.shopContentRevision.count(), media: await db.shopMediaAsset.findMany({ where: { createdById: { in: ids } }, orderBy: { id: 'asc' } }), publications: await db.shopArticlePublication.findMany({ orderBy: [{ blog: 'asc' }, { handle: 'asc' }] }) });
async function upload(background: string, client = http) {
  const data = await sharp({ create: { width: 12, height: 12, channels: 3, background } }).png().toBuffer();
  const result = await client.post('/api/admin/media').set(auth).set('Content-Type', 'image/png').send(data);
  assert.equal(result.status, 201); return result.body.asset as { id: string; url: string; sha256: string };
}

const page = (blocks: unknown[] = [{ id: 'intro', type: 'paragraph', text: 'Welcome.' }]) => ({ slug: 'studio', title: 'Studio', description: '', body: 'Retained legacy body.', banner: null, blocks });

test('structured page drafts stay private and publication exposes only the committed snapshot', async () => {
  let saved = await save({ ...fixture(), pages: [page()] });
  assert.equal((await publicContent()).status, 404);
  assert.equal((await publish(saved.version)).status, 200);
  assert.deepEqual((await publicContent()).body.content.pages, [page()]);
  saved = await save({ ...fixture(), pages: [{ ...page(), title: 'Unpublished title' }] });
  assert.equal((await publicContent()).body.content.pages[0].title, 'Studio');
  assert.equal(Object.hasOwn(saved.draft, 'authoredArticles'), false);
});

test('page-only missing targets fail atomically even when authored articles are absent or empty', async () => {
  for (const authored of [{}, { authoredArticles: [] }]) {
    for (const href of ['/pages/missing', '/blogs/news/missing', '/blogs/missing', '/policies/missing', '/products/missing', '/products/page-hidden-chair', '/collections/missing']) {
      const saved = await save({ ...fixture(), ...authored, pages: [page([{ id: 'link', type: 'link', text: 'Read', href }])] });
      const before = await snapshot();
      const response = await publish(saved.version);
      assert.equal(response.status, 400, `page-only destination ${href} must be checked`);
      assert.equal(response.body.code, 'PAGE_LINK_TARGET_MISSING');
      assert.deepEqual(await snapshot(), before);
    }
  }
});

test('page links accept candidate pages and articles plus real catalogue and source destinations', async () => {
  const hrefs = ['/', '/#intro', '/pages/studio#intro', '/pages/new-room', '/blogs/news/new-linked-story', '/products/page-chair#details', '/collections/chairs', '/collections/frontpage', '/policies/privacy-policy', '/blogs/life-culture', '/blogs/recent-stories/space-saving-furniture-ideas-for-small-homes', '/pages/our-story'];
  const content = { ...fixture(), pages: [page(hrefs.map((href, i) => ({ id: `link-${i}`, type: 'link', text: 'Read', href }))), { slug: 'new-room', title: 'Room', description: '', body: 'Hello', banner: null }], authoredArticles: [article('new-linked-story')] };
  assert.equal((await publish((await save(content)).version)).status, 200);
  // Previously published destinations removed from the candidate snapshot are not valid.
  const saved = await save({ ...fixture(), pages: [page([{ id: 'link', type: 'link', text: 'Read', href: '/blogs/news/new-linked-story' }])] });
  const before = await snapshot();
  const response = await publish(saved.version);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'PAGE_LINK_TARGET_MISSING');
  assert.deepEqual(await snapshot(), before);
});

test('page block media becomes public only on successful publication', async () => {
  const asset = await upload('#173842');
  const saved = await save({ ...fixture(), pages: [page([{ id: 'image', type: 'image', src: asset.url, alt: 'Studio' }])] });
  assert.equal((await http.get(asset.url)).status, 404);
  assert.equal((await publish(saved.version)).status, 200);
  assert.equal((await http.get(asset.url)).status, 200, 'page images must become public after publish');
  assert.notEqual((await db.shopMediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).publicAt, null);
});

test('missing, invalid and tampered page images prevent all publication and article date writes', async () => {
  for (const [i, kind] of ['missing-reference', 'missing-file', 'tampered', 'invalid-reference'].entries()) {
    const first = await upload(['#354267', '#734253', '#546372', '#234524'][i]!), second = await upload(['#759263', '#945264', '#465263', '#826354'][i]!);
    const file = join(root, second.sha256 + '.webp');
    const original = await readFile(file);
    if (kind === 'missing-file') await rename(file, file + '.missing');
    if (kind === 'tampered') await writeFile(file, Buffer.alloc(original.length, 65));
    const src = kind === 'missing-reference' ? `/media/uploads/${'f'.repeat(64)}.webp` : kind === 'invalid-reference' ? '/media/uploads/not-a-hash.webp' : second.url;
    try {
      const saved = await save({ ...fixture(), pages: [page([{ id: 'first', type: 'image', src: first.url, alt: 'First' }, { id: 'second', type: 'image', src, alt: 'Second' }])], authoredArticles: [article(`broken-page-${kind}`)] });
      const before = await snapshot();
      const response = await publish(saved.version);
      assert.equal(response.status, 400, kind);
      assert.equal(response.body.code, kind === 'invalid-reference' ? 'MEDIA_REFERENCE_INVALID' : 'MEDIA_REFERENCE_MISSING');
      assert.deepEqual(await snapshot(), before);
      assert.equal((await http.get(first.url)).status, 404);
    } finally {
      if (kind === 'missing-file') await rename(file + '.missing', file);
      if (kind === 'tampered') await writeFile(file, original);
    }
  }
});

test('structured pages retain authentication, editor authority, CSRF, origin and optimistic concurrency gates', async () => {
  const saved = await save({ ...fixture(), pages: [page()] }, editorAuth);
  const before = await snapshot();
  assert.equal((await publish(saved.version, editorAuth)).status, 403);
  assert.equal((await publish(saved.version, { ...auth, Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await publish(saved.version, { ...auth, 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await http.post('/api/admin/content/publish').set('Origin', origin).send({ expectedVersion: saved.version })).status, 401);
  assert.equal((await publish(saved.version - 1)).status, 409);
  assert.equal((await http.put('/api/admin/content').set(auth).send({ expectedVersion: saved.version - 1, content: { ...fixture(), pages: [page()] } })).status, 409);
  assert.deepEqual(await snapshot(), before);
  const responses = await Promise.all([publish(saved.version), publish(saved.version)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
});

test('rollback restores page blocks only to a draft and revalidates missing destinations at publication', async () => {
  const content = { ...fixture(), pages: [page([{ id: 'link', type: 'link', text: 'Read', href: '/pages/missing-rollback' }])] };
  let saved = await save(content);
  const revision = await db.shopContentRevision.findFirstOrThrow({ where: { version: saved.version } });
  saved = await save({ ...fixture(), pages: [page()] });
  const published = await publish(saved.version);
  assert.equal(published.status, 200);
  const publicBefore = (await publicContent()).body;
  const restored = await http.post('/api/admin/content/rollback').set(auth).send({ expectedVersion: published.body.version, revisionId: revision.id });
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body.draft.pages, content.pages);
  assert.deepEqual((await publicContent()).body, publicBefore);
  const before = await snapshot();
  const response = await publish(restored.body.version);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'PAGE_LINK_TARGET_MISSING');
  assert.deepEqual(await snapshot(), before);
});

test('unsafe page paths and oversized blocks reject saves and persisted aliases cannot bypass publication checks', async () => {
  await save({ ...fixture(), pages: [page()] });
  const before = await snapshot();
  const hash = 'b'.repeat(64);
  for (const src of [`/media/./uploads/${hash}.webp`, `/media//uploads/${hash}.webp`, `/media/uploads/./${hash}.webp`, `/media/uploads//${hash}.webp`, `/media/uploads/${hash}.webp/.`]) {
    const response = await http.put('/api/admin/content').set(auth).send({ expectedVersion: before.content!.version, content: { ...fixture(), pages: [page([{ id: 'image', type: 'image', src, alt: 'Room' }])] } });
    assert.equal(response.status, 400, src);
    assert.equal(response.body.code, 'INVALID_INPUT');
    assert.deepEqual(await snapshot(), before);
  }
  for (const blocks of [[], [{ id: 'text', type: 'paragraph', text: ' ' }], Array.from({ length: 7 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: 'a'.repeat(8000) }))]) {
    const response = await http.put('/api/admin/content').set(auth).send({ expectedVersion: before.content!.version, content: { ...fixture(), pages: [page(blocks)] } });
    assert.equal(response.status, 400);
    assert.deepEqual(await snapshot(), before);
  }
  const asset = await upload('#143958');
  await db.shopContent.update({ where: { id: 'storefront' }, data: { draft: { ...fixture(), pages: [page([{ id: 'image', type: 'image', src: `/media/./uploads/${asset.sha256}.webp`, alt: 'Room' }])] } as never } });
  const persisted = await snapshot();
  const response = await publish(persisted.content!.version);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_INPUT');
  assert.deepEqual(await snapshot(), persisted);
  assert.equal((await http.get(asset.url)).status, 404);
});

test('legacy page banners and article-specific missing-link errors retain their behavior alongside blocks', async () => {
  const banner = { desktopImage: '/media/a.webp', mobileImage: '/media/b.webp', alt: 'Art', href: '/pages/legacy-unavailable', label: 'Read' };
  assert.equal((await publish((await save({ ...fixture(), pages: [{ ...page(), banner }] })).version)).status, 200);
  const saved = await save({ ...fixture(), pages: [page()], authoredArticles: [{ ...article(), blocks: [{ id: 'link', type: 'link', text: 'Read', href: '/pages/no-article-destination' }] }] });
  const before = await snapshot();
  const response = await publish(saved.version);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'ARTICLE_LINK_TARGET_MISSING');
  assert.deepEqual(await snapshot(), before);
});
