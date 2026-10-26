import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startEnquiryDeliveryRunner } from '../src/enquiry-delivery-runner.js';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('one active delivery cycle at a time; shutdown drains the cycle and prevents later ticks', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const runner = startEnquiryDeliveryRunner(async () => { calls++; await pending; }, () => assert.fail('unexpected failure'));
  t.mock.timers.tick(30_000); await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(120_000); await flush();
  assert.equal(calls, 1, 'pending transport must not overlap another cycle');
  let stopped = false;
  const draining = runner.stop().then(() => { stopped = true; });
  await flush(); assert.equal(stopped, false, 'disconnect must wait for in-flight persistence');
  finish(); await draining;
  assert.equal(stopped, true);
  t.mock.timers.tick(120_000); await flush();
  assert.equal(calls, 1);
  await runner.stop();
});

test('a failed cycle reports only a signal and the next scheduled cycle can recover', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  const reports: unknown[][] = [];
  const runner = startEnquiryDeliveryRunner(async () => {
    calls++;
    if (calls === 1) throw new Error('private failure details');
  }, (...args: unknown[]) => { reports.push(args); });
  t.mock.timers.tick(30_000); await flush();
  assert.deepEqual(reports, [[]], 'private exceptions must not be forwarded to logger');
  t.mock.timers.tick(30_000); await flush();
  assert.equal(calls, 2);
  await runner.stop();
});
