"use client";
import { useEffect, useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import type { StorefrontContent } from "@shopmaple/contracts";
import { ContentEditor } from "./editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminRoot } from "./admin-root";
import { Notice, Skeleton } from "./crm-primitives";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";
export type StaffSession = {
  user: {
    id: string;
    email: string;
    /** `viewer` opens and previews but cannot save; `none` is somebody whose only access is the Enquiries screen. */
    role: "none" | "viewer" | "editor" | "publisher";
    canManageEnquiries?: boolean;
    /** True for the one password account kept for when Keeri cannot be reached. */
    emergency?: boolean;
  };
  csrfToken: string;
};
/** What the sign-in screen offers. `password` is the screen as it was before staff could sign in with Keeri. */
type SignInOptions = { method: "password" } | { method: "keeri"; available: boolean; emergency: boolean; /** The emergency password can be reset by an emailed link. */ reset: boolean };
/**
 * The API says what to offer in `signIn`, on the session and on its "sign in first" answer, only while
 * Keeri sign-in is on. Anything but an exact Keeri answer leaves the password form.
 */
function parseSignInOptions(body: unknown): SignInOptions {
  const value = body && typeof body === "object" ? (body as { signIn?: unknown }).signIn : null;
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (candidate.method !== "keeri" || typeof candidate.available !== "boolean" || typeof candidate.emergency !== "boolean") return { method: "password" };
  return { method: "keeri", available: candidate.available, emergency: candidate.emergency, reset: candidate.emergency && candidate.reset === true };
}
/** Keeri has not answered for over ten minutes, so the store cannot tell whether this person still has access. */
const keeriUnreachable = "Keeri can't be reached right now, so we couldn't confirm your access. Try again in a minute. If it stays down, use Emergency access.";
const isUnconfirmed = (body: unknown) => Boolean(body && typeof body === "object" && (body as { code?: unknown }).code === "ADMIN_ACCESS_UNCONFIRMED");
/** Why a trip to Keeri and back did not sign the person in (the callback's `?sign_in=`). */
const signInOutcomes: Record<string, string> = {
  denied: "Your Keeri account doesn't have access to the shop admin. Ask whoever manages roles in Keeri to tick Edit or Publish for your role under ShopMaple website admin.",
  failed: "Sign in didn't complete. Please try again.",
  unavailable: "We couldn't reach Keeri. Please try again in a minute.",
};
function parseSession(value: unknown): StaffSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StaffSession>;
  const user = candidate.user;
  if (
    !user ||
    typeof user.id !== "string" ||
    !user.id ||
    user.id.length > 100 ||
    typeof user.email !== "string" ||
    user.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
    !["none", "viewer", "editor", "publisher"].includes(user.role) ||
    (user.role === "none" && user.canManageEnquiries !== true) ||
    typeof candidate.csrfToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(candidate.csrfToken)
  )
    return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      canManageEnquiries: user.canManageEnquiries === true,
      ...(user.emergency === true ? { emergency: true } : {}),
    },
    csrfToken: candidate.csrfToken,
  };
}
export function AdminDashboard({ initialContent }: { initialContent: StorefrontContent }) {
  const adminRequest = useAdminRequest();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<SignInOptions>({ method: "password" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The emailed link to choose a new emergency password arrives as /admin#reset=…: the part after the # never
  // reaches a server, and it is taken out of the address as soon as it has been read.
  const [resetToken, setResetToken] = useState<string | null>(null);
  useEffect(() => {
    const match = /^#reset=([a-f0-9]{64})$/.exec(window.location.hash);
    if (!match) return;
    setResetToken(match[1]!);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  // Back from Keeri without a session: say why, once, and take the reason out of the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("sign_in")) return;
    const outcome = signInOutcomes[url.searchParams.get("sign_in") ?? ""];
    url.searchParams.delete("sign_in");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (outcome) setError(outcome);
  }, []);
  useEffect(() => {
    let active = true;
    void adminRequest("/api/admin/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (active && response.ok) {
          const body: unknown = await response.json();
          const verified = parseSession(body);
          if (!active) return;
          setOptions(parseSignInOptions(body));
          if (verified) setSession(verified);
          else setError("We couldn't verify your session. Please sign in again.");
        } else if (active && response.status !== 401) setError("We couldn't check your session. Please try signing in.");
        else if (active) {
          const body: unknown = await response.json().catch(() => null);
          if (!active) return;
          setOptions(parseSignInOptions(body));
          if (isUnconfirmed(body)) setError(keeriUnreachable);
        }
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setError(error instanceof AdminRequestTimeout ? "Checking your session timed out. Please try signing in." : "We couldn't connect. Check your connection and try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adminRequest]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const passwordInput = form.elements.namedItem("password") as HTMLInputElement;
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/login", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: passwordInput.value }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many sign-in attempts. Please wait before trying again."
          : response.status === 401 ? "Check your email or password and try again." : "Sign in is unavailable. Please try again.");
        return;
      }
      const verified = parseSession(await response.json());
      if (verified) setSession(verified);
      else setError("Sign in returned an invalid session. Please try again.");
    } catch (error) {
      setError(error instanceof AdminRequestTimeout ? "Sign in timed out. Please try again." : "We couldn't connect. Check your connection and try again.");
    } finally {
      passwordInput.value = "";
      setBusy(false);
    }
  }
  // A request was refused mid-session. Usually the session ran out; but if Keeri is down, say that instead,
  // because the answer is to wait or use Emergency access, not to sign in again.
  async function explainSignedOut() {
    try {
      const response = await adminRequest("/api/admin/session", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401 && isUnconfirmed(await response.json().catch(() => null))) setError(keeriUnreachable);
    } catch { /* the "session has expired" message already shown stands */ }
  }
  async function requestReset() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await adminRequest("/api/admin/emergency/reset-request", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (response.status === 202) setNotice("If the emergency account is set up, a reset link has been emailed to it. It works once, for 15 minutes.");
      else setError(response.status === 429 ? "Too many requests. Please wait before asking again." : "We couldn't send a reset link. Please try again.");
    } catch (error) {
      setError(error instanceof AdminRequestTimeout ? "Sending the reset link timed out. Please try again." : "We couldn't connect. Check your connection and try again.");
    } finally { setBusy(false); }
  }
  async function chooseNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = event.currentTarget.elements;
    const chosen = fields.namedItem("new-password") as HTMLInputElement, repeated = fields.namedItem("confirm-password") as HTMLInputElement;
    setError(""); setNotice("");
    if (chosen.value.length < 14) return setError("Choose a password of at least 14 characters.");
    if (chosen.value !== repeated.value) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const response = await adminRequest("/api/admin/emergency/reset", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: chosen.value }),
      });
      if (response.status === 204) { setResetToken(null); setNotice("The emergency password has been changed. Sign in with it under Emergency access."); }
      else if (response.status === 429) setError("Too many attempts. Please wait before trying again.");
      else { setResetToken(null); setError("This reset link is not valid any more. Ask for a new one under Emergency access."); }
    } catch (error) {
      setError(error instanceof AdminRequestTimeout ? "Changing the password timed out. Please try again." : "We couldn't connect. Check your connection and try again.");
    } finally {
      chosen.value = ""; repeated.value = "";
      setBusy(false);
    }
  }
  if (loading)
    return (
      <AdminRoot aria-label="Store administration" className="grid min-h-dvh place-items-center bg-background p-6">
        <div aria-busy="true" className="grid w-full max-w-sm gap-4">
          <Skeleton rows={3} />
          <p role="status" className="text-center text-xs text-muted-foreground">Checking your session</p>
        </div>
      </AdminRoot>
    );
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/logout", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": session!.csrfToken } });
      if (response.ok || response.status === 401) setSession(null);
      else setError("We couldn't sign you out. Please try again.");
    } catch (error) {
      setError(error instanceof AdminRequestTimeout ? "Sign out timed out. Please try again." : "We couldn't sign you out. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  if (session)
    return (
      <AdminRoot aria-label="Store administration" className="bg-background">
        {error && (
          <div className="px-4 pt-4 sm:px-6">
            <Notice tone="error"><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" /><span>{error}</span></Notice>
          </div>
        )}
        <ContentEditor session={session} initialContent={initialContent} account={{ onSignOut: () => void logout(), busy }}
          onExpired={() => { setSession(null); setError("Your session has expired. Sign in again to continue."); void explainSignedOut(); }} />
      </AdminRoot>
    );
  const keeri = options.method === "keeri" ? options : null;
  const passwordForm = (
    <form onSubmit={login} className="grid gap-4">
      <label className="grid gap-2 text-xs font-medium">
        Email
        <Input name="email" aria-label="Email" type="email" autoComplete="username" required className="h-10 bg-card text-sm" />
      </label>
      <label className="grid gap-2 text-xs font-medium">
        Password
        <Input name="password" aria-label="Password" type="password" autoComplete="current-password" required className="h-10 bg-card text-sm" />
      </label>
      <Button disabled={busy} type="submit" size="lg" variant={keeri ? "outline" : "default"} className="mt-1 w-full">
        {busy ? "Signing in" : keeri ? "Sign in with the emergency account" : "Sign in"}
      </Button>
    </form>
  );
  return (
    <AdminRoot aria-label="Store administration" data-admin-signin className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div aria-hidden="true" className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[28rem] rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-black/[0.12]" />
        <strong className="relative font-display text-xl font-normal">Maple Furnishers</strong>
        <div className="relative grid max-w-md gap-4">
          <h1 className="font-display text-4xl leading-[1.08] font-normal text-balance">Shop admin</h1>
          <p className="text-base leading-relaxed text-white/85">Edit the storefront, preview the draft beside the editor, and publish when it is ready.</p>
        </div>
        <small className="relative text-xs text-white/75">Staff only. Nothing here is visible to visitors until it is published.</small>
      </div>
      <div className="grid place-items-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm rounded-2xl bg-sunken/70 p-1.5 ring-1 ring-line-soft">
          <div className="grid gap-6 rounded-[calc(1rem-2px)] bg-card px-6 py-8 shadow-md sm:px-8">
            <div className="grid gap-1.5">
              <strong className="font-display text-lg font-normal text-primary lg:hidden">Maple Furnishers</strong>
              <h2 className="font-display text-2xl leading-tight font-normal">Sign in</h2>
              <p className="text-sm text-muted-foreground">{keeri ? "Use your Keeri account. Who can edit and publish here is set on Keeri's Roles screen." : "Use your staff email and password."}</p>
            </div>
            {error && (
              <Notice tone="error"><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" /><span>{error}</span></Notice>
            )}
            {notice && <Notice tone="status"><span>{notice}</span></Notice>}
            {resetToken ? (
              <form onSubmit={chooseNewPassword} data-emergency-reset className="grid gap-4">
                <p className="text-sm text-muted-foreground">Choose a new password for the emergency account. It must be at least 14 characters.</p>
                <label className="grid gap-2 text-xs font-medium">
                  New password
                  <Input name="new-password" aria-label="New password" type="password" autoComplete="new-password" required minLength={14} maxLength={128} className="h-10 bg-card text-sm" />
                </label>
                <label className="grid gap-2 text-xs font-medium">
                  New password again
                  <Input name="confirm-password" aria-label="New password again" type="password" autoComplete="new-password" required className="h-10 bg-card text-sm" />
                </label>
                <Button disabled={busy} type="submit" size="lg" className="mt-1 w-full">{busy ? "Saving" : "Set the emergency password"}</Button>
              </form>
            ) : null}
            {!resetToken && keeri && (keeri.available ? (
              // A full page navigation: the browser itself goes to Keeri and comes back.
              <Button asChild size="lg" className="w-full"><a href="/api/admin/keeri/start" data-keeri-sign-in>Sign in with Keeri</a></Button>
            ) : (
              <Notice tone="error"><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" /><span>Signing in with Keeri isn&apos;t set up correctly on this store yet. Ask whoever looks after the server.</span></Notice>
            ))}
            {resetToken ? null : !keeri ? passwordForm : keeri.emergency ? (
              <details data-emergency-access className="rounded-lg border border-line-soft px-3 py-2 open:pb-3">
                <summary className="cursor-pointer rounded-sm text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">Emergency access</summary>
                <p className="mt-2 mb-3 text-xs text-muted-foreground">Only for when Keeri can&apos;t be reached. It works for the one emergency account, and every use is recorded.</p>
                {passwordForm}
                {keeri.reset && (
                  <button type="button" data-emergency-forgot disabled={busy} onClick={() => void requestReset()}
                    className="mt-3 w-fit rounded-sm text-xs font-semibold text-primary underline-offset-4 focus-visible:outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60">
                    Forgot the emergency password? Email a reset link
                  </button>
                )}
              </details>
            ) : null}
            <a href="/" className="w-fit rounded-sm text-xs font-semibold text-primary underline-offset-4 focus-visible:outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60">Back to the storefront</a>
          </div>
        </div>
      </div>
    </AdminRoot>
  );
}
