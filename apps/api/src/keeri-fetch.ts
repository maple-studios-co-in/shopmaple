import { adaptKeeriExport, adaptKeeriExportV2 } from "./keeri.js";
export interface KeeriFetchOptions {
  endpoint: string;
  schemaVersion?: 1 | 2;
  trustedOrigin: string;
  token: string;
  tenantId: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetch?: typeof fetch;
}
export class KeeriFetchError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "KeeriFetchError";
  }
}
/** Server-only consumer for the proposed service export contract. Never accept these options from a browser. */
export async function fetchKeeriExport(
  options: KeeriFetchOptions,
): Promise<ReturnType<typeof adaptKeeriExport>> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
    const trusted = new URL(options.trustedOrigin);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.origin !== trusted.origin ||
      trusted.href !== `${trusted.origin}/` ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(options.tenantId) ||
      !/^[\x21-\x7E]{1,4096}$/.test(options.token) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60_000 ||
      !Number.isInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 50 * 1024 * 1024
    )
      throw new Error();
  } catch {
    throw new KeeriFetchError("INVALID_CONFIGURATION");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new KeeriFetchError("EXPORT_TIMEOUT"));
      controller.abort();
      void reader?.cancel().catch(() => {});
    }, timeoutMs);
  });
  async function read() {
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.token}`,
      },
    });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => {});
      throw new KeeriFetchError("EXPORT_TIMEOUT");
    }
    if (response.status !== 200 || response.redirected)
      throw new KeeriFetchError("UPSTREAM_REJECTED");
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      ) ||
      !response.body
    )
      throw new KeeriFetchError("INVALID_RESPONSE");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
      throw new KeeriFetchError("EXPORT_TOO_LARGE");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (controller.signal.aborted)
        throw new KeeriFetchError("EXPORT_TIMEOUT");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new KeeriFetchError("EXPORT_TOO_LARGE");
      chunks.push(chunk.value);
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
      return (options.schemaVersion === 2 ? adaptKeeriExportV2 : adaptKeeriExport)(JSON.parse(text), options.tenantId);
    } catch {
      throw new KeeriFetchError("INVALID_EXPORT");
    }
  }
  try {
    return await Promise.race([read(), deadline]);
  } catch (error) {
    if (error instanceof KeeriFetchError) throw error;
    throw new KeeriFetchError(
      controller.signal.aborted ? "EXPORT_TIMEOUT" : "TRANSPORT_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => {});
  }
}
