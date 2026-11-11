import Link from "next/link";
import { ForgotPasswordForm } from "@/components/account/auth/auth-forms";
import { AuthShell } from "@/components/account/auth/auth-shell";
import { prepareAuthPage } from "@/lib/account/auth-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset your password", robots: { index: false, follow: false } };

/** /account/forgot-password ("Forgot password?" on Figma 392:1652), drawn as the login page: an emailed code, then a new
 * password, which also signs in. */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, preview } = await prepareAuthPage(searchParams);
  const guest = next.startsWith("/checkout") ? "/checkout" : "/";
  return (
    <AuthShell
      editorial="login" media={preview ? undefined : (await getPublishedContent()).templateMedia}
      aside={<p className="auth-aside-line">Just browsing?&nbsp; <Link href={guest}>Continue as guest</Link></p>}
    >
      <ForgotPasswordForm next={next} preview={preview} />
    </AuthShell>
  );
}
