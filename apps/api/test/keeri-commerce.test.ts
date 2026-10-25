import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeeriCommerce } from "../src/keeri-commerce.js";
const base = {
  origin: "https://keeri.example.test",
  token: "a".repeat(40),
  tenantId: "maple",
  merchantScope: "maple-store",
};
test("machine transport posts JSON only to fixed Keeri origin without redirecting credentials", async () => {
  const client = createKeeriCommerce({
    ...base,
    fetch: async (url, options) => {
      assert.equal(
        String(url),
        "https://keeri.example.test/api/storefront/reservations/verify",
      );
      assert.equal(options?.method, "POST");
      assert.equal(options?.redirect, "error");
      assert.equal(
        new Headers(options?.headers).get("authorization"),
        `Bearer ${base.token}`,
      );
      assert.deepEqual(JSON.parse(String(options?.body)), {
        attemptId: "attempt",
      });
      return Response.json({ verified: true });
    },
  });
  const actual = await client
    .request("reservations/verify", { attemptId: "attempt" })
    .catch((e) => ({ error: e.code }));
  assert.deepEqual(actual, { verified: true });
});
test("unsafe origins, malformed credentials and arbitrary paths fail before network access", async () => {
  for (const origin of [
    "http://keeri.example.test",
    "https://keeri.example.test/path",
    "https://user:pass@keeri.example.test",
    "https://keeri.example.test/?x=1",
  ]) {
    assert.throws(() => createKeeriCommerce({ ...base, origin }), {
      code: "INVALID_CONFIGURATION",
    });
  }
  const client = createKeeriCommerce({
    ...base,
    fetch: async () => {
      throw Error("network must not run");
    },
  });
  for (const path of [
    "https://evil.example",
    "../orders",
    "orders?x=y",
    "catalogue",
    "reservations/release/extra",
  ])
    await assert.rejects(client.request(path, {}), { code: "INVALID_REQUEST" });
});
test("redirects, HTML, oversized streams and upstream errors are sanitized", async () => {
  for (const response of [
    new Response("private-data", { status: 401 }),
    new Response("secret", { headers: { "content-type": "text/html" } }),
    Response.json({ data: "x".repeat(200) }),
  ]) {
    const client = createKeeriCommerce({
      ...base,
      maxBytes: 100,
      fetch: async () => response,
    });
    const result = await client
      .request("quotes", {})
      .catch((e) => ({ code: e.code, message: e.message }));
    assert.ok(
      ["UPSTREAM_REJECTED", "INVALID_RESPONSE", "RESPONSE_TOO_LARGE"].includes(
        (result as any).code,
      ),
    );
    assert.doesNotMatch((result as any).message, /private-data|secret/);
  }
});
test("deadline bounds fetch and body streams even if transport ignores AbortSignal", async () => {
  for (const fetcher of [
    async () => new Promise<Response>(() => {}),
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"pending":'));
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  ]) {
    const client = createKeeriCommerce({
      ...base,
      timeoutMs: 20,
      fetch: fetcher,
    });
    await assert.rejects(client.request("quotes", {}), {
      code: "TRANSPORT_TIMEOUT",
    });
  }
});

test("reservation adapter binds the reply and parses only real date and boolean guarantees", async () => {
  const binding = {
    attemptId: "3e234cd2-1111-4222-8333-123456789012",
    snapshotSha256: "f".repeat(64),
  };
  const response = {
    ...binding,
    reservationId: "hold_one",
    verified: true,
    expiresAt: "2026-11-01T12:00:00.000Z",
  };
  const client = createKeeriCommerce({
    ...base,
    fetch: async () => Response.json(response),
  });
  const result = await client.reservations
    .reserve({ ...binding, snapshot: { version: 2 } as any })
    .catch((e) => ({ code: e.code }));
  assert.equal((result as any).verified, true);
  assert.equal(
    (result as any).expiresAt.toISOString(),
    "2026-11-01T12:00:00.000Z",
  );
  for (const bad of [
    { ...response, attemptId: "another" },
    { ...response, verified: "true" },
    { ...response, expiresAt: "not-a-date" },
  ]) {
    const badClient = createKeeriCommerce({
      ...base,
      fetch: async () => Response.json(bad),
    });
    await assert.rejects(
      badClient.reservations.reserve({
        ...binding,
        snapshot: { version: 2 } as any,
      }),
      { code: "INVALID_RESPONSE" },
    );
  }
});
test("order adapter rejects legacy review receipts and mismatched acknowledgements", async () => {
  const input = {
    merchantScope: base.merchantScope,
    attemptId: "attempt",
    idempotencyKey: "key",
    payloadSha256: "f".repeat(64),
    payload: { version: 2 },
  };
  const good = { ...input, accepted: true, externalOrderId: "actual-order" };
  delete (good as any).payload;
  const client = createKeeriCommerce({
    ...base,
    fetch: async () => Response.json(good),
  });
  assert.equal(
    (
      (await client
        .deliverCapturedOrder(input)
        .catch((e) => ({ code: e.code }))) as any
    ).externalOrderId,
    "actual-order",
  );
  for (const bad of [
    { accepted: true, receiptId: "review-only" },
    { ...good, merchantScope: "other" },
    { ...good, externalOrderId: "" },
  ]) {
    await assert.rejects(
      createKeeriCommerce({
        ...base,
        fetch: async () => Response.json(bad),
      }).deliverCapturedOrder(input),
      { code: "INVALID_RESPONSE" },
    );
  }
});

test("shared Keeri producer fixture passes the quote transport unchanged and cross-tenant requests fail closed",async()=>{
 const {readFile}=await import("node:fs/promises");
 const fixture=JSON.parse(await readFile(new URL("../../../docs/contracts/shopmaple-quote-v2.json",import.meta.url),"utf8"));
 const client=createKeeriCommerce({...base,fetch:async(url,options)=>{
  assert.equal(String(url),"https://keeri.example.test/api/storefront/quotes");
  assert.deepEqual(JSON.parse(String(options?.body)),fixture.request);
  return Response.json(fixture.response);
 }});
 assert.deepEqual(await client.quote(fixture.request),fixture.response);
 await assert.rejects(client.quote({...fixture.request,items:[{variantId:"keeri:other:variant",quantity:1}]}),{code:"INVALID_REQUEST"});
 await assert.rejects(createKeeriCommerce({...base,fetch:async()=>Response.json({accepted:true},{status:202})}).request("orders",{}),{code:"UPSTREAM_REJECTED"});
});
