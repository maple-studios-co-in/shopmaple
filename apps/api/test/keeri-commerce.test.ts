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

const restart = () => new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } });
const refused = () => {
  throw new TypeError("fetch failed");
};
/** A transport that answers from `script` in order, then repeats the last entry. */
function scripted(script: Array<() => Response>) {
  const bodies: string[] = [];
  const fetch = async (_url: unknown, options?: RequestInit) => {
    bodies.push(String(options?.body));
    return script[Math.min(bodies.length, script.length) - 1]!();
  };
  return { fetch: fetch as typeof globalThis.fetch, bodies };
}
const replies: Record<string, unknown> = {
  quotes: { ok: true },
  reservations: { ok: true },
  "reservations/verify": { verified: true },
  "reservations/release": { released: true },
};

test("a Keeri restart's 502s, 504s and refused connections are retried for quotes and holds", async () => {
  const gatewayTimeout = () => new Response("<html>504 Gateway Time-out</html>", { status: 504 });
  for (const [path, reply] of Object.entries(replies)) {
    const keeri = scripted([restart, refused, gatewayTimeout, () => Response.json(reply)]);
    const client = createKeeriCommerce({ ...base, retryDelaysMs: [0, 0, 0, 0], fetch: keeri.fetch });
    assert.deepEqual(await client.request(path, { attemptId: "attempt" }), reply, path);
    assert.equal(keeri.bodies.length, 4, path);
  }
});

test("a retried hold sends the same attemptId and snapshot, so Keeri returns the hold it already made", async () => {
  const binding = { attemptId: "3e234cd2-1111-4222-8333-123456789012", snapshotSha256: "f".repeat(64) };
  const keeri = scripted([
    restart,
    () => Response.json({ ...binding, reservationId: "hold_one", verified: true, expiresAt: "2026-11-01T12:00:00.000Z" }),
  ]);
  const client = createKeeriCommerce({ ...base, retryDelaysMs: [0], fetch: keeri.fetch });
  const hold = await client.reservations.reserve({ ...binding, snapshot: { version: 2 } as any });
  assert.equal(hold.reservationId, "hold_one");
  assert.equal(keeri.bodies.length, 2);
  assert.equal(keeri.bodies[0], keeri.bodies[1]);
});

test("Keeri's own errors, refusals, bad responses and timeouts are final, and order delivery is left to the outbox", async () => {
  const final: Array<[string, () => Response | Promise<Response>, string]> = [
    ["quotes", () => new Response("no", { status: 422 }), "UPSTREAM_REJECTED"],
    ["quotes", () => Response.json({ error: "COMMERCE_POLICY_UNAVAILABLE" }, { status: 503 }), "UPSTREAM_UNAVAILABLE"],
    ["reservations", () => Response.json({ error: "Something went wrong" }, { status: 500 }), "UPSTREAM_UNAVAILABLE"],
    ["reservations", () => new Response("gone", { status: 409 }), "UPSTREAM_REJECTED"],
    ["quotes", () => new Response("<html>", { headers: { "content-type": "text/html" } }), "INVALID_RESPONSE"],
    ["quotes", () => new Promise<Response>(() => {}), "TRANSPORT_TIMEOUT"],
    ["orders", restart, "UPSTREAM_UNAVAILABLE"],
    ["orders", refused, "TRANSPORT_UNAVAILABLE"],
  ];
  for (const [path, reply, code] of final) {
    let calls = 0;
    const client = createKeeriCommerce({
      ...base,
      timeoutMs: 50,
      retryDelaysMs: [0, 0, 0, 0],
      fetch: async () => {
        calls++;
        return reply();
      },
    });
    await assert.rejects(client.request(path, {}), { code }, `${path} ${code}`);
    assert.equal(calls, 1, `${path} ${code}`);
  }
});

test("an outage longer than the retries still fails as unavailable, after one try per delay", async () => {
  const keeri = scripted([restart]);
  const client = createKeeriCommerce({ ...base, retryDelaysMs: [0, 0, 0, 0], fetch: keeri.fetch });
  await assert.rejects(client.request("quotes", {}), { code: "UPSTREAM_UNAVAILABLE" });
  assert.equal(keeri.bodies.length, 5);
});

test("retries stop once another wait would run past the call's timeout", async () => {
  let calls = 0;
  const client = createKeeriCommerce({
    ...base,
    timeoutMs: 250,
    retryDelaysMs: [0, 0, 0, 0],
    fetch: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return restart();
    },
  });
  await assert.rejects(client.request("quotes", {}), { code: "UPSTREAM_UNAVAILABLE" });
  assert.equal(calls, 2, "the second slow failure ends past 250 ms, so there is no third try");
});

test("bad retry schedules are refused before any request", () => {
  for (const retryDelaysMs of [[-1], [1.5], [5_001], [0, 0, 0, 0, 0, 0]])
    assert.throws(() => createKeeriCommerce({ ...base, retryDelaysMs }), { code: "INVALID_CONFIGURATION" }, String(retryDelaysMs));
  assert.doesNotThrow(() => createKeeriCommerce({ ...base, retryDelaysMs: [] }));
});

test("the default schedule rides out a five-second Keeri restart", async () => {
  const down = Date.now() + 5_000;
  let calls = 0;
  const client = createKeeriCommerce({
    ...base,
    fetch: async () => {
      calls++;
      return Date.now() < down ? restart() : Response.json({ verified: true });
    },
  });
  assert.deepEqual(await client.request("reservations/verify", {}), { verified: true });
  assert.equal(calls, 5, "tries at about 0, 0.5, 1.5, 3.5 and 6 s");
});
