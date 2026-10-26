import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

export interface EnquiryDeliveryConfig {
  apiKey: string;
  from: string;
  to: string;
  adminOrigin: string;
  fingerprint: string;
}

export interface EnquiryAlert {
  jobId: string;
  enquiryId: string;
  kind: "contact" | "project" | "bulk";
  createdAt: Date;
}

export type EnquiryDeliveryOutcome =
  | { status: "accepted"; providerId: string }
  | {
      status: "retryable" | "failed" | "uncertain";
      code: "rate_limited" | "provider_busy" | "provider_unavailable" | "network_error" |
        "invalid_response" | "provider_rejected" | "configuration_error" | "idempotency_conflict";
    };

const templateVersion = "enquiry-alert-v1";
const configError = () => new Error("Invalid enquiry delivery configuration.");

export function loadEnquiryDeliveryConfig(env: Record<string, string | undefined>): EnquiryDeliveryConfig | null {
  if (env.ENQUIRY_DELIVERY_ENABLED === undefined || env.ENQUIRY_DELIVERY_ENABLED === "false") return null;
  if (env.ENQUIRY_DELIVERY_ENABLED !== "true") throw configError();
  const apiKey = env.ENQUIRY_RESEND_API_KEY?.trim() ?? "";
  const from = env.ENQUIRY_MAIL_FROM?.trim() ?? "";
  const to = env.ENQUIRY_MAIL_TO?.trim() ?? "";
  if (!/^[\x21-\x7e]{1,1024}$/.test(apiKey) || !z.email().safeParse(from).success || !z.email().safeParse(to).success) throw configError();
  let origin: URL;
  try { origin = new URL(env.WEB_ORIGIN ?? ""); } catch { throw configError(); }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw configError();
  const host = origin.hostname;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const publicHost = !isIP(host.replace(/^\[|\]$/g, "")) &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) &&
    !/(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(host);
  if (!(origin.protocol === "https:" && publicHost) &&
      !(env.NODE_ENV !== "production" && loopback && ["http:", "https:"].includes(origin.protocol))) throw configError();
  const adminOrigin = origin.origin;
  const fingerprint = createHash("sha256").update(JSON.stringify([templateVersion, apiKey, from, to, adminOrigin])).digest("hex");
  return Object.freeze({ apiKey, from, to, adminOrigin, fingerprint });
}

const alertSchema = z.object({
  jobId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  enquiryId: z.string().regex(/^enq_[a-f0-9-]{36}$/),
  kind: z.enum(["contact", "project", "bulk"]),
  createdAt: z.date(),
});
const acceptedSchema = z.object({ id: z.uuid() }).strict();
const responseByteLimit = 16_384;
const requestDeadlineMs = 10_000;

/** Server-only adapter. An accepted response proves provider acceptance, not inbox delivery. */
export async function sendEnquiryAlert(
  config: EnquiryDeliveryConfig, alert: EnquiryAlert, fetchImpl: typeof fetch = fetch,
): Promise<EnquiryDeliveryOutcome> {
  try {
    // Recheck internal callers and reject a routing change without its corresponding fingerprint.
    const checked = loadEnquiryDeliveryConfig({
      ENQUIRY_DELIVERY_ENABLED: "true", ENQUIRY_RESEND_API_KEY: config.apiKey,
      ENQUIRY_MAIL_FROM: config.from, ENQUIRY_MAIL_TO: config.to, WEB_ORIGIN: config.adminOrigin,
    });
    if (checked?.fingerprint !== config.fingerprint) return { status: "failed", code: "configuration_error" };
    config = checked;
  } catch { return { status: "failed", code: "configuration_error" }; }
  const parsed = alertSchema.safeParse(alert);
  if (!parsed.success) return { status: "failed", code: "provider_rejected" };
  const input = parsed.data;
  const body = JSON.stringify({
    from: config.from,
    to: [config.to],
    subject: "New ShopMaple enquiry",
    text: `Reference: ${input.enquiryId}\nKind: ${input.kind}\nCreated: ${input.createdAt.toISOString()}\n\nOpen the staff inbox: ${config.adminOrigin}/admin`,
  });
  const controller = new AbortController();
  let cancelBody: (() => void) | undefined;
  const invalidResponse = new Error("Invalid provider response.");
  const operation = async (): Promise<EnquiryDeliveryOutcome> => {
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `enquiry/${input.jobId}`,
        },
        body,
      });
      const reader = response.body?.getReader();
      cancelBody = () => { void reader?.cancel().catch(() => {}); };
      if (controller.signal.aborted) { cancelBody(); return { status: "uncertain", code: "network_error" }; }
      // Rejections whose status is conclusive need no provider text. Never retain error bodies.
      if (response.status === 429) return { status: "retryable", code: "rate_limited" };
      if (response.status === 401 || response.status === 403) return { status: "failed", code: "configuration_error" };
      if (response.status >= 500) return { status: "retryable", code: "provider_unavailable" };
      if (response.status >= 400 && response.status < 500 && response.status !== 409) return { status: "failed", code: "provider_rejected" };
      if (response.status !== 200 && response.status !== 409) throw invalidResponse;
      if (!reader) throw invalidResponse;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (controller.signal.aborted) return { status: "uncertain", code: "network_error" };
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > responseByteLimit) throw invalidResponse;
        chunks.push(chunk.value);
      }
      let data: unknown;
      try { data = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); } catch { throw invalidResponse; }
      if (response.status === 409) {
        const name = typeof data === "object" && data !== null && "name" in data ? data.name : null;
        if (name === "concurrent_idempotent_requests") return { status: "retryable", code: "provider_busy" };
        if (name === "invalid_idempotent_request") return { status: "uncertain", code: "idempotency_conflict" };
        throw invalidResponse;
      }
      const accepted = acceptedSchema.safeParse(data);
      if (!accepted.success) throw invalidResponse;
      return { status: "accepted", providerId: accepted.data.id };
    } catch (error) {
      return { status: "uncertain", code: error === invalidResponse ? "invalid_response" : "network_error" };
    } finally { cancelBody?.(); }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<EnquiryDeliveryOutcome>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      cancelBody?.();
      resolve({ status: "uncertain", code: "network_error" });
    }, requestDeadlineMs);
  });
  try { return await Promise.race([operation(), deadline]); }
  finally { clearTimeout(timer); }
}
