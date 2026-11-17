import Link from "next/link";
import type { TemplateMedia } from "@shopmaple/contracts";
import { ForgotPasswordForm, LoginForm, SignUpForm } from "@/components/account/auth/auth-forms";
import { AuthShell } from "@/components/account/auth/auth-shell";

export type AuthPageKind = "login" | "sign-up" | "forgot-password";

/**
 * The three sign-in pages (/account/login, /account/sign-up, /account/forgot-password; Figma 392:1652 and 392:1697). The
 * public routes pass the published artwork; the staff live preview passes the draft's, with `preview` so the forms
 * answer in memory and nobody is signed in or out. `next` (a path on this site) is where signing in returns to.
 */
export function AuthPageView({ kind, next, preview, media }: { kind: AuthPageKind; next: string; preview: boolean; media?: TemplateMedia }) {
  if (kind === "sign-up") {
    return (
      <AuthShell editorial="sign-up" media={media} aside={<p className="auth-aside-line">Thoughtfully made. Personally yours.</p>}>
        <SignUpForm next={next} preview={preview} />
      </AuthShell>
    );
  }
  // From the checkout, a guest goes back to it; otherwise to the shop.
  const guest = next.startsWith("/checkout") ? "/checkout" : "/";
  return (
    <AuthShell editorial="login" media={media} aside={<p className="auth-aside-line">Just browsing?&nbsp; <Link href={guest}>Continue as guest</Link></p>}>
      {kind === "login" ? <LoginForm next={next} preview={preview} /> : <ForgotPasswordForm next={next} preview={preview} />}
    </AuthShell>
  );
}
