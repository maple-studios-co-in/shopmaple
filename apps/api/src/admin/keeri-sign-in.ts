import { z } from "zod";

/**
 * Shop admin sign-in with Keeri accounts (ADMIN_SIGN_IN=keeri).
 *
 * Staff are managed in Keeri: its Roles screen decides who may edit, publish and see enquiries here.
 * This file is the store's half of the conversation: the settings, and the two server-to-server calls
 * (swap a one-time code for who signed in; ask whether somebody still has access).
 * The store never sees a Keeri password, and its own secret travels only in an Authorization header.
 */
export interface KeeriSignInConfig {
  /** Where the store's server calls Keeri (KEERI_ORIGIN). */
  origin: string;
  /** Where a person's browser is sent to sign in (KEERI_ADMIN_ORIGIN, or KEERI_ORIGIN). */
  adminOrigin: string;
  tenantId: string;
  clientId: string;
  secret: string;
  /** Tests stand in for Keeri here. */
  fetch?: typeof fetch;
}
export type AdminSignIn =
  | { mode: "password" }
  | {
      mode: "keeri";
      /** Null when the flag is on but the settings are unusable: nobody is let in through Keeri. */
      ready: KeeriSignInConfig | null;
      /** The one account whose shop password still works, for when Keeri cannot be reached. */
      emergencyEmail: string | null;
    };

/**
 * What the sign-in screen should offer, sent with a staff 401 and with the session itself. Nothing at
 * all while sign-in is by shop password, so those answers stay exactly as they were.
 */
export const signInOffer = (signIn: AdminSignIn) =>
  signIn.mode === "keeri" ? { signIn: { method: "keeri" as const, available: signIn.ready !== null, emergency: signIn.emergencyEmail !== null } } : {};

/** A Keeri session is re-checked once it is this old, so removed access stops within a minute. */
export const keeriRecheckMs = 60_000;
/** If Keeri cannot be reached, a session carries on this long past its last confirmation, then stops. */
export const keeriGraceMs = 10 * 60_000;
const callDeadlineMs = 5_000;
const responseByteLimit = 8_192;

const httpsOrigin = z.string().transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.href === url.origin + "/" && !url.username && !url.password) return url.origin;
  } catch { /* reported below */ }
  ctx.addIssue({ code: "custom", message: "HTTPS origin only" });
  return z.NEVER;
});
const emailSchema = z.email().max(254).transform((value) => value.toLowerCase());
const envSchema = z.object({
  KEERI_ORIGIN: httpsOrigin,
  KEERI_ADMIN_ORIGIN: httpsOrigin.optional(),
  KEERI_TENANT_ID: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  KEERI_SIGN_IN_CLIENT_ID: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  KEERI_SIGN_IN_CLIENT_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
});

/**
 * Password sign-in, exactly as before, unless ADMIN_SIGN_IN=keeri.
 *
 * A wrong or missing setting does not stop the store from starting: the storefront must not go down over
 * a staff sign-in setting. It is named (never its value) in the log, Keeri sign-in answers "unavailable",
 * and shop passwords stay switched off except for the emergency account, so a broken setting can never
 * quietly reopen password sign-in for everybody.
 */
export function loadAdminSignIn(env: Record<string, string | undefined>, warn: (message: string) => void = console.error): AdminSignIn {
  const flag = (env.ADMIN_SIGN_IN ?? "").trim();
  if (flag !== "keeri") {
    if (flag && flag !== "password") warn(`ADMIN_SIGN_IN is "${flag.slice(0, 20)}", which is not a known value; staff sign in with shop passwords.`);
    return { mode: "password" };
  }
  const emergency = emailSchema.safeParse(env.ADMIN_EMERGENCY_EMAIL || undefined);
  if (env.ADMIN_EMERGENCY_EMAIL && !emergency.success) warn("ADMIN_EMERGENCY_EMAIL is not an email address; there is no emergency account.");
  const emergencyEmail = emergency.success ? emergency.data : null;
  const parsed = envSchema.safeParse({ ...pick(env), KEERI_ADMIN_ORIGIN: env.KEERI_ADMIN_ORIGIN || undefined });
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].join(", ");
    warn(`ADMIN_SIGN_IN=keeri but these settings are missing or invalid: ${names}. Nobody can sign in with Keeri until they are fixed.`);
    return { mode: "keeri", ready: null, emergencyEmail };
  }
  const v = parsed.data;
  return {
    mode: "keeri",
    emergencyEmail,
    ready: {
      origin: v.KEERI_ORIGIN, adminOrigin: v.KEERI_ADMIN_ORIGIN ?? v.KEERI_ORIGIN, tenantId: v.KEERI_TENANT_ID,
      clientId: v.KEERI_SIGN_IN_CLIENT_ID, secret: v.KEERI_SIGN_IN_CLIENT_SECRET,
    },
  };
}
const pick = (env: Record<string, string | undefined>) => ({
  KEERI_ORIGIN: env.KEERI_ORIGIN, KEERI_TENANT_ID: env.KEERI_TENANT_ID,
  KEERI_SIGN_IN_CLIENT_ID: env.KEERI_SIGN_IN_CLIENT_ID, KEERI_SIGN_IN_CLIENT_SECRET: env.KEERI_SIGN_IN_CLIENT_SECRET,
});

/** What Keeri says a person may do here, as the shop admin's own two roles and one flag. */
export interface KeeriStaff {
  keeriUserId: string;
  name: string;
  email: string;
  role: "editor" | "publisher";
  canManageEnquiries: boolean;
}
export type KeeriAnswer =
  | { status: "allowed"; staff: KeeriStaff }
  /** Keeri answered, and the answer is no: disabled, role changed, or a role without Edit or Publish. */
  | { status: "denied" }
  /** The code was wrong, spent or expired (exchange only). */
  | { status: "invalid" }
  /** Keeri could not be reached or did not answer properly. Never treated as a no, and never as a yes. */
  | { status: "unavailable" };

const personSchema = z.object({
  tenantId: z.string(),
  user: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), name: z.string().max(200), email: emailSchema }),
  permissions: z.array(z.string().max(40)).max(20),
});
const accessSchema = z.union([z.object({ access: z.literal(false) }), personSchema.extend({ access: z.literal(true) })]);

/**
 * Keeri's three permissions as the shop admin's roles. Publish includes editing. Enquiries on their own
 * open nothing here, because every shop-admin account can edit drafts: such a person is turned away.
 */
export function staffFromKeeri(person: z.infer<typeof personSchema>, tenantId: string): KeeriStaff | null {
  // Another company's answer is not an answer about this store's staff.
  if (person.tenantId !== tenantId) return null;
  const may = (key: string) => person.permissions.includes(key);
  if (!may("publish") && !may("edit")) return null;
  return {
    keeriUserId: person.user.id, name: person.user.name.trim(), email: person.user.email,
    role: may("publish") ? "publisher" : "editor", canManageEnquiries: may("enquiries"),
  };
}

async function call(config: KeeriSignInConfig, path: string, body: object): Promise<{ status: number; json: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), callDeadlineMs);
  try {
    const response = await (config.fetch ?? fetch)(`${config.origin}${path}`, {
      method: "POST",
      // The secret goes in this header only. It is never put in an address, where it would reach logs.
      headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > responseByteLimit) return null;
    return { status: response.status, json: JSON.parse(text) as unknown };
  } catch {
    // Network failure, timeout, a redirect or a body that is not JSON: no detail is kept, since an
    // error from fetch can quote the request.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Swap the one-time code a person came back with for who they are. */
export async function exchangeKeeriCode(config: KeeriSignInConfig, code: string, redirectUri: string): Promise<KeeriAnswer> {
  const answer = await call(config, "/api/app-sign-in/token", { code, redirect_uri: redirectUri });
  if (!answer) return { status: "unavailable" };
  if (answer.status === 400) return { status: "invalid" };
  if (answer.status === 403) return { status: "denied" };
  const person = answer.status === 200 ? personSchema.safeParse(answer.json) : null;
  if (!person?.success) return { status: "unavailable" };
  const staff = staffFromKeeri(person.data, config.tenantId);
  return staff ? { status: "allowed", staff } : { status: "denied" };
}

/** Ask Keeri whether somebody signed in earlier still has access, and with what. */
export async function checkKeeriAccess(config: KeeriSignInConfig, keeriUserId: string): Promise<KeeriAnswer> {
  const answer = await call(config, "/api/app-sign-in/access", { user_id: keeriUserId });
  const parsed = answer?.status === 200 ? accessSchema.safeParse(answer.json) : null;
  if (!parsed?.success) return { status: "unavailable" };
  if (!parsed.data.access) return { status: "denied" };
  // An answer about a different person is not an answer.
  if (parsed.data.user.id !== keeriUserId) return { status: "unavailable" };
  const staff = staffFromKeeri(parsed.data, config.tenantId);
  return staff ? { status: "allowed", staff } : { status: "denied" };
}
