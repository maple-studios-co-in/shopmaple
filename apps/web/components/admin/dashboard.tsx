"use client";
import { useEffect, useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import type { StorefrontContent } from "@shopmaple/contracts";
import { ContentEditor } from "./editor";
import { Skeleton } from "./crm-primitives";
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
      <section className="shop-admin admin-session-check" aria-label="Store administration">
        <div aria-busy="true">
          <Skeleton rows={3} />
          <p role="status">Checking your session</p>
        </div>
      </section>
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
      <section className="shop-admin" aria-label="Store administration">
        {error && (
          <div className="admin-notices">
            <p role="alert" className="admin-alert"><TriangleAlert aria-hidden="true" strokeWidth={1.5} /><span>{error}</span></p>
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
      </section>
    );
  return (
    <section className="shop-admin admin-signin" aria-label="Store administration" data-admin-signin>
      <div className="admin-signin-aside" aria-hidden="true">
        <strong>Maple Furnishers</strong>
        <div>
          <h1>Shop admin</h1>
          <p>Edit the storefront, preview the draft beside the editor, and publish when it is ready.</p>
        </div>
        <small>Staff only. Nothing here is visible to visitors until it is published.</small>
      </div>
      <div className="admin-signin-main">
        <div className="admin-login">
          <h2>Sign in</h2>
          <p>Use your staff email and password.</p>
          {error && (
            <p role="alert" className="admin-alert"><TriangleAlert aria-hidden="true" strokeWidth={1.5} /><span>{error}</span></p>
          )}
          <form onSubmit={login}>
            <label>
              Email
              <input
                name="email"
                aria-label="Email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                aria-label="Password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Signing in" : "Sign in"}
            </button>
          </form>
          <a href="/">Back to the storefront</a>
        </div>
      </div>
    </section>
  );
}
