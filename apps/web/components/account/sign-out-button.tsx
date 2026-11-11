"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAccountClient } from "@/lib/account/client";
import { createPreviewTransport } from "@/lib/account/preview";

/** Ends the session (the API deletes it and clears the cookie, signed in or not), then shows the sign-in screen. */
export function SignOutButton({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const client = useMemo(() => createAccountClient(preview ? createPreviewTransport() : undefined), [preview]);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="account-nav-signout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await client.signOut();
        } catch {
          /* Signed out or not, the account page asks the API again. */
        }
        router.replace(preview ? "/account?preview=sign-in" : "/account");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
