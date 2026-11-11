const base = "https://maple.invalid";

/**
 * Where to send someone after they sign in: a path on this site only. `?next=/checkout` comes back from the checkout's
 * "Already have an account? Sign in"; anything that could leave the site ("//evil.example", "https://…", "/\evil.example",
 * a bare word) or is not a string falls back to the account overview. The result is checked again once normalised:
 * dot segments ("/.//evil.example", "/%2e%2e//evil.example") collapse into "//evil.example" only after parsing, and a
 * browser reads that as another site (security review, 11 Nov 2026).
 */
export function safeNextPath(raw: unknown, fallback = "/account"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    const path = url.pathname + url.search + url.hash;
    return path.startsWith("//") || path.startsWith("/\\") ? fallback : path;
  } catch {
    return fallback;
  }
}

/** The sign-in pages (Figma 392:1652 login, 392:1697 sign-up, and the password reset drawn to them). */
export type AuthPage = "login" | "sign-up" | "forgot-password";
const authPages = /^\/account\/(?:login|sign-up|forgot-password)(?:[/?#]|$)/;

/** Where a sign-in page returns to: a safe path that is not itself a sign-in page (which would only send it back). */
export function safeAuthNext(raw: unknown): string {
  const next = safeNextPath(raw);
  return authPages.test(next) ? "/account" : next;
}

/** A sign-in page that comes back to `next` afterwards; the overview, the default, needs no query. */
export function authHref(page: AuthPage, next = "/account", preview = false): string {
  const query = new URLSearchParams();
  const back = safeAuthNext(next);
  if (back !== "/account") query.set("next", back);
  if (preview) query.set("preview", "design");
  const search = query.toString();
  return `/account/${page}${search ? `?${search}` : ""}`;
}
