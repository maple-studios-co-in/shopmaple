import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  createRazorpayGateway,
  PaymentGatewayError,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type RazorpayConfig,
} from "../src/payments/razorpay.js";

// Public, deterministic Razorpay documentation values; never merchant secrets.
// https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
const config: RazorpayConfig = {
  keyId: "rzp_test_fixture",
  keySecret: "EnLs21M47BllR3X8PSFtjtbd",
  webhookSecret: "fixture-webhook-secret",
};
const callback = {
  razorpay_order_id: "order_IEIaMR65cu6nz3",
  razorpay_payment_id: "pay_IH4NVgf4Dreq1l",
  razorpay_signature:
    "0d4e745a1838664ad6c9c9902212a32d627d68e917290b0ad5f08ff4561bc50f",
};
const expected = {
  orderId: callback.razorpay_order_id,
  amountPaise: 5000,
  currency: "INR" as const,
};
const payment = {
  entity: "payment",
  id: callback.razorpay_payment_id,
  order_id: expected.orderId,
  amount: 5000,
  currency: "INR",
  status: "captured",
  captured: true,
  amount_refunded: 0,
  refund_status: null,
  // Other provider fields must not escape this boundary.
  email: "fixture@example.invalid",
  contact: "fixture",
  card_id: null,
};
const order = {
  entity: "order",
  id: expected.orderId,
  amount: 5000,
  currency: "INR",
  receipt: "attempt_1",
  status: "created",
  amount_paid: 0,
  amount_due: 5000,
  attempts: 0,
  notes: {},
  created_at: 1756455561,
};
const orderInput = {
  amountPaise: 5000,
  currency: "INR" as const,
  receipt: "attempt_1",
};
const errorCode = (code: string) => (error: unknown) =>
  error instanceof PaymentGatewayError && error.code === code;
function gatewayWith(body: unknown, status = 200) {
  return createRazorpayGateway(config, {
    fetch: async () => Response.json(body, { status }),
  });
}

// Removing the stored-order binding would accept another order's valid callback.
test("official callback fixture verifies only for the stored order", () => {
  assert.equal(
    verifyCheckoutSignature(expected.orderId, callback, config.keySecret),
    true,
  );
  assert.equal(
    verifyCheckoutSignature("order_another", callback, config.keySecret),
    false,
  );
  assert.equal(
    verifyCheckoutSignature(
      expected.orderId,
      { ...callback, razorpay_payment_id: "pay_other" },
      config.keySecret,
    ),
    false,
  );
  for (const signature of [
    "",
    "f".repeat(64),
    "z".repeat(64),
    callback.razorpay_signature + "00",
  ]) {
    assert.equal(
      verifyCheckoutSignature(
        expected.orderId,
        { ...callback, razorpay_signature: signature },
        config.keySecret,
      ),
      false,
    );
  }
});

test("official SDK webhook fixture verifies exact bytes and rejects reparsed JSON", () => {
  // https://github.com/razorpay/razorpay-node/blob/master/test/utils/razorpay-utils.spec.js
  const raw = Buffer.from('{"a":1,"b":2,"c":{"d":3}}');
  const signature =
    "2fe04e22977002e6c7cb553adab8b460cb9e2a4970d5953cb27a8472752e3bbc";
  assert.equal(verifyWebhookSignature(raw, signature, "123456"), true);
  assert.equal(
    verifyWebhookSignature(
      Buffer.from(JSON.stringify(JSON.parse(raw.toString()), null, 2)),
      signature,
      "123456",
    ),
    false,
  );
  assert.equal(verifyWebhookSignature(raw, signature, "changed-secret"), false);
  assert.equal(verifyWebhookSignature(raw, "not-hex", "123456"), false);
});

test("missing configuration fails explicitly without making requests", () => {
  for (const field of ["keyId", "keySecret", "webhookSecret"] as const) {
    assert.throws(
      () => createRazorpayGateway({ ...config, [field]: "" }),
      errorCode("MISSING_CONFIGURATION"),
    );
  }
  assert.throws(
    () => createRazorpayGateway(config, { timeoutMs: 0 }),
    errorCode("INVALID_INPUT"),
  );
});

test("creates an INR order in integer paise with partial payments disabled", async () => {
  let calls = 0;
  const gateway = createRazorpayGateway(config, {
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.razorpay.com/v1/orders");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Basic " +
          Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64"),
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        amount: 5000,
        currency: "INR",
        receipt: "attempt_1",
        partial_payment: false,
      });
      return Response.json(order);
    },
  });
  assert.deepEqual(await gateway.createOrder(orderInput), {
    orderId: expected.orderId,
    amountPaise: 5000,
    currency: "INR",
    receipt: "attempt_1",
  });
  assert.equal(calls, 1);
});

test("invalid amounts, currencies and receipts cannot reach the gateway", async () => {
  const gateway = createRazorpayGateway(config, {
    fetch: async () => {
      assert.fail("invalid request reached transport");
    },
  });
  for (const amountPaise of [
    -1,
    0,
    99,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(
      gateway.createOrder({ ...orderInput, amountPaise }),
      errorCode("INVALID_INPUT"),
    );
  }
  await assert.rejects(
    gateway.createOrder({ ...orderInput, currency: "USD" as "INR" }),
    errorCode("INVALID_INPUT"),
  );
  for (const receipt of ["", "x".repeat(41), "emoji😀", "with\nnewline"]) {
    await assert.rejects(
      gateway.createOrder({ ...orderInput, receipt }),
      errorCode("INVALID_INPUT"),
    );
  }
});

test("provider order responses must match the frozen commercial request", async () => {
  for (const patch of [
    { amount: 1 },
    { currency: "USD" },
    { receipt: "other" },
    { entity: "payment" },
    { id: "invalid" },
    { status: "paid" },
    { amount_paid: 100 },
    { amount_due: 1 },
  ]) {
    await assert.rejects(
      gatewayWith({ ...order, ...patch }).createOrder(orderInput),
      errorCode("INVALID_RESPONSE"),
    );
  }
});

test("a valid callback fetches captured payment evidence and strips personal data", async () => {
  const gateway = createRazorpayGateway(config, {
    fetch: async (url, init) => {
      assert.equal(
        url,
        `https://api.razorpay.com/v1/payments/${callback.razorpay_payment_id}`,
      );
      assert.equal(init?.method, "GET");
      return Response.json(payment);
    },
  });
  assert.deepEqual(await gateway.verifyCallback(expected, callback), {
    paymentId: callback.razorpay_payment_id,
    orderId: expected.orderId,
    amountPaise: 5000,
    currency: "INR",
    status: "captured",
  });
});

test("invalid callback signatures fail before payment fetch", async () => {
  const gateway = createRazorpayGateway(config, {
    fetch: async () => {
      assert.fail("invalid callback reached transport");
    },
  });
  await assert.rejects(
    gateway.verifyCallback(expected, {
      ...callback,
      razorpay_signature: "f".repeat(64),
    }),
    errorCode("INVALID_SIGNATURE"),
  );
  await assert.rejects(
    gateway.verifyCallback({ ...expected, orderId: "order_other" }, callback),
    errorCode("INVALID_SIGNATURE"),
  );
});

test("captured evidence binds payment identity, order, currency and exact amount", async () => {
  for (const patch of [
    { id: "pay_other" },
    { order_id: "order_other" },
    { currency: "USD" },
    { amount: 4999 },
    { amount: "5000" },
    { entity: "order" },
  ]) {
    await assert.rejects(
      gatewayWith({ ...payment, ...patch }).verifyCapturedPayment(
        expected,
        callback.razorpay_payment_id,
      ),
      errorCode("PAYMENT_MISMATCH"),
    );
  }
});

test("authorization, inconsistent capture and refunded payments are never accepted", async () => {
  for (const patch of [
    { status: "authorized" },
    { status: "failed" },
    { status: "refunded" },
    { captured: false },
    { captured: "true" },
  ]) {
    await assert.rejects(
      gatewayWith({ ...payment, ...patch }).verifyCapturedPayment(
        expected,
        callback.razorpay_payment_id,
      ),
      errorCode("PAYMENT_NOT_CAPTURED"),
    );
  }
  for (const patch of [
    { amount_refunded: 1 },
    { amount_refunded: undefined },
    { refund_status: "partial" },
  ]) {
    await assert.rejects(
      gatewayWith({ ...payment, ...patch }).verifyCapturedPayment(
        expected,
        callback.razorpay_payment_id,
      ),
      errorCode("PAYMENT_REFUNDED_OR_UNKNOWN"),
    );
  }
});

test("invalid payment identifiers and expected totals do not form outbound URLs", async () => {
  const gateway = createRazorpayGateway(config, {
    fetch: async () => {
      assert.fail("invalid identity reached transport");
    },
  });
  await assert.rejects(
    gateway.verifyCapturedPayment(expected, "pay_../../orders"),
    errorCode("INVALID_INPUT"),
  );
  await assert.rejects(
    gateway.verifyCapturedPayment(
      { ...expected, amountPaise: 1.1 },
      callback.razorpay_payment_id,
    ),
    errorCode("INVALID_INPUT"),
  );
});

test("webhook authentication returns deduplication data without implying payment completion", () => {
  const raw = Buffer.from(
    JSON.stringify({
      entity: "event",
      event: "payment.captured",
      payload: { payment: { entity: payment } },
    }),
  );
  const signature = createHmac("sha256", config.webhookSecret)
    .update(raw)
    .digest("hex");
  const gateway = gatewayWith(null);
  const event = gateway.authenticateWebhook(raw, signature, "event_123");
  assert.equal(event.eventId, "event_123");
  assert.equal(event.eventType, "payment.captured");
  assert.equal(event.paymentId, callback.razorpay_payment_id);
  assert.equal(event.orderId, expected.orderId);
  assert.match(event.bodySha256, /^[a-f0-9]{64}$/);
  assert.equal("paid" in event, false);
  assert.throws(
    () => gateway.authenticateWebhook(raw, "f".repeat(64), "event_123"),
    errorCode("INVALID_SIGNATURE"),
  );
  assert.throws(
    () => gateway.authenticateWebhook(raw, signature, ""),
    errorCode("INVALID_WEBHOOK"),
  );
  assert.throws(
    () =>
      gateway.authenticateWebhook(
        Buffer.alloc(1_048_577),
        signature,
        "event_123",
      ),
    errorCode("INVALID_WEBHOOK"),
  );
});

test("signed malformed webhooks fail and unsupported events remain non-actionable", () => {
  const gateway = gatewayWith(null);
  for (const text of [
    "{",
    "null",
    '{"entity":"payment"}',
    '{"entity":"event","event":"payment.captured","payload":{}}',
  ]) {
    const raw = Buffer.from(text);
    const signature = createHmac("sha256", config.webhookSecret)
      .update(raw)
      .digest("hex");
    assert.throws(
      () => gateway.authenticateWebhook(raw, signature, "event_123"),
      errorCode("INVALID_WEBHOOK"),
    );
  }
  const raw = Buffer.from('{"entity":"event","event":"refund.created"}');
  const signature = createHmac("sha256", config.webhookSecret)
    .update(raw)
    .digest("hex");
  assert.equal(
    gateway.authenticateWebhook(raw, signature, "event_other").paymentId,
    undefined,
  );
});

test("upstream errors are sanitized and order creation is never automatically retried", async () => {
  for (const status of [400, 401, 429, 500]) {
    await assert.rejects(
      gatewayWith(
        { error: { description: "private-provider-data" } },
        status,
      ).createOrder(orderInput),
      (error: unknown) => {
        assert.ok(error instanceof PaymentGatewayError);
        assert.equal(error.code, "UPSTREAM_HTTP_ERROR");
        assert.equal(error.httpStatus, status);
        assert.equal(error.operationOutcome, "unknown");
        assert.equal(String(error).includes("private-provider-data"), false);
        return true;
      },
    );
  }
  let calls = 0;
  const gateway = createRazorpayGateway(config, {
    fetch: async () => {
      calls++;
      throw new Error("secret transport detail");
    },
  });
  await assert.rejects(
    gateway.createOrder(orderInput),
    errorCode("UPSTREAM_UNAVAILABLE"),
  );
  assert.equal(calls, 1);
});

test("deadline covers both transport and response body reading", async () => {
  for (const fetch of [
    async () => new Promise<Response>(() => {}),
    async () => new Response(new ReadableStream<Uint8Array>()),
  ]) {
    const gateway = createRazorpayGateway(config, { fetch, timeoutMs: 10 });
    await assert.rejects(
      gateway.createOrder(orderInput),
      errorCode("UPSTREAM_TIMEOUT"),
    );
  }
});

test("malformed JSON responses are rejected without exposing response content", async () => {
  const gateway = createRazorpayGateway(config, {
    fetch: async () => new Response("private-invalid-json"),
  });
  await assert.rejects(
    gateway.createOrder(orderInput),
    errorCode("INVALID_RESPONSE"),
  );
});

// Removing stream byte accounting would accept a matching payment hidden in an oversized body.
test("oversized provider bodies cannot authorize capture even with a missing or understated length", async () => {
  for (const contentLength of [undefined, "1"]) {
    const gateway = createRazorpayGateway(config, {
      fetch: async () =>
        new Response(
          JSON.stringify({ ...payment, notes: "x".repeat(262_144) }),
          { headers: contentLength ? { "content-length": contentLength } : {} },
        ),
    });
    await assert.rejects(
      gateway.verifyCapturedPayment(expected, callback.razorpay_payment_id),
      (error: unknown) => {
        assert.ok(error instanceof PaymentGatewayError);
        assert.equal(error.code, "RESPONSE_TOO_LARGE");
        assert.equal(error.operationOutcome, "not_applicable");
        return true;
      },
    );
  }
});

// The consumer must stop the stream immediately, not wait for an oversized body to finish.
test("oversized streamed order response is cancelled and remains an unknown one-shot creation", async () => {
  let cancelled = false;
  let calls = 0;
  const gateway = createRazorpayGateway(config, {
    timeoutMs: 100,
    fetch: async () => {
      calls++;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(262_144));
            controller.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    },
  });
  await assert.rejects(gateway.createOrder(orderInput), (error: unknown) => {
    assert.ok(error instanceof PaymentGatewayError);
    assert.equal(error.code, "RESPONSE_TOO_LARGE");
    assert.equal(error.operationOutcome, "unknown");
    return true;
  });
  assert.equal(cancelled, true);
  assert.equal(calls, 1);
});

test("declared oversized response is rejected and cancelled before waiting for body bytes", async () => {
  let cancelled = false;
  const gateway = createRazorpayGateway(config, {
    timeoutMs: 100,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-length": "262145" } },
      ),
  });
  await assert.rejects(
    gateway.createOrder(orderInput),
    errorCode("RESPONSE_TOO_LARGE"),
  );
  assert.equal(cancelled, true);
});

test("provider JSON at the response byte limit is still accepted", async () => {
  const json = JSON.stringify(order);
  const gateway = createRazorpayGateway(config, {
    fetch: async () =>
      new Response(json + " ".repeat(262_144 - Buffer.byteLength(json))),
  });
  assert.deepEqual(await gateway.createOrder(orderInput), {
    orderId: expected.orderId,
    amountPaise: 5000,
    currency: "INR",
    receipt: "attempt_1",
  });
});

test("response timeout cancels the provider body and keeps creation outcome unknown", async () => {
  let cancelled = false;
  const gateway = createRazorpayGateway(config, {
    timeoutMs: 10,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  await assert.rejects(gateway.createOrder(orderInput), (error: unknown) => {
    assert.ok(error instanceof PaymentGatewayError);
    assert.equal(error.code, "UPSTREAM_TIMEOUT");
    assert.equal(error.operationOutcome, "unknown");
    return true;
  });
  assert.equal(cancelled, true);
});
