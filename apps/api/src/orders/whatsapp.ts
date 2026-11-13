import {
  orderConfirmationTemplateName,
  orderConfirmationVariables,
  type OrderConfirmationTemplatePayload,
} from "@shopmaple/contracts/whatsapp";
import { z } from "zod";

/**
 * WhatsApp order confirmations through Meta's WhatsApp Cloud API (owner, 11 Nov 2026; docs/whatsapp-order-confirmation.md).
 *
 * Not connected, and not to be: Keeri sends every WhatsApp order message (owner, 13 Nov 2026) through the WhatsApp
 * connection it already runs, and the store only collects the buyer's consent at checkout (orders/service.ts). With no
 * WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_API_VERSION `loadWhatsAppConfig` returns null, and
 * nothing calls the sender. Do not set those on the store.
 */
export interface WhatsAppConfig {
  /** The WhatsApp Business phone number's id in Meta (not the phone number). */
  readonly phoneNumberId: string;
  /** The approved template's language code, "en" unless WHATSAPP_TEMPLATE_LANGUAGE says otherwise. */
  readonly language: string;
  /** The Graph API version, e.g. "v23.0". */
  readonly apiVersion: string;
  /** Not enumerable, so logging or serialising the config never shows it. */
  readonly accessToken: string;
}

export type WhatsAppDeliveryOutcome =
  | { status: "accepted"; providerId: string }
  | {
      status: "retryable" | "failed" | "uncertain";
      code: "rate_limited" | "provider_unavailable" | "network_error" | "invalid_response" | "provider_rejected" |
        "configuration_error" | "recipient_rejected";
    };

const required = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_API_VERSION"] as const;

/**
 * The WhatsApp settings, or null when none of WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_API_VERSION is
 * set. Throws when only some are set or one is malformed. Errors name the setting, never its value.
 */
export function loadWhatsAppConfig(env: Record<string, string | undefined>): WhatsAppConfig | null {
  const read = (name: string) => env[name]?.trim() ?? "";
  const missing = required.filter((name) => !read(name));
  if (missing.length === required.length) return null;
  if (missing.length)
    throw new Error(`WhatsApp is only partly configured: set ${missing.join(" and ")} too, or remove every WHATSAPP_ setting.`);
  const accessToken = read("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = read("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = read("WHATSAPP_API_VERSION");
  const language = read("WHATSAPP_TEMPLATE_LANGUAGE") || "en";
  if (!/^[\x21-\x7e]{20,4096}$/.test(accessToken)) throw new Error("WHATSAPP_ACCESS_TOKEN is not a valid access token.");
  if (!/^[0-9]{5,32}$/.test(phoneNumberId))
    throw new Error("WHATSAPP_PHONE_NUMBER_ID must be the numeric phone number ID from WhatsApp Manager, not the phone number.");
  if (!/^v[0-9]{1,3}\.[0-9]$/.test(apiVersion)) throw new Error('WHATSAPP_API_VERSION must be a Graph API version such as "v23.0".');
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language))
    throw new Error('WHATSAPP_TEMPLATE_LANGUAGE must be a template language code such as "en" or "en_US".');
  const config = { phoneNumberId, language, apiVersion };
  Object.defineProperty(config, "accessToken", { value: accessToken, enumerable: false });
  return Object.freeze(config) as WhatsAppConfig;
}

/** An Indian mobile number as the Cloud API's `to`: "919876543210". Spaces, dashes, brackets and a leading +91, 91 or 0
 * are accepted; anything else is null. */
export function whatsAppRecipient(phone: string): string | null {
  const digits = phone.replace(/[\s().-]/g, "");
  const match = /^(?:\+91|91|0)?([6-9][0-9]{9})$/.exec(digits);
  return match ? `91${match[1]}` : null;
}

const parameterText = (max: number) =>
  z.string().min(1).max(max).refine((text) => !/[\n\r\t]/.test(text) && !/ {5,}/.test(text) && text === text.trim());
const payloadSchema = z
  .object({
    name: z.literal(orderConfirmationTemplateName),
    language: z.object({ code: z.string() }).strict(),
    components: z.tuple([
      z.object({
        type: z.literal("header"),
        parameters: z.tuple([z.object({ type: z.literal("image"), image: z.object({ link: z.url({ protocol: /^https$/ }).max(1000) }).strict() }).strict()]),
      }).strict(),
      z.object({
        type: z.literal("body"),
        parameters: z.array(z.object({ type: z.literal("text"), text: parameterText(200) }).strict()).length(orderConfirmationVariables.length),
      }).strict(),
      z.object({
        type: z.literal("button"),
        sub_type: z.literal("url"),
        index: z.literal("0"),
        // "View order" ends in the Maple order number: /account/orders/MF-10482.
        parameters: z.tuple([z.object({ type: z.literal("text"), text: z.string().regex(/^MF-[1-9][0-9]{0,9}$/) }).strict()]),
      }).strict(),
    ]),
  })
  .strict();
const acceptedSchema = z.object({ messages: z.array(z.object({ id: z.string().regex(/^[\x21-\x7e]{1,512}$/) })).length(1) });
const errorSchema = z.object({ error: z.object({ code: z.number().int() }) });

// Graph API error codes (developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes), by what a retry can do.
const rateLimited = new Set([4, 17, 341, 80007, 130429, 131056]);
const unavailable = new Set([1, 2, 131000, 131016, 133004]);
const misconfigured = new Set([0, 3, 10, 190, 368, 131005, 131031, 131042, 132001, 132015, 132016, 133010]);
const recipient = new Set([131021, 131026, 131030, 131050]);
const responseByteLimit = 16_384;
const requestDeadlineMs = 8_000;

/**
 * Sends one order confirmation (`orderConfirmationWhatsApp(...).template` from @shopmaple/contracts/whatsapp) to `to`,
 * an Indian mobile number, in the configured template language. An accepted answer means Meta took the message, not
 * that it was delivered: delivery and later failures arrive on Meta's webhook.
 *
 * Unused (see the top of this file). The Cloud API takes no idempotency key, so an `uncertain` outcome (a timeout, a
 * broken answer) may have been delivered and must not be resent automatically; rejected or unknown templates come back
 * as `failed` / `configuration_error`. Keeri's sender follows the same rules.
 * Error bodies are read only for Meta's error code and never kept or returned; nothing here logs.
 */
export async function sendOrderConfirmationWhatsApp(
  config: WhatsAppConfig,
  to: string,
  payload: OrderConfirmationTemplatePayload,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = requestDeadlineMs }: { timeoutMs?: number } = {},
): Promise<WhatsAppDeliveryOutcome> {
  if (!config.accessToken || !/^[0-9]{5,32}$/.test(config.phoneNumberId) || !/^v[0-9]{1,3}\.[0-9]$/.test(config.apiVersion))
    return { status: "failed", code: "configuration_error" };
  const recipientDigits = whatsAppRecipient(to);
  if (!recipientDigits) return { status: "failed", code: "recipient_rejected" };
  const template = payloadSchema.safeParse(payload);
  if (!template.success) return { status: "failed", code: "provider_rejected" };
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientDigits,
    type: "template",
    template: { ...template.data, language: { code: config.language } },
  });
  const controller = new AbortController();
  let cancelBody: (() => void) | undefined;
  const invalidResponse = new Error("Invalid provider response.");
  const operation = async (): Promise<WhatsAppDeliveryOutcome> => {
    try {
      const response = await fetchImpl(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
        body,
      });
      const reader = response.body?.getReader();
      cancelBody = () => { void reader?.cancel().catch(() => {}); };
      if (controller.signal.aborted) return { status: "uncertain", code: "network_error" };
      const ok = response.status === 200;
      if (!ok && (response.status < 400 || response.status > 599)) throw invalidResponse;
      let data: unknown = null;
      if (reader) {
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
        try { data = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); } catch { data = null; }
      }
      if (ok) {
        const accepted = acceptedSchema.safeParse(data);
        if (!accepted.success) throw invalidResponse;
        return { status: "accepted", providerId: accepted.data.messages[0]!.id };
      }
      // Meta answers most errors with 400 and a code; the code decides, then the status.
      const code = errorSchema.safeParse(data).data?.error.code;
      if (code !== undefined) {
        if (rateLimited.has(code)) return { status: "retryable", code: "rate_limited" };
        if (unavailable.has(code)) return { status: "retryable", code: "provider_unavailable" };
        if (misconfigured.has(code) || (code >= 200 && code <= 299)) return { status: "failed", code: "configuration_error" };
        if (recipient.has(code)) return { status: "failed", code: "recipient_rejected" };
      }
      if (response.status === 429) return { status: "retryable", code: "rate_limited" };
      if (response.status >= 500) return { status: "retryable", code: "provider_unavailable" };
      if (response.status === 401 || response.status === 403) return { status: "failed", code: "configuration_error" };
      return { status: "failed", code: "provider_rejected" };
    } catch (error) {
      return { status: "uncertain", code: error === invalidResponse ? "invalid_response" : "network_error" };
    } finally { cancelBody?.(); }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<WhatsAppDeliveryOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      cancelBody?.();
      resolve({ status: "uncertain", code: "network_error" });
    }, timeoutMs);
  });
  try { return await Promise.race([operation(), deadline]); }
  finally { clearTimeout(timer); }
}
