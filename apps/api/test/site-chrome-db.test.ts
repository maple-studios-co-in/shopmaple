import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { chromeFixture, chromeLink, contentFixture } from './fixtures/site-chrome.js';
import { defaultSiteChrome } from '../../web/lib/site-chrome-defaults.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/shopmaple_test' || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '55439') throw Error('Dedicated loopback test database required');
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = 'http://localhost:3000';
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const token = randomBytes(32).toString('hex'), editorToken = randomBytes(32).toString('hex');
const auth = { Origin: origin, Cookie: `shop_admin=${token}`, 'X-CSRF-Token': digest('csrf:' + token) };
const editorAuth = { Origin: origin, Cookie: `shop_admin=${editorToken}`, 'X-CSRF-Token': digest('csrf:' + editorToken) };
const ids: string[] = [];
let http: ReturnType<typeof request>;
const document = (siteChrome = chromeFixture()) => ({ ...contentFixture(), siteChrome });
before(async () => {
  await db.shopContentRevision.deleteMany(); await db.shopContent.deleteMany(); await db.shopArticlePublication.deleteMany();
  for (const [role, session] of [['publisher', token], ['editor', editorToken]] as const) {
    const staff = await db.shopAdmin.create({ data: { email: `chrome-${role}-${randomBytes(5).toString('hex')}@example.invalid`, passwordHash: 'unused-test-password-hash', role } }); ids.push(staff.id);
    await db.shopAdminSession.create({ data: { adminId: staff.id, tokenHash: digest(session), expiresAt: new Date(Date.now() + 600000) } });
  }
  for (const published of [true, false]) await db.product.create({ data: { id: `chrome-${published}`, handle: `chrome-chair-${published}`, title: 'Chrome chair', description: '', images: [], published, source: 'chrome-test', sourceUpdatedAt: new Date() } });
  http = request(createApp(db, { webOrigin: origin, catalogMode: 'preview', secureCookies: false }));
});
after(async () => {
  await db.shopContentRevision.deleteMany({ where: { actorId: { in: ids } } });
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: ids } } }); await db.shopAdmin.deleteMany({ where: { id: { in: ids } } });
  await db.product.deleteMany({ where: { source: 'chrome-test' } }); await db.shopArticlePublication.deleteMany(); await db.$disconnect();
});
async function save(content: unknown, headers = auth) {
  const expectedVersion = (await db.shopContent.findUnique({ where: { id: 'storefront' } }))?.version ?? 0;
  const result = await http.put('/api/admin/content').set(headers).send({ expectedVersion, content });
  assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
}
const publish = (expectedVersion: number, headers = auth) => http.post('/api/admin/content/publish').set(headers).send({ expectedVersion });
const publicContent = () => http.get('/api/content/storefront');
const snapshot = async () => ({ content: await db.shopContent.findUnique({ where: { id: 'storefront' } }), revisions: await db.shopContentRevision.count(), publications: await db.shopArticlePublication.findMany({ orderBy: [{ blog: 'asc' }, { handle: 'asc' }] }) });
const article = { blog: 'news', handle: 'chrome-new-story', title: 'A new story', excerpt: '', cover: null, blocks: [{ id: 'intro', type: 'paragraph', text: 'Welcome' }], publishedAt: null };

test('chrome drafts stay private, safe enabled destinations publish and same-candidate pages/articles resolve', async () => {
  const saved = await save(document());
  assert.equal((await publicContent()).status, 404);
  assert.equal((await publish(saved.version)).status, 200);
  const candidate = document(); candidate.siteChrome.utilityLinks = [chromeLink('page', '/pages/chrome-new-page'), chromeLink('article', '/blogs/news/chrome-new-story'), chromeLink('product', '/products/chrome-chair-true#details'), chromeLink('account', '/account'), chromeLink('favourites', '/favourites')];
  const savedCandidate = await save({ ...candidate, pages: [{ slug: 'chrome-new-page', title: 'Page', description: '', body: 'Welcome', banner: null }], authoredArticles: [article] });
  assert.equal((await publicContent()).body.content.siteChrome.utilityLinks[0].href, '/account');
  assert.equal((await publish(savedCandidate.version)).status, 200);
  assert.equal((await publicContent()).body.content.siteChrome.utilityLinks[0].href, '/pages/chrome-new-page');
});

test('missing enabled targets in every chrome surface reject publication atomically', async () => {
  const missing = '/pages/chrome-missing';
  const updates: Array<(chrome: ReturnType<typeof chromeFixture>) => void> = [
    chrome => { chrome.announcement.href = missing; },
    chrome => { chrome.utilityLinks = [chromeLink('missing', missing)]; },
    chrome => { chrome.navigation[0]!.href = missing; },
    chrome => { chrome.navigation[0]!.columns[0]!.links[0]!.href = missing; },
    chrome => { chrome.desktopDiscovery[0]!.href = missing; },
    chrome => { chrome.mobileQuickLinks = [chromeLink('missing', missing)]; },
    chrome => { chrome.footer.shopLinks = [chromeLink('missing', missing)]; },
    chrome => { chrome.footer.helpLinks = [chromeLink('missing', missing)]; },
    chrome => { chrome.footer.policyLinks = [chromeLink('missing', missing)]; },
  ];
  for (const [index, update] of updates.entries()) {
    const chrome = chromeFixture(); update(chrome);
    const saved = await save({ ...document(chrome), authoredArticles: [{ ...article, handle: `unpublished-${index}` }] });
    const previous = await snapshot(); const publicBefore = (await publicContent()).body;
    const response = await publish(saved.version);
    assert.equal(response.status, 400, `missing chrome target surface ${index} must block publication`);
    assert.equal(response.body.code, 'CHROME_LINK_TARGET_MISSING');
    assert.deepEqual(await snapshot(), previous); assert.deepEqual((await publicContent()).body, publicBefore);
  }
});

test('unpublished products and nonexistent route families cannot be chrome destinations', async () => {
  for (const href of ['/products/chrome-chair-false', '/products/chrome-missing', '/collections/chrome-missing', '/blogs/chrome-missing', '/blogs/news/chrome-absent', '/policies/chrome-missing', '/pages/chrome-new-page']) {
    const chrome = chromeFixture(); chrome.utilityLinks = [chromeLink('missing', href)];
    const saved = await save(document(chrome)); const previous = await snapshot();
    const response = await publish(saved.version);
    assert.equal(response.status, 400, href); assert.equal(response.body.code, 'CHROME_LINK_TARGET_MISSING');
    assert.deepEqual(await snapshot(), previous);
  }
});

test('hidden links and hidden navigation/footer parents can be saved and published but re-enabling validates targets', async () => {
  const chrome = chromeFixture(); const missing = '/pages/chrome-hidden';
  chrome.announcement = { ...chrome.announcement, enabled: false, href: missing };
  chrome.utilityLinks = [{ ...chromeLink('hidden', missing), enabled: false }];
  chrome.navigation[0] = { ...chrome.navigation[0]!, enabled: false, href: missing, columns: [{ id: 'hidden', links: [{ ...chromeLink('hidden', missing), parent: false }] }] };
  chrome.desktopDiscovery[0] = { ...chrome.desktopDiscovery[0]!, enabled: false, href: missing };
  chrome.mobileQuickLinks = [{ ...chromeLink('hidden', missing), enabled: false }];
  chrome.footer.columns = chrome.footer.columns.map(column => ({ ...column, enabled: false }));
  chrome.footer.shopLinks = [chromeLink('hidden', missing)]; chrome.footer.helpLinks = [chromeLink('hidden', missing)];
  chrome.footer.policyLinks = [{ ...chromeLink('hidden', missing), enabled: false }];
  assert.equal((await publish((await save(document(chrome))).version)).status, 200);
  chrome.utilityLinks[0]!.enabled = true;
  const saved = await save(document(chrome)); const previous = await snapshot();
  assert.equal((await publish(saved.version)).status, 400); assert.deepEqual(await snapshot(), previous);
});

test('chrome save/publish retains authentication, role, origin, CSRF and stale-version protections', async () => {
  const saved = await save(document(), editorAuth); const previous = await snapshot();
  assert.equal((await publish(saved.version, editorAuth)).status, 403);
  assert.equal((await publish(saved.version, { ...auth, Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await publish(saved.version, { ...auth, 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await http.post('/api/admin/content/publish').set('Origin', origin).send({ expectedVersion: saved.version })).status, 401);
  assert.equal((await publish(saved.version - 1)).status, 409);
  assert.deepEqual(await snapshot(), previous);
  const invalid = document(); invalid.siteChrome.utilityLinks[0]!.href = '//evil.invalid';
  const response = await http.put('/api/admin/content').set(auth).send({ expectedVersion: saved.version, content: invalid });
  assert.equal(response.status, 400); assert.equal(response.body.code, 'INVALID_INPUT'); assert.deepEqual(await snapshot(), previous);
});

// Integration characterization: the source template must be publishable unchanged.
test('original storefront chrome defaults publish through the real router and retain source targets', async () => {
  const saved = await save({ ...contentFixture(), siteChrome: structuredClone(defaultSiteChrome) });
  assert.equal((await publish(saved.version)).status, 200);
  const content = (await publicContent()).body.content;
  assert.equal(content.siteChrome.navigation[0].columns[0].links[0].href, '/pages/sofas');
  assert.equal(content.siteChrome.navigation[1].columns[0].links[4].enquirySubject, 'Kids Beds');
  assert.equal(content.siteChrome.whatsapp.phone, '+918796130252');
});
