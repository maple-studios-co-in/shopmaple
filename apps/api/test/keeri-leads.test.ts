import assert from "node:assert/strict";
import { test } from "node:test";
import { loadKeeriLeadsConfig, sendKeeriLead, type KeeriLead } from "../src/keeri-leads.js";

const token = "k".repeat(40);
const env = { KEERI_LEADS_ENABLED: "true", KEERI_ORIGIN: "https://keeri.example.test", KEERI_COMMERCE_TOKEN: token };
const lead: KeeriLead = {
  enquiryId: "enq_01234567-89ab-cdef-0123-456789abcdef",
  kind: "project",
  name: "Synthetic Visitor",
  email: "visitor@example.invalid",
  phone: "+91 98765 43210",
  message: "A dining table for eight",
  context: { product: "Oak table", variant: "", sku: "OAK-8", pincode: "" },
  submittedAt: new Date("2026-11-10T04:05:06.000Z"),
};
const created = { version: 1, leadId: "lead_123", outcome: "created", leadPath: "/leads/lead_123" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("the switch is off unless exactly true, and an enabled store with a missing or unsafe key refuses to start", () => {
  assert.equal(loadKeeriLeadsConfig({}), null);
  assert.equal(loadKeeriLeadsConfig({ KEERI_ORIGIN: env.KEERI_ORIGIN, KEERI_COMMERCE_TOKEN: token }), null, "credentials alone never enable leads");
  assert.equal(loadKeeriLeadsConfig({ ...env, KEERI_LEADS_ENABLED: "false" }), null);
  const config = loadKeeriLeadsConfig(env);
  assert.ok(config);
  assert.equal(config.origin, "https://keeri.example.test");
  assert.equal(config.adminOrigin, "https://keeri.example.test", "the admin origin defaults to KEERI_ORIGIN");
  assert.equal(loadKeeriLeadsConfig({ ...env, KEERI_ADMIN_ORIGIN: "https://maple.keeri.example.test/" })?.adminOrigin, "https://maple.keeri.example.test");
  assert.match(config.fingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(loadKeeriLeadsConfig({ ...env, KEERI_ORIGIN: "https://other.example.test" })?.fingerprint, config.fingerprint, "a different Keeri rebinds queued leads");
  for (const value of ["TRUE", "1", "yes", ""]) {
    assert.throws(() => loadKeeriLeadsConfig({ ...env, KEERI_LEADS_ENABLED: value }), { message: "KEERI_LEADS_ENABLED must be true or false" });
  }
  const cases: Array<[Record<string, string | undefined>, string]> = [
    [{ KEERI_ORIGIN: undefined }, "KEERI_ORIGIN"],
    [{ KEERI_ORIGIN: "http://keeri.example.test" }, "KEERI_ORIGIN"],
    [{ KEERI_ORIGIN: "https://keeri.example.test/path" }, "KEERI_ORIGIN"],
    [{ KEERI_ORIGIN: "https://user:pass@keeri.example.test" }, "KEERI_ORIGIN"],
    [{ KEERI_COMMERCE_TOKEN: undefined }, "KEERI_COMMERCE_TOKEN"],
    [{ KEERI_COMMERCE_TOKEN: "short" }, "KEERI_COMMERCE_TOKEN"],
    [{ KEERI_ADMIN_ORIGIN: "http://keeri.example.test" }, "KEERI_ADMIN_ORIGIN"],
    [{ KEERI_ADMIN_ORIGIN: "https://keeri.example.test/admin" }, "KEERI_ADMIN_ORIGIN"],
    [{ KEERI_ORIGIN: undefined, KEERI_COMMERCE_TOKEN: undefined }, "KEERI_COMMERCE_TOKEN, KEERI_ORIGIN"],
  ];
  for (const [patch, keys] of cases) {
    assert.throws(() => loadKeeriLeadsConfig({ ...env, ...patch }), { message: `KEERI_LEADS_ENABLED=true requires valid values for: ${keys}` });
  }
  assert.throws(() => loadKeeriLeadsConfig({ ...env, KEERI_COMMERCE_TOKEN: "short" }), (error: Error) => !error.message.includes("short"), "values are never echoed");
});

test("a lead posts the exact versioned body, the bearer credential and the enquiry id as its idempotency key", async () => {
  const config = loadKeeriLeadsConfig(env)!;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const transport: typeof fetch = async (url, init) => { requests.push({ url: String(url), init: init! }); return json(200, created); };
  assert.deepEqual(await sendKeeriLead(config, lead, transport), { status: "accepted", leadId: "lead_123", outcome: "created", leadPath: "/leads/lead_123" });
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request!.url, "https://keeri.example.test/api/storefront/leads");
  assert.equal(request!.init.method, "POST");
  assert.equal(request!.init.redirect, "error");
  const headers = new Headers(request!.init.headers);
  assert.equal(headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Idempotency-Key"), lead.enquiryId);
  // Exact text: empty context fields are left out rather than sent as "" or null.
  assert.equal(String(request!.init.body), JSON.stringify({
    version: 1, enquiryId: lead.enquiryId, kind: "project", name: "Synthetic Visitor", email: "visitor@example.invalid",
    phone: "+91 98765 43210", message: "A dining table for eight", context: { product: "Oak table", sku: "OAK-8" }, submittedAt: "2026-11-10T04:05:06.000Z",
  }));
  const bodies: string[] = [];
  const capture: typeof fetch = async (_url, init) => { bodies.push(String(init?.body)); return json(200, created); };
  await sendKeeriLead(config, { ...lead, context: { product: "", variant: "", sku: "", pincode: "" } }, capture);
  await sendKeeriLead(config, { ...lead, context: {} }, capture);
  await sendKeeriLead(config, { ...lead, context: { product: "Chair", variant: "Teak", sku: "CH-1", pincode: "560001" } }, capture);
  assert.deepEqual(JSON.parse(bodies[0]!).context, {});
  assert.deepEqual(JSON.parse(bodies[1]!).context, {});
  assert.deepEqual(JSON.parse(bodies[2]!).context, { product: "Chair", variant: "Teak", sku: "CH-1", pincode: "560001" });
  assert.ok(bodies.every(body => !body.includes("null")));
});

test("a matched lead returns Keeri's existing lead, and a replay of the same key returns the same answer", async () => {
  const config = loadKeeriLeadsConfig(env)!;
  const matched = { version: 1, leadId: "lead_9", outcome: "matched", leadPath: "/leads/lead_9" };
  const keys: string[] = [];
  const transport: typeof fetch = async (_url, init) => { keys.push(new Headers(init?.headers).get("Idempotency-Key")!); return json(200, matched); };
  const first = await sendKeeriLead(config, lead, transport), second = await sendKeeriLead(config, lead, transport);
  assert.deepEqual(first, { status: "accepted", leadId: "lead_9", outcome: "matched", leadPath: "/leads/lead_9" });
  assert.deepEqual(second, first);
  assert.deepEqual(keys, [lead.enquiryId, lead.enquiryId]);
});

test("Keeri outages and timeouts are retried; refusals, conflicts and credential errors are final; no body text comes back", async () => {
  const config = loadKeeriLeadsConfig(env)!;
  const cases: Array<[number, unknown, unknown]> = [
    [500, { error: "SENSITIVE" }, { status: "retryable", code: "provider_unavailable" }],
    [502, "<html>bad gateway</html>", { status: "retryable", code: "provider_unavailable" }],
    [503, {}, { status: "retryable", code: "provider_unavailable" }],
    [504, {}, { status: "retryable", code: "provider_unavailable" }],
    [429, {}, { status: "retryable", code: "rate_limited" }],
    [400, { error: "INVALID_LEAD" }, { status: "failed", code: "provider_rejected" }],
    [409, { error: "IDEMPOTENCY_CONFLICT" }, { status: "failed", code: "idempotency_conflict" }],
    [401, { error: "UNAUTHORIZED" }, { status: "failed", code: "configuration_error" }],
    [403, { error: "FORBIDDEN" }, { status: "failed", code: "configuration_error" }],
    [404, {}, { status: "failed", code: "provider_rejected" }],
    [201, created, { status: "uncertain", code: "invalid_response" }],
  ];
  for (const [status, body, want] of cases) {
    assert.deepEqual(await sendKeeriLead(config, lead, async () => json(status, body)), want, String(status));
  }
  assert.deepEqual(await sendKeeriLead(config, lead, async () => { throw new Error("connect ECONNREFUSED visitor@example.invalid"); }), { status: "uncertain", code: "network_error" });
  const started = Date.now();
  assert.deepEqual(await sendKeeriLead(config, lead, async () => new Promise<Response>(() => {}), 50), { status: "uncertain", code: "network_error" }, "a timeout is retried as a network error");
  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  assert.deepEqual(await sendKeeriLead(config, lead, async () => new Response(stalled, { headers: { "Content-Type": "application/json" } }), 50), { status: "uncertain", code: "network_error" });
  assert.ok(Date.now() - started < 2_000);
  assert.equal(cancelled, true, "a timed-out body read is cancelled");
});

test("only a strict, bounded 200 reply counts as a lead", async () => {
  const config = loadKeeriLeadsConfig(env)!;
  for (const body of [
    {}, { ...created, version: 2 }, { ...created, outcome: "updated" }, { ...created, leadId: "" }, { ...created, leadId: "a/b" },
    { ...created, leadPath: "https://evil.example/leads/1" }, { ...created, leadPath: "/leads/../admin" }, { ...created, extra: "x" }, null,
  ]) {
    assert.deepEqual(await sendKeeriLead(config, lead, async () => json(200, body)), { status: "uncertain", code: "invalid_response" }, JSON.stringify(body));
  }
  assert.deepEqual(await sendKeeriLead(config, lead, async () => new Response(JSON.stringify(created), { status: 200, headers: { "Content-Type": "text/html" } })), { status: "uncertain", code: "invalid_response" });
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(" ".repeat(20_000))); },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await sendKeeriLead(config, lead, async () => new Response(oversized, { headers: { "Content-Type": "application/json" } })), { status: "uncertain", code: "invalid_response" });
  assert.equal(cancelled, true);
});

test("newsletter, review and malformed leads never reach the transport", async () => {
  const config = loadKeeriLeadsConfig(env)!;
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; return json(200, created); };
  for (const bad of [
    { ...lead, kind: "newsletter" }, { ...lead, kind: "review" }, { ...lead, enquiryId: "enq_bad" }, { ...lead, submittedAt: new Date(NaN) },
  ]) {
    assert.deepEqual(await sendKeeriLead(config, bad as KeeriLead, transport), { status: "failed", code: "provider_rejected" });
  }
  assert.deepEqual(await sendKeeriLead({ ...config, origin: "https://elsewhere.example.test" }, lead, transport), { status: "failed", code: "configuration_error" }, "a changed origin without its fingerprint is refused");
  assert.equal(calls, 0);
});
