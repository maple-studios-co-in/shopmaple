import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchKeeriExport,
  KeeriFetchError,
  type KeeriFetchOptions,
} from "../src/keeri-fetch.js";
import { keeriFixture } from "./fixtures/keeri.js";
const options: KeeriFetchOptions = {
  endpoint: "https://keeri.example.test/api/storefront/export",
  trustedOrigin: "https://keeri.example.test",
  token: "synthetic-service-token",
  tenantId: "maple",
};
const response = (data: unknown = keeriFixture()) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
const rejects = (run: Promise<unknown>, code: string) =>
  assert.rejects(
    run,
    (error: unknown) => error instanceof KeeriFetchError && error.code === code,
  );

test("export fetch authenticates only the fixed destination and validates products before returning", async () => {
  const result = await fetchKeeriExport({
    ...options,
    fetch: async (url, init) => {
      assert.equal(String(url), options.endpoint);
      assert.equal(init?.method, "GET");
      assert.equal(init?.redirect, "error");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer synthetic-service-token",
      );
      return response();
    },
  });
  assert.equal(result.source, "keeri:maple");
  assert.equal(result.products[0]?.variants[0]?.pricePaise, 1234567);
  assert.equal(result.products[0]?.variants[0]?.available, false);
});

test("unsafe or mismatched endpoints fail before credentials can leave the process", async () => {
  for (const endpoint of [
    "http://keeri.example.test/export",
    "https://elsewhere.example/export",
    "https://name:secret@keeri.example.test/export",
    "https://keeri.example.test/export#fragment",
    "https://keeri.example.test/export?token=secret",
  ]) {
    let requested = false;
    await rejects(
      fetchKeeriExport({
        ...options,
        endpoint,
        fetch: async () => {
          requested = true;
          return response();
        },
      }),
      "INVALID_CONFIGURATION",
    );
    assert.equal(requested, false);
  }
});

test("redirects, HTTP errors and non-JSON bodies never become imports or leak response content", async () => {
  for (const status of [302, 401, 500])
    await rejects(
      fetchKeeriExport({
        ...options,
        fetch: async () => new Response("private upstream detail", { status }),
      }),
      "UPSTREAM_REJECTED",
    );
  await rejects(
    fetchKeeriExport({
      ...options,
      fetch: async () =>
        new Response("private upstream detail", {
          headers: { "Content-Type": "text/html" },
        }),
    }),
    "INVALID_RESPONSE",
  );
});

test("schema, tenant and cross-record ownership checks run before returning any export", async () => {
  for (const change of [
    (x: ReturnType<typeof keeriFixture>) => {
      x.complete = false;
    },
    (x: ReturnType<typeof keeriFixture>) => {
      x.tenantId = "other";
    },
    (x: ReturnType<typeof keeriFixture>) => {
      x.models[0]!.variants[0]!.tenantId = "other";
    },
  ]) {
    const fixture = keeriFixture();
    change(fixture);
    await rejects(
      fetchKeeriExport({ ...options, fetch: async () => response(fixture) }),
      "INVALID_EXPORT",
    );
  }
});

test("streamed and declared oversized responses are rejected without importing partial JSON", async () => {
  await rejects(
    fetchKeeriExport({
      ...options,
      maxBytes: 100,
      fetch: async () => response(),
    }),
    "EXPORT_TOO_LARGE",
  );
  await rejects(
    fetchKeeriExport({
      ...options,
      maxBytes: 100,
      fetch: async () =>
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "101",
          },
        }),
    }),
    "EXPORT_TOO_LARGE",
  );
});

test("deadline covers both connection and stalled response body and aborts the request", async () => {
  for (const bodyStalls of [false, true]) {
    let signal: AbortSignal | null | undefined;
    await rejects(
      fetchKeeriExport({
        ...options,
        timeoutMs: 30,
        fetch: async (_url, init) => {
          signal = init?.signal;
          if (!bodyStalls) return new Promise<Response>(() => {});
          return new Response(new ReadableStream(), {
            headers: { "Content-Type": "application/json" },
          });
        },
      }),
      "EXPORT_TIMEOUT",
    );
    assert.equal(signal?.aborted, true);
  }
});

test("transport exceptions and malformed JSON expose only bounded stable codes", async () => {
  await rejects(
    fetchKeeriExport({
      ...options,
      fetch: async () => {
        throw new Error("Authorization: synthetic-service-token");
      },
    }),
    "TRANSPORT_UNAVAILABLE",
  );
  await rejects(
    fetchKeeriExport({
      ...options,
      fetch: async () =>
        new Response("{broken", {
          headers: { "Content-Type": "application/json" },
        }),
    }),
    "INVALID_EXPORT",
  );
});

test("a transport completing after the deadline cannot leave an unread body running", async () => {
  let finish: ((value: Response) => void) | undefined;
  let cancelled = false;
  const pending = fetchKeeriExport({ ...options, timeoutMs: 20, fetch: () => new Promise<Response>(resolve => { finish = resolve; }) });
  await rejects(pending, "EXPORT_TIMEOUT");
  finish!(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "Content-Type": "application/json" } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});
