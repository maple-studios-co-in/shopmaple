import "server-only";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

/** What the API needs to check the upload: the film's type and length, the staff session, its CSRF token and origin. */
const sent = ["content-type", "content-length", "cookie", "origin", "x-csrf-token", "x-media-label", "user-agent", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"];
/** The answer's own headers, as the API wrote them (the body is short JSON). */
const answered = ["content-type", "cache-control", "x-content-type-options", "x-robots-tag", "ratelimit", "ratelimit-policy", "retry-after"];

/**
 * Streams a staff film upload to the API as it arrives. The store's `/api/*` rewrite would copy the body through a buffer
 * that Next caps at 10 MB (silently cutting off the rest), and the proxy in proxy.ts would buffer it too, so the film route
 * is a route handler of its own, left out of the proxy: 80 MB films pass through without being held in memory.
 */
export function forwardFilmUpload(request: Request, api: string): Promise<Response> {
  const target = new URL("/api/admin/media/films", api);
  const headers: Record<string, string> = {};
  for (const name of sent) { const value = request.headers.get(name); if (value !== null) headers[name] = value; }
  return new Promise(resolve => {
    let settled = false;
    const finish = (response: Response) => { if (!settled) { settled = true; resolve(response); } };
    const failed = () => finish(Response.json(
      { code: "MEDIA_UPLOAD_FAILED", message: "The film could not be uploaded. Please try again." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    ));
    const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, { method: "POST", headers }, response => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", failed);
      response.on("end", () => finish(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 502, headers: pick(response.headers) })));
    });
    upstream.on("error", failed);
    // The browser gave up (closed the tab, cancelled): stop sending the rest to the API, which then discards it.
    request.signal?.addEventListener("abort", () => upstream.destroy(), { once: true });
    if (!request.body) { upstream.end(); return; }
    Readable.fromWeb(request.body as import("node:stream/web").ReadableStream).on("error", () => upstream.destroy()).pipe(upstream);
  });
}
function pick(headers: IncomingHttpHeaders) {
  const kept = new Headers({ "Cache-Control": "private, no-store" });
  for (const name of answered) { const value = headers[name]; if (typeof value === "string") kept.set(name, value); }
  return kept;
}
