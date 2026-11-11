import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../proxy";
import { forwardFilmUpload } from "../lib/film-upload-forward";

/** A stand-in API that records what reached it. */
async function fakeApi(answer: (body: Buffer, headers: IncomingHttpHeaders) => { status: number; body: object; headers?: Record<string, string> }) {
  const seen: { body?: Buffer; headers?: IncomingHttpHeaders; path?: string } = {};
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      seen.body = Buffer.concat(chunks); seen.headers = req.headers; seen.path = req.url;
      const reply = answer(seen.body, req.headers);
      res.writeHead(reply.status, { "Content-Type": "application/json", "Set-Cookie": "leak=1", ...reply.headers }).end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return { api: `http://127.0.0.1:${address.port}`, seen, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
/** A request body that arrives in pieces, as a browser upload does. */
function streamed(bytes: Buffer, piece = 1024 * 1024) {
  let at = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) { if (at >= bytes.length) controller.close(); else { controller.enqueue(bytes.subarray(at, at + piece)); at += piece; } } });
}

test("a film larger than Next's 10 MB request buffer reaches the API whole, with the staff headers and nothing else", async () => {
  const film = Buffer.alloc(12 * 1024 * 1024 + 123, 7);
  const fake = await fakeApi(body => ({ status: 201, body: { received: body.length }, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } }));
  try {
    const response = await forwardFilmUpload(new Request("http://localhost:3000/api/admin/media/films", {
      method: "POST", body: streamed(film), duplex: "half",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(film.length), Cookie: "shop_admin=token; other=1", Origin: "http://localhost:3000", "X-CSRF-Token": "c".repeat(64), "X-Media-Label": "Workshop%20film", Authorization: "Bearer not-forwarded" },
    } as RequestInit), fake.api);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { received: film.length });
    assert.equal(fake.seen.path, "/api/admin/media/films");
    assert.equal(createHash("sha256").update(fake.seen.body!).digest("hex"), createHash("sha256").update(film).digest("hex"), "every byte arrives");
    assert.equal(fake.seen.headers!["content-type"], "video/mp4"); assert.equal(fake.seen.headers!["content-length"], String(film.length));
    assert.equal(fake.seen.headers!["x-csrf-token"], "c".repeat(64)); assert.equal(fake.seen.headers!.origin, "http://localhost:3000");
    assert.equal(fake.seen.headers!.cookie, "shop_admin=token; other=1"); assert.equal(fake.seen.headers!["x-media-label"], "Workshop%20film");
    assert.equal(fake.seen.headers!.authorization, undefined);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow"); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("set-cookie"), null, "only the answer's own headers come back");
  } finally { await fake.close(); }
});

test("the API's refusal reaches the browser as it was written, and an unreachable API is a clear failure", async () => {
  const fake = await fakeApi(() => ({ status: 400, body: { code: "MEDIA_INVALID_FILM", message: "Choose a complete MP4 or WebM film." } }));
  try {
    const response = await forwardFilmUpload(new Request("http://localhost:3000/api/admin/media/films", { method: "POST", body: "not a film", headers: { "Content-Type": "video/mp4" } }), fake.api);
    assert.equal(response.status, 400); assert.equal((await response.json()).code, "MEDIA_INVALID_FILM");
  } finally { await fake.close(); }
  const down = await forwardFilmUpload(new Request("http://localhost:3000/api/admin/media/films", { method: "POST", body: "x" }), "http://127.0.0.1:9");
  assert.equal(down.status, 502); assert.equal((await down.json()).code, "MEDIA_UPLOAD_FAILED");
});

test("the proxy, which buffers request bodies, skips only the film upload route", () => {
  assert.equal(unstable_doesMiddlewareMatch({ config, url: "/api/admin/media/films" }), false);
  for (const url of ["/", "/api/admin/media", "/api/admin/content", "/media/uploads/" + "a".repeat(64) + ".mp4", "/admin"])
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), true, url);
});
