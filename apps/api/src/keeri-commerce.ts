import { z } from "zod";
import {
  quoteRequestSchema,
  quoteResponseSchema,
  type QuoteRequest,
} from "@shopmaple/contracts";
import type { ReservationPort } from "./orders/service.js";
import type {
  KeeriDeliveryRequest,
  KeeriDeliveryAcknowledgement,
} from "./orders/workers.js";
export class KeeriCommerceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "KeeriCommerceError";
  }
}
interface Options {
  origin: string;
  token: string;
  tenantId: string;
  merchantScope: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}
const paths = new Set([
  "quotes",
  "reservations",
  "reservations/verify",
  "reservations/release",
  "orders",
]);
/** Server-only, fixed-origin machine transport. Each domain consumer validates its response schema. */
export function createKeeriCommerce(options: Options) {
  const timeoutMs = options.timeoutMs ?? 10_000,
    maxBytes = options.maxBytes ?? 256 * 1024;
  let origin: URL;
  try {
    origin = new URL(options.origin);
    if (
      origin.protocol !== "https:" ||
      origin.href !== origin.origin + "/" ||
      origin.username ||
      origin.password ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(options.token) ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(options.tenantId) ||
      !/^[a-z0-9_-]{1,100}$/.test(options.merchantScope) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 30_000 ||
      !Number.isInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 1024 * 1024
    )
      throw Error();
  } catch {
    throw new KeeriCommerceError("INVALID_CONFIGURATION");
  }
  async function request(path: string, body: unknown): Promise<unknown> {
    if (!paths.has(path)) throw new KeeriCommerceError("INVALID_REQUEST");
    let serialized: string;
    try {
      serialized = JSON.stringify(body);
      if (!serialized || Buffer.byteLength(serialized) > 128 * 1024)
        throw Error();
    } catch {
      throw new KeeriCommerceError("INVALID_REQUEST");
    }
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new KeeriCommerceError("TRANSPORT_TIMEOUT"));
        controller.abort();
        void reader?.cancel().catch(() => {});
      }, timeoutMs);
    });
    async function read() {
      const response = await (options.fetch ?? fetch)(
        new URL(`/api/storefront/${path}`, origin),
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.token}`,
          },
          body: serialized,
        },
      );
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw new KeeriCommerceError("TRANSPORT_TIMEOUT");
      }
      if (response.status !== 200 || response.redirected) {
        void response.body?.cancel().catch(() => {});
        throw new KeeriCommerceError("UPSTREAM_REJECTED");
      }
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? "",
        ) ||
        !response.body
      ) {
        void response.body?.cancel().catch(() => {});
        throw new KeeriCommerceError("INVALID_RESPONSE");
      }
      const length = response.headers.get("content-length");
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > maxBytes)
      ) {
        void response.body.cancel().catch(() => {});
        throw new KeeriCommerceError("RESPONSE_TOO_LARGE");
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const next = await reader.read();
        if (controller.signal.aborted)
          throw new KeeriCommerceError("TRANSPORT_TIMEOUT");
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) throw new KeeriCommerceError("RESPONSE_TOO_LARGE");
        chunks.push(next.value);
      }
      try {
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        );
      } catch {
        throw new KeeriCommerceError("INVALID_RESPONSE");
      }
    }
    try {
      return await Promise.race([read(), deadline]);
    } catch (e) {
      if (e instanceof KeeriCommerceError) throw e;
      throw new KeeriCommerceError(
        controller.signal.aborted
          ? "TRANSPORT_TIMEOUT"
          : "TRANSPORT_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  }
  const remoteId = z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/);
  const digest = z.string().regex(/^[a-f0-9]{64}$/);
  const guarantee = z
    .object({
      attemptId: remoteId,
      snapshotSha256: digest,
      reservationId: remoteId,
      verified: z.literal(true),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .strict();
  const ack = z
    .object({
      accepted: z.literal(true),
      merchantScope: z.literal(options.merchantScope),
      attemptId: remoteId,
      idempotencyKey: z.string().min(1).max(500),
      payloadSha256: digest,
      externalOrderId: remoteId,
    })
    .strict();
  function validated<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new KeeriCommerceError("INVALID_RESPONSE");
    return result.data;
  }
  const reservations: ReservationPort = {
    async reserve(input) {
      const result = validated(guarantee, await request("reservations", input));
      if (
        result.attemptId !== input.attemptId ||
        result.snapshotSha256 !== input.snapshotSha256
      )
        throw new KeeriCommerceError("INVALID_RESPONSE");
      return { ...result, expiresAt: new Date(result.expiresAt) };
    },
    async verify(input) {
      return validated(
        z.object({ verified: z.boolean() }).strict(),
        await request("reservations/verify", input),
      ).verified;
    },
  };
  async function quote(input: QuoteRequest) {
    const parsed = quoteRequestSchema.parse(input);
    if (
      parsed.items.some(
        (i) => !i.variantId.startsWith(`keeri:${options.tenantId}:`),
      )
    )
      throw new KeeriCommerceError("INVALID_REQUEST");
    return validated(quoteResponseSchema, await request("quotes", parsed));
  }
  async function deliverCapturedOrder(
    input: KeeriDeliveryRequest,
  ): Promise<KeeriDeliveryAcknowledgement> {
    if (input.merchantScope !== options.merchantScope)
      throw new KeeriCommerceError("INVALID_REQUEST");
    const result = validated(ack, await request("orders", input));
    if (
      result.attemptId !== input.attemptId ||
      result.idempotencyKey !== input.idempotencyKey ||
      result.payloadSha256 !== input.payloadSha256
    )
      throw new KeeriCommerceError("INVALID_RESPONSE");
    return result;
  }
  return { request, quote, reservations, deliverCapturedOrder };
}
