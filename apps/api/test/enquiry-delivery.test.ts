import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { processEnquiryDeliveries } from "../src/enquiry-delivery-worker.js";
import { saveEnquiry } from "../src/enquiries.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const ids: string[] = [];
const config = { apiKey: "synthetic-unused", from: "sender@example.invalid", to: "recipient@example.invalid", adminOrigin: "https://shop.example.invalid", fingerprint: "a".repeat(64) };
const input = { kind: "contact", email: "synthetic@example.invalid", name: "Synthetic visitor", message: "Never include private text in alerts" };
async function create() { const result = await saveEnquiry(db, input, randomUUID(), config); ids.push(result.receipt.reference); return result.receipt.reference; }
afterEach(async () => {
  await db.enquiryDeliveryRetryAudit.deleteMany({ where: { delivery: { enquiryId: { in: ids } } } });
  await db.enquiryDelivery.deleteMany({ where: { enquiryId: { in: ids } } });
  await db.enquiry.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});
after(async () => db.$disconnect());
test("disabled enquiries persist without delivery intents and activation never backfills", async () => {
  const key = randomUUID(), original = await saveEnquiry(db, input, key); ids.push(original.receipt.reference);
  assert.equal(original.receipt.notificationSent, false);
  assert.equal(await db.enquiryDelivery.count({ where: { enquiryId: original.receipt.reference } }), 0);
  const replay = await saveEnquiry(db, input, key, config);
  assert.equal(replay.created, false); assert.equal(replay.receipt.reference, original.receipt.reference);
  assert.equal(await db.enquiryDelivery.count({ where: { enquiryId: original.receipt.reference } }), 0);
});
test("enabled concurrent submissions enqueue exactly one private durable intent", async () => {
  const key = randomUUID();
  const results = await Promise.all([saveEnquiry(db, input, key, config), saveEnquiry(db, input, key, config)]);
  const id = results[0]!.receipt.reference; ids.push(id);
  assert.deepEqual(results.map(result => result.created).sort(), [false, true]);
  assert.equal(results[1]!.receipt.reference, id); assert.equal(results[0]!.receipt.notificationSent, false);
  const jobs = await db.enquiryDelivery.findMany({ where: { enquiryId: id } });
  assert.equal(jobs.length, 1); assert.equal(jobs[0]!.configurationHash, config.fingerprint);
  assert.equal(jobs[0]!.status, "queued"); assert.equal(jobs[0]!.attempts, 0);
  assert.equal(JSON.stringify(jobs).includes(input.email), false); assert.equal(JSON.stringify(jobs).includes(input.message), false);
});
test("enqueue failure rolls back enquiry and its idempotency receipt", async () => {
  const before = await db.enquiry.count();
  await assert.rejects(saveEnquiry(db, input, randomUUID(), { ...config, fingerprint: null as unknown as string }));
  assert.equal(await db.enquiry.count(), before);
});
test("delivery evidence prevents accidental enquiry deletion", async () => {
  const id = await create();
  await assert.rejects(db.enquiry.delete({ where: { id } }));
  assert.equal(await db.enquiry.count({ where: { id } }), 1);
});

const job = (id: string) => db.enquiryDelivery.findUniqueOrThrow({ where: { enquiryId: id } });
const accepted = async () => ({ status: "accepted" as const, providerId: "synthetic-provider-id" });
test("concurrent worker claims send one metadata-only alert and never resend accepted jobs", async () => {
  const id = await create(), alerts: unknown[] = [];
  const send = async (_: unknown, alert: unknown) => { alerts.push(alert); return accepted(); };
  await Promise.all([processEnquiryDeliveries(db, config, send), processEnquiryDeliveries(db, config, send)]);
  const current = await job(id);
  assert.equal(current.status, "accepted"); assert.equal(current.attempts, 1); assert.equal(current.version, 2);
  assert.ok(current.acceptedAt); assert.equal(current.leaseToken, null);
  assert.equal(alerts.length, 1);
  const row = await db.enquiry.findUniqueOrThrow({ where: { id } });
  assert.deepEqual(alerts[0], { jobId: current.id, enquiryId: id, kind: "contact", createdAt: row.createdAt });
  assert.equal(await processEnquiryDeliveries(db, config, send), 0); assert.equal(alerts.length, 1);
});
test("unknown transport outcomes retry with stable identity, backoff and five-attempt cap", async () => {
  const id = await create(); let clock = new Date(Date.now() + 1000), calls = 0; const keys: string[] = [];
  const send = async (_: unknown, alert: { jobId: string }) => { calls++; keys.push(alert.jobId); return { status: "uncertain" as const, code: "network_error" as const }; };
  for (let i = 1; i <= 5; i++) {
    await processEnquiryDeliveries(db, config, send, () => clock);
    const current = await job(id); assert.equal(current.attempts, i);
    if (i < 5) {
      assert.equal(current.status, "retry_wait"); assert.ok(current.nextAttemptAt && current.nextAttemptAt > clock);
      await processEnquiryDeliveries(db, config, send, () => clock); assert.equal(calls, i);
      clock = new Date(current.nextAttemptAt!.getTime() + 1);
    }
  }
  const current = await job(id); assert.equal(current.status, "uncertain"); assert.equal(current.errorCode, "attempts_exhausted");
  clock = new Date(clock.getTime() + 3600000);
  await processEnquiryDeliveries(db, config, send, () => clock); assert.equal(calls, 5); assert.equal(new Set(keys).size, 1);
});
test("expired leases recover but stale transport completion cannot overwrite a newer claim", async () => {
  const id = await create(); let clock = new Date(Date.now() + 1000); let started!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  const first = processEnquiryDeliveries(db, config, async () => { started(); await gate; return { status: "failed", code: "provider_rejected" }; }, () => clock, 1);
  // A stub worker must fail an assertion rather than hang awaiting a transport it never invokes.
  await Promise.race([ready, first]); assert.equal((await job(id)).status, "sending");
  clock = new Date(clock.getTime() + 61000);
  await processEnquiryDeliveries(db, config, accepted, () => clock, 1);
  release(); await first;
  const current = await job(id); assert.equal(current.status, "accepted"); assert.equal(current.attempts, 2); assert.equal(current.providerId, "synthetic-provider-id");
});
test("configuration changes, deduplication expiry and payload conflicts require reconciliation", async () => {
  let calls = 0; const send = async () => { calls++; return accepted(); };
  const changed = await create();
  await processEnquiryDeliveries(db, { ...config, fingerprint: "b".repeat(64) }, send);
  assert.equal((await job(changed)).errorCode, "configuration_changed"); assert.equal(calls, 0);
  const expired = await create();
  await db.enquiryDelivery.update({ where: { enquiryId: expired }, data: { status: "sending", attempts: 1, firstAttemptAt: new Date(Date.now() - 23 * 3600000), leaseToken: "old", leaseExpiresAt: new Date(0) } });
  await processEnquiryDeliveries(db, config, send);
  assert.equal((await job(expired)).status, "uncertain"); assert.equal((await job(expired)).errorCode, "retry_window_expired"); assert.equal(calls, 0);
  const conflicted = await create();
  await processEnquiryDeliveries(db, config, async () => ({ status: "uncertain", code: "idempotency_conflict" }));
  assert.equal((await job(conflicted)).status, "uncertain"); assert.equal((await job(conflicted)).errorCode, "idempotency_conflict");
  await processEnquiryDeliveries(db, config, send); assert.equal(calls, 0);
});
test("terminal provider errors stop retries and batch processing is bounded", async () => {
  const first = await create(), second = await create();
  assert.equal(await processEnquiryDeliveries(db, config, async () => ({ status: "failed", code: "provider_rejected" }), undefined, 1), 1);
  assert.equal((await job(first)).status, "failed"); assert.equal((await job(second)).status, "queued");
  assert.equal(await processEnquiryDeliveries(db, config, accepted, undefined, 1), 1);
  assert.equal((await job(second)).status, "accepted");
});
