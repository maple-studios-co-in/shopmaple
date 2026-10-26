import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnquiryDeliveryConfig, sendEnquiryAlert, type EnquiryAlert } from "../src/enquiry-delivery-provider.js";

const env = {
  ENQUIRY_DELIVERY_ENABLED: "true",
  ENQUIRY_RESEND_API_KEY: "synthetic-transport-key",
  ENQUIRY_MAIL_FROM: "alerts@example.com",
  ENQUIRY_MAIL_TO: "staff@example.com",
  WEB_ORIGIN: "https://shop.example.com",
  NODE_ENV: "production",
};

// Catches accidental activation, ignored invalid configuration, and routing changes without rebinding jobs.
test("configuration requires exact activation and complete safe server-owned routing", () => {
  assert.equal(loadEnquiryDeliveryConfig({}), null);
  assert.equal(loadEnquiryDeliveryConfig({ ...env, ENQUIRY_DELIVERY_ENABLED: undefined }), null);
  assert.equal(loadEnquiryDeliveryConfig({ ...env, ENQUIRY_DELIVERY_ENABLED: "false", WEB_ORIGIN: "bad" }), null);
  const config = loadEnquiryDeliveryConfig(env);
  assert.ok(config, "explicit valid configuration enables the adapter");
  assert.equal(config.adminOrigin, "https://shop.example.com");
  assert.equal(config.from, "alerts@example.com");
  assert.equal(config.to, "staff@example.com");
  assert.match(config.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(loadEnquiryDeliveryConfig({ ...env, WEB_ORIGIN: "https://shop.example.com/" })?.fingerprint, config.fingerprint);
  for (const [key, value] of Object.entries({ ENQUIRY_RESEND_API_KEY: "another-synthetic-key", ENQUIRY_MAIL_FROM: "other@example.com", ENQUIRY_MAIL_TO: "other@example.com", WEB_ORIGIN: "https://another.example.com" })) {
    assert.notEqual(loadEnquiryDeliveryConfig({ ...env, [key]: value })?.fingerprint, config.fingerprint, `${key} rebinds the configuration`);
  }
  for (const patch of [
    { ENQUIRY_DELIVERY_ENABLED: "TRUE" }, { ENQUIRY_DELIVERY_ENABLED: "1" }, { ENQUIRY_DELIVERY_ENABLED: "" },
    { ENQUIRY_RESEND_API_KEY: "" }, { ENQUIRY_RESEND_API_KEY: "synthetic\r\nInjected: yes" },
    { ENQUIRY_MAIL_FROM: "Name <alerts@example.com>" }, { ENQUIRY_MAIL_TO: "staff@example.com,other@example.com" },
    { ENQUIRY_MAIL_TO: "staff@example.com\nBcc: other@example.com" },
    { WEB_ORIGIN: "http://shop.example.com" }, { WEB_ORIGIN: "https://user:pass@shop.example.com" },
    { WEB_ORIGIN: "https://shop.example.com/path" }, { WEB_ORIGIN: "https://shop.example.com?query=1" },
    { WEB_ORIGIN: "https://shop.example.com#anchor" }, { WEB_ORIGIN: "https://127.0.0.1" },
    { WEB_ORIGIN: "https://10.0.0.1" }, { WEB_ORIGIN: "https://[::1]" }, { WEB_ORIGIN: "https://localhost" },
    { WEB_ORIGIN: "https://internal.local" }, { WEB_ORIGIN: "not a URL" },
  ]) {
    assert.throws(() => loadEnquiryDeliveryConfig({ ...env, ...patch }), { message: "Invalid enquiry delivery configuration." });
  }
  for (const key of ["ENQUIRY_RESEND_API_KEY", "ENQUIRY_MAIL_FROM", "ENQUIRY_MAIL_TO", "WEB_ORIGIN"]) {
    assert.throws(() => loadEnquiryDeliveryConfig({ ...env, [key]: undefined }), { message: "Invalid enquiry delivery configuration." });
  }
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.equal(loadEnquiryDeliveryConfig({ ...env, NODE_ENV: "test", WEB_ORIGIN: origin })?.adminOrigin, origin);
    assert.throws(() => loadEnquiryDeliveryConfig({ ...env, WEB_ORIGIN: origin }));
  }
});

const alert: EnquiryAlert = {
  jobId: "notification_01234567-89ab-cdef-0123-456789abcdef",
  enquiryId: "enq_01234567-89ab-cdef-0123-456789abcdef",
  kind: "project",
  createdAt: new Date("2026-10-26T01:02:03.000Z"),
};
const providerId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Catches including customer fields, changing retry payload/key, forwarding redirects, or dropping provider acknowledgement.
test("transport sends a deterministic minimal alert with a stable idempotency key", async () => {
  const config = loadEnquiryDeliveryConfig(env)!;
  const requests: { url: string; options: RequestInit }[] = [];
  const transport: typeof fetch = async (url, options) => {
    requests.push({ url: String(url), options: options! });
    return jsonResponse(200, { id: providerId });
  };
  const withCustomerFields = { ...alert, name: "DO_NOT_SEND_NAME", email: "do-not-send@example.invalid", message: "DO_NOT_SEND_MESSAGE" };
  assert.deepEqual(await sendEnquiryAlert(config, withCustomerFields, transport), { status: "accepted", providerId });
  assert.deepEqual(await sendEnquiryAlert(config, alert, transport), { status: "accepted", providerId });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.redirect, "error");
    const headers = new Headers(request.options.headers);
    assert.equal(headers.get("Authorization"), "Bearer synthetic-transport-key");
    assert.equal(headers.get("Idempotency-Key"), "enquiry/notification_01234567-89ab-cdef-0123-456789abcdef");
    assert.deepEqual(JSON.parse(String(request.options.body)), {
      from: "alerts@example.com",
      to: ["staff@example.com"],
      subject: "New ShopMaple enquiry",
      text: "Reference: enq_01234567-89ab-cdef-0123-456789abcdef\nKind: project\nCreated: 2026-10-26T01:02:03.000Z\n\nOpen the staff inbox: https://shop.example.com/admin",
    });
  }
  assert.equal(requests[0]!.options.body, requests[1]!.options.body);
});

// Catches sending a payload that differs from the normalized values bound into a job's fingerprint.
test("equivalent runtime configuration keeps the fingerprint-bound payload identical", async () => {
  const config = loadEnquiryDeliveryConfig(env)!;
  const bodies: string[] = [];
  const transport: typeof fetch = async (_url, options) => {
    bodies.push(String(options?.body));
    return jsonResponse(200, { id: providerId });
  };
  await sendEnquiryAlert(config, alert, transport);
  await sendEnquiryAlert({ ...config, from: " alerts@example.com ", adminOrigin: "https://shop.example.com/" }, alert, transport);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1], bodies[0]);
});

// Catches treating rejection/ambiguous acknowledgement as accepted, and leaking provider response text.
test("transport classifies provider results without returning error bodies", async () => {
  const config = loadEnquiryDeliveryConfig(env)!;
  const cases = [
    { http: 429, name: "rate_limit_exceeded", want: { status: "retryable", code: "rate_limited" } },
    { http: 409, name: "concurrent_idempotent_requests", want: { status: "retryable", code: "provider_busy" } },
    { http: 409, name: "invalid_idempotent_request", want: { status: "uncertain", code: "idempotency_conflict" } },
    { http: 409, name: "unknown_conflict", want: { status: "uncertain", code: "invalid_response" } },
    { http: 401, name: "missing_api_key", want: { status: "failed", code: "configuration_error" } },
    { http: 403, name: "validation_error", want: { status: "failed", code: "configuration_error" } },
    { http: 400, name: "validation_error", want: { status: "failed", code: "provider_rejected" } },
    { http: 422, name: "invalid_parameter", want: { status: "failed", code: "provider_rejected" } },
    { http: 500, name: "application_error", want: { status: "retryable", code: "provider_unavailable" } },
    { http: 503, name: "service_unavailable", want: { status: "retryable", code: "provider_unavailable" } },
    { http: 302, name: "redirect", want: { status: "uncertain", code: "invalid_response" } },
    { http: 201, name: "unexpected_success", want: { status: "uncertain", code: "invalid_response" } },
  ];
  for (const entry of cases) {
    assert.deepEqual(await sendEnquiryAlert(config, alert, async () => jsonResponse(entry.http, { name: entry.name, message: "SENSITIVE_PROVIDER_TEXT" })), entry.want, `${entry.http}:${entry.name}`);
  }
  for (const body of [{}, { id: "" }, { id: "customer@example.invalid" }, { id: "x".repeat(500) }, null, { id: providerId, name: "application_error" }]) {
    assert.deepEqual(await sendEnquiryAlert(config, alert, async () => jsonResponse(200, body)), { status: "uncertain", code: "invalid_response" });
  }
  assert.deepEqual(await sendEnquiryAlert(config, alert, async () => { throw new Error("SENSITIVE_NETWORK_TEXT"); }), { status: "uncertain", code: "network_error" });
  assert.deepEqual(await sendEnquiryAlert(config, alert, async () => new Response("not json", { status: 200 })), { status: "uncertain", code: "invalid_response" });
});

// Catches header/text injection and accidental sends after runtime corruption, before any transport side effect.
test("invalid alert or configuration cannot reach the transport", async () => {
  const config = loadEnquiryDeliveryConfig(env)!;
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; return jsonResponse(200, { id: providerId }); };
  for (const bad of [
    { ...alert, jobId: "job\r\nInjected: true" }, { ...alert, jobId: "x".repeat(129) },
    { ...alert, enquiryId: "enq_bad\ncustomer@example.invalid" },
    { ...alert, kind: "project\ncustomer@example.invalid" }, { ...alert, createdAt: new Date(NaN) },
  ]) {
    assert.deepEqual(await sendEnquiryAlert(config, bad as EnquiryAlert, transport), { status: "failed", code: "provider_rejected" });
  }
  assert.deepEqual(await sendEnquiryAlert({ ...config, to: "elsewhere@example.com" }, alert, transport), { status: "failed", code: "configuration_error" });
  assert.equal(calls, 0, "invalid data is rejected before outbound transport");
});

// Catches unbounded response allocation and trusting a large provider response containing hidden content.
test("oversized and broken response streams are uncertain and cancelled", async () => {
  const config = loadEnquiryDeliveryConfig(env)!;
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(16_385))); },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await sendEnquiryAlert(config, alert, async () => new Response(oversized)), { status: "uncertain", code: "invalid_response" });
  assert.equal(cancelled, true);
  const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("SENSITIVE_BODY_ERROR")); } });
  assert.deepEqual(await sendEnquiryAlert(config, alert, async () => new Response(broken)), { status: "uncertain", code: "network_error" });
});

// Catches clearing the request deadline at headers, or relying solely on fetch honoring AbortSignal.
test("one bounded deadline covers both headers and the entire response body", async () => {
  const config = loadEnquiryDeliveryConfig(env)!;
  const signals: AbortSignal[] = [];
  let cancelled = false;
  const stalledBody = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const headersNeverArrive: typeof fetch = async (_url, options) => {
    signals.push(options!.signal!);
    return new Promise<Response>(() => {});
  };
  const bodyNeverArrives: typeof fetch = async (_url, options) => {
    signals.push(options!.signal!);
    return new Response(stalledBody);
  };
  const started = Date.now();
  const outcomes = await Promise.all([
    sendEnquiryAlert(config, alert, headersNeverArrive), sendEnquiryAlert(config, alert, bodyNeverArrives),
  ]);
  assert.deepEqual(outcomes, [{ status: "uncertain", code: "network_error" }, { status: "uncertain", code: "network_error" }]);
  assert.ok(Date.now() - started < 12_000, "total deadline is bounded");
  assert.ok(signals.every(signal => signal.aborted), "timeout aborts pending transports");
  assert.equal(cancelled, true, "timeout cancels pending body reads");
});
