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
    role: "editor" | "publisher";
    canManageEnquiries?: boolean;
  };
  csrfToken: string;
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
    !["editor", "publisher"].includes(user.role) ||
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
    },
    csrfToken: candidate.csrfToken,
  };
}
export function AdminDashboard({
  initialContent,
}: {
  initialContent: StorefrontContent;
}) {
  const adminRequest = useAdminRequest();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void adminRequest("/api/admin/session", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (active && response.ok) {
          const verified = parseSession(await response.json());
          if (!active) return;
          if (verified) setSession(verified);
          else
            setError("We couldn't verify your session. Please sign in again.");
        } else if (active && response.status !== 401)
          setError("We couldn't check your session. Please try signing in.");
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setError(
          error instanceof AdminRequestTimeout
            ? "Checking your session timed out. Please try signing in."
            : "We couldn't connect. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adminRequest]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const passwordInput = form.elements.namedItem(
      "password",
    ) as HTMLInputElement;
    const password = passwordInput.value;
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many sign-in attempts. Please wait before trying again."
            : response.status === 401
              ? "Check your email or password and try again."
              : "Sign in is unavailable. Please try again.",
        );
        return;
      }
      const verified = parseSession(await response.json());
      if (!verified) {
        setError("Sign in returned an invalid session. Please try again.");
        return;
      }
      setSession(verified);
    } catch (error) {
      setError(
        error instanceof AdminRequestTimeout
          ? "Sign in timed out. Please try again."
          : "We couldn't connect. Check your connection and try again.",
      );
    } finally {
      passwordInput.value = "";
      setBusy(false);
    }
  }
  if (loading)
    return (
      <AdminRoot aria-label="Store administration" className="min-h-dvh bg-background">
        <div className="grid min-h-dvh place-items-center p-6">
          <div aria-busy="true" className="grid w-full max-w-sm gap-4">
            <Skeleton rows={3} />
            <p role="status" className="text-center text-xs text-muted-foreground">Checking your session</p>
          </div>
        </div>
      </AdminRoot>
    );
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": session!.csrfToken },
      });
      if (response.ok || response.status === 401) setSession(null);
      else setError("We couldn't sign you out. Please try again.");
    } catch (error) {
      setError(
        error instanceof AdminRequestTimeout
          ? "Sign out timed out. Please try again."
          : "We couldn't sign you out. Check your connection and try again.",
      );
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
        <ContentEditor
          session={session}
          initialContent={initialContent}
          account={{ onSignOut: () => void logout(), busy }}
          onExpired={() => {
            setSession(null);
            setError("Your session has expired. Sign in again to continue.");
          }}
        />
      </AdminRoot>
    );
  return (
    <AdminRoot aria-label="Store administration" data-admin-signin className="min-h-dvh bg-background">
      {/* The layout grid sits inside the root so the root's toaster never takes a grid row. */}
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
              <p className="text-sm text-muted-foreground">Use your staff email and password.</p>
            </div>
            {error && (
              <Notice tone="error"><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" /><span>{error}</span></Notice>
            )}
            <form onSubmit={login} className="grid gap-4">
              <label className="grid gap-2 text-xs font-medium">
                Email
                <Input name="email" aria-label="Email" type="email" autoComplete="username" required className="h-10 bg-card text-sm" />
              </label>
              <label className="grid gap-2 text-xs font-medium">
                Password
                <Input name="password" aria-label="Password" type="password" autoComplete="current-password" required className="h-10 bg-card text-sm" />
              </label>
              <Button disabled={busy} type="submit" size="lg" className="mt-1 w-full">
                {busy ? "Signing in" : "Sign in"}
              </Button>
            </form>
            <a href="/" className="w-fit rounded-sm text-xs font-semibold text-primary underline-offset-4 focus-visible:outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60">Back to the storefront</a>
          </div>
        </div>
      </div>
      </div>
    </AdminRoot>
  );
}
