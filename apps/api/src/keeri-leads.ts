import { createHash } from "node:crypto";
import { z } from "zod";

/** Enquiries that are people waiting for an answer. Newsletter signups and reviews never become leads. */
export const keeriLeadKinds = ["contact", "project", "bulk"] as const;
export type KeeriLeadKind = (typeof keeriLeadKinds)[number];
export const isKeeriLeadKind = (kind: string): kind is KeeriLeadKind => (keeriLeadKinds as readonly string[]).includes(kind);

export interface KeeriLeadsConfig {
  origin: string;
  token: string;
  /** Base of the Keeri admin, for "Open in Keeri" links; KEERI_ORIGIN unless KEERI_ADMIN_ORIGIN is set. */
  adminOrigin: string;
  fingerprint: string;
}

export interface KeeriLead {
  enquiryId: string;
  kind: KeeriLeadKind;
  name: string;
  email: string;
  phone: string;
  message: string;
  context: Partial<Record<(typeof contextKeys)[number], string>>;
  submittedAt: Date;
}

export type KeeriLeadOutcome =
  | { status: "accepted"; leadId: string; outcome: "created" | "matched"; leadPath: string }
  | {
      status: "retryable" | "failed" | "uncertain";
      code: "rate_limited" | "provider_unavailable" | "network_error" | "invalid_response" |
        "provider_rejected" | "configuration_error" | "idempotency_conflict";
    };

const contextKeys = ["product", "variant", "sku", "pincode"] as const;
const protocolVersion = "keeri-lead-v1";
const requestDeadlineMs = 10_000;
const responseByteLimit = 16_384;

const httpsOrigin = z.string().transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.href === url.origin + "/" && !url.username && !url.password) return url.origin;
  } catch { /* reported below */ }
  ctx.addIssue({ code: "custom", message: "HTTPS origin only" });
  return z.NEVER;
});
const envSchema = z.object({
  KEERI_ORIGIN: httpsOrigin,
  KEERI_COMMERCE_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  KEERI_ADMIN_ORIGIN: httpsOrigin.optional(),
});

/**
 * Null unless KEERI_LEADS_ENABLED=true. Once enabled, a missing or unsafe key stops startup and is
 * named (never its value), so a half-configured store never quietly drops leads.
 */
export function loadKeeriLeadsConfig(env: Record<string, string | undefined>): KeeriLeadsConfig | null {
  const flag = env.KEERI_LEADS_ENABLED;
  if (flag === undefined || flag === "false") return null;
  if (flag !== "true") throw new Error("KEERI_LEADS_ENABLED must be true or false");
  const parsed = envSchema.safeParse({ KEERI_ORIGIN: env.KEERI_ORIGIN, KEERI_COMMERCE_TOKEN: env.KEERI_COMMERCE_TOKEN, KEERI_ADMIN_ORIGIN: env.KEERI_ADMIN_ORIGIN || undefined });
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "")))].filter(Boolean).sort();
    throw new Error(`KEERI_LEADS_ENABLED=true requires valid values for: ${keys.join(", ")}`);
  }
  const { KEERI_ORIGIN: origin, KEERI_COMMERCE_TOKEN: token, KEERI_ADMIN_ORIGIN: adminOrigin = origin } = parsed.data;
  // Bound to where leads go, not to the token: rotating the credential must not strand queued leads,
  // and Keeri's idempotency key makes a resend to the same Keeri safe.
  const fingerprint = createHash("sha256").update(JSON.stringify([protocolVersion, origin])).digest("hex");
  return Object.freeze({ origin, token, adminOrigin, fingerprint });
}

const leadSchema = z.object({
  enquiryId: z.string().regex(/^enq_[a-f0-9-]{36}$/),
  kind: z.enum(keeriLeadKinds),
  name: z.string().max(100),
  email: z.email().max(254),
  phone: z.string().max(30),
  message: z.string().max(5000),
  context: z.record(z.string(), z.unknown()),
  submittedAt: z.date().refine(date => !Number.isNaN(date.getTime())),
});
const remoteId = z.string().regex(/^[A-Za-z0-9_:-]{1,200}$/);
const acceptedSchema = z.object({
  version: z.literal(1),
  leadId: remoteId,
  outcome: z.enum(["created", "matched"]),
  leadPath: z.string().regex(/^\/leads\/[A-Za-z0-9_:-]{1,200}$/),
}).strict();

/** The exact request body. Context keys that are absent or empty are left out, never sent as "" or null. */
export function keeriLeadBody(lead: KeeriLead) {
  const context: Record<string, string> = {};
  for (const key of contextKeys) {
    const value = lead.context[key];
    if (typeof value === "string" && value !== "") context[key] = value;
  }
  return {
    version: 1, enquiryId: lead.enquiryId, kind: lead.kind, name: lead.name, email: lead.email,
    phone: lead.phone, message: lead.message, context, submittedAt: lead.submittedAt.toISOString(),
  };
}

function recheck(config: KeeriLeadsConfig) {
  try {
    const checked = loadKeeriLeadsConfig({ KEERI_LEADS_ENABLED: "true", KEERI_ORIGIN: config.origin, KEERI_COMMERCE_TOKEN: config.token, KEERI_ADMIN_ORIGIN: config.adminOrigin });
    return checked?.fingerprint === config.fingerprint ? checked : null;
  } catch { return null; }
}

/**
 * Server-only: one bounded POST of one lead. Only a status code or a fixed outcome comes back;
 * no request or response text is returned or logged, since both may hold customer details.
 */
export async function sendKeeriLead(config: KeeriLeadsConfig, lead: KeeriLead, fetchImpl: typeof fetch = fetch, timeoutMs = requestDeadlineMs): Promise<KeeriLeadOutcome> {
  const checked = recheck(config);
  if (!checked) return { status: "failed", code: "configuration_error" };
  if (!leadSchema.safeParse(lead).success) return { status: "failed", code: "provider_rejected" };
  const body = JSON.stringify(keeriLeadBody(lead));
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  const invalid = new Error("invalid");
  const operation = async (): Promise<KeeriLeadOutcome> => {
    try {
      const response = await fetchImpl(new URL("/api/storefront/leads", checked.origin), {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: {
          Accept: "application/json", "Content-Type": "application/json",
          Authorization: `Bearer ${checked.token}`, "Idempotency-Key": lead.enquiryId,
        },
        body,
      });
      reader = response.body?.getReader();
      if (controller.signal.aborted) return { status: "uncertain", code: "network_error" };
      // The status alone decides a refusal; error bodies are never read.
      if (response.status === 401 || response.status === 403) return { status: "failed", code: "configuration_error" };
      if (response.status === 409) return { status: "failed", code: "idempotency_conflict" };
      if (response.status === 408 || response.status === 429) return { status: "retryable", code: "rate_limited" };
      if (response.status >= 500) return { status: "retryable", code: "provider_unavailable" };
      if (response.status >= 400) return { status: "failed", code: "provider_rejected" };
      if (response.status !== 200 || !reader || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw invalid;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (controller.signal.aborted) return { status: "uncertain", code: "network_error" };
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > responseByteLimit) throw invalid;
        chunks.push(chunk.value);
      }
      let data: unknown;
      try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); } catch { throw invalid; }
      const accepted = acceptedSchema.safeParse(data);
      if (!accepted.success) throw invalid;
      return { status: "accepted", leadId: accepted.data.leadId, outcome: accepted.data.outcome, leadPath: accepted.data.leadPath };
    } catch (error) {
      return { status: "uncertain", code: error === invalid ? "invalid_response" : "network_error" };
    } finally { cancel(); }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<KeeriLeadOutcome>(resolve => {
    timer = setTimeout(() => { controller.abort(); cancel(); resolve({ status: "uncertain", code: "network_error" }); }, timeoutMs);
  });
  try { return await Promise.race([operation(), deadline]); }
  finally { clearTimeout(timer); }
}
