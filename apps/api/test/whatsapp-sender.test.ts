import assert from "node:assert/strict";
import { test } from "node:test";
import { inspect } from "node:util";
import { orderConfirmationSample, orderConfirmationWhatsApp, type OrderConfirmationTemplatePayload } from "@shopmaple/contracts/whatsapp";
import { loadWhatsAppConfig, sendOrderConfirmationWhatsApp, whatsAppRecipient } from "../src/orders/whatsapp.js";

// The WhatsApp Cloud API sender (owner, 11 Nov 2026), against a stand-in fetch: nothing here reaches Meta.
const env = {
  WHATSAPP_ACCESS_TOKEN: "EAAG-synthetic-access-token-0123456789",
  WHATSAPP_PHONE_NUMBER_ID: "109876543210987",
  WHATSAPP_API_VERSION: "v23.0",
};
const store = "https://store.maplefurnishers.com";
const { template } = orderConfirmationWhatsApp({ ...orderConfirmationSample, origin: store, mediaUrl: `${store}/whatsapp/order-media/nola` });
const messageId = "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQUJDREVGMDEyMzQ1Njc4OQA=";
const accepted = { messaging_product: "whatsapp", contacts: [{ input: "919876543210", wa_id: "919876543210" }], messages: [{ id: messageId }] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const config = () => loadWhatsAppConfig(env)!;

// Catches switching on by accident, half a configuration passing silently, and the token leaking into logs or errors.
test("the configuration is off when unset, whole when set, and loud when partial", () => {
  assert.equal(loadWhatsAppConfig({}), null);
  assert.equal(loadWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: " ", WHATSAPP_PHONE_NUMBER_ID: "", WHATSAPP_API_VERSION: undefined }), null);
  assert.equal(loadWhatsAppConfig({ WHATSAPP_TEMPLATE_LANGUAGE: "en" }), null, "a language alone switches nothing on");
  const loaded = config();
  assert.deepEqual({ ...loaded }, { phoneNumberId: "109876543210987", language: "en", apiVersion: "v23.0" });
  assert.equal(loaded.accessToken, env.WHATSAPP_ACCESS_TOKEN);
  assert.ok(Object.isFrozen(loaded));
  assert.doesNotMatch(JSON.stringify(loaded), /synthetic/, "serialising never shows the token");
  assert.doesNotMatch(inspect(loaded, { depth: 4 }), /synthetic/, "logging never shows the token");
  assert.equal(loadWhatsAppConfig({ ...env, WHATSAPP_TEMPLATE_LANGUAGE: "en_US" })?.language, "en_US");
  for (const name of Object.keys(env)) {
    assert.throws(
      () => loadWhatsAppConfig({ ...env, [name]: undefined }),
      (error: Error) => error.message.includes(name) && !Object.values(env).some((value) => value !== env.WHATSAPP_API_VERSION && error.message.includes(value)),
      `${name} missing`,
    );
  }
  for (const patch of [
    { WHATSAPP_ACCESS_TOKEN: "short" },
    { WHATSAPP_ACCESS_TOKEN: "synthetic token with spaces 0123456789" },
    { WHATSAPP_PHONE_NUMBER_ID: "+91 98765 43210" },
    { WHATSAPP_API_VERSION: "23.0.1" },
    { WHATSAPP_API_VERSION: "latest" },
    { WHATSAPP_TEMPLATE_LANGUAGE: "English" },
  ]) {
    const value = Object.values(patch)[0]!;
    assert.throws(() => loadWhatsAppConfig({ ...env, ...patch }), (error: Error) => !error.message.includes(value), JSON.stringify(Object.keys(patch)));
  }
});

// Catches a wrong endpoint, a missing Authorization header, a number with a plus or without 91, or the wrong language.
test("a confirmation is posted to the phone number's messages endpoint as a template", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const transport: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return json(200, accepted);
  };
  const english = loadWhatsAppConfig({ ...env, WHATSAPP_TEMPLATE_LANGUAGE: "en_US" })!;
  assert.deepEqual(await sendOrderConfirmationWhatsApp(english, "+91 98765 43210", template, transport), { status: "accepted", providerId: messageId });
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request!.url, "https://graph.facebook.com/v23.0/109876543210987/messages");
  assert.equal(request!.init.method, "POST");
  assert.equal(request!.init.redirect, "error");
  const headers = new Headers(request!.init.headers);
  assert.equal(headers.get("Authorization"), `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`);
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(request!.init.body)), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "919876543210",
    type: "template",
    template: {
      name: "order_confirmation",
      language: { code: "en_US" },
      components: [
        { type: "header", parameters: [{ type: "image", image: { link: `${store}/whatsapp/order-media/nola` } }] },
        {
          type: "body",
          parameters: ["Aditi", "MF-10482", "Nola Accent Chair × 1", "₹26,400", "24–28 Nov 2026", "Bengaluru · 560001"].map((text) => ({ type: "text", text })),
        },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: orderConfirmationSample.orderNumber }] },
      ],
    },
  });
});

// Catches sending to a foreign or malformed number, which WhatsApp would bill or bounce.
test("recipients are Indian mobile numbers, sent as digits with 91 and no plus", async () => {
  for (const phone of ["+919876543210", "+91 98765 43210", "919876543210", "09876543210", "98765-43210", "(+91) 98765 43210", "9876543210"])
    assert.equal(whatsAppRecipient(phone), "919876543210", phone);
  for (const phone of ["", "12345", "+1 415 555 0100", "+44 7700 900123", "+91 5876543210", "+91 98765 4321", "9876543210 ext 2"])
    assert.equal(whatsAppRecipient(phone), null, phone);
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    return json(200, accepted);
  };
  assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "+1 415 555 0100", template, transport), { status: "failed", code: "recipient_rejected" });
  assert.equal(calls, 0);
});

// Catches a message Meta would refuse (error 132018 and friends) costing a request, and a tampered configuration sending.
test("a message that breaks WhatsApp's rules never reaches Meta", async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    return json(200, accepted);
  };
  const edit = (change: (payload: OrderConfirmationTemplatePayload) => void) => {
    const copy = structuredClone(template);
    change(copy);
    return copy;
  };
  const broken = [
    edit((p) => { (p as { name: string }).name = "order_confirmation_v2"; }),
    edit((p) => { p.components[1].parameters[0]!.text = "Aditi\nRao"; }),
    edit((p) => { p.components[1].parameters[2]!.text = "Nola\tAccent Chair × 1"; }),
    edit((p) => { p.components[1].parameters[3]!.text = "₹26,400     paid"; }),
    edit((p) => { p.components[1].parameters[4]!.text = ""; }),
    edit((p) => { p.components[1].parameters.pop(); }),
    edit((p) => { p.components[0].parameters[0].image.link = "http://store.maplefurnishers.com/whatsapp/order-media/nola"; }),
    edit((p) => { p.components[2].parameters[0].text = "../../admin"; }),
  ];
  for (const payload of broken)
    assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", payload, transport), { status: "failed", code: "provider_rejected" });
  const tampered = { ...config(), apiVersion: "v23.0/../../me" } as ReturnType<typeof config>;
  assert.deepEqual(await sendOrderConfirmationWhatsApp(tampered, "9876543210", template, transport), { status: "failed", code: "configuration_error" });
  assert.equal(calls, 0, "nothing invalid is sent");
});

// Catches retrying what can never succeed, giving up on what will, and passing Meta's error text (which can hold the
// customer's number) back to the caller.
test("Meta's answers map to accepted, retryable, failed or uncertain, without their text", async () => {
  const errorBody = (code: number) => ({ error: { message: "SENSITIVE_PROVIDER_TEXT +919876543210", type: "OAuthException", code, fbtrace_id: "Azx" } });
  const cases: [number, number, { status: string; code: string }][] = [
    [400, 130429, { status: "retryable", code: "rate_limited" }],
    [400, 131056, { status: "retryable", code: "rate_limited" }],
    [400, 80007, { status: "retryable", code: "rate_limited" }],
    [429, 4, { status: "retryable", code: "rate_limited" }],
    [500, 1, { status: "retryable", code: "provider_unavailable" }],
    [503, 131016, { status: "retryable", code: "provider_unavailable" }],
    [400, 131000, { status: "retryable", code: "provider_unavailable" }],
    [401, 190, { status: "failed", code: "configuration_error" }],
    [403, 200, { status: "failed", code: "configuration_error" }],
    [400, 132001, { status: "failed", code: "configuration_error" }],
    [400, 132015, { status: "failed", code: "configuration_error" }],
    [400, 133010, { status: "failed", code: "configuration_error" }],
    [400, 131030, { status: "failed", code: "recipient_rejected" }],
    [400, 131026, { status: "failed", code: "recipient_rejected" }],
    [400, 100, { status: "failed", code: "provider_rejected" }],
    [400, 132000, { status: "failed", code: "provider_rejected" }],
    [400, 132018, { status: "failed", code: "provider_rejected" }],
  ];
  for (const [status, code, want] of cases)
    assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, async () => json(status, errorBody(code))), want, `${status}/${code}`);
  const text = (status: number) => async () => new Response("SENSITIVE_PROVIDER_TEXT", { status });
  assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, text(429)), { status: "retryable", code: "rate_limited" });
  assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, text(502)), { status: "retryable", code: "provider_unavailable" });
  assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, text(401)), { status: "failed", code: "configuration_error" });
  assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, text(400)), { status: "failed", code: "provider_rejected" });
  for (const answer of [
    () => new Response(null, { status: 302, headers: { Location: "https://example.com/" } }),
    () => json(201, accepted),
    () => json(200, {}),
    () => json(200, { messages: [] }),
    () => json(200, { messages: [{ id: messageId }, { id: messageId }] }),
    () => json(200, { messages: [{ id: "wamid with spaces" }] }),
    () => new Response("not json", { status: 200 }),
  ])
    assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, async () => answer()), { status: "uncertain", code: "invalid_response" });
  assert.deepEqual(
    await sendOrderConfirmationWhatsApp(config(), "9876543210", template, async () => { throw new Error("SENSITIVE_NETWORK_TEXT"); }),
    { status: "uncertain", code: "network_error" },
  );
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(16_385))); },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await sendOrderConfirmationWhatsApp(config(), "9876543210", template, async () => new Response(oversized, { status: 200 })), {
    status: "uncertain",
    code: "invalid_response",
  });
  assert.equal(cancelled, true, "an oversized answer is cancelled, not read to the end");
});

// Catches clearing the deadline once headers arrive, or trusting fetch to honour the abort signal.
test("one short deadline covers the headers and the whole answer", async () => {
  const signals: AbortSignal[] = [];
  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const headersNeverArrive: typeof fetch = async (_url, init) => {
    signals.push(init!.signal!);
    return new Promise<Response>(() => {});
  };
  const bodyNeverEnds: typeof fetch = async (_url, init) => {
    signals.push(init!.signal!);
    return new Response(stalled, { status: 200 });
  };
  const started = Date.now();
  const outcomes = await Promise.all([
    sendOrderConfirmationWhatsApp(config(), "9876543210", template, headersNeverArrive, { timeoutMs: 50 }),
    sendOrderConfirmationWhatsApp(config(), "9876543210", template, bodyNeverEnds, { timeoutMs: 50 }),
  ]);
  assert.deepEqual(outcomes, [{ status: "uncertain", code: "network_error" }, { status: "uncertain", code: "network_error" }]);
  assert.ok(Date.now() - started < 3_000, "the deadline is kept");
  assert.ok(signals.length === 2 && signals.every((signal) => signal.aborted), "the request is aborted");
  assert.equal(cancelled, true, "a stalled answer is cancelled");
});

// Catches a default deadline long enough to hold up the order worker.
test("the default deadline is eight seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let settled = false;
  const pending = sendOrderConfirmationWhatsApp(config(), "9876543210", template, async () => new Promise<Response>(() => {})).then((outcome) => {
    settled = true;
    return outcome;
  });
  t.mock.timers.tick(7_999);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, { status: "uncertain", code: "network_error" });
});
