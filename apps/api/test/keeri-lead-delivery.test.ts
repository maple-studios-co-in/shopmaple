import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { keeriFirstAttemptHoldMs, processEnquiryDeliveries, processKeeriLeadDeliveries } from "../src/enquiry-delivery-worker.js";
import { saveEnquiry } from "../src/enquiries.js";
import type { EnquiryAlert } from "../src/enquiry-delivery-provider.js";
import type { KeeriLead, KeeriLeadOutcome, KeeriLeadsConfig } from "../src/keeri-leads.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const ids: string[] = [];
const email = { apiKey: "synthetic-unused", from: "sender@example.invalid", to: "recipient@example.invalid", adminOrigin: "https://shop.example.invalid", fingerprint: "a".repeat(64) };
const keeri: KeeriLeadsConfig = { origin: "https://keeri.example.invalid", token: "k".repeat(40), adminOrigin: "https://admin.keeri.example.invalid", fingerprint: "c".repeat(64) };
const input = { kind: "project", name: "Synthetic visitor", email: "Visitor@Example.invalid", phone: "98765 43210", message: "Private brief", context: { product: "Oak table", sku: "OAK-8" } };
async function create(body: object = input, keeriConfig: KeeriLeadsConfig | null = keeri, emailConfig: typeof email | null = email) {
  const result = await saveEnquiry(db, body, randomUUID(), emailConfig, keeriConfig); ids.push(result.receipt.reference); return result.receipt.reference;
}
const row = (enquiryId: string, target: "email" | "keeri") => db.enquiryDelivery.findUnique({ where: { enquiryId_target: { enquiryId, target } } });
afterEach(async () => {
  await db.enquiryDeliveryRetryAudit.deleteMany({ where: { delivery: { enquiryId: { in: ids } } } });
  await db.enquiryDelivery.deleteMany({ where: { enquiryId: { in: ids } } });
  await db.enquiry.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});
after(async () => db.$disconnect());
const createdLead = (leadId = "lead_1"): KeeriLeadOutcome => ({ status: "accepted", leadId, outcome: "created", leadPath: `/leads/${leadId}` });
const acceptedEmail = async () => ({ status: "accepted" as const, providerId: "synthetic-provider-id" });

test("contact, project and bulk enquiries queue one Keeri lead beside the email; newsletter and review never do", async () => {
  const kinds = ["contact", "project", "bulk", "newsletter", "review"] as const;
  const made: Record<string, string> = {};
  for (const kind of kinds) made[kind] = await create({ ...input, kind, email: `${kind}-${randomUUID()}@example.invalid` });
  for (const kind of ["contact", "project", "bulk"]) {
    const lead = await row(made[kind]!, "keeri");
    assert.ok(lead, `${kind} queues a lead`);
    assert.equal(lead.status, "queued"); assert.equal(lead.configurationHash, keeri.fingerprint); assert.equal(lead.attempts, 0);
    assert.equal((await row(made[kind]!, "email"))?.configurationHash, email.fingerprint, "the staff email is still queued");
  }
  for (const kind of ["newsletter", "review"]) assert.equal(await row(made[kind]!, "keeri"), null, `${kind} never goes to Keeri`);
  const saved = await db.enquiryDelivery.findMany({ where: { enquiryId: { in: Object.values(made) } } });
  assert.equal(JSON.stringify(saved).includes("Private brief"), false, "the outbox holds no customer text");
});

test("with the flag off there are no Keeri jobs and the email outbox is exactly as before", async () => {
  const id = await create(input, null);
  assert.equal(await row(id, "keeri"), null);
  assert.equal(await db.enquiryDelivery.count({ where: { enquiryId: id } }), 1);
  const alerts: EnquiryAlert[] = [];
  await processEnquiryDeliveries(db, email, async (_c, alert) => { alerts.push(alert); return acceptedEmail(); });
  const enquiry = await db.enquiry.findUniqueOrThrow({ where: { id } });
  assert.deepEqual(alerts, [{ jobId: (await row(id, "email"))!.id, enquiryId: id, kind: "project", createdAt: enquiry.createdAt }]);
  let calls = 0;
  await processKeeriLeadDeliveries(db, keeri, async () => { calls++; return createdLead(); });
  assert.equal(calls, 0);
});

test("the worker sends the stored enquiry once and keeps Keeri's lead id, outcome and time", async () => {
  const id = await create();
  const leads: KeeriLead[] = [];
  const send = async (_c: KeeriLeadsConfig, lead: KeeriLead) => { leads.push(lead); return createdLead("lead_77"); };
  await Promise.all([processKeeriLeadDeliveries(db, keeri, send), processKeeriLeadDeliveries(db, keeri, send)]);
  const enquiry = await db.enquiry.findUniqueOrThrow({ where: { id } });
  assert.deepEqual(leads, [{ enquiryId: id, kind: "project", name: "Synthetic visitor", email: "visitor@example.invalid", phone: "98765 43210", message: "Private brief",
    context: { product: "Oak table", variant: "", sku: "OAK-8", pincode: "" }, submittedAt: enquiry.createdAt }]);
  const lead = (await row(id, "keeri"))!;
  assert.equal(lead.status, "accepted"); assert.equal(lead.attempts, 1); assert.ok(lead.acceptedAt);
  assert.equal(lead.keeriLeadId, "lead_77"); assert.equal(lead.keeriOutcome, "created"); assert.equal(lead.keeriLeadPath, "/leads/lead_77"); assert.equal(lead.errorCode, null);
  assert.equal((await row(id, "email"))!.status, "queued", "the Keeri worker never touches the email row");
  const matched = await create();
  await processKeeriLeadDeliveries(db, keeri, async () => ({ status: "accepted", leadId: "lead_5", outcome: "matched", leadPath: "/leads/lead_5" }));
  assert.equal((await row(matched, "keeri"))!.keeriOutcome, "matched");
  assert.equal(await db.enquiry.count({ where: { id: { in: [id, matched] } } }), 2, "the local enquiry is always kept");
});

test("an outage or timeout waits and retries the same enquiry; a refusal is final", async () => {
  const id = await create();
  let clock = new Date(Date.now() + 1000);
  const outcomes: KeeriLeadOutcome[] = [{ status: "retryable", code: "provider_unavailable" }, { status: "uncertain", code: "network_error" }, createdLead("lead_2")];
  const sent: string[] = [];
  const send = async (_c: KeeriLeadsConfig, lead: KeeriLead) => { sent.push(lead.enquiryId); return outcomes.shift()!; };
  await processKeeriLeadDeliveries(db, keeri, send, () => clock);
  let lead = (await row(id, "keeri"))!;
  assert.equal(lead.status, "retry_wait"); assert.equal(lead.errorCode, "provider_unavailable"); assert.ok(lead.nextAttemptAt! > clock);
  clock = new Date(lead.nextAttemptAt!.getTime() + 1);
  await processKeeriLeadDeliveries(db, keeri, send, () => clock);
  lead = (await row(id, "keeri"))!;
  assert.equal(lead.status, "retry_wait"); assert.equal(lead.errorCode, "network_error");
  clock = new Date(lead.nextAttemptAt!.getTime() + 1);
  await processKeeriLeadDeliveries(db, keeri, send, () => clock);
  lead = (await row(id, "keeri"))!;
  assert.equal(lead.status, "accepted"); assert.equal(lead.attempts, 3); assert.equal(lead.keeriLeadId, "lead_2");
  assert.deepEqual(sent, [id, id, id]);
  for (const code of ["provider_rejected", "idempotency_conflict", "configuration_error"] as const) {
    const refused = await create();
    await processKeeriLeadDeliveries(db, keeri, async () => ({ status: "failed", code }), () => clock);
    const failed = (await row(refused, "keeri"))!;
    assert.equal(failed.status, "failed"); assert.equal(failed.errorCode, code); assert.equal(failed.nextAttemptAt, null); assert.equal(failed.keeriLeadId, null);
    let again = 0;
    await processKeeriLeadDeliveries(db, keeri, async () => { again++; return createdLead(); }, () => new Date(clock.getTime() + 7_200_000));
    assert.equal(again, 0, `${code} is not retried`);
  }
});

test("the staff email waits for Keeri's first attempt and links the lead once it exists", async () => {
  const id = await create();
  const alerts: EnquiryAlert[] = [];
  const sendEmail = async (_c: unknown, alert: EnquiryAlert) => { alerts.push(alert); return acceptedEmail(); };
  assert.equal(await processEnquiryDeliveries(db, email, sendEmail, undefined, undefined, keeri.adminOrigin), 0, "held while Keeri has not been tried");
  assert.equal((await row(id, "email"))!.status, "queued");
  await processKeeriLeadDeliveries(db, keeri, async () => createdLead("lead_42"));
  assert.equal(await processEnquiryDeliveries(db, email, sendEmail, undefined, undefined, keeri.adminOrigin), 1);
  assert.equal(alerts[0]!.keeriLeadUrl, "https://admin.keeri.example.invalid/leads/lead_42");
  assert.equal(JSON.stringify(alerts).includes("visitor@example.invalid"), false);
});

test("a failed or slow Keeri attempt does not stop the email, which keeps the store admin link", async () => {
  const failing = await create();
  await processKeeriLeadDeliveries(db, keeri, async () => ({ status: "uncertain", code: "network_error" }));
  const alerts: EnquiryAlert[] = [];
  const sendEmail = async (_c: unknown, alert: EnquiryAlert) => { alerts.push(alert); return acceptedEmail(); };
  await processEnquiryDeliveries(db, email, sendEmail, undefined, undefined, keeri.adminOrigin);
  assert.equal(alerts.length, 1); assert.equal(alerts[0]!.enquiryId, failing); assert.equal("keeriLeadUrl" in alerts[0]!, false);
  // Keeri never tried (its worker is down): the email goes once the short hold has passed.
  const untried = await create();
  await processEnquiryDeliveries(db, email, sendEmail, undefined, undefined, keeri.adminOrigin);
  assert.equal(alerts.length, 1);
  const later = new Date(Date.now() + keeriFirstAttemptHoldMs + 1000);
  await processEnquiryDeliveries(db, email, sendEmail, () => later, undefined, keeri.adminOrigin);
  assert.equal(alerts.length, 2); assert.equal(alerts[1]!.enquiryId, untried); assert.equal("keeriLeadUrl" in alerts[1]!, false);
  assert.ok(keeriFirstAttemptHoldMs <= 5 * 60_000, "the hold is short");
});

test("an email retried after Keeri succeeds keeps the link it was first built with", async () => {
  const id = await create();
  let clock = new Date(Date.now() + 1000);
  await processKeeriLeadDeliveries(db, keeri, async () => ({ status: "uncertain", code: "network_error" }), () => clock);
  const alerts: EnquiryAlert[] = [];
  let first = true;
  const sendEmail = async (_c: unknown, alert: EnquiryAlert) => {
    alerts.push(alert);
    if (first) { first = false; return { status: "uncertain" as const, code: "network_error" as const }; }
    return acceptedEmail();
  };
  await processEnquiryDeliveries(db, email, sendEmail, () => clock, undefined, keeri.adminOrigin);
  clock = new Date(clock.getTime() + 3_600_000);
  await processKeeriLeadDeliveries(db, keeri, async () => createdLead("lead_late"), () => clock);
  assert.equal((await row(id, "keeri"))!.status, "accepted");
  await processEnquiryDeliveries(db, email, sendEmail, () => clock, undefined, keeri.adminOrigin);
  assert.equal(alerts.length, 2);
  // The provider's idempotency key is per job, so a retry must send the same text.
  assert.deepEqual(alerts[1], alerts[0]);
});
