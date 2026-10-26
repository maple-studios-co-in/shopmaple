import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storefrontContentSchema } from '@shopmaple/contracts';
import { chromeFixture, chromeLink, contentFixture } from './fixtures/site-chrome.js';
const parse = (siteChrome: unknown) => storefrontContentSchema.safeParse({ ...contentFixture(), siteChrome });
test('legacy snapshots preserve omitted chrome and valid chrome survives the content boundary', () => {
  assert.equal(Object.hasOwn(storefrontContentSchema.parse(contentFixture()), 'siteChrome'), false);
  const chrome = chromeFixture();
  const parsed = parse(chrome);
  assert.equal(parsed.success, true, 'a valid chrome override must be accepted');
  if (parsed.success) assert.deepEqual((parsed.data as unknown as { siteChrome: unknown }).siteChrome, chrome);
});
test('only canonical local destinations and contact-only enquiry subjects are accepted', () => {
  for (const href of ['/', '/account', '/favourites', '/pages/contact', '/products/chair#details', '/blogs/news/new-story', '/collections/all'])
    assert.equal(parse({ ...chromeFixture(), utilityLinks: [chromeLink('link', href)] }).success, true, href);
  for (const href of ['javascript:alert(1)', 'https://evil.invalid', '//evil.invalid', '/admin', '/api/content', '#details', '/account?x=y', '/pages/contact?product=chair', '/pages/%63ontact', '/pages/../contact', '/pages//contact', '/pages/contact\n'])
    assert.equal(parse({ ...chromeFixture(), utilityLinks: [chromeLink('link', href)] }).success, false, href);
  assert.equal(parse({ ...chromeFixture(), utilityLinks: [{ ...chromeLink(), enquirySubject: 'Care & repair' }] }).success, true);
  for (const value of [{ ...chromeLink('home', '/'), enquirySubject: 'Hello' }, { ...chromeLink(), enquirySubject: ' ' }, { ...chromeLink(), enquirySubject: 'x'.repeat(161) }])
    assert.equal(parse({ ...chromeFixture(), utilityLinks: [value] }).success, false);
});
test('contact and social destinations reject injections, aliases and unapproved hosts', () => {
  for (const [key, value] of [
    ['customerPhone', '911234567890'], ['customerPhone', '+012345678'], ['bulkPhone', '+123'], ['bulkPhone', '+1234567890123456'],
    ['customerEmail', 'hello@example.invalid\r\nBcc:other@example.invalid'], ['bulkEmail', 'not-email'],
    ['instagram', 'https://evil.invalid/studio/'], ['instagram', 'https://www.instagram.com/p/post/'], ['instagram', 'https://www.instagram.com/studio/?x=1'], ['instagram', 'https://www.instagram.com/studio/#x'], ['instagram', 'https://user@www.instagram.com/studio/'], ['instagram', 'https://www.instagram.com:443/studio/'], ['instagram', 'https://www.instagram.com/%73tudio/'], ['instagram', 'https://www.instagram.com/../studio/'],
    ['linkedin', 'http://www.linkedin.com/company/studio/'], ['linkedin', 'https://www.linkedin.com/in/person/'], ['linkedin', 'https://www.linkedin.com/company/studio/?x=1'],
  ]) assert.equal(parse({ ...chromeFixture(), footer: { ...chromeFixture().footer, [key!]: value } }).success, false, `${key}: ${value}`);
  assert.equal(parse({ ...chromeFixture(), footer: { ...chromeFixture().footer, instagram: null, linkedin: null } }).success, true);
  assert.equal(parse({ ...chromeFixture(), whatsapp: { enabled: false, phone: 'https://evil.invalid', label: 'Chat' } }).success, false);
});
test('chrome objects reject unknown fields, blank copy, controls, duplicate identities and list overflow', () => {
  const chrome = chromeFixture();
  for (const update of [
    { rawHtml: '<script>x</script>' }, { announcement: { ...chrome.announcement, text: ' ' } }, { announcement: { ...chrome.announcement, text: 'x'.repeat(201) } },
    { utilityLinks: [{ ...chromeLink(), label: 'line\nfeed' }] }, { utilityLinks: [{ ...chromeLink(), label: 'x'.repeat(121) }] }, { utilityLinks: [{ ...chromeLink(), id: 'Bad ID' }] }, { utilityLinks: [{ ...chromeLink(), id: 'x'.repeat(81) }] }, { utilityLinks: [{ ...chromeLink(), onclick: 'x' }] }, { utilityLinks: [chromeLink(), chromeLink()] },
    { utilityLinks: Array.from({ length: 7 }, (_, i) => chromeLink(`link-${i}`)) }, { navigation: [] }, { navigation: Array.from({ length: 9 }, (_, i) => ({ ...chrome.navigation[0], id: `nav-${i}` })) },
    { navigation: [{ ...chrome.navigation[0], columns: [{ id: 'empty', links: [] }] }] }, { navigation: [{ ...chrome.navigation[0], columns: [chrome.navigation[0]!.columns[0], chrome.navigation[0]!.columns[0]] }] },
    { desktopDiscovery: [{ ...chrome.desktopDiscovery[0], cta: '' }] }, { mobileQuickLinks: Array.from({ length: 9 }, (_, i) => chromeLink(`link-${i}`)) },
    { footer: { ...chrome.footer, columns: [{ key: 'shop', enabled: true }, { key: 'shop', enabled: false }, { key: 'care', enabled: true }] } }, { footer: { ...chrome.footer, contactColumns: [] } }, { footer: { ...chrome.footer, addressLines: [] } }, { footer: { ...chrome.footer, customerPhoneLabel: '\t' } },
    { whatsapp: { ...chrome.whatsapp, label: '\u0000' } },
  ]) assert.equal(parse({ ...chrome, ...update }).success, false, JSON.stringify(update).slice(0, 100));
});
test('the independent 64 KiB chrome budget rejects otherwise bounded Unicode content', () => {
  const chrome = chromeFixture();
  const large = { ...chrome, navigation: Array.from({ length: 5 }, (_, i) => ({ ...chrome.navigation[0], id: `nav-${i}`, columns: Array.from({ length: 3 }, (_, j) => ({ id: `col-${j}`, links: Array.from({ length: 10 }, (_, k) => ({ ...chromeLink(`link-${k}`), label: '家'.repeat(120), parent: false })) })) })) };
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 128 * 1024);
  const parsed = parse(large);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.issues.some(issue => issue.message === "Site chrome exceeds 64 KiB"));
});

test('canonical IDs, phones and social URLs reject trailing line terminators', () => {
  for (const suffix of ['\n', '\r\n', '\u0085', '\u2028', '\u2029']) {
    const chrome = chromeFixture();
    assert.equal(parse({ ...chrome, utilityLinks: [{ ...chromeLink(), id: `contact${suffix}` }] }).success, false, `ID suffix ${JSON.stringify(suffix)}`);
    assert.equal(parse({ ...chrome, whatsapp: { ...chrome.whatsapp, phone: `+911234567890${suffix}` } }).success, false, `phone suffix ${JSON.stringify(suffix)}`);
    assert.equal(parse({ ...chrome, footer: { ...chrome.footer, instagram: `https://www.instagram.com/studio/${suffix}` } }).success, false, `Instagram suffix ${JSON.stringify(suffix)}`);
    assert.equal(parse({ ...chrome, footer: { ...chrome.footer, linkedin: `https://www.linkedin.com/company/studio/${suffix}` } }).success, false, `LinkedIn suffix ${JSON.stringify(suffix)}`);
  }
});
