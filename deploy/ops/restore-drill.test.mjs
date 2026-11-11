import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCounts, compareMigrations, drillWorkName, summarise } from './restore-drill.mjs';

const tolerance = { percent: 10, absolute: 25 };

test('key table counts within tolerance pass; a large gap fails and names the table', () => {
  const live = { Product: 385, Variant: 798, Enquiry: 140, CheckoutAttempt: 12, Cart: 9000 };
  assert.deepEqual(compareCounts(live, { Product: 385, Variant: 790, Enquiry: 131, CheckoutAttempt: 10, Cart: 10 }, tolerance), []);
  const problems = compareCounts(live, { Product: 12, Variant: 798, Enquiry: 140, CheckoutAttempt: 12, Cart: 9000 }, tolerance);
  assert.deepEqual(problems, ['row count Product: live 385, restored 12 (allowed difference 39)']);
});

test('a key table missing from the restore fails; volatile tables are not compared', () => {
  const problems = compareCounts({ Product: 10, Cart: 50, CustomerSession: 5 }, { Cart: 0 }, tolerance);
  assert.deepEqual(problems, ['table Product is missing from the restored database']);
});

test('tolerance has an absolute floor so small tables are not flagged for ordinary growth', () => {
  assert.deepEqual(compareCounts({ Enquiry: 30 }, { Enquiry: 8 }, tolerance), []);
  assert.equal(compareCounts({ Enquiry: 30 }, { Enquiry: 4 }, tolerance).length, 1);
  assert.equal(compareCounts({ Enquiry: 3 }, { Enquiry: 0 }, { percent: 0, absolute: 0 }).length, 1);
});

const m = (name, finishedAt, checksum = 'c') => ({ name, finishedAt, checksum });
test('migrations must match, except ones the live database applied after the backup was taken', () => {
  const dumpStartedAt = '2026-11-12T02:47:00.000Z';
  const restored = [m('a', '2026-10-01T00:00:00.000Z'), m('b', '2026-11-01T00:00:00.000Z')];
  assert.deepEqual(compareMigrations([...restored], restored, dumpStartedAt), []);
  assert.deepEqual(compareMigrations([...restored, m('c', '2026-11-12T09:00:00.000Z')], restored, dumpStartedAt), []);
  assert.deepEqual(compareMigrations([...restored, m('c', '2026-11-11T09:00:00.000Z')], restored, dumpStartedAt), ['migration c is applied live (before the backup) but missing from the backup']);
  assert.deepEqual(compareMigrations([m('a', '2026-10-01T00:00:00.000Z')], restored, dumpStartedAt), ['migration b is in the backup but not applied live']);
  assert.deepEqual(compareMigrations([m('a', '2026-10-01T00:00:00.000Z', 'x'), restored[1]], restored, dumpStartedAt), ['migration a has a different checksum in the backup']);
});

test('drill work directories have a fixed, recognisable name so cleanup never touches anything else', () => {
  assert.match(drillWorkName(Date.parse('2026-11-12T03:30:00.000Z')), /^drill-20261112T033000Z-[a-f0-9]{8}$/);
});

test('the summary states the result, the pair and each problem', () => {
  const text = summarise({ ok: false, at: '2026-11-12T03:30:00.000Z', pairId: 'p1', pairCompletedAt: '2026-11-12T02:47:01.000Z', problems: ['row count Product: live 385, restored 12 (allowed difference 39)'], facts: { tables: 30, mediaFiles: 15, latestOrder: 'MF-10012 present' } });
  assert.match(text.subject, /Restore drill FAILED/);
  assert.match(text.text, /Backup: p1/);
  assert.match(text.text, /- row count Product/);
  const passed = summarise({ ok: true, at: '2026-11-12T03:30:00.000Z', pairId: 'p1', pairCompletedAt: '2026-11-12T02:47:01.000Z', problems: [], facts: { tables: 30, mediaFiles: 15, latestOrder: 'none captured before the backup' } });
  assert.match(passed.subject, /Restore drill passed/);
});
