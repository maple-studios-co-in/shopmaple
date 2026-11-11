import { signInCodeTtlMinutes, type SignInPurpose } from "@shopmaple/contracts/account";
import { loadEnquiryDeliveryConfig, sendTransactionalEmail, type EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import { maskEmail } from "./security.js";

export interface AccountRuntimeConfig {
  codeSecret: string;
  /** Production rules apply: anything but NODE_ENV=development or test, unset included. */
  production: boolean;
  /** The sign-in code sender; null only outside production (codes are printed instead). */
  email: EnquiryDeliveryConfig | null;
}

/**
 * CUSTOMER_ACCOUNTS_ENABLED: `true` turns customer accounts on, `false` off. Unset, they are on only when NODE_ENV is
 * `development` or `test`; any other NODE_ENV, unset included, gets production's rules (fail closed). In production,
 * accounts that are on also need:
 * - ACCOUNT_CODE_SECRET (32–256 characters), which keys the code and network hashes;
 * - a mail sender (ORDER_* or ENQUIRY_*), or codes could never arrive;
 * - API_TRUST_PROXY_LOOPBACK=true behind the local proxy, or every visitor would count as one network.
 * Anything missing stops the API at start-up. Values are never logged.
 */
export function loadAccountConfig(env: Record<string, string | undefined>): AccountRuntimeConfig | null {
  const flag = env.CUSTOMER_ACCOUNTS_ENABLED?.trim() || undefined;
  if (flag !== undefined && flag !== "true" && flag !== "false")
    throw new Error("CUSTOMER_ACCOUNTS_ENABLED must be true or false");
  const production = env.NODE_ENV !== "development" && env.NODE_ENV !== "test";
  if (!(flag === undefined ? !production : flag === "true")) return null;
  const secret = env.ACCOUNT_CODE_SECRET?.trim() ?? "";
  if (secret && (secret.length < 32 || secret.length > 256)) throw new Error("ACCOUNT_CODE_SECRET must be 32 to 256 characters");
  if (!secret && production)
    throw new Error("CUSTOMER_ACCOUNTS_ENABLED=true requires ACCOUNT_CODE_SECRET (32 or more random characters) unless NODE_ENV is development or test");
  const email = loadAccountEmail(env);
  if (production && !email)
    throw new Error("CUSTOMER_ACCOUNTS_ENABLED=true requires ORDER_RESEND_API_KEY, ORDER_MAIL_FROM and ORDER_MAIL_TO (or their ENQUIRY_* values) to email sign-in codes");
  if (production && env.API_TRUST_PROXY_LOOPBACK !== "true")
    throw new Error("CUSTOMER_ACCOUNTS_ENABLED=true requires API_TRUST_PROXY_LOOPBACK=true (the API behind the local proxy); without it every visitor counts as one network");
  return { codeSecret: secret || developmentCodeKey, production, email };
}
// Outside production only, so codes survive a `tsx watch` restart. Production refuses to start without its own value.
const developmentCodeKey = "local development only, never production";

/** The order sender: each ORDER_* value falls back to its ENQUIRY_* one (as checkout's order email does). Null when
 * none is set; a partial or invalid set fails loudly instead of silently dropping sign-in codes. */
export function loadAccountEmail(env: Record<string, string | undefined>): EnquiryDeliveryConfig | null {
  const pick = (own: string, shared: string) => env[own]?.trim() || env[shared]?.trim() || "";
  const apiKey = pick("ORDER_RESEND_API_KEY", "ENQUIRY_RESEND_API_KEY");
  const from = pick("ORDER_MAIL_FROM", "ENQUIRY_MAIL_FROM");
  const to = pick("ORDER_MAIL_TO", "ENQUIRY_MAIL_TO");
  if (!apiKey && !from && !to) return null;
  const invalid = () =>
    new Error("Customer accounts need valid ORDER_RESEND_API_KEY, ORDER_MAIL_FROM and ORDER_MAIL_TO (or their ENQUIRY_* values) and WEB_ORIGIN to email sign-in codes");
  try {
    const config = loadEnquiryDeliveryConfig({
      ENQUIRY_DELIVERY_ENABLED: "true",
      ENQUIRY_RESEND_API_KEY: apiKey,
      ENQUIRY_MAIL_FROM: from,
      ENQUIRY_MAIL_TO: to,
      WEB_ORIGIN: env.WEB_ORIGIN,
      NODE_ENV: env.NODE_ENV,
    });
    if (!config) throw invalid();
    return config;
  } catch {
    throw invalid();
  }
}

/** Plain and short. The code stays out of the subject, which lock screens and notifications show. The wording follows
 * why the code was asked for; a sign-up for an address that already has a password says so here (never on the page). */
export function signInCodeEmail(code: string, origin: string, purpose: SignInPurpose = "sign-in", hasPassword = false) {
  const lasts = `It works once, for ${signInCodeTtlMinutes} minutes.`;
  const sign = ["", "Maple Furnishers", origin];
  if (purpose === "sign-up")
    return {
      subject: hasPassword ? "You already have a Maple Furnishers account" : "Confirm your email for Maple Furnishers",
      text: [
        hasPassword
          ? `You already have a Maple account with this email. Enter ${code} to sign in; the password you just chose replaces your old one.`
          : `Your code is ${code}. Enter it to finish creating your Maple account.`,
        "",
        lasts,
        "If you didn't ask for this, you can ignore this email: nothing changes without the code.",
        ...sign,
      ].join("\n"),
    };
  if (purpose === "reset")
    return {
      subject: "Reset your Maple Furnishers password",
      text: [
        `Your code is ${code}. Enter it with your new password to reset it.`,
        "",
        lasts,
        "If you didn't ask to reset your password, you can ignore this email: your password stays as it is.",
        ...sign,
      ].join("\n"),
    };
  return {
    subject: "Your Maple Furnishers sign-in code",
    text: [
      `Your sign-in code is ${code}`,
      "",
      lasts,
      "If you didn't ask to sign in, you can ignore this email: nobody can sign in without the code.",
      ...sign,
    ].join("\n"),
  };
}

export type SignInCodeMessage = { challengeId: string; to: string; code: string; purpose?: SignInPurpose; hasPassword?: boolean };
/**
 * Delivers a sign-in code through the existing Resend helper, keyed to its challenge so a retry never sends twice.
 * Without a mail service a development API prints the code (with a masked email) to its console instead; production
 * never prints a code. Never throws: the sign-in answer has already gone, and a lost email just means asking again.
 */
export function createSignInCodeSender(
  email: EnquiryDeliveryConfig | null,
  options: { production: boolean; fetch?: typeof fetch; log?: (line: string) => void },
) {
  const log = options.log ?? ((line: string) => console.info(line));
  return async ({ challengeId, to, code, purpose, hasPassword }: SignInCodeMessage) => {
    if (email) {
      const outcome = await sendTransactionalEmail(email, `signin/${challengeId}`, { to, ...signInCodeEmail(code, email.adminOrigin, purpose, hasPassword) }, options.fetch)
        .catch(() => ({ status: "uncertain", code: "network_error" }) as const);
      // The provider's failure category only (e.g. rate_limited); never the address or the code.
      if (outcome.status !== "accepted") log(`Sign-in email was not accepted by the mail service: ${outcome.code}`);
      return;
    }
    if (options.production) {
      log("Sign-in code email is not configured; no code was sent");
      return;
    }
    log(`[accounts] development sign-in code for ${maskEmail(to)}: ${code} (no mail service configured; never printed in production)`);
  };
}
